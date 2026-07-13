import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useSimulationController } from '../../src/composables/useSimulationController'

function deferred() {
  let resolve
  const promise = new Promise(res => { resolve = res })
  return { promise, resolve }
}

function createController(api) {
  const projectData = ref({
    name: 'A',
    simulationConfig: { time: 1, timeStep: 0.1 },
    net: { nodes: [], edges: [], protocols: [] }
  })
  const scope = effectScope()
  const addLog = vi.fn()
  const showPanic = vi.fn()
  const controller = scope.run(() => useSimulationController({
    projectData,
    getSimulationPayload: () => ({ name: projectData.value.name, net: projectData.value.net }),
    validatePayload: () => ({ success: true }),
    addLog,
    applicationLogs: ref([]),
    refreshAllWindows: vi.fn(),
    checkAndHideInvalidEntangledStates: vi.fn(),
    clearAllPlots: vi.fn(),
    hideSlotState: vi.fn(),
    showAlert: vi.fn(),
    showPanic,
    api
  }))
  return { controller, projectData, addLog, showPanic, stop: () => scope.stop() }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('simulation controller polling ownership', () => {
  it('ignores a response from an obsolete polling generation', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const second = deferred()
    const api = {
      getSimulationStatus: vi.fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise),
      getBackendLogs: vi.fn(async () => ({ success: true, logs: [] }))
    }
    const { controller, stop } = createController(api)

    controller.startPolling()
    controller.startPolling()
    first.resolve({
      success: true,
      state: { simulation: { simulation_running: false, simulation_progress: 1, simulation_time: 1 } }
    })
    await Promise.resolve()
    expect(controller.phase.value).not.toBe('completed')

    second.resolve({
      success: true,
      state: { simulation: { simulation_running: true, simulation_progress: 0.25, simulation_time: 1 } }
    })
    await Promise.resolve()
    expect(controller.phase.value).toBe('running')
    stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores an old-project response after session reset', async () => {
    vi.useFakeTimers()
    const request = deferred()
    const api = {
      getSimulationStatus: vi.fn(() => request.promise),
      getBackendLogs: vi.fn(async () => ({ success: true, logs: [] }))
    }
    const { controller, projectData, stop } = createController(api)
    controller.startPolling()
    projectData.value = { ...projectData.value, name: 'B' }
    controller.resetSimulation()
    request.resolve({
      success: true,
      state: { simulation: { simulation_running: true, simulation_progress: 0.5, simulation_time: 1 } }
    })
    await Promise.resolve()
    expect(controller.phase.value).toBe('empty')
    expect(controller.simulationStatus.value.state).toBeNull()
    stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('records the completed transition once when polling reaches its target', async () => {
    vi.useFakeTimers()
    const api = {
      getSimulationStatus: vi.fn(async () => ({
        success: true,
        state: {
          simulation: {
            simulation_running: false,
            simulation_progress: 1,
            simulation_time: 1
          }
        }
      })),
      getBackendLogs: vi.fn(async () => ({ success: true, logs: [] }))
    }
    const { controller, addLog, stop } = createController(api)

    controller.startPolling()
    await Promise.resolve()
    await Promise.resolve()

    expect(controller.phase.value).toBe('completed')
    expect(addLog).toHaveBeenCalledWith('success', 'Simulation completed', 'Web API')
    expect(addLog.mock.calls.filter(([, message]) => message === 'Simulation completed')).toHaveLength(1)
    stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('drains final simulator logs before stopping terminal polling', async () => {
    const firstLogRequest = deferred()
    const panic = {
      id: 'panic-terminal',
      severity: 'panic',
      summary: 'Simulation crashed with BoundsError',
      exception_type: 'BoundsError',
      message: 'index [100]',
      stacktrace: 'MockBrokenProtocol frame'
    }
    const ordinaryError = {
      id: 'error-terminal',
      timestamp: '2026-07-13T12:00:00.000Z',
      source: 'Simulator',
      severity: 'error',
      message: 'Error running simulation'
    }
    const api = {
      getSimulationStatus: vi.fn(async () => ({
        success: true,
        state: {
          simulation: {
            simulation_running: false,
            simulation_error: panic.message,
            simulation_panic: panic
          }
        }
      })),
      getBackendLogs: vi.fn()
        .mockImplementationOnce(() => firstLogRequest.promise)
        .mockResolvedValueOnce({ success: true, logs: [ordinaryError, panic] })
    }
    const { controller, addLog, showPanic, stop } = createController(api)

    controller.startPolling()
    await Promise.resolve()
    await Promise.resolve()

    expect(controller.phase.value).toBe('error')
    expect(api.getBackendLogs).toHaveBeenCalledTimes(1)
    const inFlightSignal = api.getBackendLogs.mock.calls[0][2].signal

    firstLogRequest.resolve({ success: true, logs: [] })
    for (let attempt = 0; attempt < 8; attempt += 1) await Promise.resolve()

    expect(api.getBackendLogs).toHaveBeenCalledTimes(2)
    expect(inFlightSignal.aborted).toBe(false)
    expect(controller.pollingActive.value).toBe(false)
    expect(addLog).toHaveBeenCalledWith(
      'error',
      ordinaryError.message,
      'Simulator',
      JSON.stringify(ordinaryError, null, 2),
      expect.objectContaining({ id: ordinaryError.id, raw: ordinaryError })
    )
    expect(addLog.mock.calls.filter(([level]) => level === 'panic')).toHaveLength(1)
    expect(showPanic).toHaveBeenCalledTimes(1)
    stop()
  })

  it('preserves simulator severity and structured record metadata', async () => {
    const record = {
      id: 'log-1',
      timestamp: '2026-07-13T12:00:00.000Z',
      source: 'Simulator',
      severity: 'error',
      message: 'ordinary simulator error',
      protocol: 'ExampleProtocol'
    }
    const api = {
      getBackendLogs: vi.fn(async () => ({ success: true, logs: [record] }))
    }
    const { controller, addLog, stop } = createController(api)

    await controller.fetchBackendLogs()

    expect(addLog).toHaveBeenCalledWith(
      'error',
      record.message,
      'Simulator',
      JSON.stringify(record, null, 2),
      expect.objectContaining({ id: 'log-1', raw: record, fullMessage: record.message })
    )
    stop()
  })

  it('deduplicates a panic racing between state and log polling', async () => {
    const panic = {
      id: 'panic-1',
      timestamp: '2026-07-13T12:00:00.000Z',
      source: 'Simulator',
      severity: 'panic',
      summary: 'BoundsError while stepping the simulator',
      exception_type: 'BoundsError',
      message: 'attempt to access 3-element Vector at index [100]',
      stacktrace: 'stack frame one\nstack frame two'
    }
    const api = {
      getSimulationStatus: vi.fn(async () => ({
        success: true,
        state: {
          simulation: {
            simulation_running: false,
            simulation_error: panic.message,
            simulation_panic: panic
          }
        }
      })),
      getBackendLogs: vi.fn(async () => ({ success: true, logs: [panic] }))
    }
    const { controller, addLog, showPanic, stop } = createController(api)

    await controller.getSimulationStatus(false)
    await controller.fetchBackendLogs()

    expect(addLog.mock.calls.filter(([level]) => level === 'panic')).toHaveLength(1)
    expect(addLog).toHaveBeenCalledWith(
      'panic',
      panic.summary,
      'Simulator',
      JSON.stringify(panic, null, 2),
      expect.objectContaining({
        id: panic.id,
        fullMessage: panic.message,
        exceptionType: panic.exception_type,
        stacktrace: panic.stacktrace
      })
    )
    expect(showPanic).toHaveBeenCalledTimes(1)
    expect(showPanic).toHaveBeenCalledWith(expect.objectContaining({ id: panic.id }))
    stop()
  })
})

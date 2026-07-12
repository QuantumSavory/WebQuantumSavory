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
    api
  }))
  return { controller, projectData, addLog, stop: () => scope.stop() }
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
    expect(addLog).toHaveBeenCalledWith('success', 'Simulation completed', 'Backend')
    expect(addLog.mock.calls.filter(([, message]) => message === 'Simulation completed')).toHaveLength(1)
    stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})

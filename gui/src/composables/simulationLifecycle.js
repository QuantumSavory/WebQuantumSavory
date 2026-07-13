export const SimulationPhase = Object.freeze({
  EMPTY: 'empty',
  PARSED: 'parsed',
  PREPARED: 'prepared',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
  ERROR: 'error'
})

export function createSimulationState() {
  return {
    phase: SimulationPhase.EMPTY,
    message: '',
    backendState: null,
    isParsed: false,
    isPrepared: false,
    cumulativeTargetTime: 0,
    pollingActive: false,
    error: null
  }
}

export function isNotFoundResponse(response) {
  if (!response) return false
  const code = response.error_code ?? response.status_code
  const message = String(response.message ?? response.detail ?? response.error ?? '').toLowerCase()
  return code === 'NOT_FOUND' || code === 404 || message.includes('not found') || message.includes('404')
}

export function phaseFromBackendState(backendState, fallback = SimulationPhase.PREPARED) {
  const simulation = backendState?.simulation
  if (!simulation) return fallback

  if (simulation.simulation_error || simulation.simulation_execution_time_exceeded) {
    return SimulationPhase.ERROR
  }
  if (simulation.simulation_auto_purged || backendState?.status === 'blocked') {
    return SimulationPhase.BLOCKED
  }
  if (simulation.simulation_paused === true) {
    return SimulationPhase.PAUSED
  }
  if (simulation.simulation_running === true) {
    return SimulationPhase.RUNNING
  }

  const progress = Number(simulation.simulation_progress || 0)
  const target = Number(simulation.simulation_time || 0)
  if (target > 0 && progress >= target) {
    return SimulationPhase.COMPLETED
  }
  if (backendState?.status === 'complete') return SimulationPhase.COMPLETED
  if (backendState?.status === 'prepared') return SimulationPhase.PREPARED
  if (backendState?.status === 'created') return SimulationPhase.PARSED
  if (backendState?.status === 'unknown') return SimulationPhase.EMPTY
  return fallback
}

export function messageForBackendState(backendState, phase) {
  const simulation = backendState?.simulation || {}
  switch (phase) {
    case SimulationPhase.RUNNING:
      return `Running simulation... ${Number(simulation.simulation_progress || 0).toFixed(3)}s / ${simulation.simulation_time || 0}s`
    case SimulationPhase.PAUSED:
      return 'Simulation paused'
    case SimulationPhase.COMPLETED:
      return 'Simulation completed'
    case SimulationPhase.BLOCKED:
      return simulation.simulation_auto_purged
        ? 'Simulation purged after long inactivity'
        : 'Simulation blocked'
    case SimulationPhase.ERROR:
      return simulation.simulation_error
        ? `Simulation failed: ${simulation.simulation_error}`
        : 'Simulation execution time exceeded'
    case SimulationPhase.PREPARED:
      return 'Simulation prepared'
    case SimulationPhase.PARSED:
      return 'Network graph parsed'
    default:
      return ''
  }
}

export function reduceSimulationState(previous, event) {
  const state = previous || createSimulationState()

  switch (event.type) {
    case 'RESET':
      return {
        ...createSimulationState(),
        message: event.message || 'Simulation reset'
      }
    case 'REQUEST':
      return {
        ...state,
        message: event.message || state.message,
        error: null
      }
    case 'PARSED':
      return {
        ...state,
        phase: SimulationPhase.PARSED,
        message: event.message || 'Network graph parsed',
        backendState: event.backendState ?? state.backendState,
        isParsed: true,
        isPrepared: false,
        error: null
      }
    case 'PREPARED':
      return {
        ...state,
        phase: SimulationPhase.PREPARED,
        message: event.message || 'Simulation prepared',
        backendState: event.backendState ?? state.backendState,
        isParsed: true,
        isPrepared: true,
        error: null
      }
    case 'RUN_TARGET':
      return {
        ...state,
        cumulativeTargetTime: event.target,
        error: null
      }
    case 'POLLING_STARTED':
      return { ...state, pollingActive: true }
    case 'POLLING_STOPPED':
      return { ...state, pollingActive: false }
    case 'BACKEND_STATE': {
      const phase = phaseFromBackendState(event.backendState, event.fallbackPhase || state.phase)
      return {
        ...state,
        phase,
        message: event.message || messageForBackendState(event.backendState, phase),
        backendState: event.backendState,
        isParsed: phase !== SimulationPhase.EMPTY,
        isPrepared: ![SimulationPhase.EMPTY, SimulationPhase.PARSED].includes(phase),
        error: phase === SimulationPhase.ERROR ? (event.error || event.backendState?.simulation?.simulation_error || null) : null
      }
    }
    case 'NOT_FOUND':
      return {
        ...createSimulationState(),
        message: event.message || 'No simulation running'
      }
    case 'ERROR':
      return {
        ...state,
        phase: SimulationPhase.ERROR,
        message: event.message || event.error?.message || 'Simulation error',
        backendState: event.backendState ?? state.backendState,
        pollingActive: false,
        error: event.error || event.message || true
      }
    default:
      return state
  }
}

export function simulationCapabilities(phase, graphEmpty) {
  const running = phase === SimulationPhase.RUNNING
  const paused = phase === SimulationPhase.PAUSED
  return {
    canRun: !graphEmpty && !running && !paused,
    canPause: running,
    canResume: paused,
    canStop: !graphEmpty && phase !== SimulationPhase.EMPTY,
    canPrepare: !graphEmpty && !running && !paused,
    // Once a backend graph exists, edits must wait for Reset/Stop so Run can
    // never reuse a parsed snapshot that differs from the visible project.
    editingDisabled: phase !== SimulationPhase.EMPTY
  }
}

export function legacySimulationStatus(state) {
  const ready = [SimulationPhase.PARSED, SimulationPhase.PREPARED, SimulationPhase.COMPLETED].includes(state.phase)
  return {
    status: state.phase === SimulationPhase.ERROR || state.phase === SimulationPhase.BLOCKED
      ? 'error'
      : state.phase === SimulationPhase.EMPTY
        ? 'stopped'
        : ready
          ? 'ready'
          : 'processing',
    message: state.message,
    state: state.backendState
  }
}

const PROJECT_TRANSITION_PHASES = new Set(['preparing', 'committing'])

export function applicationLoadingMessage({
  applicationMetadataPending = false,
  mapInitializationPending = false,
  projectTransitionPhase = 'idle',
  foregroundRequest = null
} = {}) {
  if (applicationMetadataPending) return 'Loading application metadata'
  if (mapInitializationPending) return 'Initializing map'
  if (PROJECT_TRANSITION_PHASES.has(projectTransitionPhase)) return 'Loading project'
  if (foregroundRequest) return 'Preparing simulation request'
  return ''
}

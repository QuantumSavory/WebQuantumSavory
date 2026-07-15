import { describe, expect, it } from 'vitest'
import { applicationLoadingMessage } from '../../src/composables/applicationLoading.js'

describe('application shell loading scope', () => {
  it.each([
    [{ applicationMetadataPending: true }, 'Loading application metadata'],
    [{ mapInitializationPending: true }, 'Initializing map'],
    [{ projectTransitionPhase: 'preparing' }, 'Loading project'],
    [{ projectTransitionPhase: 'committing' }, 'Loading project'],
    [{ foregroundRequest: { id: 1, action: 'run' } }, 'Preparing simulation request']
  ])('reports an allowed shell-loading source', (state, expected) => {
    expect(applicationLoadingMessage(state)).toBe(expected)
  })

  it('prioritizes startup metadata when several shell operations overlap', () => {
    expect(applicationLoadingMessage({
      applicationMetadataPending: true,
      mapInitializationPending: true,
      projectTransitionPhase: 'committing',
      foregroundRequest: { id: 1, action: 'run' }
    })).toBe('Loading application metadata')
  })

  it('does not activate for execution, polling, or local rendering work', () => {
    expect(applicationLoadingMessage({
      simulationPhase: 'running',
      pollingActive: true,
      tagPreviewPending: true,
      plotPending: true,
      scriptExportPending: true
    })).toBe('')
  })
})

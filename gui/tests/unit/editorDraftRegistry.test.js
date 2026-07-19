import { describe, expect, it, vi } from 'vitest'

import { createEditorDraftRegistry } from '../../src/composables/editorDraftRegistry'

describe('editorDraftRegistry', () => {
  it('awaits registered editor commits in registration order', async () => {
    const registry = createEditorDraftRegistry()
    const events = []
    registry.register({
      id: 'markdown',
      flush: async () => {
        events.push('markdown')
        return { valid: true }
      },
    })
    registry.register({
      id: 'states-zoo',
      flush: async () => {
        events.push('states-zoo')
        return { valid: true }
      },
    })

    await expect(registry.flushAll()).resolves.toEqual({ valid: true })
    expect(events).toEqual(['markdown', 'states-zoo'])
  })

  it('stops at an invalid or busy draft and identifies its editor', async () => {
    const registry = createEditorDraftRegistry()
    const later = vi.fn()
    registry.register({
      id: 'states-zoo',
      flush: async () => ({
        valid: false,
        details: { variable_id: 'state_a', field: 'parameters.visibility' },
      }),
    })
    registry.register({ id: 'later', flush: later })

    await expect(registry.flushAll()).resolves.toEqual({
      valid: false,
      details: {
        editor: 'states-zoo',
        variable_id: 'state_a',
        field: 'parameters.visibility',
      },
    })
    expect(later).not.toHaveBeenCalled()
  })

  it('unregisters component-owned editors', async () => {
    const registry = createEditorDraftRegistry()
    const flush = vi.fn()
    const unregister = registry.register({ id: 'temporary', flush })
    unregister()

    await registry.flushAll()
    expect(flush).not.toHaveBeenCalled()
  })
})

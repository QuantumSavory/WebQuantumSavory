import { describe, expect, it } from 'vitest'

import { useUnsavedChanges } from '../../src/composables/useUnsavedChanges'

describe('useUnsavedChanges', () => {
  it('can mark a never-saved project dirty and clears the flag after save', () => {
    const project = { name: '', description: '' }
    const changes = useUnsavedChanges(() => project)

    expect(changes.hasUnsavedChanges()).toBe(false)
    changes.markAsUnsaved()
    expect(changes.hasUnsavedChanges()).toBe(true)

    changes.markAsSaved()
    expect(changes.hasUnsavedChanges()).toBe(false)
    project.description = 'Changed after save'
    expect(changes.hasUnsavedChanges()).toBe(true)
  })
})

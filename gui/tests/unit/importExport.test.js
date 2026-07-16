import { afterEach, describe, expect, it, vi } from 'vitest'

import { useImportExport } from '../../src/composables/useImportExport'
import ProjectStore from '../../src/models/ProjectStore'

function importProject(overrides = {}) {
  return {
    name: ' Imported Project ',
    description: '',
    variables: [],
    net: { nodes: [], edges: [], protocols: [] },
    ...overrides,
  }
}

function createHarness() {
  const importIntoSession = vi.fn(async () => true)
  const showAlert = vi.fn()
  const composable = useImportExport({
    currentProjectName: { value: 'Current' },
    importedProjectData: { value: null },
    conflictProjectName: { value: '' },
    showImportConflictDialog: { value: false },
    addLog: vi.fn(),
    importIntoSession,
    serializeProjectData: vi.fn(),
    showAlert,
  })
  return { composable, importIntoSession, showAlert }
}

afterEach(() => vi.restoreAllMocks())

describe('project import annotations', () => {
  it('validates and clones annotations without mutating imported input', async () => {
    vi.spyOn(ProjectStore, 'listProjects').mockReturnValue([])
    const harness = createHarness()
    const raw = importProject({
      annotations: [{
        id: 'annotation_imported',
        markdown: 'Imported $x$',
        bounds: { west: -3, south: -2, east: 3, north: 2 },
        backgroundColor: '#FFFFFF',
        borderColor: '#123ABC',
        area: { freeCorner: [4, 3] },
      }],
    })
    const original = structuredClone(raw)

    expect(await harness.composable.validateAndProcessImport(raw)).toBe(true)

    expect(raw).toEqual(original)
    const imported = harness.importIntoSession.mock.calls[0][0]
    expect(imported.name).toBe('Imported Project')
    expect(imported.annotations).toEqual([{
      id: 'annotation_imported',
      markdown: 'Imported $x$',
      bounds: { west: -3, south: -2, east: 3, north: 2 },
      backgroundColor: '#ffffff',
      borderColor: '#123abc',
      area: { freeCorner: [4, 3] },
    }])
    expect(imported.annotations).not.toBe(raw.annotations)
  })

  it('defaults legacy imports to an empty annotation collection', async () => {
    vi.spyOn(ProjectStore, 'listProjects').mockReturnValue([])
    const harness = createHarness()

    expect(await harness.composable.validateAndProcessImport(importProject())).toBe(true)
    expect(harness.importIntoSession.mock.calls[0][0].annotations).toEqual([])
  })

  it('rejects invalid annotation data before changing the session', async () => {
    vi.spyOn(ProjectStore, 'listProjects').mockReturnValue([])
    const harness = createHarness()
    const raw = importProject({
      annotations: [{
        id: 'annotation_invalid',
        markdown: '',
        bounds: { west: 3, south: -2, east: -3, north: 2 },
        backgroundColor: '#ffffff',
        borderColor: '#000000',
        area: null,
      }],
    })

    expect(await harness.composable.validateAndProcessImport(raw)).toBeUndefined()
    expect(harness.importIntoSession).not.toHaveBeenCalled()
    expect(harness.showAlert).toHaveBeenCalledWith(
      'Import failed',
      expect.stringMatching(/annotation.*canonical and non-empty/i),
    )
  })
})

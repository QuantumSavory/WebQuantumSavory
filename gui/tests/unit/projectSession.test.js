import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createEmptyProject, encodeStoredProject } from '../../src/utils/projectCodec'
import { useProjectSession } from '../../src/composables/useProjectSession'

function createHarness({ projects = {}, confirmVersionMismatch = vi.fn(() => true) } = {}) {
  const records = new Map(Object.entries(projects))
  const projectData = ref(createEmptyProject('A'))
  const currentProjectName = ref('A')
  const isDemoProject = ref(false)
  const selectedItem = ref({ id: 'selected' })
  const selectedType = ref('node')
  const mapCenter = ref([1, 2])
  const mapZoom = ref(3)
  const calls = {
    reset: vi.fn(),
    stop: vi.fn(),
    stopAlive: vi.fn(),
    closeWindows: vi.fn(),
    hide: vi.fn(),
    markSaved: vi.fn(),
    syncLegacy: vi.fn()
  }
  const store = {
    loadProject: vi.fn(name => records.get(name) || null),
    saveProject: vi.fn((name, data) => records.set(name, data)),
    openProject: vi.fn((name, data) => records.set(name, data)),
    deleteProject: vi.fn(name => records.delete(name)),
    listProjects: vi.fn(() => [...records.keys()])
  }
  const api = {
    getDefaultBgNoise: () => ({ type: 'default', parameters: [] }),
    getPlatformInfo: () => ({ versions: { julia: '1.12', quantumSavory: '0.7', app: '1.6' } }),
    fetchPlatformInfo: vi.fn(),
    destroySimulation: vi.fn(async () => ({ success: true }))
  }
  const session = useProjectSession({
    projectData,
    currentProjectName,
    isDemoProject,
    selectedItem,
    selectedType,
    mapCenter,
    mapZoom,
    clearLogs: vi.fn(),
    addLog: vi.fn(),
    getSimulationStatus: vi.fn(),
    defaultMapCenter: [0, 0],
    defaultMapZoom: 4,
    minimumTimeStep: 0.1,
    markAsSaved: calls.markSaved,
    resetSimulation: calls.reset,
    stopPolling: calls.stop,
    stopAlivePolling: calls.stopAlive,
    closeAllResultWindows: calls.closeWindows,
    hideSlotState: calls.hide,
    syncLegacyProjectData: calls.syncLegacy,
    confirmVersionMismatch,
    showError: vi.fn(),
    store,
    api
  })
  return { session, records, projectData, currentProjectName, selectedItem, selectedType, mapCenter, mapZoom, calls, store, api }
}

beforeAll(() => {
  const values = new Map()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: key => values.has(key) ? values.get(key) : null,
      removeItem: key => values.delete(key),
      setItem: (key, value) => values.set(key, String(value))
    }
  })
})

beforeEach(() => window.localStorage.clear())

describe('project session', () => {
  it('renames before Save As serialization and starts a clean session', () => {
    const harness = createHarness()
    expect(harness.session.saveAs('B')).toBe(true)
    expect(harness.currentProjectName.value).toBe('B')
    expect(harness.projectData.value.name).toBe('B')
    expect(harness.records.get('B').name).toBe('B')
    expect(harness.calls.reset).toHaveBeenCalledOnce()
    expect(harness.calls.closeWindows).toHaveBeenCalledOnce()
    expect(window.localStorage.getItem('recentProjectName')).toBe('B')
  })

  it('does not tear down the current session when version confirmation is declined', async () => {
    const stored = encodeStoredProject(createEmptyProject('B'), {
      name: 'B',
      map: { position: [5, 6], zoom: 7 },
      platformInfo: { versions: { julia: '2.0', quantumSavory: '0.7', app: '1.6' } }
    })
    const harness = createHarness({ projects: { B: stored }, confirmVersionMismatch: vi.fn(() => false) })
    expect(await harness.session.open('B')).toBe(false)
    expect(harness.currentProjectName.value).toBe('A')
    expect(harness.projectData.value.name).toBe('A')
    expect(harness.calls.reset).not.toHaveBeenCalled()
    expect(harness.calls.closeWindows).not.toHaveBeenCalled()
    expect(harness.api.destroySimulation).not.toHaveBeenCalled()
  })

  it('allows only the newest overlapping open to commit', async () => {
    let resolveFirstConfirmation
    const firstConfirmation = new Promise(resolve => { resolveFirstConfirmation = resolve })
    const projectA = encodeStoredProject(createEmptyProject('Old'), {
      name: 'Old',
      map: { position: [1, 1], zoom: 2 },
      platformInfo: { versions: { julia: '2.0', quantumSavory: '0.7', app: '1.6' } }
    })
    const projectB = encodeStoredProject(createEmptyProject('Newest'), {
      name: 'Newest',
      map: { position: [8, 9], zoom: 10 }
    })
    const harness = createHarness({
      projects: { Old: projectA, Newest: projectB },
      confirmVersionMismatch: vi.fn(() => firstConfirmation)
    })

    const first = harness.session.open('Old')
    const second = harness.session.open('Newest')
    expect(await second).toBe(true)
    resolveFirstConfirmation(true)
    expect(await first).toBe(false)
    expect(harness.currentProjectName.value).toBe('Newest')
    expect(harness.projectData.value.name).toBe('Newest')
    expect(harness.mapCenter.value).toEqual([8, 9])
  })

  it('deleting the active project performs complete teardown and commits an empty session', async () => {
    const harness = createHarness({ projects: { A: encodeStoredProject(createEmptyProject('A'), { name: 'A' }) } })
    expect(await harness.session.delete('A', { confirmed: true })).toBe(true)
    expect(harness.currentProjectName.value).toBe('')
    expect(harness.projectData.value).toEqual(createEmptyProject())
    expect(harness.selectedItem.value).toBeNull()
    expect(harness.selectedType.value).toBeNull()
    expect(harness.calls.reset).toHaveBeenCalledOnce()
    expect(harness.calls.stop).toHaveBeenCalledOnce()
    expect(harness.calls.stopAlive).toHaveBeenCalledOnce()
    expect(harness.calls.closeWindows).toHaveBeenCalledOnce()
    expect(harness.calls.markSaved).toHaveBeenCalledOnce()
  })

  it('does not overwrite an existing project when an imported version is declined', async () => {
    const original = encodeStoredProject(createEmptyProject('B'), {
      name: 'B',
      platformInfo: { versions: { julia: '1.12', quantumSavory: '0.7', app: '1.6' } }
    })
    const imported = encodeStoredProject(createEmptyProject('Imported B'), {
      name: 'Imported B',
      platformInfo: { versions: { julia: '2.0', quantumSavory: '0.7', app: '1.6' } }
    })
    const harness = createHarness({
      projects: { B: original },
      confirmVersionMismatch: vi.fn(() => false)
    })

    expect(await harness.session.importProject(imported, ' B ')).toBe(false)
    expect(harness.records.get('B')).toEqual(original)
    expect(harness.currentProjectName.value).toBe('A')
    expect(harness.calls.reset).not.toHaveBeenCalled()
    expect(harness.api.destroySimulation).not.toHaveBeenCalled()
  })
})

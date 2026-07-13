import { ref, computed, watch } from 'vue'

const SELECTED_ELEMENT_STORAGE_KEY = 'panelCollapsed_selected_element'
const LEGACY_SELECTED_ELEMENT_KEYS = [
  'panelCollapsed_node_panel',
  'panelCollapsed_edge_panel',
  'panelCollapsed_void_panel'
]

const PANEL_STORAGE_KEYS = Object.freeze({
  selectedElementPanel: SELECTED_ELEMENT_STORAGE_KEY,
  nodeListPanel: 'panelCollapsed_node_list',
  edgeListPanel: 'panelCollapsed_edge_list',
  floatingProtocolsPanel: 'panelCollapsed_floating_protocols',
  bottomPanel: 'panelCollapsed_logs_panel'
})
const COLLAPSED_PANEL_FLEX = '0 0 var(--app-panel-collapsed-height)'

function readStoredBoolean(key) {
  const value = localStorage.getItem(key)
  return value === null ? null : value === 'true'
}

function readSelectedElementCollapsed() {
  const stored = readStoredBoolean(SELECTED_ELEMENT_STORAGE_KEY)
  const selectedElementCollapsed = stored !== null
    ? stored
    : LEGACY_SELECTED_ELEMENT_KEYS
        .map(readStoredBoolean)
        .some(value => value === true)

  if (stored === null) {
    localStorage.setItem(SELECTED_ELEMENT_STORAGE_KEY, String(selectedElementCollapsed))
  }
  LEGACY_SELECTED_ELEMENT_KEYS.forEach(key => localStorage.removeItem(key))
  return selectedElementCollapsed
}

function readPanelCollapsed(key) {
  return readStoredBoolean(key) === true
}

/**
 * Owns persisted shell layout state. Panels are controlled views of these refs;
 * no panel component reads or writes localStorage independently.
 */
export function usePanelLayout() {
  const isRightSidebarVisible = ref(true)
  const panelCollapsedStates = ref({
    selectedElementPanel: readSelectedElementCollapsed(),
    nodeListPanel: readPanelCollapsed(PANEL_STORAGE_KEYS.nodeListPanel),
    edgeListPanel: readPanelCollapsed(PANEL_STORAGE_KEYS.edgeListPanel),
    floatingProtocolsPanel: readPanelCollapsed(PANEL_STORAGE_KEYS.floatingProtocolsPanel),
    bottomPanel: readPanelCollapsed(PANEL_STORAGE_KEYS.bottomPanel)
  })

  watch(panelCollapsedStates, states => {
    Object.entries(PANEL_STORAGE_KEYS).forEach(([panelName, storageKey]) => {
      localStorage.setItem(storageKey, String(states[panelName]))
    })
  }, { deep: true })

  const panelFlexValues = computed(() => {
    const firstPaneCollapsed = panelCollapsedStates.value.selectedElementPanel

    return {
      first: firstPaneCollapsed ? COLLAPSED_PANEL_FLEX : '1 1 0',
      nodeList: panelCollapsedStates.value.nodeListPanel ? COLLAPSED_PANEL_FLEX : '1 1 0',
      edgeList: panelCollapsedStates.value.edgeListPanel ? COLLAPSED_PANEL_FLEX : '1 1 0',
      floating: panelCollapsedStates.value.floatingProtocolsPanel ? COLLAPSED_PANEL_FLEX : '1 1 0'
    }
  })

  function toggleRightSidebar() {
    isRightSidebarVisible.value = !isRightSidebarVisible.value
  }

  return {
    isRightSidebarVisible,
    panelCollapsedStates,
    panelFlexValues,
    toggleRightSidebar
  }
}

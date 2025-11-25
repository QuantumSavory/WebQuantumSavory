import { ref, computed } from 'vue'

/**
 * useAppState - Composable for App.vue state and basic handlers
 * Consolidates state management from App.vue
 */
export function useAppState(
  projectData,
  selectedItem,
  selectedType,
  mapCenter,
  mapZoom,
  applicationLogs,
  minimizedProjectData
) {
  // Dialog states
  const showMenu = ref(false)
  const showLoadDialog = ref(false)
  const loadProjectName = ref('')
  const loadProjectList = ref([])
  const currentProjectName = ref('')
  const isDemoProject = ref(false)
  const showJsonViewer = ref(localStorage.getItem('showJsonViewer') === 'true')
  const jsonViewerMode = ref(localStorage.getItem('jsonViewerMode') || 'full')
  const showImportConflictDialog = ref(false)
  const importedProjectData = ref(null)
  const conflictProjectName = ref('')
  const showProjectNameDialog = ref(false)
  const projectNameDialogMode = ref('new')
  const projectNameDialogInitialValue = ref('')
  const showAboutModal = ref(false)

  // Computed
  const selectedNodeIndex = computed(() => {
    if (selectedItem.value && selectedType.value === 'node') {
      return projectData.value.net.nodes.indexOf(selectedItem.value)
    }
    return null
  })

  const selectedItemInfo = computed(() => {
    if (!selectedItem.value) return null

    if (selectedType.value === 'node') {
      return {
        title: selectedItem.value.name,
        details: [
          { label: 'ID', value: selectedItem.value.id },
          { label: 'Position', value: selectedItem.value.position.join(', ') },
          { label: 'Type', value: selectedItem.value.data.type }
        ]
      }
    }
    return null
  })

  // Dialog handlers
  function toggleJsonViewerVisibility() {
    showJsonViewer.value = !showJsonViewer.value
    localStorage.setItem('showJsonViewer', showJsonViewer.value)
  }

  function toggleJsonViewerMode() {
    jsonViewerMode.value = jsonViewerMode.value === 'full' ? 'minimized' : 'full'
    localStorage.setItem('jsonViewerMode', jsonViewerMode.value)
  }

  return {
    // State
    showMenu,
    showLoadDialog,
    loadProjectName,
    loadProjectList,
    currentProjectName,
    isDemoProject,
    showJsonViewer,
    jsonViewerMode,
    showImportConflictDialog,
    importedProjectData,
    conflictProjectName,
    showProjectNameDialog,
    projectNameDialogMode,
    projectNameDialogInitialValue,
    showAboutModal,
    
    // Computed
    selectedNodeIndex,
    selectedItemInfo,
    
    // Handlers
    toggleJsonViewerVisibility,
    toggleJsonViewerMode
  }
}


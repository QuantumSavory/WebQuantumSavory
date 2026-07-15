import { ref, computed } from 'vue'

/**
 * useAppState - Composable for App.vue state and basic handlers
 * Consolidates state management from App.vue
 */
export function useAppState({
  projectData,
  selectedItem,
  selectedType
}) {
  // Dialog states
  const showLoadDialog = ref(false)
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
  const showSystemInformation = ref(false)

  // Computed
  const selectedNodeIndex = computed(() => {
    if (selectedItem.value && selectedType.value === 'node') {
      return projectData.value.net.nodes.indexOf(selectedItem.value)
    }
    return null
  })

  return {
    // State
    showLoadDialog,
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
    showSystemInformation,
    
    // Computed
    selectedNodeIndex
  }
}

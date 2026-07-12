<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, provide } from 'vue'
import BaseMap from './components/map/BaseMap.vue'
import NodePanel from './components/panels/NodePanel.vue'
import ProjectStore from './models/ProjectStore.js'
import NodeListPanel from './components/panels/NodeListPanel.vue'
import RunnerPanel from './components/panels/RunnerPanel.vue'
import FloatingProtocolsPanel from './components/panels/FloatingProtocolsPanel.vue'
import { api } from './utils/ApiConnector'
import {JsonViewer} from "vue3-json-viewer"
import { generateUUid } from './utils/Utils'
//import "vue3-json-viewer/dist/vue3-json-viewer.css";
import TieredMenu from 'primevue/tieredmenu';
import {
  Braces,
  Check,
  ChevronRight,
  Copy,
  CopyPlus,
  Download,
  FileJson,
  FilePlus2,
  FileUp,
  FolderOpen,
  Info,
  Library,
  Menu as MenuIcon,
  PanelRightClose,
  PanelRightOpen,
  Save,
  X
} from '@lucide/vue'
import EdgeListPanel from './components/panels/EdgeListPanel.vue'
import EdgePanel from './components/panels/EdgePanel.vue'
import BottomPanel from './components/panels/BottomPanel.vue'
import ProjectNameDialog from './components/ProjectNameDialog.vue'
import ImportConflictDialog from './components/ImportConflictDialog.vue'
import OpenProjectDialog from './components/OpenProjectDialog.vue'
import AboutModal from './components/AboutModal.vue'
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue'
import AlertModal from './components/AlertModal.vue'
import ConfirmModal from './components/ConfirmModal.vue'
import RepeaterChainDialog from './components/RepeaterChainDialog.vue'
import StarNetworkDialog from './components/StarNetworkDialog.vue'
import GraphNetworkDialog from './components/GraphNetworkDialog.vue'
import packageJson from '../package.json'
import VoidPanel from './components/panels/VoidPanel.vue'
import ResultsView from './components/panels/ResultsView.vue'
import LucideMenuIcon from './components/LucideMenuIcon.vue'
import SmallScreenWarning from './components/SmallScreenWarning.vue'

// Import composables
import { useSimulationController } from './composables/useSimulationController.js'
import { usePanelLayout } from './composables/usePanelLayout.js'
import { useWindowManagement } from './composables/useWindowManagement.js'
import { useNodeEdgeOperations } from './composables/useNodeEdgeOperations.js'
import { useProjectSession } from './composables/useProjectSession.js'
import { useImportExport } from './composables/useImportExport.js'
import { useAppState } from './composables/useAppState.js'
import { useUnsavedChanges } from './composables/useUnsavedChanges.js'

// Import utils
import { validatePayload } from './utils/projectHelpers.js'
import { isEntangledStateStillValid } from './utils/SlotConnectionUtils.js'
import { createEmptyProject, toScriptExportPayload, toSimulationPayload } from './utils/projectCodec.js'
import { UI_SERVICES_KEY } from './composables/uiServices.js'
import { registerLegacyBridge, syncLegacyProjectData } from './utils/legacyBridge.js'
import { generateRepeaterChain } from './utils/repeaterChain.js'
import { generateStarNetwork } from './utils/starNetwork.js'
import { generateGraphNetwork, GRAPH_TOPOLOGIES } from './utils/graphNetwork.js'

// Import demo projects
import demo1 from './demos/1.Entangler.Example.json'
import demo2 from './demos/2.Entangler.Example.with.consumer.json'


const baseMapInstance = ref(null);

const TIME_STEP = 0.1;

// Default map configuration (must be defined before composables that use it)
const DEFAULT_MAP_CENTER = [-98.5795, 39.8283] // Roughly the center of continental US
const DEFAULT_MAP_ZOOM = 4 // Zoom level to show most of the US

// Initialize composables
const projectData = ref(createEmptyProject())

// Required variables and functions for composables
// Log management functions
function addLog(level, message, source = 'App', extendedInfo = null) {
  // Check if this message is the same as the last log entry
  const lastLog = applicationLogs.value[applicationLogs.value.length - 1];
  if (lastLog && lastLog.message === message && lastLog.source === source) {
    // Update the timestamp of the existing log entry
    lastLog.timestamp = new Date().toISOString();
    lastLog.count = (lastLog.count || 1) + 1;
    return;
  }
  
  const logEntry = {
    id: generateUUid('log'),
    timestamp: new Date().toISOString(),
    level,
    message,
    source,
    extendedInfo,
    count: 1
  };
  
  applicationLogs.value.push(logEntry);
  
  // Keep only the last maxLogs entries
  if (applicationLogs.value.length > maxLogs.value) {
    applicationLogs.value = applicationLogs.value.slice(-maxLogs.value);
  }
}

// Application logs
const applicationLogs = ref([])
const maxLogs = ref(1000)
const showRepeaterChainDialog = ref(false)
const showStarNetworkDialog = ref(false)
const showGraphNetworkDialog = ref(false)
const confirmationRequest = ref(null)

function confirmAction({ title, message, confirmButtonText = 'Confirm', dangerous = false }) {
  return new Promise(resolve => {
    confirmationRequest.value?.resolve(false)
    confirmationRequest.value = { title, message, confirmButtonText, dangerous, resolve }
  })
}

function resolveConfirmation(result) {
  const request = confirmationRequest.value
  confirmationRequest.value = null
  request?.resolve(result)
}

// Minimized project data - cleans up project data for API calls
const minimizedProjectData = computed(() => toSimulationPayload(projectData.value))
const exportScriptPayload = computed(() => toScriptExportPayload(projectData.value))

// Window management is the authoritative owner of result-window state.
const {
  resultWindows,
  showResultsView,
  closeResultWindow,
  closeAllResultWindows,
  bringWindowToFront,
  updateWindowPosition,
  updateWindowSize,
  registerWindowRef,
  unregisterWindowRef,
  refreshAllWindows,
  clearAllPlots
} = useWindowManagement()

provide(UI_SERVICES_KEY, {
  getProjectData: () => projectData.value,
  showAlert,
  showResultsView,
  showEntangledSlots,
  hideSlotState
})

const disposeLegacyBridge = registerLegacyBridge({
  getProjectData: () => projectData.value,
  showResultsView,
  showEntangledSlots,
  hideSlotState
})

/**
 * Check if the currently displayed entangled state still exists in the new response
 * If not, hide the entanglement visualization and close associated result windows
 * @param {Object} response - The get_state response containing new entanglements
 */
function checkAndHideInvalidEntangledStates(response) {
  if (!baseMapInstance.value || !response?.state?.slots?.entanglements) {
    return
  }
  
  try {
    // Get the currently active slot connection state from BaseMap
    const activeState = baseMapInstance.value.getActiveSlotConnectionState()
    
    if (!activeState) {
      // No state currently displayed, nothing to check
      return
    }
    
    // Get new entanglements from response
    const newEntanglements = response.state.slots.entanglements
    
    // Check if the displayed state still exists
    const isStillValid = isEntangledStateStillValid(activeState, newEntanglements)
    
    if (!isStillValid) {
      // Hide the entanglement visualization
      if (baseMapInstance.value.hideSlotConnectionState) {
        baseMapInstance.value.hideSlotConnectionState()
      }
      
      // Find and close all result windows associated with this entangled state
      const stateId = activeState.id
      const windowsToClose = resultWindows.value.filter(window => {
        return window.context?.stateId === stateId
      })
      
      windowsToClose.forEach(window => {
        closeResultWindow(window.id)
      })
    }
  } catch (error) {
    console.error('Error checking entangled states:', error)
  }
}

// Alert modal function
function showAlert(title, message) {
  alertModalTitle.value = title
  alertModalMessage.value = message
  showAlertModal.value = true
}

function closeAlertModal() {
  showAlertModal.value = false
}

const {
  phase: simulationPhase,
  capabilities: simulationCapabilities,
  simulationState,
  simulationStatus,
  hasSimulationRun,
  resetSimulation,
  prepareNetworkGraph,
  prepareSimulation,
  runSimulationWithSteps,
  pauseSimulation,
  resumeSimulation,
  stopSimulation,
  getSimulationStatus,
  stopPolling,
  startAlivePolling,
  stopAlivePolling,
  dispose: disposeSimulationController
} = useSimulationController({
  projectData,
  getProjectName: () => projectData.value.name,
  getSimulationPayload: () => minimizedProjectData.value,
  validatePayload,
  addLog,
  applicationLogs,
  refreshAllWindows,
  checkAndHideInvalidEntangledStates,
  clearAllPlots,
  hideSlotState,
  showAlert
})

const isNetworkEditingDisabled = computed(() => (
  simulationCapabilities.value.editingDisabled || hasSimulationRun.value
))

const {
  isRightSidebarVisible,
  panelCollapsedStates,
  panelFlexValues,
  toggleRightSidebar
} = usePanelLayout()

// Initialize node/edge operations composable  
const {
  mapCenter,
  mapZoom,
  selectedItem,
  selectedType,
  justCreatedNode,
  handleSelect,
  addNewNode,
  handleMapClick: handleMapClickComposable,
  handleMapStateChange: handleMapStateChangeComposable,
  deleteSelected,
  handleEdgeCreated,
  moveNode
} = useNodeEdgeOperations(projectData, isNetworkEditingDisabled, addLog, { hideSlotState, showAlert })

// Initialize app state composable
const {
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
  selectedNodeIndex
} = useAppState({ projectData, selectedItem, selectedType })

// Create a ref for markAsSaved that will be set after useUnsavedChanges is initialized
const markAsSavedRef = ref(null)

// Project session owns project identity, persistence, and transition teardown.
const {
  transitionGeneration: projectTransitionGeneration,
  open: openProject,
  openDemo: loadDemoProject,
  create: createNewProject,
  saveAs: createSaveAsProject,
  save: saveProject,
  delete: handleDeleteProjectPM,
  importProject: importProjectIntoSession,
  serializeProjectData,
  deserializeProjectData,
  generateCopyName,
  dispose: disposeProjectSession
} = useProjectSession({
  projectData,
  currentProjectName,
  isDemoProject,
  selectedItem,
  selectedType,
  mapCenter,
  mapZoom,
  clearLogs,
  addLog,
  getSimulationStatus,
  defaultMapCenter: DEFAULT_MAP_CENTER,
  defaultMapZoom: DEFAULT_MAP_ZOOM,
  minimumTimeStep: TIME_STEP,
  markAsSaved: () => markAsSavedRef.value?.(),
  resetSimulation,
  stopPolling,
  stopAlivePolling,
  closeAllResultWindows,
  hideSlotState,
  syncLegacyProjectData,
  confirmVersionMismatch: message => confirmAction({
    title: 'Project version mismatch',
    message,
    confirmButtonText: 'Open project'
  }),
  confirmDelete: message => confirmAction({
    title: 'Delete project',
    message,
    confirmButtonText: 'Delete',
    dangerous: true
  }),
  showError: message => showAlert('Project Error', message)
})

// Unsaved snapshots compare the canonical storage representation.
const {
  hasUnsavedChanges,
  markAsSaved
} = useUnsavedChanges(serializeProjectData)

markAsSavedRef.value = markAsSaved

// Unsaved changes dialog state
const showUnsavedChangesDialog = ref(false)
const pendingAction = ref(null)

// Alert modal state
const showAlertModal = ref(false)
const alertModalTitle = ref('Alert')
const alertModalMessage = ref('')

// Initialize import/export composable
const {
  importProject,
  exportProject,
  validateAndProcessImport,
  handleImportConflictOverwrite,
  handleImportConflictNewName,
  cancelImportConflict
} = useImportExport({
  currentProjectName,
  importedProjectData,
  conflictProjectName,
  showImportConflictDialog,
  addLog,
  importIntoSession: importProjectIntoSession,
  serializeProjectData,
  showAlert
})

function showEntangledSlots(slotId) {
  const allEntanglements = simulationStatus.value?.state?.slots?.entanglements;
  if( !allEntanglements ){
    return
  }

  const relatedSlotIds = [];
  allEntanglements.forEach(entanglement => {
    let slotIdToAdd = null;
    if( entanglement[0] === slotId ){
      slotIdToAdd = entanglement[1];
    }else if( entanglement[1] === slotId ){
      slotIdToAdd = entanglement[0];
    }
    if( slotIdToAdd && !relatedSlotIds.includes(slotIdToAdd) ){
      relatedSlotIds.push(slotIdToAdd);
    }
  });

  const entangledSlots = [];
  projectData.value.net.nodes.forEach(node => {
    node.data.slots.forEach(slot => {
      if( relatedSlotIds.includes(slot.id) ){
        entangledSlots.push( { nodeId: node.id, slotId: slot.id } );
      }
    });
  });

  const baseMapComponent = baseMapInstance.value; 
  const entagledState = {
    id: "state_1",
    slots: entangledSlots
  }

  try {
      baseMapComponent.showSlotConnectionState(entagledState);
  } catch (error) {
      console.error('Error calling showSlotConnectionState:', error)
  }
  
}


function hideSlotState() {
  try{
    baseMapInstance.value.hideSlotConnectionState();
  }catch(error){
    console.log('Error calling hideSlotConnectionState:', error)
  }
}


const mainMenuItems = computed(() => {
  let result = [
    { label: 'New', lucideIcon: FilePlus2, command: () => handleMenu('new') },
    { label: 'Open', lucideIcon: FolderOpen, command: () => handleMenu('open') },
    { label: 'Import', lucideIcon: FileUp, command: () => handleMenu('import') },
    { label: 'Export', lucideIcon: Download, command: () => handleMenu('export') },
  ];
  
  // Only show Save if not a demo project
  if (!isDemoProject.value) {
    result.push({ label: 'Save', lucideIcon: Save, command: () => handleMenu('save') })
  }
  
  if( currentProjectName.value ){
    result.push(
      { label: 'Save As', lucideIcon: CopyPlus, command: () => handleMenu('saveas') },
    )
  }
  result.push( { separator: true } );

  
  // Add About entry
  result.push(
    { label: 'About', lucideIcon: Info, command: () => handleMenu('about') }
  )
  
  // Add Demos submenu at the end
  result.push({
    label: 'Demos', 
    lucideIcon: Library,
    items: demoProjects.map(demo => ({
      label: demo.name,
      lucideIcon: FileJson,
      command: () => {
        // Check for unsaved changes before loading demo
        if (hasUnsavedChanges()) {
          pendingAction.value = { type: 'demo', demoData: demo.data }
          showUnsavedChangesDialog.value = true
        } else {
          loadDemoProject(demo.data)
        }
      }
    }))
  })


  result.push(
    { label: 'JSON Viewer', lucideIcon: Braces, command: () => handleMenu('json') },
  )
  
  
  return result;
})

const mainMenuElement = ref(null)

function toggleMainMenu(event){
  mainMenuElement.value.toggle(event)
}

// addNodeClickHandler wrapper for the template
function addNodeClickHandler() {
  addNewNode(null, 'city', mapCenter.value)
}

// Demo projects list
const demoProjects = [
  { name: demo1.name, data: demo1 },
  { name: demo2.name, data: demo2 }
]

// App version from package.json
const appVersion = ref(packageJson.version)

function clearLogs() {
  applicationLogs.value = []
}

function openRepeaterChainGenerator() {
  if (isNetworkEditingDisabled.value) {
    showAlert(
      'Layout tools unavailable',
      'Reset or stop the simulation before changing the network layout.'
    )
    return
  }
  showRepeaterChainDialog.value = true
}

function closeRepeaterChainGenerator() {
  showRepeaterChainDialog.value = false
}

function handleGenerateRepeaterChain(options) {
  if (isNetworkEditingDisabled.value) {
    closeRepeaterChainGenerator()
    showAlert(
      'Layout tools unavailable',
      'Reset or stop the simulation before changing the network layout.'
    )
    return
  }

  try {
    const startNodeName = projectData.value.net.nodes.find(node => node.id === options.startNodeId)?.name
    const endNodeName = projectData.value.net.nodes.find(node => node.id === options.endNodeId)?.name
    const result = generateRepeaterChain(projectData.value.net, options)

    if (
      selectedItem.value?.id === result.removedNode.id
      || selectedItem.value?.id === result.removedEdge.id
    ) {
      handleSelect(null, null)
    }

    closeRepeaterChainGenerator()
    addLog(
      'success',
      `Generated a chain of ${result.generatedNodes.length} repeaters between ${startNodeName} and ${endNodeName}${result.virtualEdge ? ' with an end-to-end virtual edge' : ''}`,
      'Layout Tools'
    )
  } catch (error) {
    closeRepeaterChainGenerator()
    showAlert('Unable to generate repeater chain', error.message)
  }
}

function openStarNetworkGenerator() {
  if (isNetworkEditingDisabled.value) {
    showAlert(
      'Layout tools unavailable',
      'Reset or stop the simulation before changing the network layout.'
    )
    return
  }
  showStarNetworkDialog.value = true
}

function closeStarNetworkGenerator() {
  showStarNetworkDialog.value = false
}

function handleGenerateStarNetwork(options) {
  if (isNetworkEditingDisabled.value) {
    closeStarNetworkGenerator()
    showAlert(
      'Layout tools unavailable',
      'Reset or stop the simulation before changing the network layout.'
    )
    return
  }

  try {
    const centerName = projectData.value.net.nodes.find(node => node.id === options.centerNodeId)?.name
    const result = generateStarNetwork(projectData.value.net, options)

    if (
      selectedItem.value?.id === result.removedNode.id
      || selectedItem.value?.id === result.removedEdge.id
    ) {
      handleSelect(null, null)
    }

    closeStarNetworkGenerator()
    addLog(
      'success',
      `Generated a star with ${result.generatedNodes.length} peripheral nodes around ${centerName}`,
      'Layout Tools'
    )
  } catch (error) {
    closeStarNetworkGenerator()
    showAlert('Unable to generate star network', error.message)
  }
}

function openGraphNetworkGenerator() {
  if (isNetworkEditingDisabled.value) {
    showAlert(
      'Layout tools unavailable',
      'Reset or stop the simulation before changing the network layout.'
    )
    return
  }
  showGraphNetworkDialog.value = true
}

function closeGraphNetworkGenerator() {
  showGraphNetworkDialog.value = false
}

function handleGenerateGraphNetwork(options) {
  if (isNetworkEditingDisabled.value) {
    closeGraphNetworkGenerator()
    showAlert(
      'Layout tools unavailable',
      'Reset or stop the simulation before changing the network layout.'
    )
    return
  }

  try {
    const result = generateGraphNetwork(projectData.value.net, options)
    const removedIds = new Set([
      ...result.removedNodes.map(node => node.id),
      result.removedEdge.id
    ])
    if (removedIds.has(selectedItem.value?.id)) {
      handleSelect(null, null)
    }

    const topologyDescription = result.topology === GRAPH_TOPOLOGIES.GRID
      ? `${result.summary.xCount} by ${result.summary.yCount} grid`
      : `${result.generatedNodes.length}-node all-to-all network`
    closeGraphNetworkGenerator()
    addLog('success', `Generated a ${topologyDescription}`, 'Layout Tools')
  } catch (error) {
    closeGraphNetworkGenerator()
    showAlert('Unable to generate graph network', error.message)
  }
}


function handleMenu(action) {
  if (action === 'new') {
    // Check for unsaved changes before creating new project
    if (hasUnsavedChanges()) {
      pendingAction.value = { type: 'new' }
      showUnsavedChangesDialog.value = true
      return
    }
    projectNameDialogMode.value = 'new'
    projectNameDialogInitialValue.value = ''
    showProjectNameDialog.value = true
  } else if (action === 'save') {
    if (!currentProjectName.value) {
      // hsow dialog to enter project name
      showProjectNameDialog.value = true
      projectNameDialogMode.value = 'saveas'
      projectNameDialogInitialValue.value = ''
      showProjectNameDialog.value = true
      return
    }
    saveProject()
    
  } else if (action === 'open') {
    // Check for unsaved changes before opening project
    if (hasUnsavedChanges()) {
      pendingAction.value = { type: 'open' }
      showUnsavedChangesDialog.value = true
      return
    }
    // Get all projects sorted by most recently opened
    const recentProjects = ProjectStore.getRecentProjects(50) // Higher limit for full list
    loadProjectList.value = recentProjects;
    showLoadDialog.value = true
  } else if (action === 'import') {
    // Check for unsaved changes before importing
    if (hasUnsavedChanges()) {
      pendingAction.value = { type: 'import' }
      showUnsavedChangesDialog.value = true
      return
    }
    importProject()
  } else if (action === 'export') {
    exportProject()
  } else if (action === 'saveas') {
    handleSaveAs()
  } else if (action === 'json') {
    toggleJsonViewerVisibility()
  } else if (action === 'about') {
    showAboutModal.value = true
  }
}

function toggleJsonViewerVisibility(){
  showJsonViewer.value = !showJsonViewer.value
  localStorage.setItem('showJsonViewer', showJsonViewer.value)
}

function handleProjectNameConfirm(projectName) {
  if (projectNameDialogMode.value === 'new') {
    createNewProject(projectName)
  } else if (projectNameDialogMode.value === 'saveas') {
    createSaveAsProject(projectName)
    // If there's a pending action (from unsaved changes dialog), execute it
    if (pendingAction.value) {
      const action = pendingAction.value
      pendingAction.value = null
      // Execute the pending action after a short delay to ensure project is saved
      nextTick(() => {
        executePendingAction(action)
      })
    }
  }
  showProjectNameDialog.value = false
}

function handleProjectNameCancel() {
  showProjectNameDialog.value = false
}

function handleOpenProjectSelect(projectName) {
  showLoadDialog.value = false
  // Check for unsaved changes before opening project
  if (hasUnsavedChanges()) {
    pendingAction.value = { type: 'open', projectName: projectName }
    showUnsavedChangesDialog.value = true
    return
  }
  openProject(projectName)
}

function handleOpenProjectClose() {
  showLoadDialog.value = false
}

function handleNewProjectFromDialog() {
  showLoadDialog.value = false
  handleMenu('new')
}

function handleImportProjectFromDialog() {
  showLoadDialog.value = false
  handleMenu('import')
}

const handleDeleteProject = handleDeleteProjectPM

function toggleJsonViewerMode(){
  jsonViewerMode.value = jsonViewerMode.value === 'full' ? 'minimized' : 'full'
  localStorage.setItem('jsonViewerMode', jsonViewerMode.value)
}


function handleSaveAs() {
  if (!currentProjectName.value) {
    showAlert('Save As', 'No project to save. Please create or open a project first.')
    return
  }
  
  projectNameDialogMode.value = 'saveas'
  projectNameDialogInitialValue.value = generateCopyName(currentProjectName.value)
  showProjectNameDialog.value = true
}

// Handle unsaved changes dialog actions
function handleUnsavedChangesSave() {
  showUnsavedChangesDialog.value = false
  const action = pendingAction.value
  pendingAction.value = null
  
  // Save the project first
  if (currentProjectName.value) {
    saveProject()
  } else {
    // If no project name, show save as dialog first
    handleSaveAs()
    // Store the pending action to execute after save
    pendingAction.value = action
    return
  }
  
  // Execute the pending action
  executePendingAction(action)
}

function handleUnsavedChangesDiscard() {
  showUnsavedChangesDialog.value = false
  const action = pendingAction.value
  pendingAction.value = null
  
  // Mark as saved (discard changes)
  markAsSaved()
  
  // Execute the pending action
  executePendingAction(action)
}

function handleUnsavedChangesCancel() {
  showUnsavedChangesDialog.value = false
  pendingAction.value = null
}

function executePendingAction(action) {
  if (!action) return
  
  switch (action.type) {
    case 'new':
      projectNameDialogMode.value = 'new'
      projectNameDialogInitialValue.value = ''
      showProjectNameDialog.value = true
      break
    case 'open':
      if (action.projectName) {
        // Opening specific project from dropdown or dialog
        openProject(action.projectName)
      } else {
        // Opening project list dialog
        const recentProjects = ProjectStore.getRecentProjects(50)
        loadProjectList.value = recentProjects
        showLoadDialog.value = true
      }
      break
    case 'import':
      importProject()
      break
    case 'demo':
      loadDemoProject(action.demoData)
      break
  }
}

onMounted( async () => {
  // Capture the startup restore target before any await. A user can create or
  // open a project while platform metadata is loading; that newer session must
  // not be replaced by a late read of `recentProjectName`.
  const startupRecentProjectName = localStorage.getItem('recentProjectName')
  const startupTransitionGeneration = projectTransitionGeneration.value

  // fetch platform info
  await api.fetchPlatformInfo()
  // One-time migration: ensure metadata index exists for existing projects
  const metadataIndex = ProjectStore.getMetadataIndex()
  const existingProjects = ProjectStore.listProjects()
  
  // If index is empty but projects exist, rebuild it
  if (Object.keys(metadataIndex).length === 0 && existingProjects.length > 0) {
    ProjectStore.rebuildMetadataIndex()
  }
  
  // Restore only if no user-initiated project transition won the startup race.
  if (
    startupRecentProjectName
    && !currentProjectName.value
    && projectTransitionGeneration.value === startupTransitionGeneration
  ) {
    await openProject(startupRecentProjectName)
  }
  
  startAlivePolling();
  
  // Add beforeunload handler to warn about unsaved changes
  window.addEventListener('beforeunload', handleBeforeUnload)
})

// Handle browser beforeunload event to warn about unsaved changes
function handleBeforeUnload(event) {
  if (hasUnsavedChanges()) {
    // Modern browsers ignore the message but still show a dialog
    event.preventDefault()
    // For older browsers
    event.returnValue = ''
    return ''
  }
}

// Clean up beforeunload handler on unmount
onUnmounted(() => {
  resolveConfirmation(false)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  disposeProjectSession()
  disposeSimulationController()
  disposeLegacyBridge()
})
</script>

<template>
  <div>
    <SmallScreenWarning />
    <div class="topbar">
      <div class="topbar-title">
        <img src="./assets/logo.png" alt="WebQuantumSavory Logo" class="topbar-logo">
        WebQuantumSavory Simulation Builder
        <span class="version-badge">v{{ appVersion }}</span>
      </div>
      <div class="topbar-right">
        <div class="topbar-menu">
          <div v-if="currentProjectName" class="project-name-container">
            <span class="project-name-label" :title="currentProjectName">{{ currentProjectName }}</span>
          </div>
          
          <div class="action-buttons">
            <button class="menu-btn hamburger-btn" @click="toggleMainMenu" aria-label="Menu">
              <MenuIcon :size="28" aria-hidden="true" />
            </button>
            <TieredMenu ref="mainMenuElement" id="main_menu" :model="mainMenuItems" :popup="true">
              <template #itemicon="{ item }">
                <LucideMenuIcon :item="item" />
              </template>
              <template #submenuicon>
                <ChevronRight :size="15" aria-hidden="true" />
              </template>
            </TieredMenu>
          </div>
        </div>
      </div>
    </div>
    <div class="app">
      <div class="main-panel">
        <BaseMap 
          ref="baseMapInstance"
          :nodes="projectData.net.nodes"
          :edges="projectData.net.edges"
          :selected-item="selectedItem"
          :selected-type="selectedType"
          :center="mapCenter"
          :zoom="mapZoom"
          @select="handleSelect"
          @map-click="handleMapClickComposable"
          @edge-created="handleEdgeCreated"
          @map-state-change="handleMapStateChangeComposable"
          @delete="deleteSelected"
          :style="'https://tiles.stadiamaps.com/styles/alidade_smooth.json'"
        />
      </div>
      


      <!---------------- RIGHT SIDEBAR -------------->
      <!-- Sidebar Toggle Button (outside sidebar so it doesn't slide with it) -->
      <button 
        v-if="projectData"
        class="sidebar-toggle-btn" 
        :class="{ 'sidebar-toggle-btn-hidden': !isRightSidebarVisible }"
        @click="toggleRightSidebar"
        :title="isRightSidebarVisible ? 'Hide panel' : 'Show panel'"
      >
        <PanelRightClose v-if="isRightSidebarVisible" :size="15" aria-hidden="true" />
        <PanelRightOpen v-else :size="15" aria-hidden="true" />
      </button>
      
      <div 
        class="sidebar sidebar-right" 
        :class="{ 'sidebar-hidden': !isRightSidebarVisible }"
        v-if="projectData"
      >
        <div class="info-panel">
            <div style="padding: 1px 4px 0px !important;">
              <RunnerPanel 
                id="runnerPanel" 
                :projectData="projectData" 
                :simulationStatus="simulationStatus" 
                :simulationState="{ ...simulationState, hasSimulationRun: isNetworkEditingDisabled }"
                :phase="simulationPhase"
                :capabilities="simulationCapabilities"
                @run="runSimulationWithSteps" 
                @pause="pauseSimulation"
                @resume="resumeSimulation"
                @stop="stopSimulation"
                @prepareNetworkGraph="prepareNetworkGraph" 
                @prepareSimulation="prepareSimulation"
            />
            </div>
          <div class="custom-panels-container">
            <!-- First Panel: NodePanel or EdgePanel -->
            <div 
              class="custom-panel"
              :style="{ flex: panelFlexValues.first }"
            >
              <!-- NodePanel for selected node -->
              <NodePanel
                id="nodePanel" 
                v-if="selectedType === 'node' && selectedItem"
                :key="selectedItem && selectedItem.id"
                :node="selectedItem" 
                :nodeIndex="selectedNodeIndex"
                :justCreated="justCreatedNode"
                :simulationState="{ ...simulationState, hasSimulationRun: isNetworkEditingDisabled }"
                :variables="projectData.variables"
                v-model:collapsed="panelCollapsedStates.selectedElementPanel"
                @delete="deleteSelected"
                @name-edit-complete="justCreatedNode = false"
              />
              <!-- EdgePanel for selected edge -->
              <EdgePanel 
                id="edgePanel" 
                v-else-if="selectedType === 'edge' && selectedItem"
                :projectData="projectData"
                :key="selectedItem && selectedItem.id"
                :edge="selectedItem"
                :simulationState="{ ...simulationState, hasSimulationRun: isNetworkEditingDisabled }"
                :variables="projectData.variables"
                v-model:collapsed="panelCollapsedStates.selectedElementPanel"
                @delete="deleteSelected"
              />
              <VoidPanel 
                v-else
                v-model:collapsed="panelCollapsedStates.selectedElementPanel"
              >Nothing Selected</VoidPanel>
            </div>
            
            <!-- Node List Panel -->
            <div 
              class="custom-panel"
              :style="{ flex: panelFlexValues.nodeList }"
            >
              <NodeListPanel
                id="nodeListPanel" 
                :nodes="projectData.net.nodes"
                :selected-node="selectedItem && selectedType === 'node' ? selectedItem : null"
                :simulationState="{ ...simulationState, hasSimulationRun: isNetworkEditingDisabled }"
                v-model:collapsed="panelCollapsedStates.nodeListPanel"
                @select="node => handleSelect(node, 'node')" 
                @addNewNode="addNodeClickHandler"
                @move-node="moveNode"
              />
            </div>
            
            <!-- Edge List Panel -->
            <div 
              class="custom-panel"
              :style="{ flex: panelFlexValues.edgeList }"
            >
              <EdgeListPanel
                id="edgeListPanel" 
                :projectData="projectData" 
                :edges="projectData.net.edges"
                :selected-edge="selectedItem && selectedType === 'edge' ? selectedItem : null"
                :simulationState="{ ...simulationState, hasSimulationRun: isNetworkEditingDisabled }"
                v-model:collapsed="panelCollapsedStates.edgeListPanel"
                @select="edge => handleSelect(edge, 'edge')"
              />
            </div>
            
            <!-- Floating Protocols Panel -->
            <div 
              class="custom-panel"
              :style="{ flex: panelFlexValues.floating }"
            >
              <FloatingProtocolsPanel 
                id="floatingProtocolsPanel" 
                v-if="api.config.value.protocolTypes?.floating"
                :protocols="projectData.net.protocols"
                :simulationState="{ ...simulationState, hasSimulationRun: isNetworkEditingDisabled }"
                :variables="projectData.variables"
                v-model:collapsed="panelCollapsedStates.floatingProtocolsPanel"
              />
              <div v-else></div>
            </div>
          </div>

          

        </div>
      </div>
    </div>

    <!-- Tabbed tools panel at bottom -->
    <div class="logs-panel-container">
      <BottomPanel
        :logs="applicationLogs"
        :max-logs="200"
        :show-timestamps="true"
        :allow-clear="true"
        :helpers-disabled="isNetworkEditingDisabled"
        :variables="projectData.variables"
        :project-data="projectData"
        :export-script-payload="exportScriptPayload"
        :variables-disabled="isNetworkEditingDisabled"
        :right-sidebar-visible="isRightSidebarVisible"
        v-model:collapsed="panelCollapsedStates.bottomPanel"
        @clear-logs="clearLogs"
        @update-description="projectData.description = $event"
        @open-repeater-chain-generator="openRepeaterChainGenerator"
        @open-star-network-generator="openStarNetworkGenerator"
        @open-graph-network-generator="openGraphNetworkGenerator"
      />
    </div>

    <RepeaterChainDialog
      :show="showRepeaterChainDialog"
      :nodes="projectData.net.nodes"
      :edges="projectData.net.edges"
      @confirm="handleGenerateRepeaterChain"
      @cancel="closeRepeaterChainGenerator"
    />

    <StarNetworkDialog
      :show="showStarNetworkDialog"
      :nodes="projectData.net.nodes"
      :edges="projectData.net.edges"
      @confirm="handleGenerateStarNetwork"
      @cancel="closeStarNetworkGenerator"
    />

    <GraphNetworkDialog
      :show="showGraphNetworkDialog"
      :nodes="projectData.net.nodes"
      :edges="projectData.net.edges"
      @confirm="handleGenerateGraphNetwork"
      @cancel="closeGraphNetworkGenerator"
    />

    <!-- Open Project Dialog Component -->
    <OpenProjectDialog
      :show="showLoadDialog"
      :projects="loadProjectList"
      @select-project="handleOpenProjectSelect"
      @close="handleOpenProjectClose"
      @delete-project="handleDeleteProject"
      @new-project="handleNewProjectFromDialog"
      @import-project="handleImportProjectFromDialog"
    />

    <!-- Import Conflict Dialog Component -->
    <ImportConflictDialog
      :show="showImportConflictDialog"
      :project-name="conflictProjectName"
      @overwrite="handleImportConflictOverwrite"
      @new-name="handleImportConflictNewName"
      @cancel="cancelImportConflict"
    />

    <!-- Project Name Dialog Component -->
    <ProjectNameDialog
      :show="showProjectNameDialog"
      :title="projectNameDialogMode === 'new' ? 'New Project' : 'Save As'"
      :confirm-button-text="projectNameDialogMode === 'new' ? 'Create' : 'Save'"
      :initial-value="projectNameDialogInitialValue"
      :mode="projectNameDialogMode"
      @confirm="handleProjectNameConfirm"
      @cancel="handleProjectNameCancel"
    />

    <!-- Unsaved Changes Dialog Component -->
    <UnsavedChangesDialog
      :show="showUnsavedChangesDialog"
      @save="handleUnsavedChangesSave"
      @discard="handleUnsavedChangesDiscard"
      @cancel="handleUnsavedChangesCancel"
    />

    <!-- About Modal Component -->
    <AboutModal
      :show="showAboutModal"
      @close="showAboutModal = false"
    />

    <!-- Alert Modal Component -->
    <AlertModal
      :show="showAlertModal"
      :title="alertModalTitle"
      :message="alertModalMessage"
      @close="closeAlertModal"
    />

    <ConfirmModal
      v-if="confirmationRequest"
      :show="true"
      :title="confirmationRequest.title"
      :message="confirmationRequest.message"
      :confirm-button-text="confirmationRequest.confirmButtonText"
      :dangerous="confirmationRequest.dangerous"
      @confirm="resolveConfirmation(true)"
      @cancel="resolveConfirmation(false)"
    />

    <div v-if="showJsonViewer" class="json-viewer-box">
      <div class="json-viewer-header" style="display: flex; align-items: center; justify-content: space-between;">
        <h3 style="cursor: pointer; text-transform: capitalize;" @click="toggleJsonViewerMode">{{jsonViewerMode}}</h3>
        <!-- close button -->
        <button class="menu-btn hamburger-btn" @click="toggleJsonViewerVisibility" aria-label="Close">
          <X :size="22" aria-hidden="true" />
        </button>
      </div>
      <JsonViewer :value="jsonViewerMode === 'full' ? projectData : minimizedProjectData" expanded :expandDepth="10" copyable boxed sort theme="light">
        <template #copy="{ copied }">
          <span class="json-copy-control">
            <Check v-if="copied" :size="15" aria-hidden="true" />
            <Copy v-else :size="15" aria-hidden="true" />
            <span class="visually-hidden">{{ copied ? 'Copied JSON' : 'Copy JSON' }}</span>
          </span>
        </template>
      </JsonViewer>
    </div>


    <!-- Floating result windows -->
    <ResultsView
      v-for="window in resultWindows"
      :key="window.id"
      :ref="(el) => {
        // Handle both single ref and array (Vue may pass array in some cases)
        const ref = Array.isArray(el) ? el[0] : el
        if (ref) {
          registerWindowRef(window.id, ref)
        } else {
          unregisterWindowRef(window.id)
        }
      }"
      :windowId="window.id"
      :itemDetails="{ type: window.type, item: window.item, context: window.context }"
      :position="window.position"
      :size="window.size"
      :zIndex="window.zIndex"
      :projectData="projectData"
      @close="closeResultWindow(window.id)"
      @bring-to-front="bringWindowToFront(window.id)"
      @update-position="updateWindowPosition(window.id, $event)"
      @update-size="updateWindowSize(window.id, $event)"
    />
  </div>
</template>

<!-- Styles extracted to assets/app.css and imported via main.js -->

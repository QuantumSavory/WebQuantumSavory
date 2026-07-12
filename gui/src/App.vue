<script setup>
import { reactive, ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import BaseMap from './components/map/BaseMap.vue'
import Node from './models/Node'
import Edge from './models/Edge'
import NodePanel from './components/panels/NodePanel.vue'
import ProjectStore from './models/ProjectStore.js'
import NodeListPanel from './components/panels/NodeListPanel.vue'
import RunnerPanel from './components/panels/RunnerPanel.vue'
import FloatingProtocolsPanel from './components/panels/FloatingProtocolsPanel.vue'
import FloatingProtocol from './models/FloatingProtocol'
import EdgeProtocol from './models/EdgeProtocol'
import { api } from './utils/ApiConnector'
import {JsonViewer} from "vue3-json-viewer"
import { generateUUid, setEdgeCorrectNodeOrder } from './utils/Utils'
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
import RepeaterChainDialog from './components/RepeaterChainDialog.vue'
import packageJson from '../package.json'
import VoidPanel from './components/panels/VoidPanel.vue'
import ResultsView from './components/panels/ResultsView.vue'
import LucideMenuIcon from './components/LucideMenuIcon.vue'

// Import composables
import { useSimulation } from './composables/useSimulation.js'
import { usePolling } from './composables/usePolling.js'
import { usePanelLayout } from './composables/usePanelLayout.js'
import { useWindowManagement } from './composables/useWindowManagement.js'
import { useNodeEdgeOperations } from './composables/useNodeEdgeOperations.js'
import { useProjectManagement } from './composables/useProjectManagement.js'
import { useImportExport } from './composables/useImportExport.js'
import { useDialogs } from './composables/useDialogs.js'
import { useAppState } from './composables/useAppState.js'
import { useUnsavedChanges } from './composables/useUnsavedChanges.js'

// Import utils
import { validatePayload, generateRandomNodes, generateRandomEdges, getNodeById, getNodeBySlotId } from './utils/projectHelpers.js'
import { showEntangledSlots as showEntangledSlotsUtil, hideSlotState } from './utils/windowHelpers.js'
import { fetchBackendLogs, mapBackendLogLevel, compareVersionsMismatch } from './utils/backendHelpers.js'
import { isEntangledStateStillValid } from './utils/SlotConnectionUtils.js'
import { generateRepeaterChain } from './utils/repeaterChain.js'

// Import demo projects
import demo1 from './demos/1.Entangler.Example.json'
import demo2 from './demos/2.Entangler.Example.with.consumer.json'


const baseMapInstance = ref(null);

const TIME_STEP = 0.1;

// Default map configuration (must be defined before composables that use it)
const DEFAULT_MAP_CENTER = [-98.5795, 39.8283] // Roughly the center of continental US
const DEFAULT_MAP_ZOOM = 4 // Zoom level to show most of the US

// Initialize composables
const projectData = ref({
  name: 'New Project',
  variables: [],
  simulationConfig: {
    time: 1.0,
    timeStep: 0.1,
  },
  net: {
    nodes: [],
    edges: [],
    protocols: []
  }
})

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

// Minimized project data - cleans up project data for API calls
const minimizedProjectData = computed(() => {
  const projectCopy = JSON.parse(JSON.stringify(projectData.value))
  
  // Remove simulation config from the project data
  delete projectCopy.simulationConfig

  // Keep global variable definitions free of editor-only validation state.
  projectCopy.variables = (projectCopy.variables || []).map(variable => ({
    id: variable.id,
    name: variable.name,
    type: variable.type,
    value: variable.value
  }))
  
  // Exclusion lists
  const excludeCommon = ['sim', 'net']
  const excludeNode = [...excludeCommon, 'node']
  const excludeEdge = [...excludeCommon, 'nodeA', 'nodeB']

  // Clean Up Node Nodes
  projectCopy.net.nodes.forEach(node => {
    // Clean Up slot bg noises and ui-state properties
    node.data.slots.forEach(slot => {
      // delete ui-state properties
      delete slot.ui_expanded

      // Properly format background noise to object
      if (typeof slot.backgroundNoise === 'string') {
        slot.backgroundNoise = {
          type: slot.backgroundNoise,
          parameters: []
        }
      } else {
        delete slot.backgroundNoise.doc
        slot.backgroundNoise.parameters = slot.backgroundNoise.parameters.filter(p => {
          const valueIsNull = p.value == null || p.value == ""
          return !valueIsNull
        })
        slot.backgroundNoise.parameters = slot.backgroundNoise.parameters.map(p => {
          const cleanParam = {
            name: p.field,
            value: p.value
          }
          return cleanParam
        })
      }
    })
    // Clean Up Node Protocol parameters
    node.data.protocols.forEach(protocol => {
      protocol.parameters = protocol.parameters.filter(p => {
        // set type
        if (p.selectedType != null) {
          p.type = p.selectedType
          delete p.selectedType
        }
        const isExcluded = excludeNode.includes(p.name)
        const valueIsNull = p.value == null || p.value == ""
        return !isExcluded && !valueIsNull
      })
    })
  })

  // Clean Up Edge Protocol parameters
  projectCopy.net.edges.forEach(edge => {
    edge.data.protocols.forEach(protocol => {
      protocol.parameters = protocol.parameters.filter(p => {
        // set type
        if (p.selectedType != null) {
          p.type = p.selectedType
          delete p.selectedType
        }
        const isExcluded = excludeEdge.includes(p.name)
        const valueIsNull = p.value == null || p.value == ""
        return !isExcluded && !valueIsNull
      })
    })
  })

  // Clean Up Floating Protocol parameters
  projectCopy.net.protocols.forEach(protocol => {
    protocol.parameters = protocol.parameters.filter(p => {
      // set type
      if (p.selectedType != null) {
        p.type = p.selectedType
        delete p.selectedType
      }
      const isExcluded = excludeEdge.includes(p.name)
      const valueIsNull = p.value == null || p.value == ""
      return !isExcluded && !valueIsNull
    })
  })

  // Remove read-only properties in slots
  projectCopy.net.nodes.forEach(node => {
    node.data.slots.forEach(slot => {
      delete slot.isLocked
      delete slot.assignment
      delete slot.lastOperationTime
      delete slot.representationType
    })
  })

  return projectCopy
})

const exportScriptPayload = computed(() => ({
  ...minimizedProjectData.value,
  simulationConfig: {
    time: projectData.value.simulationConfig.time,
    timeStep: projectData.value.simulationConfig.timeStep
  }
}))

// Provide a temporary no-op for stopPolling to satisfy useSimulation signature
const stopPollingForSim = () => {}

// Initialize window management first (needed by useSimulation and usePolling)
const {
  resultWindows,
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
      console.log('🔍 checkAndHideInvalidEntangledStates: Displayed entangled state no longer exists, hiding it')
      
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
        console.log(`🔍 checkAndHideInvalidEntangledStates: Closing window ${window.id} associated with state ${stateId}`)
        closeResultWindow(window.id)
      })
    }
  } catch (error) {
    console.error('Error checking entangled states:', error)
  }
}

// Use composables - initialize with basic dependencies first
const {
  simulationState,
  simulationStatus,
  backendSimulation,
  isSimulationRunning,
  isSimulationPaused,
  isSimulationComplete,
  isSimulationIdle,
  currentSimulationTime,
  targetSimulationTime,
  hasSimulationRun,
  getSlotById,
  calculateSimulationProgress,
  updateSimulationStatus,
  resetSlotStates,
  resetSimulation,
  // Simulation lifecycle from composable (aliased)
  prepareNetworkGraph: prepareNetworkGraphSim,
  prepareSimulation: prepareSimulationSim,
  runSimulationWithSteps: runSimulationWithStepsSim,
  pauseSimulation: pauseSimulationSim,
  resumeSimulation: resumeSimulationSim,
  stopSimulation: stopSimulationSim,
  getSimulationStatus: getSimulationStatusSim,
  processIntermediateResults: processIntermediateResultsSim
} = useSimulation(projectData, addLog, validatePayload, minimizedProjectData, stopPollingForSim, applicationLogs, refreshAllWindows, checkAndHideInvalidEntangledStates, clearAllPlots)

// Alert modal function
function showAlert(title, message) {
  alertModalTitle.value = title
  alertModalMessage.value = message
  showAlertModal.value = true
}

function closeAlertModal() {
  showAlertModal.value = false
}

// Initialize polling composable
const {
  startPolling: startPollingComposable,
  stopPolling: stopPollingComposable, 
  startAlivePolling,
  stopAlivePolling,
} = usePolling(simulationState, simulationStatus, projectData, minimizedProjectData, addLog, updateSimulationStatus, prepareNetworkGraphSim, refreshAllWindows, checkAndHideInvalidEntangledStates, showAlert)

// Create local wrappers to use composable functions
function startPolling() {
  startPollingComposable()
}

function stopPolling() {
  stopPollingComposable()
}

// Simulation lifecycle wrappers bound to composable functions
function prepareNetworkGraph() {
  return prepareNetworkGraphSim()
}

function prepareSimulation() {
  return prepareSimulationSim()
}

function runSimulationWithSteps() {
  startAlivePolling();
  return runSimulationWithStepsSim(startPolling)
}

function pauseSimulation() {
  return pauseSimulationSim(minimizedProjectData)
}

function resumeSimulation() {
  startAlivePolling();
  return resumeSimulationSim(minimizedProjectData, startPolling)
}

function stopSimulation() {
  return stopSimulationSim(minimizedProjectData, isSimulationRunning, isSimulationPaused)
}

function getSimulationStatus(addLogs = true, updatePreviousLog = false) {
  return getSimulationStatusSim(addLogs, updatePreviousLog)
}

function processIntermediateResults(stepResults) {
  return processIntermediateResultsSim(stepResults)
}

const {
  isRightSidebarVisible,
  panelCollapsedStates,
  panelContainerKey,
  handlePanelCollapse,
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
  isCreatingNode,
  newNodeName,
  newNodeType,
  waitingForPosition,
  handleSelect,
  addNewNode,
  handleMapClick: handleMapClickComposable,
  handleMapStateChange: handleMapStateChangeComposable,
  startCreateNode,
  cancelCreateNode,
  proceedToPosition,
  createNewSlotClicked,
  deleteSelected,
  handleEdgeCreated,
  moveNode
} = useNodeEdgeOperations(projectData, hasSimulationRun, addLog)

// Initialize app state composable
const {
  showMenu,
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
  selectedNodeIndex,
  selectedItemInfo,
  toggleJsonViewerVisibility: toggleJsonViewerVisibilityState,
  toggleJsonViewerMode: toggleJsonViewerModeState
} = useAppState(projectData, selectedItem, selectedType, mapCenter, mapZoom, applicationLogs, minimizedProjectData)

// Create a ref for markAsSaved that will be set after useUnsavedChanges is initialized
const markAsSavedRef = ref(null)

// Initialize project management composable (requires dependencies from above)
const {
  openProject,
  loadDemoProject,
  createNewProject,
  createSaveAsProject,
  saveProject,
  handleDeleteProject: handleDeleteProjectPM,
  serializeProjectData,
  deserializeProjectData,
  generateCopyName
} = useProjectManagement(
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
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  TIME_STEP,
  () => markAsSavedRef.value?.(), // Pass a function that calls the ref
  resetSimulation,
  stopPolling,
  stopAlivePolling,
  closeAllResultWindows
)

// Initialize unsaved changes tracking (requires serializeProjectData from useProjectManagement)
const {
  hasUnsavedChanges,
  markAsSaved,
  markAsUnsaved,
  clearSnapshot
} = useUnsavedChanges(serializeProjectData)

// Update the ref so useProjectManagement can call markAsSaved
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
  handleImportConflictOverwrite,
  handleImportConflictNewName,
  cancelImportConflict
} = useImportExport(
  currentProjectName,
  importedProjectData,
  conflictProjectName,
  showImportConflictDialog,
  clearLogs,
  addLog,
  openProject,
  serializeProjectData,
  minimizedProjectData
)

// Project handlers are still in App.vue due to circular dependencies
// TODO: Refactor to avoid needing handleMenu defined before composables

window.showEntangledSlots = ( slotId )=>{
  console.log('🔗 showEntangledSlots: Called for slot:', slotId)
  console.log('🔗 showEntangledSlots: simulationStatus.value:', simulationStatus.value)
  console.log('🔗 showEntangledSlots: simulationStatus.value.state:', simulationStatus.value?.state)
  const allEntanglements = simulationStatus.value?.state?.slots?.entanglements;
  console.log('🔗 showEntangledSlots: All entanglements:', allEntanglements)
  if( !allEntanglements ){
    console.warn('⚠️ showEntangledSlots: No entanglements found')
    //alert('No entanglements found')
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
      const result = baseMapComponent.showSlotConnectionState(entagledState);
  } catch (error) {
      console.error('Error calling showSlotConnectionState:', error)
  }
  
}


window.hideSlotState = ()=>{
  try{
    baseMapInstance.value.hideSlotConnectionState();
  }catch(error){
    console.log('Error calling hideSlotConnectionState:', error)
  }
}


// ============= END DEBUGGING FUNCTIONS, NOT FOR PRODUCTION =============


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

// moved to useSimulation composable

const mainMenuElement = ref(null)

function toggleMainMenu(){
  mainMenuElement.value.toggle(event)
}

const jsonViewerKeyClicked = (...args  )=>{
}

// Configuration for initial data
const INITIAL_NODE_COUNT = 30;
const INITIAL_EDGE_COUNT = 60;

// US bounds roughly (longitude, latitude)
const US_BOUNDS = {
  west: -125.0,
  east: -65.0,
  south: 25.0,
  north: 49.0
}

const floatingProtocolsPanel = ref(null)

// addNodeClickHandler wrapper for the template
function addNodeClickHandler() {
  addNewNode(null, 'city', mapCenter.value)
}


// Generate initial edges for demo
projectData.value.net.edges = generateRandomEdges(projectData.value.net.nodes, INITIAL_EDGE_COUNT)


// Demo projects list
const demoProjects = [
  { name: demo1.name, data: demo1 },
  { name: demo2.name, data: demo2 }
]

const loadProjectName = ref('') // This one is still needed in App.vue for now

// App version from package.json
const appVersion = ref(packageJson.version)


// Update the most recent log entry with extended info
function updateLastLog(extendedInfo) {
  if (applicationLogs.value.length > 0) {
    const lastLog = applicationLogs.value[applicationLogs.value.length - 1]
    // Check if the last log is a "Running step" message
    if (lastLog.message.startsWith('Running step')) {
      console.log('📝 updateLastLog: Updating last log with simulation state')
      lastLog.extendedInfo = extendedInfo
      lastLog.level = 'success' // Change to success since step completed
    }
  }
}

function clearLogs() {
  applicationLogs.value = []
}

function openRepeaterChainGenerator() {
  if (hasSimulationRun.value) {
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
  if (hasSimulationRun.value) {
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
      `Generated a chain of ${result.generatedNodes.length} repeaters between ${startNodeName} and ${endNodeName}`,
      'Layout Tools'
    )
  } catch (error) {
    closeRepeaterChainGenerator()
    showAlert('Unable to generate repeater chain', error.message)
  }
}


function handleMenu(action) {
  showMenu.value = false
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
    ProjectStore.saveProject(currentProjectName.value, serializeProjectData())
    markAsSaved()
    
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

// compareVersionsMismatch and mapBackendLogLevel moved to utils/backendHelpers.js

// Use handleDeleteProject from useProjectManagement composable  
const handleDeleteProject = handleDeleteProjectPM

function toggleJsonViewerMode(){
  jsonViewerMode.value = jsonViewerMode.value === 'full' ? 'minimized' : 'full'
  localStorage.setItem('jsonViewerMode', jsonViewerMode.value)
}


function validateAndProcessImport(jsonData) {
  // Validate structure
  if (!jsonData.name || typeof jsonData.name !== 'string') {
    alert('Invalid project structure: Missing or invalid "name" property.')
    return
  }
  
  if (!jsonData.net || typeof jsonData.net !== 'object') {
    alert('Invalid project structure: Missing or invalid "net" property.')
    return
  }
  
  const net = jsonData.net
  if (!Array.isArray(net.nodes)) {
    alert('Invalid project structure: "net.nodes" must be an array.')
    return
  }
  
  if (!Array.isArray(net.edges)) {
    alert('Invalid project structure: "net.edges" must be an array.')
    return
  }
  
  if (!Array.isArray(net.protocols)) {
    alert('Invalid project structure: "net.protocols" must be an array.')
    return
  }
  
  // Check for name conflicts
  const existingProjects = ProjectStore.listProjects()
  if (existingProjects.includes(jsonData.name)) {
    // Show conflict resolution dialog
    importedProjectData.value = jsonData
    conflictProjectName.value = jsonData.name
    showImportConflictDialog.value = true
  } else {
    // No conflict, import directly
    processImport(jsonData, jsonData.name)
  }
}

function processImport(jsonData, finalName) {
  try {
    // Clear logs when importing project
    clearLogs()
    
    // Create project data with the final name
    const projectDataToImport = {
      ...jsonData,
      name: finalName
    }
    
    // Save the project
    ProjectStore.saveProject(finalName, projectDataToImport)
    
    // Load the imported project (this will also clear logs again, but that's fine)
    openProject(finalName)
    
    addLog('info', `Project imported: ${finalName}`, 'System')
    alert(`Project "${finalName}" imported successfully!`)
  } catch (error) {
    addLog('error', `Failed to import project: ${error.message}`, 'System')
    alert(`Failed to import project: ${error.message}`)
  }
}

function generateUniqueName(baseName) {
  const existingProjects = ProjectStore.listProjects()
  let counter = 2
  let uniqueName = `${baseName} ${counter}`
  
  while (existingProjects.includes(uniqueName)) {
    counter++
    uniqueName = `${baseName} ${counter}`
  }
  
  return uniqueName
}


function handleSaveAs() {
  if (!currentProjectName.value) {
    alert('No project to save. Please create or open a project first.')
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
    ProjectStore.saveProject(currentProjectName.value, serializeProjectData())
    markAsSaved()
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
  // fetch platform info
  await api.fetchPlatformInfo()
  // One-time migration: ensure metadata index exists for existing projects
  const metadataIndex = ProjectStore.getMetadataIndex()
  const existingProjects = ProjectStore.listProjects()
  
  // If index is empty but projects exist, rebuild it
  if (Object.keys(metadataIndex).length === 0 && existingProjects.length > 0) {
    ProjectStore.rebuildMetadataIndex()
  }
  
  // check if recentProjectName is in local storage
  const recentProjectName = localStorage.getItem('recentProjectName')
  if (recentProjectName) {
    openProject(recentProjectName)
  }
  
  // Force update of panel flex values after DOM is ready
  // This ensures collapsed states from localStorage are properly reflected in the layout
  await nextTick()
  panelContainerKey.value++
  console.log('🔄 Mounted: Panel flex values:', panelFlexValues.value)
  console.log('🔄 Mounted: Panel collapsed states:', panelCollapsedStates.value)

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
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <div>
    <div class="topbar">
      <div class="topbar-title">
        <img src="./assets/logo.png" alt="WebQuantumSavory Logo" class="topbar-logo">
        WebQuantumSavory Simulation Builder
        <span class="version-badge">v{{ appVersion }}</span>
      </div>
      <div class="topbar-right">
        <div class="topbar-menu" @mouseleave="showMenu = false">
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
                :simulationState="{ ...simulationState, hasSimulationRun }"
                @run="runSimulationWithSteps" 
                @pause="pauseSimulation"
                @resume="resumeSimulation"
                @stop="stopSimulation"
                @prepareNetworkGraph="prepareNetworkGraph" 
                @prepareSimulation="prepareSimulation"
            />
            </div>
          <div class="custom-panels-container" :key="panelContainerKey">
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
                :simulationState="{ ...simulationState, hasSimulationRun }"
                :variables="projectData.variables"
                @delete="deleteSelected"
                @name-edit-complete="justCreatedNode = false"
                @collapsed-changed="(collapsed) => handlePanelCollapse('node_panel', collapsed)"
              />
              <!-- EdgePanel for selected edge -->
              <EdgePanel 
                id="edgePanel" 
                v-else-if="selectedType === 'edge' && selectedItem"
                :projectData="projectData"
                :key="selectedItem && selectedItem.id"
                :edge="selectedItem"
                :simulationState="{ ...simulationState, hasSimulationRun }"
                :variables="projectData.variables"
                @delete="deleteSelected"
                @collapsed-changed="(collapsed) => handlePanelCollapse('edge_panel', collapsed)"
              />
              <VoidPanel 
                v-else
                @collapsed-changed="(collapsed) => handlePanelCollapse('void_panel', collapsed)"
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
                :simulationState="{ ...simulationState, hasSimulationRun }"
                @select="node => handleSelect(node, 'node')" 
                @addNewNode="addNodeClickHandler"
                @move-node="moveNode"
                @collapsed-changed="(collapsed) => handlePanelCollapse('node_list', collapsed)"
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
                :simulationState="{ ...simulationState, hasSimulationRun }"
                @select="edge => handleSelect(edge, 'edge')"
                @collapsed-changed="(collapsed) => handlePanelCollapse('edge_list', collapsed)"
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
                ref="floatingProtocolsPanel"    
                :protocols="projectData.net.protocols"
                :simulationState="{ ...simulationState, hasSimulationRun }"
                :variables="projectData.variables"
                @collapsed-changed="(collapsed) => handlePanelCollapse('floating_protocols', collapsed)"
              />
              <div v-else></div>
            </div>
          </div>

          

          <!-- Selected Edge Info (fallback) -->
          <!-- <template v-if="selectedItem && selectedType === 'edge'">
            <div class="selected-item">
              <h3>{{ selectedItemInfo.title }}</h3>
              <div class="item-details">
                <div v-for="detail in selectedItemInfo.details" :key="detail.label" class="detail-row">
                  <span class="detail-label">{{ detail.label }}:</span>
                  <span class="detail-value">{{ detail.value }}</span>
                </div>
              </div>
            </div>
          </template> -->
        </div>
      </div>
    </div>

    <!-- Tabbed tools panel at bottom -->
    <div class="logs-panel-container">
      <BottomPanel
        :logs="applicationLogs"
        :max-logs="50"
        :show-timestamps="true"
        :allow-clear="true"
        :helpers-disabled="hasSimulationRun"
        :variables="projectData.variables"
        :project-data="projectData"
        :export-script-payload="exportScriptPayload"
        :variables-disabled="hasSimulationRun"
        @clear-logs="clearLogs"
        @open-repeater-chain-generator="openRepeaterChainGenerator"
      />
    </div>

    <RepeaterChainDialog
      :show="showRepeaterChainDialog"
      :nodes="projectData.net.nodes"
      :edges="projectData.net.edges"
      @confirm="handleGenerateRepeaterChain"
      @cancel="closeRepeaterChainGenerator"
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

    <div v-if="showJsonViewer" class="json-viewer-box">
      <div class="json-viewer-header" style="display: flex; align-items: center; justify-content: space-between;">
        <h3 style="cursor: pointer; text-transform: capitalize;" @click="toggleJsonViewerMode">{{jsonViewerMode}}</h3>
        <!-- close button -->
        <button class="menu-btn hamburger-btn" @click="toggleJsonViewerVisibility" aria-label="Close">
          <X :size="22" aria-hidden="true" />
        </button>
      </div>
      <JsonViewer :value="jsonViewerMode === 'full' ? projectData : minimizedProjectData" expanded :expandDepth="10" copyable boxed sort theme="light"  @onKeyClick="jsonViewerKeyClicked">
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

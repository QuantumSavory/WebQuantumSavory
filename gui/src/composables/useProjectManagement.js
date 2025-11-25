import { ref, nextTick } from 'vue'
import ProjectStore from '../models/ProjectStore'
import { api } from '../utils/ApiConnector'
import { setEdgeCorrectNodeOrder } from '../utils/Utils'
import Node from '../models/Node'
import Edge from '../models/Edge'
import FloatingProtocol from '../models/FloatingProtocol'

/**
 * useProjectManagement - Composable for project CRUD operations
 * Handles opening, saving, creating, deleting projects
 */
export function useProjectManagement(
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
  markAsSaved,
  resetSimulation,
  stopPolling,
  stopAlivePolling,
  closeAllResultWindows
) {
  function resetUiStateForProjectChange() {
    if (typeof stopPolling === 'function') {
      stopPolling()
    }
    if (typeof stopAlivePolling === 'function') {
      stopAlivePolling()
    }
    if (typeof resetSimulation === 'function') {
      resetSimulation()
    }
    if (typeof closeAllResultWindows === 'function') {
      closeAllResultWindows()
    }
  }

  async function openProject(name) {
    resetUiStateForProjectChange()
    const platformInfo = await api.getPlatformInfo()
    
    const data = ProjectStore.loadProject(name)
    if (data) {
      if (data.platformInfo?.versions) {
        const mismatch = compareVersionsMismatch(data.platformInfo.versions, platformInfo.versions)
        if (mismatch) {
          const result = confirm(`This project (${name}) was saved with a different version of the software, this could cause issues with the simulation.\n\n${mismatch.join('\n')}\n\nDo you want to proceed anyway?`)
          if (result === false) {
            return
          }
        }
      }
      data.platformInfo = platformInfo
    
      clearLogs()
      window.hideSlotState()
      
      projectData.value.net = { nodes: [], edges: [], protocols: [] }
      await nextTick()
      
      const newData = deserializeProjectData(data)
      projectData.value = newData
      currentProjectName.value = name
      isDemoProject.value = false
      selectedItem.value = null
      selectedType.value = null

      ProjectStore.openProject(name, serializeProjectData())
      window.projectData = projectData.value
      localStorage.setItem('recentProjectName', name)
      
      addLog('info', `Project opened: ${name}`, 'System')
      getSimulationStatus(false)
      
      // Mark project as saved after loading
      if (markAsSaved && typeof markAsSaved === 'function') {
        markAsSaved()
      }
    } else {
      alert('Failed to load project: ' + name)
    }
  }

  async function loadDemoProject(demoData) {
    resetUiStateForProjectChange()
    const platformInfo = await api.getPlatformInfo()
    const data = JSON.parse(JSON.stringify(demoData))
    data.platformInfo = platformInfo
    
    clearLogs()
    window.hideSlotState()
    
    projectData.value.net = { nodes: [], edges: [], protocols: [] }
    await nextTick()
    
    const newData = deserializeProjectData(data)
    projectData.value = newData
    currentProjectName.value = data.name
    isDemoProject.value = true
    selectedItem.value = null
    selectedType.value = null
    
    window.projectData = projectData.value
    
    addLog('info', `Demo project loaded: ${data.name}`, 'System')
    addLog('warning', 'This is a demo project. Use "Save As" to create your own copy.', 'System')
    getSimulationStatus(false)
    
    // Mark demo project as saved after loading
    if (markAsSaved && typeof markAsSaved === 'function') {
      markAsSaved()
    }
  }

  function createNewProject(projectName) {
    resetUiStateForProjectChange()
    clearLogs()
    
    currentProjectName.value = projectName
    isDemoProject.value = false
    projectData.value = {
      name: currentProjectName.value,
      simulationConfig: { time: 1.0, timeStep: 0.1 },
      net: { nodes: [], edges: [], protocols: [] }
    }
    
    mapCenter.value = [...DEFAULT_MAP_CENTER]
    mapZoom.value = DEFAULT_MAP_ZOOM
    
    ProjectStore.saveProject(currentProjectName.value, serializeProjectData())
    addLog('info', `New project created: ${projectName}`, 'System')
    
    // Mark project as saved after creating
    if (markAsSaved && typeof markAsSaved === 'function') {
      markAsSaved()
    }
  }

  function saveProject() {
    if (!currentProjectName.value) return
    ProjectStore.saveProject(currentProjectName.value, serializeProjectData())
    
    // Mark project as saved after saving
    if (markAsSaved && typeof markAsSaved === 'function') {
      markAsSaved()
    }
  }

  function createSaveAsProject(projectName) {
    try {
      clearLogs()
      
      ProjectStore.saveProject(projectName, serializeProjectData())
      
      currentProjectName.value = projectName
      projectData.value.name = projectName
      isDemoProject.value = false
      
      localStorage.setItem('recentProjectName', projectName)
      addLog('info', `Project saved as: ${projectName}`, 'System')
      
      // Mark project as saved after save as
      if (markAsSaved && typeof markAsSaved === 'function') {
        markAsSaved()
      }
    } catch (error) {
      addLog('error', `Failed to save project: ${error.message}`, 'System')
      alert(`Failed to save project: ${error.message}`)
    }
  }

  function handleDeleteProject(projectName) {
    if (!confirm(`Are you sure you want to delete the project "${projectName}"? This action cannot be undone.`)) {
      return
    }
    
    try {
      ProjectStore.deleteProject(projectName)
      
      if (currentProjectName.value === projectName) {
        currentProjectName.value = ''
        projectData.value = {
          name: 'New Project',
          simulationConfig: { time: 1.0, timeStep: 0.1 },
          net: { nodes: [], edges: [], protocols: [] }
        }
        
        mapCenter.value = [...DEFAULT_MAP_CENTER]
        mapZoom.value = DEFAULT_MAP_ZOOM
        selectedItem.value = null
        selectedType.value = null
        localStorage.removeItem('recentProjectName')
      }
      
      addLog('warning', `Project deleted: ${projectName}`, 'System')
    } catch (error) {
      addLog('error', `Failed to delete project: ${error.message}`, 'System')
      alert(`Failed to delete project: ${error.message}`)
    }
  }

  function serializeProjectData() {
    const platformInfo = api.getPlatformInfo()
    return {
      name: currentProjectName.value,
      simulationConfig: {
        time: projectData.value.simulationConfig?.time || 1.0,
        timeStep: projectData.value.simulationConfig?.timeStep || 0.1,
      },
      platformInfo: platformInfo,
      net: {
        nodes: projectData.value.net.nodes.map(n => n.toJSON ? n.toJSON() : n),
        edges: projectData.value.net.edges.map(e => ({
          id: e.id,
          source: e.source.id || e.source,
          target: e.target.id || e.target,
          isLogic: e.isLogic || false,
          data: e.data
        })),
        protocols: projectData.value.net.protocols.map(p => p.toJSON ? p.toJSON() : p),
      },
      uiGlobal: {
        map: {
          zoom: mapZoom.value,
          position: [...mapCenter.value]
        }
      }
    }
  }

  function deserializeProjectData(data) {
    const nodes = (data.net.nodes || []).map(n => new Node(n))
    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))
    const edges = (data.net.edges || []).map(e => {
      const edge = new Edge({
        id: e.id,
        source: nodeMap[e.source] || e.source,
        target: nodeMap[e.target] || e.target,
        isLogic: e.isLogic || false,
        data: e.data
      })
      setEdgeCorrectNodeOrder(edge, nodes)
      return edge
    })
    const floating_protocols = (data.net.protocols || []).map(p => new FloatingProtocol(p))

    nodes.forEach(node => {
      node.data.slots.forEach(slot => {
        if (slot.backgroundNoise === 'default' || slot.backgroundNoise == null || slot.backgroundNoise == '' || slot.backgroundNoise == undefined) {
          slot.backgroundNoise = api.getDefaultBgNoise()
        }
      })
    })
    
    if (data.uiGlobal?.map) {
      mapCenter.value = [...data.uiGlobal.map.position] || [...DEFAULT_MAP_CENTER]
      mapZoom.value = data.uiGlobal.map.zoom || DEFAULT_MAP_ZOOM
    } else {
      mapCenter.value = [...DEFAULT_MAP_CENTER]
      mapZoom.value = DEFAULT_MAP_ZOOM
    }
    
    return {
      name: data.name,
      simulationConfig: {
        time: Math.max(1.0, (data.simulationConfig?.time || 1.0)),
        timeStep: Math.max(TIME_STEP, (data.simulationConfig?.timeStep || 0.1)),
      },
      net: { nodes, edges, protocols: floating_protocols }
    }
  }

  function compareVersionsMismatch(projectVersions, currentVersions) {
    let mismatch = false
    const project_julia_version = projectVersions.julia.split('.')[0]
    const project_quantumSavory_version = projectVersions.quantumSavory.split('.')[0]
    const project_app_version = projectVersions.app.split('.')[0]
    
    const current_julia_version = currentVersions.julia.split('.')[0]
    const current_quantumSavory_version = currentVersions.quantumSavory.split('.')[0]
    const current_app_version = currentVersions.app.split('.')[0]

    const report = []
    if (project_julia_version !== current_julia_version) {
      mismatch = true
      report.push(`Julia: ${projectVersions.julia} vs ${currentVersions.julia}`)
    }
    if (project_quantumSavory_version !== current_quantumSavory_version) {
      mismatch = true
      report.push(`QuantumSavory: ${projectVersions.quantumSavory} vs ${currentVersions.quantumSavory}`)
    }
    if (project_app_version !== current_app_version) {
      mismatch = true
      report.push(`App: ${projectVersions.app} vs ${currentVersions.app}`)
    }
    if (mismatch) {
      return report
    }
    return null
  }

  function generateCopyName(baseName) {
    const existingProjects = ProjectStore.listProjects()
    let copyName = `${baseName} (copy)`
    
    if (existingProjects.includes(copyName)) {
      let counter = 2
      while (existingProjects.includes(`${baseName} (copy ${counter})`)) {
        counter++
      }
      copyName = `${baseName} (copy ${counter})`
    }
    
    return copyName
  }

  return {
    openProject,
    loadDemoProject,
    createNewProject,
    createSaveAsProject,
    saveProject,
    handleDeleteProject,
    serializeProjectData,
    deserializeProjectData,
    compareVersionsMismatch,
    generateCopyName
  }
}


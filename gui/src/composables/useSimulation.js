import { ref, computed } from 'vue'
import { api } from '../utils/ApiConnector'

// Helper function for updating last log
function getUpdateLastLogFunc(applicationLogs) {
  return function(extendedInfo) {
    if (applicationLogs.value.length > 0) {
      const lastLog = applicationLogs.value[applicationLogs.value.length - 1]
      if (lastLog.message.startsWith('Running step')) {
        console.log('📝 updateLastLog: Updating last log with simulation state')
        lastLog.extendedInfo = extendedInfo
        lastLog.level = 'success'
      }
    }
  }
}

// Helper function to extract error message from API response
// Handles different response formats: message, error, details.error, detail
function extractErrorMessage(response, fallback = 'Unknown error') {
  if (!response) return fallback
  return response.message || 
         response.error || 
         response.details?.error || 
         response.detail || 
         fallback
}

/**
 * useSimulation - Composable for simulation state and operations
 * Extracted from App.vue to improve code organization
 */
export function useSimulation(projectData, addLog, validatePayload, minimizedProjectData, stopPolling, applicationLogs, refreshAllWindows, checkAndHideInvalidEntangledStates) {
  // Helper for updateLastLog
  const updateLastLogLocal = getUpdateLastLogFunc(applicationLogs)
  
  // Simulation state management
  const simulationState = ref({
    isParsed: false,
    isPrepared: false,
    cumulativeTargetTime: 0,
    pollingActive: false,
    statePollingTimeout: null,
    logsPollingInterval: null, 
    alivePollingInterval: null
  })

  const simulationStatus = ref({
    status: 'stopped',
    message: '',
    state: null
  })

  // Computed states derived from backend
  const backendSimulation = computed(() => simulationStatus.value.state?.simulation || {})

  const isSimulationRunning = computed(() => {
    return backendSimulation.value.simulation_running === true && 
           backendSimulation.value.simulation_paused !== true
  })

  const isSimulationPaused = computed(() => {
    return backendSimulation.value.simulation_paused === true
  })

  const isSimulationComplete = computed(() => {
    const sim = backendSimulation.value
    return sim.simulation_running === false && 
           sim.simulation_progress >= sim.simulation_time &&
           sim.simulation_progress > 0
  })

  const isSimulationIdle = computed(() => {
    const sim = backendSimulation.value
    return !sim.simulation_running && 
           !sim.simulation_paused && 
           (sim.simulation_progress || 0) === 0
  })

  const currentSimulationTime = computed(() => {
    return backendSimulation.value.simulation_progress || 0
  })

  const targetSimulationTime = computed(() => {
    return backendSimulation.value.simulation_time || projectData.value.simulationConfig?.time || 1.0
  })

  const hasSimulationRun = computed(() => {
    return simulationState.value.cumulativeTargetTime > 0
  })

  // Helper functions
  function getSlotById(slotId) {
    let result = null
    projectData.value.net.nodes.forEach(node => {
      const slot = node.data.slots.find(slot => slot.id === slotId)
      if( slot ){
        result = slot
      }
    })
    return result
  }

  function calculateSimulationProgress(sim) {
    if (!sim.simulation_progress || !sim.simulation_time) {
      return 0
    }
    const cumulativeTargetTime = simulationState.value.cumulativeTargetTime || projectData.value.simulationConfig?.time || 1.0
    const maxTime = Math.max(sim.simulation_time, cumulativeTargetTime)
    const progress = (sim.simulation_progress / maxTime) * 100
    return Math.min(Math.round(progress), 100)
  }

  function updateSimulationStatus() {
    if( !simulationStatus.value?.state?.slots?.slots ){
      return
    }
    const updatedSlots = simulationStatus.value.state.slots.slots
    updatedSlots.forEach(slot => {
      const slotToUpdate = getSlotById(slot.slot_id)
      if( slotToUpdate ){
        slotToUpdate.isLocked = slot.is_locked
        slotToUpdate.assignment = slot.is_assigned
      }
    })
  }

  function resetSlotStates() {
    projectData.value.net.nodes.forEach(node => {
      node.data.slots.forEach(slot => {
        slot.isLocked = false
        slot.assignment = false
      })
    })
  }

  function resetSimulation() {
    simulationState.value.isParsed = false
    simulationState.value.isPrepared = false
    simulationState.value.cumulativeTargetTime = 0
    resetSlotStates()
    window.hideSlotState?.()
    simulationStatus.value = {
      status: 'stopped',
      message: 'Simulation reset',
      state: null
    }
  }

  // Simulation lifecycle functions
  async function prepareNetworkGraph(showSuccessLogs=true) {
    const validation = validatePayload(minimizedProjectData.value)
    if (!validation.success) {
      alert(validation.error)
      return
    }
    
    console.log('🔄 prepareNetworkGraph: Resetting simulation state')
    resetSimulation()
    
    if( showSuccessLogs )
      addLog('info', 'Parsing network graph...', 'Backend');

    simulationStatus.value = {
      status: 'processing',
      message: 'Parsing network graph...'
    }
    const response = await api.parseNetworkGraph(minimizedProjectData.value)
    if (response.success === false) {
      const errorMsg = extractErrorMessage(response, 'Failed to parse network graph')
      addLog('error', 'Failed to parse network graph', 'Backend', JSON.stringify(response, null, 2))
      simulationStatus.value = {
        status: 'error',
        message: errorMsg
      }
    } else {
      simulationState.value.isParsed = true
      if( showSuccessLogs )
        addLog('success', 'Network graph parsed OK', 'Backend', JSON.stringify(response, null, 2));
      simulationStatus.value = {
        status: 'ready',
        message: response.message
      }
    }
  }

  async function prepareSimulation() {
    const validation = validatePayload(minimizedProjectData.value)
    if (!validation.success) {
      alert(validation.error)
      return
    }
    addLog('info', 'Preparing simulation...', 'Backend')
    simulationStatus.value = {
      status: 'processing',
      message: 'Preparing simulation...'
    }
    const response = await api.prepareSimulation(minimizedProjectData.value)
    if (response.success === false) {
      const errorMsg = extractErrorMessage(response, 'Failed to prepare simulation')
      addLog('error', 'Failed to prepare simulation', 'Backend', JSON.stringify(response, null, 2))
      simulationStatus.value = {
        status: 'error',
        message: errorMsg
      }
    } else {
      simulationState.value.isPrepared = true
      addLog('success', 'Simulation prepared OK', 'Backend', JSON.stringify(response, null, 2))
      simulationStatus.value = {
        status: 'ready',
        message: response.message
      }
    }
  }

  async function runSimulationWithSteps(startPolling) {
    console.log('🚀 runSimulation: Starting simulation')
    
    const validation = validatePayload(minimizedProjectData.value)
    if (!validation.success) {
      console.error('❌ runSimulation: Validation failed', validation.error)
      alert(validation.error)
      return
    }

    const additionalTime = projectData.value.simulationConfig?.time || 1.0
    const newCumulativeTargetTime = simulationState.value.cumulativeTargetTime + additionalTime
    
    console.log('📊 runSimulation: Configuration', {
      additionalTime,
      previousCumulative: simulationState.value.cumulativeTargetTime,
      newCumulativeTargetTime
    })
    
    simulationStatus.value = {
      status: 'processing',
      message: 'Initializing simulation...'
    }

    addLog('info', `Starting simulation: adding ${additionalTime}s (total target: ${newCumulativeTargetTime}s)`, 'Backend')

    try {
      if (!simulationState.value.isParsed) {
        console.log('🔧 runSimulation: Parsing network graph')
        addLog('info', 'Parsing network graph...', 'Backend')
        const parseResponse = await api.parseNetworkGraph(minimizedProjectData.value)
        if (parseResponse.success === false) {
          const errorMsg = extractErrorMessage(parseResponse, 'Failed to parse network graph')
          const error = new Error(`Failed to parse network graph: ${errorMsg}`)
          error.response = parseResponse
          throw error
        }
        simulationState.value.isParsed = true
        console.log('✅ runSimulation: Network graph parsed')
      }

      if (!simulationState.value.isPrepared) {
        console.log('🔧 runSimulation: Preparing simulation')
        addLog('info', 'Preparing simulation...', 'Backend')
        const prepareResponse = await api.prepareSimulation(minimizedProjectData.value)
        if (prepareResponse.success === false) {
          const errorMsg = extractErrorMessage(prepareResponse, 'Failed to prepare simulation')
          const error = new Error(`Failed to prepare simulation: ${errorMsg}`)
          error.response = prepareResponse
          throw error
        }
        simulationState.value.isPrepared = true
        console.log('✅ runSimulation: Simulation prepared')
      }

      simulationState.value.cumulativeTargetTime = newCumulativeTargetTime

      console.log('🔄 runSimulation: Starting simulation run to', newCumulativeTargetTime, 's')
      addLog('info', `Running simulation to ${newCumulativeTargetTime}s`, 'Backend')
      
      api.runSimulation(projectData.value.name, newCumulativeTargetTime).catch(error => {
        console.error('❌ runSimulation: Background error from run_simulation', error)
      })

      console.log('⏳ runSimulation: Starting polling')
      startPolling()

    } catch (error) {
      console.error('❌ runSimulation: Simulation failed', error)
      stopPolling()
      simulationStatus.value = {
        status: 'error',
        message: error.message
      }
      // Include full response details in extendedInfo for expandable error logs
      const extendedInfo = error.response ? JSON.stringify(error.response, null, 2) : null
      addLog('error', `Simulation failed: ${error.message}`, 'Backend', extendedInfo)
    }
  }

  async function pauseSimulation(minimizedProjectData) {
    console.log('⏸️ pauseSimulation: Pausing simulation')
    
    try {
      const response = await api.pauseSimulation(projectData.value.name)
      console.log('📋 pauseSimulation: Response', response)
      
      if (response.success === false) {
        const errorMsg = extractErrorMessage(response, 'Failed to pause simulation')
        const error = new Error(`Failed to pause simulation: ${errorMsg}`)
        error.response = response
        throw error
      }
      
      stopPolling()
      
      const currentStatus = await api.getSimulationStatus(minimizedProjectData.value)
      if (currentStatus.success) {
        simulationStatus.value = {
          status: 'processing',
          message: 'Simulation paused',
          state: currentStatus.state
        }
        console.log('📊 pauseSimulation: Paused at', currentStatus.state.simulation?.simulation_progress, 's')
      }
      
      addLog('info', 'Simulation paused', 'Backend')
    } catch (error) {
      console.error('❌ pauseSimulation: Failed to pause', error)
      const extendedInfo = error.response ? JSON.stringify(error.response, null, 2) : null
      addLog('error', `Failed to pause: ${error.message}`, 'Backend', extendedInfo)
    }
  }

  async function resumeSimulation(minimizedProjectData, startPolling) {
    console.log('▶️ resumeSimulation: Resuming simulation')
    
    try {
      const currentStatus = await api.getSimulationStatus(minimizedProjectData.value)
      if (!currentStatus.success || !currentStatus.state?.simulation) {
        throw new Error('Could not get current simulation status')
      }
      
      const sim = currentStatus.state.simulation
      
      if (!sim.simulation_paused) {
        console.log('⚠️ resumeSimulation: Not paused on backend')
        addLog('info', 'Simulation was not paused', 'Backend')
        return
      }
      
      if (sim.simulation_progress >= sim.simulation_time) {
        console.log('⚠️ resumeSimulation: Already complete')
        simulationStatus.value = {
          status: 'ready',
          message: 'Simulation completed',
          state: currentStatus.state
        }
        addLog('info', 'Simulation already completed', 'Backend')
        return
      }
      
      console.log('📊 resumeSimulation: Resuming to', sim.simulation_time, 's')
      
      api.runSimulation(projectData.value.name, sim.simulation_time).catch(error => {
        console.error('❌ resumeSimulation: Background error from run_simulation', error)
      })
      
      startPolling()
      addLog('info', 'Simulation resumed', 'Backend')
      
    } catch (error) {
      console.error('❌ resumeSimulation: Failed to resume', error)
      stopPolling()
      simulationStatus.value = {
        ...simulationStatus.value,
        status: 'error',
        message: error.message
      }
      const extendedInfo = error.response ? JSON.stringify(error.response, null, 2) : null
      addLog('error', `Failed to resume: ${error.message}`, 'Backend', extendedInfo)
    }
  }

  async function stopSimulation(minimizedProjectData, isSimulationRunning, isSimulationPaused) {
    console.log('⏹️ stopSimulation: Stopping simulation')
    if (isSimulationRunning.value && !isSimulationPaused.value) {
      try {
        const response = await api.pauseSimulation(projectData.value.name)
        console.log('📋 pauseSimulation: Response', response)
        
        if (response.success === false) {
          const errorMsg = extractErrorMessage(response, 'Failed to pause simulation')
          const error = new Error(`Failed to pause simulation: ${errorMsg}`)
          error.response = response
          throw error
        }
        
        stopPolling()
        
        const currentStatus = await api.getSimulationStatus(minimizedProjectData.value)
      } catch (error) {
        console.error('❌ stopSimulation: Failed to pause', error)
        const extendedInfo = error.response ? JSON.stringify(error.response, null, 2) : null
        addLog('error', `Failed to pause: ${error.message}`, 'Backend', extendedInfo)
      }
    }

    try {
      const response = await api.destroySimulation(projectData.value.name)
      console.log('📋 destroySimulation: Response', response)
      
      if (response.success === false) {
        const errorMsg = extractErrorMessage(response, 'Failed to destroy simulation')
        const error = new Error(`Failed to destroy simulation: ${errorMsg}`)
        error.response = response
        throw error
      } else {
        console.log('✅ stopSimulation: Simulation destroyed')
        addLog('info', 'Simulation destroyed', 'Backend')
      }
    } catch (error) {
      console.error('❌ stopSimulation: Failed to destroy', error)
      const extendedInfo = error.response ? JSON.stringify(error.response, null, 2) : null
      addLog('error', `Failed to destroy: ${error.message}`, 'Backend', extendedInfo)
    }

    await prepareNetworkGraph()
    resetSimulation()
  }

  // Get simulation status from backend
  async function getSimulationStatus(addLogs = true, updatePreviousLog = false) {
    console.log('🔍 getSimulationStatus: Called with addLogs:', addLogs, 'updatePreviousLog:', updatePreviousLog)
    
    if (addLogs && !updatePreviousLog) {
      addLog('info', 'Getting simulation status...', 'Backend')
    }
    
    const response = await api.getSimulationStatus(minimizedProjectData.value)
    console.log('📋 getSimulationStatus: Response received', response)
    
    if (response.success === false || response.detail) {
      const errorMessage = response.message || response.detail || response.error || ''
      const errorCode = response.error_code || response.status_code || ''
      
      if (errorCode === 'NOT_FOUND' || errorCode === 404 || 
          errorMessage.toLowerCase().includes('not found') || 
          errorMessage.toLowerCase().includes('404')) {
        console.log('ℹ️ getSimulationStatus: No simulation running (NOT_FOUND/404), setting status to stopped')
        simulationStatus.value.status = 'stopped'
        simulationStatus.value.message = 'No simulation running'
        simulationStatus.value.state = null
        // Reset slot states to false since simulation doesn't exist
        resetSlotStates()
        if (addLogs && !updatePreviousLog) {
          addLog('info', 'No simulation currently running', 'Backend')
        }
      } else {
        console.log('❌ getSimulationStatus: Real error occurred', errorMessage)
        simulationStatus.value.status = 'error'
        simulationStatus.value.message = errorMessage
        simulationStatus.value.state = response.state
        if (addLogs && !updatePreviousLog) {
          addLog('error', 'Failed to get simulation status', 'Backend', JSON.stringify(response, null, 2))
        }
      }
    } else {
      console.log('✅ getSimulationStatus: Success, setting status to ready')
      simulationStatus.value.status = 'ready'
      simulationStatus.value.message = response.message
      simulationStatus.value.state = response.state
      
      if (response.state?.simulation?.simulation_time !== undefined) {
        simulationState.value.currentSimulationTime = response.state.simulation.simulation_time
      }
      
      if (updatePreviousLog) {
        const lastLog = applicationLogs.value.length > 0 ? applicationLogs.value[applicationLogs.value.length - 1] : null
        if (lastLog && lastLog.message.startsWith('Running step')) {
          console.log('📝 getSimulationStatus: Updating previous log with state')
          updateLastLogLocal(JSON.stringify(response, null, 2))
        } else {
          console.log('⚠️ getSimulationStatus: Could not find "Running step" log to update')
        }
      } else if (addLogs) {
        addLog('success', 'Simulation status retrieved OK', 'Backend', JSON.stringify(response, null, 2))
      }
      
      // Refresh all open result windows with latest data
      if (refreshAllWindows && typeof refreshAllWindows === 'function') {
        refreshAllWindows()
      }
      
      // Check if displayed entangled state still exists and hide if invalid
      if (checkAndHideInvalidEntangledStates && typeof checkAndHideInvalidEntangledStates === 'function') {
        checkAndHideInvalidEntangledStates(response)
      }
    }
    console.log('📊 getSimulationStatus: Final status set to:', simulationStatus.value.status)
    updateSimulationStatus()
  }

  // Process intermediate simulation results
  function processIntermediateResults(stepResults) {
    console.log(`📊 processIntermediateResults: Processing results for step ${simulationState.value.currentStep}`)
    
    const resultEntry = {
      step: simulationState.value.currentStep,
      time: simulationState.value.currentSimulationTime,
      results: stepResults,
      timestamp: new Date().toISOString()
    }
    
    simulationState.value.intermediateResults.push(resultEntry)
    
    console.log(`📊 processIntermediateResults: Stored results`, {
      step: resultEntry.step,
      time: resultEntry.time,
      hasResults: !!resultEntry.results,
      totalResults: simulationState.value.intermediateResults.length
    })
    
    console.log(`✅ processIntermediateResults: Processed results for step ${simulationState.value.currentStep} at time ${simulationState.value.currentSimulationTime}`)
  }

  return {
    // State
    simulationState,
    simulationStatus,
    
    // Computed
    backendSimulation,
    isSimulationRunning,
    isSimulationPaused,
    isSimulationComplete,
    isSimulationIdle,
    currentSimulationTime,
    targetSimulationTime,
    hasSimulationRun,
    
    // Methods
    getSlotById,
    calculateSimulationProgress,
    updateSimulationStatus,
    resetSlotStates,
    resetSimulation,
    prepareNetworkGraph,
    prepareSimulation,
    runSimulationWithSteps,
    pauseSimulation,
    resumeSimulation,
    stopSimulation,
    getSimulationStatus,
    processIntermediateResults
  }
}

import { api } from '../utils/ApiConnector'

/**
 * usePolling - Composable for simulation polling operations
 */
export function usePolling(simulationState, simulationStatus, projectData, minimizedProjectData, addLog, updateSimulationStatus, prepareNetworkGraphSim, refreshAllWindows, checkAndHideInvalidEntangledStates, showAlert) {
  
  function startPolling() {
    console.log('🚀 startPolling: Starting simulation polling')
    
    if (simulationState.value.pollingActive) {
      console.log('⚠️ startPolling: Polling already active, stopping existing first')
      stopPolling()
    }
    
    simulationState.value.pollingActive = true
    startBackendLogsPolling()
    startStatePolling()
  }

  function stopPolling() {
    console.log('🛑 stopPolling: Stopping all polling')
    
    simulationState.value.pollingActive = false
    
    if (simulationState.value.statePollingTimeout) {
      clearTimeout(simulationState.value.statePollingTimeout)
      simulationState.value.statePollingTimeout = null
    }
    
    stopBackendLogsPolling()
    console.log('✅ stopPolling: All polling stopped')
  }

  async function startStatePolling() {
    const POLLING_INTERVAL = 500
    const TIMEOUT = 1000 * 60 * 15
    const startTime = Date.now()
    
    console.log(`⏳ startStatePolling: Starting (interval: ${POLLING_INTERVAL}ms, timeout: ${TIMEOUT}ms)`)
    
    const poll = async () => {
      try {
        if (!simulationState.value.pollingActive) {
          console.log('⏹️ startStatePolling: Polling stopped externally')
          return
        }
        
        if (Date.now() - startTime > TIMEOUT) {
          console.log('⏰ startStatePolling: Timeout reached')
          stopPolling()
          simulationStatus.value = {
            ...simulationStatus.value,
            status: 'error',
            message: 'Simulation timeout - exceeded 15 minutes'
          }
          addLog('error', 'Simulation timeout - exceeded 15 minutes', 'Backend')
          return
        }
        
        const response = await api.getSimulationStatus(minimizedProjectData.value)
        
        if (response.success && response.state?.simulation) {
          const sim = response.state.simulation
          
          simulationStatus.value = {
            status: 'processing',
            message: `Running simulation... ${(sim.simulation_progress || 0).toFixed(3)}s / ${sim.simulation_time || 0}s`,
            state: response.state
          }
          
          updateSimulationStatus()
          
          // Refresh all open result windows with latest data
          if (refreshAllWindows && typeof refreshAllWindows === 'function') {
            refreshAllWindows()
          }
          
          // Check if displayed entangled state still exists and hide if invalid
          if (checkAndHideInvalidEntangledStates && typeof checkAndHideInvalidEntangledStates === 'function') {
            checkAndHideInvalidEntangledStates(response)
          }

          if (sim.simulation_error) {
            console.error('❌ startStatePolling: Simulation task failed', sim.simulation_error)
            stopPolling()
            simulationStatus.value = {
              status: 'error',
              message: `Simulation failed: ${sim.simulation_error}`,
              state: response.state
            }
            addLog('error', `Simulation failed: ${sim.simulation_error}`, 'Backend')
            return
          }
          
          if (sim.simulation_running === false) {
            // Check if the simulation execution time exceeded
            if( sim.simulation_execution_time_exceeded ) {
              console.log('⚠️ startStatePolling: Simulation execution time exceeded')
              stopPolling()
              simulationStatus.value = {
                status: 'error',
                message: 'Simulation execution time exceeded',
                state: response.state
              }

              console.error('Simulation execution time exceeded');

              prepareNetworkGraphSim(false);

              if (showAlert && typeof showAlert === 'function') {
                showAlert('Simulation Error', 'Simulation execution time exceeded')
              }
              console.log('📋 destroySimulation: Response', response)
              return;
            }

            if (sim.simulation_paused) {
              console.log('⏸️ startStatePolling: Simulation paused')
              stopPolling()
              simulationStatus.value = {
                status: 'processing',
                message: 'Simulation paused',
                state: response.state
              }
              return
            }

            if ((sim.simulation_progress || 0) >= (sim.simulation_time || 0)) {
              console.log('✅ startStatePolling: Simulation completed!')
              stopPolling()
              simulationStatus.value = {
                status: 'ready',
                message: 'Simulation completed',
                state: response.state
              }
              return
            }

            console.error('❌ startStatePolling: Simulation stopped before reaching its target')
            stopPolling()
            simulationStatus.value = {
              status: 'error',
              message: 'Simulation stopped before reaching its target',
              state: response.state
            }
            addLog('error', 'Simulation stopped before reaching its target', 'Backend')
            return
          }

          

          console.log(`⏳ startStatePolling: Running - progress: ${sim.simulation_progress}s / ${sim.simulation_time}s`)
        }
        
        if (simulationState.value.pollingActive) {
          simulationState.value.statePollingTimeout = setTimeout(poll, POLLING_INTERVAL)
        }
      } catch (error) {
        console.error('❌ startStatePolling: Error polling simulation status:', error)
        stopPolling()
        simulationStatus.value = {
          ...simulationStatus.value,
          status: 'error',
          message: `Polling error: ${error.message}`
        }
        addLog('error', `Polling error: ${error.message}`, 'Backend')
      }
    }
    
    poll()
  }


  async function startAlivePolling(){
    const ALIVE_POLLING_INTERVAL = 60_000;  // 1 minute

    if( simulationState.value.alivePollingInterval ){
      stopAlivePolling()
    }

    simulationState.value.alivePollingInterval = setInterval(() => {
      checkAlive()
    }, ALIVE_POLLING_INTERVAL)
    
  }

  async function checkAlive(){
    const response = await api.getSimulationStatus(minimizedProjectData.value)

    if( !response.success && response.error_code === 'NOT_FOUND' ){
      stopAlivePolling();
      return;
    }

    if( response.success && response.state?.simulation ){
      const sim = response.state.simulation;
      
      // Refresh all open result windows with latest data
      if (refreshAllWindows && typeof refreshAllWindows === 'function') {
        refreshAllWindows()
      }
      
      // Check if displayed entangled state still exists and hide if invalid
      if (checkAndHideInvalidEntangledStates && typeof checkAndHideInvalidEntangledStates === 'function') {
        checkAndHideInvalidEntangledStates(response)
      }
      
      if( sim.simulation_running === false && sim.simulation_auto_purged ){
        stopPolling()
        simulationStatus.value = {
          status: 'error',
          message: 'Simulation stopped',
          state: response.state
        }

        addLog('error', 'Simulation purged after long inactivity', 'Backend');
        prepareNetworkGraphSim(false);
        stopAlivePolling();
        if (showAlert && typeof showAlert === 'function') {
          showAlert('Simulation Stopped', 'Simulation purged after long inactivity')
        }
        return;
      }
    }
  }

  function stopAlivePolling(){
    console.log( 'stopAlivePolling()' );
    if( simulationState.value.alivePollingInterval ){
      clearInterval(simulationState.value.alivePollingInterval)
      simulationState.value.alivePollingInterval = null
    }
  }

  function startBackendLogsPolling() {
    console.log('📝 startBackendLogsPolling: Starting backend logs polling')
    
    if (simulationState.value.logsPollingInterval) {
      clearInterval(simulationState.value.logsPollingInterval)
    }
    
    const LOGS_POLLING_INTERVAL = 2000
    
    fetchBackendLogs()
    
    simulationState.value.logsPollingInterval = setInterval(() => {
      fetchBackendLogs()
    }, LOGS_POLLING_INTERVAL)
    
    console.log(`📝 startBackendLogsPolling: Polling started (interval: ${LOGS_POLLING_INTERVAL}ms)`)
  }

  function stopBackendLogsPolling() {
    console.log('📝 stopBackendLogsPolling: Stopping backend logs polling')
    
    if (simulationState.value.logsPollingInterval) {
      clearInterval(simulationState.value.logsPollingInterval)
      simulationState.value.logsPollingInterval = null
      console.log('📝 stopBackendLogsPolling: Polling stopped')
    }
    
    fetchBackendLogs()
  }

  function mapBackendLogLevel(levelData) {
    return 'debug'
  }

  async function fetchBackendLogs() {
    try {
      const projectName = projectData.value.name
      console.log(`📝 fetchBackendLogs: Fetching logs for project: ${projectName}`)
      
      const response = await api.getBackendLogs(projectName, true)
      console.log(`📝 fetchBackendLogs: Response received`, response)
      
      if (response.success !== false && response.logs && Array.isArray(response.logs)) {
        console.log(`📝 fetchBackendLogs: Received ${response.logs.length} log entries`)
        
        response.logs.forEach(backendLog => {
          const logMessage = backendLog.message || backendLog.msg || ''
          
          const lowerMessage = logMessage.trim().toLowerCase()
          if (lowerMessage === 'simulation started' || 
              lowerMessage === 'simulation progress' ||
              lowerMessage.startsWith('simulation progress')) {
            return
          }
          
          const logLevel = mapBackendLogLevel(backendLog.level)
          const extendedInfoStr = JSON.stringify(backendLog, null, 2)
          
          addLog(logLevel, logMessage, 'Backend', extendedInfoStr)
        })
        
        console.log(`✅ fetchBackendLogs: Successfully processed ${response.logs.length} backend logs`)
      } else {
        console.log(`ℹ️ fetchBackendLogs: No logs returned or empty response`)
      }
    } catch (error) {
      console.error('❌ fetchBackendLogs: Error fetching backend logs', error)
    }
  }

  return {
    startPolling,
    stopPolling,
    startStatePolling,
    startBackendLogsPolling,
    stopBackendLogsPolling,
    fetchBackendLogs,
    startAlivePolling,
    stopAlivePolling,
    checkAlive
  }
}

import { api } from './ApiConnector'

/**
 * Backend helper functions for logs and simulation status
 */

export function mapBackendLogLevel(levelData) {
  return 'debug'
  // TODO: Backend developer will provide proper log level mapping in the future
  // For now, treat all backend logs as 'debug' level
  
  /* Future implementation when backend provides proper levels:
  // Handle nested level object: { level: { level: 0 } }
  let numericLevel
  
  if (levelData && typeof levelData === 'object' && 'level' in levelData) {
    numericLevel = levelData.level
  } else if (typeof levelData === 'number') {
    numericLevel = levelData
  } else if (typeof levelData === 'string') {
    return levelData.toLowerCase()
  } else {
    return 'debug'
  }
  
  // Map numeric levels to log types
  // Based on Julia logging conventions:
  // -1000 = Error
  // 0 = Info
  // 1000 = Warn
  // 2000 = Debug
  if (numericLevel <= -1000) {
    return 'error'
  } else if (numericLevel < 0) {
    return 'warning'
  } else if (numericLevel === 0) {
    return 'info'
  } else if (numericLevel <= 1000) {
    return 'warning'
  } else {
    return 'debug'
  }
  */
}

export function compareVersionsMismatch(projectVersions, currentVersions) {
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

export async function fetchBackendLogs(projectData, addLog) {
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


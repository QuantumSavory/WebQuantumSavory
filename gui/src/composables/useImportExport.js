import ProjectStore from '../models/ProjectStore'
import { validatePayload } from '../utils/projectHelpers'

/**
 * useImportExport - Composable for import/export operations
 */
export function useImportExport(
  currentProjectName,
  importedProjectData,
  conflictProjectName,
  showImportConflictDialog,
  clearLogs,
  addLog,
  openProject,
  serializeProjectData,
  minimizedProjectData
) {
  function importProject() {
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.json'
    fileInput.style.display = 'none'
    
    fileInput.onchange = (event) => {
      const file = event.target.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          try {
            const jsonData = JSON.parse(e.target.result)
            validateAndProcessImport(jsonData)
          } catch (error) {
            alert('Invalid JSON file. Please select a valid JSON file.')
          }
        }
        reader.readAsText(file)
      }
      document.body.removeChild(fileInput)
    }
    
    document.body.appendChild(fileInput)
    fileInput.click()
  }

  function validateAndProcessImport(jsonData) {
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

    if (jsonData.variables !== undefined && !Array.isArray(jsonData.variables)) {
      alert('Invalid project structure: "variables" must be an array when present.')
      return
    }
    
    const existingProjects = ProjectStore.listProjects()
    if (existingProjects.includes(jsonData.name)) {
      importedProjectData.value = jsonData
      conflictProjectName.value = jsonData.name
      showImportConflictDialog.value = true
    } else {
      processImport(jsonData, jsonData.name)
    }
  }

  function processImport(jsonData, finalName) {
    try {
      clearLogs()
      
      const projectDataToImport = {
        ...jsonData,
        name: finalName
      }
      
      ProjectStore.saveProject(finalName, projectDataToImport)
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

  function handleImportConflictOverwrite() {
    showImportConflictDialog.value = false
    processImport(importedProjectData.value, conflictProjectName.value)
  }

  function handleImportConflictNewName() {
    showImportConflictDialog.value = false
    const uniqueName = generateUniqueName(conflictProjectName.value)
    processImport(importedProjectData.value, uniqueName)
  }

  function cancelImportConflict() {
    showImportConflictDialog.value = false
    importedProjectData.value = null
    conflictProjectName.value = ''
  }

  function exportProject() {
    if (!currentProjectName.value) {
      alert('No project to export. Please create or open a project first.')
      return
    }
    
    try {
      const projectData = serializeProjectData()
      const jsonString = JSON.stringify(projectData, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      
      const downloadLink = document.createElement('a')
      downloadLink.href = url
      downloadLink.download = `${currentProjectName.value}.json`
      downloadLink.style.display = 'none'
      
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
      URL.revokeObjectURL(url)
      
    } catch (error) {
      alert(`Failed to export project: ${error.message}`)
    }
  }

  return {
    importProject,
    exportProject,
    validateAndProcessImport,
    processImport,
    generateUniqueName,
    handleImportConflictOverwrite,
    handleImportConflictNewName,
    cancelImportConflict
  }
}

import ProjectStore from '../models/ProjectStore'
import { validatePayload } from '../utils/projectHelpers'

/**
 * useProjectHandlers - Composable for project-related UI handlers
 * Handles dialog interactions, dropdowns, and project operations
 */
export function useProjectHandlers(
  projectData,
  currentProjectName,
  isDemoProject,
  selectedItem,
  selectedType,
  showProjectDropdown,
  projectListDropdown,
  showLoadDialog,
  loadProjectList,
  showProjectNameDialog,
  projectNameDialogMode,
  projectNameDialogInitialValue,
  openProject,
  handleMenu
) {
  function toggleProjectDropdown() {
    if (!showProjectDropdown.value) {
      const recentProjects = ProjectStore.getRecentProjects(10)
      projectListDropdown.value = recentProjects
        .filter(project => project.name !== currentProjectName.value)
        .map(project => project.name)
    }
    showProjectDropdown.value = !showProjectDropdown.value
  }

  function quickOpenProject(name) {
    showProjectDropdown.value = false
    openProject(name)
  }

  function handleOpenProjectSelect(projectName) {
    showLoadDialog.value = false
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

  function handleProjectNameConfirm(projectName, createNewProject, createSaveAsProject) {
    if (projectNameDialogMode.value === 'new') {
      createNewProject(projectName)
    } else if (projectNameDialogMode.value === 'saveas') {
      createSaveAsProject(projectName)
    }
    showProjectNameDialog.value = false
  }

  function handleProjectNameCancel() {
    showProjectNameDialog.value = false
  }

  return {
    toggleProjectDropdown,
    quickOpenProject,
    handleOpenProjectSelect,
    handleOpenProjectClose,
    handleNewProjectFromDialog,
    handleImportProjectFromDialog,
    handleProjectNameConfirm,
    handleProjectNameCancel
  }
}


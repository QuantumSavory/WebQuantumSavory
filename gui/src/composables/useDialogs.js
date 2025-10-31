import ProjectStore from '../models/ProjectStore'

/**
 * useDialogs - Composable for dialog management
 * Handles all dialog state and actions
 */
export function useDialogs(
  showMenu,
  showLoadDialog,
  showProjectNameDialog,
  showImportConflictDialog,
  showAboutModal,
  showJsonViewer,
  projectNameDialogMode,
  projectNameDialogInitialValue,
  loadProjectList,
  importProject,
  exportProject,
  openProject,
  saveProject,
  createNewProject,
  createSaveAsProject,
  toggleJsonViewerVisibility,
  handleSaveAs
) {
  function handleMenu(action) {
    showMenu.value = false
    if (action === 'new') {
      projectNameDialogMode.value = 'new'
      projectNameDialogInitialValue.value = ''
      showProjectNameDialog.value = true
    } else if (action === 'save') {
      if (!currentProjectName.value) {
        projectNameDialogMode.value = 'saveas'
        projectNameDialogInitialValue.value = ''
        showProjectNameDialog.value = true
        return
      }
      saveProject()
    } else if (action === 'open') {
      const recentProjects = ProjectStore.getRecentProjects(50)
      loadProjectList.value = recentProjects
      showLoadDialog.value = true
    } else if (action === 'import') {
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

  function handleProjectNameConfirm(projectName, currentProjectName) {
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

  return {
    handleMenu,
    handleProjectNameConfirm,
    handleProjectNameCancel,
    handleOpenProjectSelect,
    handleOpenProjectClose,
    handleNewProjectFromDialog,
    handleImportProjectFromDialog
  }
}


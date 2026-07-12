let activeRegistration = null

export function registerLegacyBridge({
  getProjectData,
  showResultsView,
  showEntangledSlots,
  hideSlotState
}) {
  const registration = {
    getProjectData,
    showResultsView,
    showEntangledSlots,
    hideSlotState
  }
  activeRegistration = registration

  window.showResultsView = (...args) => activeRegistration?.showResultsView?.(...args)
  window.showEntangledSlots = (...args) => activeRegistration?.showEntangledSlots?.(...args)
  window.hideSlotState = (...args) => activeRegistration?.hideSlotState?.(...args)
  syncLegacyProjectData()

  return () => {
    if (activeRegistration !== registration) return
    activeRegistration = null
    delete window.showResultsView
    delete window.showEntangledSlots
    delete window.hideSlotState
    delete window.projectData
  }
}

export function syncLegacyProjectData() {
  if (typeof window === 'undefined') return
  window.projectData = activeRegistration?.getProjectData?.() || null
}

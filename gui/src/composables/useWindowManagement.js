import { ref } from 'vue'

/**
 * useWindowManagement - Composable for floating window management
 */
export function useWindowManagement() {
  const resultWindows = ref([])
  const windowRefs = new Map() // Map of windowId -> component ref
  let nextWindowId = 1
  let nextWindowZIndex = 1000

  function showResultsView(type, item, context = {}) {
    const newWindow = {
      id: `result-window-${nextWindowId++}`,
      type,
      item,
      context,
      position: {
        x: 100 + (resultWindows.value.length * 30),
        y: 100 + (resultWindows.value.length * 30)
      },
      size: {
        width: 400,
        height: 300
      },
      zIndex: nextWindowZIndex++,
      results: null
    }
    resultWindows.value.push(newWindow)
  }

  function closeResultWindow(windowId) {
    const index = resultWindows.value.findIndex(w => w.id === windowId)
    if (index !== -1) {
      resultWindows.value.splice(index, 1)
    }
    // Clean up ref when window is closed
    unregisterWindowRef(windowId)
  }

  function closeAllResultWindows() {
    resultWindows.value = []
    windowRefs.clear()
    nextWindowId = 1
    nextWindowZIndex = 1000
  }

  function bringWindowToFront(windowId) {
    const window = resultWindows.value.find(w => w.id === windowId)
    if (window) {
      window.zIndex = nextWindowZIndex++
    }
  }

  function updateWindowPosition(windowId, position) {
    const window = resultWindows.value.find(w => w.id === windowId)
    if (window) {
      window.position = position
    }
  }

  function updateWindowSize(windowId, size) {
    const window = resultWindows.value.find(w => w.id === windowId)
    if (window) {
      window.size = size
    }
  }

  /**
   * Register a component ref for a window
   * @param {string} windowId - The ID of the window
   * @param {Object} ref - The component ref instance
   */
  function registerWindowRef(windowId, ref) {
    if (ref) {
      windowRefs.set(windowId, ref)
    }
  }

  /**
   * Unregister a component ref for a window
   * @param {string} windowId - The ID of the window
   */
  function unregisterWindowRef(windowId) {
    windowRefs.delete(windowId)
  }

  /**
   * Refresh all open result windows by calling their fetchResults method
   */
  function refreshAllWindows() {
    windowRefs.forEach((ref, windowId) => {
      if (ref && typeof ref.fetchResults === 'function') {
        try {
          ref.fetchResults()
        } catch (error) {
          console.error(`Error refreshing window ${windowId}:`, error)
        }
      }
    })
  }

  /**
   * Clear all plot content in open result windows
   */
  function clearAllPlots() {
    windowRefs.forEach((ref, windowId) => {
      if (ref && typeof ref.clearPlot === 'function') {
        try {
          ref.clearPlot()
        } catch (error) {
          console.error(`Error clearing plot for window ${windowId}:`, error)
        }
      }
    })
  }

  return {
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
  }
}

import { ref } from 'vue'

/**
 * useWindowManagement - Composable for floating window management
 */
export function useWindowManagement() {
  const resultWindows = ref([])
  let nextWindowId = 1
  let nextWindowZIndex = 1000

  window.showResultsView = ( type, item, context = {} ) => {
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
        width: 800,
        height: 600
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

  return {
    resultWindows,
    closeResultWindow,
    bringWindowToFront,
    updateWindowPosition,
    updateWindowSize
  }
}

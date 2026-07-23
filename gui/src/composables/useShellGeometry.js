import { nextTick, onMounted, onScopeDispose, readonly, ref, watch } from 'vue'
import { readCssPixels } from '../utils/cssPixels.js'

/**
 * Measures the application shell using only elements explicitly owned by App.
 * Returned coordinates are viewport pixels suitable for fixed-position panels.
 */
export function useShellGeometry({
  topbar,
  rightSidebar,
  bottomPanelContainer,
  rightSidebarVisible
}) {
  const availableBounds = ref({
    left: 0,
    right: window.innerWidth,
    top: 0,
    bottom: window.innerHeight
  })
  let resizeObserver = null

  function measure() {
    const gap = readCssPixels('--app-shell-panel-gap')
    const left = bottomPanelContainer.value?.getBoundingClientRect().left ?? 0
    const top = (topbar.value?.getBoundingClientRect().bottom ?? 0) + gap
    let right = window.innerWidth - gap

    if (rightSidebarVisible.value && rightSidebar.value) {
      const sidebarBounds = rightSidebar.value.getBoundingClientRect()
      const sidebarLeft = rightSidebar.value.offsetLeft || sidebarBounds.left
      right = sidebarLeft - gap
    }

    availableBounds.value = {
      left,
      right: Math.max(left + 1, right),
      top,
      bottom: window.innerHeight
    }
  }

  function observeShellElements() {
    resizeObserver?.disconnect()
    if (typeof ResizeObserver === 'undefined') return

    resizeObserver = new ResizeObserver(measure)
    const shellElements = [topbar.value, rightSidebar.value, bottomPanelContainer.value]
    shellElements
      .filter(Boolean)
      .forEach(element => resizeObserver.observe(element))
  }

  function refreshObservedGeometry() {
    nextTick(() => {
      observeShellElements()
      measure()
    })
  }

  watch(
    [
      () => topbar.value,
      () => rightSidebar.value,
      () => bottomPanelContainer.value,
      () => rightSidebarVisible.value
    ],
    refreshObservedGeometry,
    { flush: 'post' }
  )

  onMounted(() => {
    window.addEventListener('resize', measure)
    refreshObservedGeometry()
  })

  onScopeDispose(() => {
    window.removeEventListener('resize', measure)
    resizeObserver?.disconnect()
  })

  return readonly(availableBounds)
}

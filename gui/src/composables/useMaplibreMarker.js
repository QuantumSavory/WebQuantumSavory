import { onMounted, onUnmounted, unref, watch } from 'vue'
import maplibregl from 'maplibre-gl'

function resolve(value) {
  return typeof value === 'function' ? value() : unref(value)
}

function markerPosition(marker) {
  if (!marker) return null
  const position = marker.getLngLat()
  return [position.lng, position.lat]
}

/**
 * Own one MapLibre marker whose element is supplied by a Vue template ref.
 * MapLibre overwrites marker aria labels during addTo(), so the composable
 * restores the domain label after attachment and whenever it changes.
 */
export function useMaplibreMarker({
  map,
  element,
  position,
  options = {},
  ariaLabel = null,
  events = {},
  watchPosition = true,
}) {
  let marker = null

  function setPosition(nextPosition) {
    if (marker && nextPosition) marker.setLngLat(nextPosition)
  }

  function getPosition() {
    return markerPosition(marker)
  }

  function restoreAriaLabel(label = resolve(ariaLabel)) {
    const markerElement = resolve(element)
    if (markerElement && label) markerElement.setAttribute('aria-label', label)
  }

  onMounted(() => {
    const markerElement = resolve(element)
    marker = new maplibregl.Marker({
      ...options,
      element: markerElement,
    })
      .setLngLat(resolve(position))
      .addTo(resolve(map))

    restoreAriaLabel()
    Object.entries(events).forEach(([event, handler]) => marker.on(event, handler))
  })

  if (watchPosition) {
    watch(position, nextPosition => setPosition(nextPosition), { deep: true })
  }
  if (ariaLabel) {
    watch(ariaLabel, label => restoreAriaLabel(label))
  }

  onUnmounted(() => {
    if (typeof marker?.off === 'function') {
      Object.entries(events).forEach(([event, handler]) => marker.off(event, handler))
    }
    marker?.remove()
  })

  return {
    getMarker: () => marker,
    getPosition,
    setPosition,
  }
}

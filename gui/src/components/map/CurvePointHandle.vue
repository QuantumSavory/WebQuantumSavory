<template>
  <button
    ref="element"
    type="button"
    class="curve-point-handle"
    :class="`curve-point-${point.type}`"
    :aria-label="`${point.type} curve point. Click to ${point.type === 'smooth' ? 'make sharp' : 'delete'}.`"
    @pointerdown="captureDragStartPosition"
    @click.stop="handleClick"
  />
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import { positionInProjectWorld } from '../../utils/mapCoordinates'

const props = defineProps({
  map: { type: Object, required: true },
  point: { type: Object, required: true },
})

const emit = defineEmits(['move', 'cycle', 'interactionBusy'])
const element = ref(null)
let marker = null
let dragged = false
let curveStartPosition = null
let displayedDragStartPosition = null

function markerPosition() {
  const position = marker?.getLngLat()
  return position ? [position.lng, position.lat] : null
}

function captureDragStartPosition() {
  curveStartPosition = [...props.point.position]
  displayedDragStartPosition = markerPosition()
}

function handleClick() {
  if (dragged) {
    dragged = false
    return
  }
  emit('cycle', props.point)
}

onMounted(() => {
  marker = new maplibregl.Marker({
    element: element.value,
    draggable: true,
    anchor: 'center',
  })
    .setLngLat(props.point.position)
    .addTo(props.map)

  marker.on('dragstart', () => {
    if (!curveStartPosition || !displayedDragStartPosition) {
      captureDragStartPosition()
    }
    dragged = true
    emit('interactionBusy', true)
  })
  marker.on('dragend', () => {
    const position = positionInProjectWorld(
      markerPosition(),
      displayedDragStartPosition,
      curveStartPosition,
    )
    emit(
      'move',
      props.point,
      position,
      () => marker?.setLngLat(props.point.position),
    )
    curveStartPosition = null
    displayedDragStartPosition = null
    emit('interactionBusy', false)
  })
})

watch(
  () => props.point.position,
  position => marker?.setLngLat(position),
  { deep: true },
)

onUnmounted(() => marker?.remove())
</script>

<style scoped>
.curve-point-handle {
  width: 14px;
  height: 14px;
  padding: 0;
  border: 2px solid var(--app-color-primary);
  background: var(--app-color-surface);
  box-shadow: var(--app-shadow-marker);
  cursor: grab;
  z-index: var(--app-z-map-handle);
}

.curve-point-handle:active {
  cursor: grabbing;
}

.curve-point-handle:focus-visible {
  outline: var(--app-focus-ring-width) solid var(--app-color-surface);
  outline-offset: 2px;
}

.curve-point-smooth {
  border-radius: 50%;
}

.curve-point-sharp {
  transform: rotate(45deg);
  border-radius: 2px;
  background: var(--app-color-primary-soft);
}
</style>

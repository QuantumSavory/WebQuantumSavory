<template>
  <button
    ref="element"
    type="button"
    class="annotation-resize-handle"
    :class="`annotation-resize-handle-${kind}`"
    :data-annotation-corner="corner || undefined"
    :aria-label="label"
    @click.stop
  />
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import maplibregl from 'maplibre-gl'

const props = defineProps({
  map: { type: Object, required: true },
  position: { type: Array, required: true },
  label: { type: String, required: true },
  kind: { type: String, default: 'annotation' },
  corner: { type: String, default: null },
})

const emit = defineEmits(['activate', 'move'])
const element = ref(null)
let marker = null

function markerPosition() {
  const position = marker.getLngLat()
  return [position.lng, position.lat]
}

onMounted(() => {
  marker = new maplibregl.Marker({
    element: element.value,
    draggable: true,
    anchor: 'center',
  })
    .setLngLat(props.position)
    .addTo(props.map)
  // MapLibre assigns its generic localized marker label during addTo().
  // Restore the domain-specific control label for keyboard and screen-reader users.
  element.value.setAttribute('aria-label', props.label)

  marker.on('dragstart', () => emit('activate'))
  marker.on('drag', () => emit('move', markerPosition()))
  marker.on('dragend', () => emit('move', markerPosition()))
})

watch(
  () => props.position,
  position => marker?.setLngLat(position),
  { deep: true },
)
watch(() => props.label, label => element.value?.setAttribute('aria-label', label))

onUnmounted(() => marker?.remove())
</script>

<style scoped>
.annotation-resize-handle {
  width: 14px;
  height: 14px;
  padding: 0;
  border: 2px solid var(--app-color-primary);
  border-radius: 2px;
  background: var(--app-color-surface);
  box-shadow: var(--app-shadow-marker);
  cursor: nwse-resize;
  z-index: 30;
}

.annotation-resize-handle-annotation[data-annotation-corner="northeast"],
.annotation-resize-handle-annotation[data-annotation-corner="southwest"] {
  cursor: nesw-resize;
}

.annotation-resize-handle-area {
  border-style: dashed;
  border-radius: 50%;
  cursor: move;
}

.annotation-resize-handle:active {
  cursor: grabbing;
}

.annotation-resize-handle:focus-visible {
  outline: var(--app-focus-ring-width) solid var(--app-color-surface);
  outline-offset: 2px;
}
</style>

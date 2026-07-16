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
import { ref } from 'vue'
import { useMaplibreMarker } from '../../composables/useMaplibreMarker'

const props = defineProps({
  map: { type: Object, required: true },
  position: { type: Array, required: true },
  label: { type: String, required: true },
  kind: { type: String, default: 'annotation' },
  corner: { type: String, default: null },
})

const emit = defineEmits(['activate', 'move'])
const element = ref(null)

const markerController = useMaplibreMarker({
  map: () => props.map,
  element,
  position: () => props.position,
  options: {
    draggable: true,
    anchor: 'center',
  },
  ariaLabel: () => props.label,
  events: {
    dragstart: () => emit('activate'),
    drag: () => emit('move', markerController.getPosition()),
    dragend: () => emit('move', markerController.getPosition()),
  },
})
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
  z-index: var(--app-z-map-handle);
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

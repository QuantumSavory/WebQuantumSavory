<template>
  <button
    ref="element"
    type="button"
    class="curve-point-handle"
    :class="`curve-point-${point.type}`"
    :aria-label="`${point.type} curve point. Click to ${point.type === 'smooth' ? 'make sharp' : 'delete'}.`"
    @click.stop="handleClick"
  />
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import maplibregl from 'maplibre-gl'

const props = defineProps({
  map: { type: Object, required: true },
  point: { type: Object, required: true },
})

const emit = defineEmits(['move', 'cycle'])
const element = ref(null)
let marker = null
let dragged = false

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

  marker.on('dragstart', () => { dragged = true })
  marker.on('dragend', () => {
    const position = marker.getLngLat()
    emit('move', props.point, [position.lng, position.lat])
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

<template>
  <div ref="element" class="edge-badge-stack" aria-hidden="true">
    <span
      v-for="row in rows"
      :key="row.id"
      class="edge-badge"
      :class="`edge-badge-${row.id}`"
    >
      {{ row.label }}
    </span>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import maplibregl from 'maplibre-gl'

const props = defineProps({
  map: { type: Object, required: true },
  position: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
})

const element = ref(null)
let marker = null

onMounted(() => {
  marker = new maplibregl.Marker({
    element: element.value,
    anchor: 'center',
  })
    .setLngLat(props.position)
    .addTo(props.map)
})

watch(() => props.position, position => marker?.setLngLat(position), { deep: true })

onUnmounted(() => marker?.remove())
</script>

<style scoped>
.edge-badge-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  pointer-events: none;
  transform: translateY(-18px);
}

.edge-badge {
  padding: 2px 6px;
  border: 1px solid color-mix(in srgb, var(--app-color-primary) 35%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-color-surface) 94%, transparent);
  box-shadow: var(--app-shadow-marker);
  color: var(--app-color-primary);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.25;
  white-space: nowrap;
}

.edge-badge-delay {
  color: var(--app-color-text-muted);
}
</style>

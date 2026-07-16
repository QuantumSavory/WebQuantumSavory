<template>
  <!-- MapLibre owns the rendered source and layers. -->
</template>

<script setup>
import { onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  map: { type: Object, required: true },
  layerKey: { type: String, required: true },
  feature: { type: Object, required: true },
  fillColor: { type: String, required: true },
  borderColor: { type: String, required: true },
  fillOpacity: { type: Number, default: 1 },
  lineWidth: { type: Number, default: 2 },
  lineDasharray: { type: Array, default: null },
})

const sourceId = `annotation-source-${props.layerKey}`
const fillLayerId = `annotation-fill-${props.layerKey}`
const lineLayerId = `annotation-line-${props.layerKey}`

function firstEdgeLayerId() {
  return props.map.getStyle?.().layers?.find(layer => (
    layer.id.startsWith('edge-layer-') || layer.id.startsWith('edge-click-layer-')
  ))?.id
}

function addLayer(layer) {
  const beforeId = firstEdgeLayerId()
  if (beforeId) props.map.addLayer(layer, beforeId)
  else props.map.addLayer(layer)
}

function updateFeature(feature) {
  props.map.getSource(sourceId)?.setData(feature)
}

function updatePaint(layerId, property, value) {
  if (props.map.getLayer(layerId)) {
    props.map.setPaintProperty(layerId, property, value)
  }
}

function removeMapResources() {
  if (props.map.getLayer(lineLayerId)) props.map.removeLayer(lineLayerId)
  if (props.map.getLayer(fillLayerId)) props.map.removeLayer(fillLayerId)
  if (props.map.getSource(sourceId)) props.map.removeSource(sourceId)
}

onMounted(() => {
  props.map.addSource(sourceId, {
    type: 'geojson',
    data: props.feature,
  })
  addLayer({
    id: fillLayerId,
    type: 'fill',
    source: sourceId,
    paint: {
      'fill-color': props.fillColor,
      'fill-opacity': props.fillOpacity,
    },
  })
  const linePaint = {
    'line-color': props.borderColor,
    'line-width': props.lineWidth,
  }
  if (props.lineDasharray) linePaint['line-dasharray'] = props.lineDasharray
  addLayer({
    id: lineLayerId,
    type: 'line',
    source: sourceId,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: linePaint,
  })
})

watch(() => props.feature, updateFeature, { deep: true })
watch(() => props.fillColor, value => updatePaint(fillLayerId, 'fill-color', value))
watch(() => props.fillOpacity, value => updatePaint(fillLayerId, 'fill-opacity', value))
watch(() => props.borderColor, value => updatePaint(lineLayerId, 'line-color', value))
watch(() => props.lineWidth, value => updatePaint(lineLayerId, 'line-width', value))
watch(
  () => props.lineDasharray,
  value => updatePaint(lineLayerId, 'line-dasharray', value),
  { deep: true },
)

onUnmounted(removeMapResources)
</script>

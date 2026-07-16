<template>
  <!-- MapLibre owns the rendered source and layers. -->
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  annotationFillLayerId,
  annotationLineLayerId,
  annotationSourceId,
  firstEdgeLayerId,
} from '../../utils/mapLayers'

const props = defineProps({
  map: { type: Object, required: true },
  layerKey: { type: String, required: true },
  beforeLayerId: { type: String, default: '' },
  feature: { type: Object, required: true },
  fillColor: { type: String, required: true },
  borderColor: { type: String, required: true },
  fillOpacity: { type: Number, default: 1 },
  lineWidth: { type: Number, default: 2 },
  lineDasharray: { type: Array, default: null },
})

const sourceId = annotationSourceId(props.layerKey)
const fillLayerId = annotationFillLayerId(props.layerKey)
const lineLayerId = annotationLineLayerId(props.layerKey)

function insertionTarget() {
  if (props.beforeLayerId && props.map.getLayer(props.beforeLayerId)) {
    return props.beforeLayerId
  }
  return firstEdgeLayerId(props.map)
}

function addLayer(layer) {
  const beforeId = insertionTarget()
  if (beforeId) props.map.addLayer(layer, beforeId)
  else props.map.addLayer(layer)
}

function ensureLayerOrder() {
  const beforeId = insertionTarget()
  if (!beforeId || typeof props.map.moveLayer !== 'function') return
  if (props.map.getLayer(fillLayerId)) props.map.moveLayer(fillLayerId, beforeId)
  if (props.map.getLayer(lineLayerId)) props.map.moveLayer(lineLayerId, beforeId)
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
  nextTick(ensureLayerOrder)
})

watch(() => props.feature, updateFeature, { deep: true })
watch(() => props.beforeLayerId, () => nextTick(ensureLayerOrder))
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

<template>
  <div class="edge-line">
    <EdgeBadgeStack
      v-if="badgeRows.length > 0 && resolvedPhysical"
      :map="map"
      :position="resolvedPhysical.midpoint"
      :rows="badgeRows"
    />
    <CurvePointHandle
      v-for="point in editableCurvePoints"
      :key="point.id"
      :map="map"
      :point="point"
      @move="moveCurvePoint"
      @cycle="cycleCurvePoint"
      @interaction-busy="emit('interactionBusy', $event)"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { generateUUid } from '../../utils/Utils'
import {
  formatPhysicalValue,
  projectPointOntoEdge,
  resolveEdgePhysicalProperties,
  sampleEdgeRoute,
} from '../../utils/edgeGeometry'
import {
  edgeClickLayerId,
  edgeLineLayerId,
} from '../../utils/mapLayers'
import CurvePointHandle from './CurvePointHandle.vue'
import EdgeBadgeStack from './EdgeBadgeStack.vue'

const props = defineProps({
  edge: { type: Object, required: true },
  map: { type: Object, required: true },
  isSelected: { type: Boolean, default: false },
  isTemporary: { type: Boolean, default: false },
  editingLocked: { type: Boolean, default: false },
  curveEditingEnabled: { type: Boolean, default: false },
  showPhysicalBadges: { type: Boolean, default: true },
  physicalConfig: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['select', 'designOperations', 'interactionBusy'])
const sourceId = `edge-${props.edge.id}`
const layerId = edgeLineLayerId(props.edge.id)
const clickLayerId = edgeClickLayerId(props.edge.id)
const isHovered = ref(false)

const DEFAULT_STYLE = {
  'line-color': '#76769e',
  'line-width': 2,
  'line-opacity': 0.8,
}
const SELECTED_STYLE = {
  'line-color': '#484ab2',
  'line-width': 4,
  'line-opacity': 1,
}
const TEMPORARY_STYLE = {
  'line-color': '#76769e',
  'line-width': 2,
  'line-opacity': 0.5,
  'line-dasharray': [2, 2],
}
const LOGIC_STYLE = {
  'line-color': '#76769e90',
  'line-width': 8,
  'line-opacity': 1,
  'line-dasharray': [0.3, 0.3],
}
const SELECTED_LOGIC_STYLE = {
  'line-color': '#484ab2',
  'line-width': 8,
  'line-opacity': 1,
  'line-dasharray': [0.3, 0.3],
}
const CLICK_STYLE = {
  'line-color': 'transparent',
  'line-width': 30,
  'line-opacity': 1,
}
const HOVER_STYLE = {
  'line-color': '#7375ec',
  'line-width': 4,
  'line-opacity': 1,
}
const HOVER_LOGIC_STYLE = {
  'line-color': '#7375ec',
  'line-width': 8,
  'line-opacity': 1,
  'line-dasharray': [0.3, 0.3],
}

function temporaryLine() {
  const sourcePosition = Array.isArray(props.edge.source)
    ? props.edge.source
    : (props.edge.source.position || props.edge.source.getPosition())
  const targetPosition = Array.isArray(props.edge.target)
    ? props.edge.target
    : (props.edge.target.position || props.edge.target.getPosition())
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: [sourcePosition, targetPosition] },
  }
}

const resolvedPhysical = computed(() => {
  if (props.isTemporary || props.edge.isLogic === true) return null
  return resolveEdgePhysicalProperties(props.edge, props.physicalConfig)
})

const renderedLine = computed(() => {
  if (props.isTemporary) return temporaryLine()
  return resolvedPhysical.value?.line ?? sampleEdgeRoute(props.edge).line
})

const badgeRows = computed(() => {
  if (!props.showPhysicalBadges || !resolvedPhysical.value) return []
  const rows = []
  if (!resolvedPhysical.value.manualDelay) {
    rows.push({
      id: 'distance',
      label: formatPhysicalValue(resolvedPhysical.value.distanceMeters, 'm'),
    })
  }
  rows.push({
    id: 'delay',
    label: formatPhysicalValue(resolvedPhysical.value.propagationDelaySeconds, 's'),
  })
  return rows
})

const editableCurvePoints = computed(() => (
  !props.isTemporary
  && props.edge.isLogic !== true
  && props.isSelected
  && props.curveEditingEnabled
  && !props.editingLocked
    ? props.edge.data.curvePoints
    : []
))

function updateLine() {
  props.map.getSource(sourceId)?.setData(renderedLine.value)
}

function updateStyle(selected = props.isSelected, hovered = isHovered.value) {
  let style
  if (selected) style = props.edge.isLogic ? SELECTED_LOGIC_STYLE : SELECTED_STYLE
  else if (hovered) style = props.edge.isLogic ? HOVER_LOGIC_STYLE : HOVER_STYLE
  else style = props.edge.isLogic ? LOGIC_STYLE : DEFAULT_STYLE

  if (props.map.getLayer(layerId)) {
    Object.entries(style).forEach(([key, value]) => {
      props.map.setPaintProperty(layerId, key, value)
    })
  }
}

function handleEdgeClick(event) {
  emit('select', props.edge, 'edge')
  if (!props.isSelected
    || !props.curveEditingEnabled
    || props.editingLocked
    || props.edge.isLogic === true) return

  const projection = projectPointOntoEdge(
    props.edge,
    [event.lngLat.lng, event.lngLat.lat],
  )
  const curvePoints = props.edge.data.curvePoints.map(point => ({
    ...point,
    position: [...point.position],
  }))
  curvePoints.splice(projection.segmentIndex, 0, {
    id: generateUUid('curve'),
    position: projection.position,
    type: 'smooth',
  })
  emit('designOperations', [{
    kind: 'topology.update_edge',
    edge_id: props.edge.id,
    value: { data: { curvePoints } },
  }])
}

function handleMouseEnter(event) {
  if (!event.originalEvent.target.classList.contains('maplibregl-canvas')) return
  isHovered.value = true
  updateStyle(props.isSelected, true)
}

function handleMouseLeave() {
  isHovered.value = false
  updateStyle(props.isSelected, false)
}

function moveCurvePoint(point, position) {
  const curvePoints = props.edge.data.curvePoints.map(candidate => ({
    ...candidate,
    position: candidate.id === point.id ? [...position] : [...candidate.position],
  }))
  emit('designOperations', [{
    kind: 'topology.update_edge',
    edge_id: props.edge.id,
    value: { data: { curvePoints } },
  }])
}

function cycleCurvePoint(point) {
  let curvePoints
  if (point.type === 'smooth') {
    curvePoints = props.edge.data.curvePoints.map(candidate => ({
      ...candidate,
      type: candidate.id === point.id ? 'sharp' : candidate.type,
      position: [...candidate.position],
    }))
  } else {
    curvePoints = props.edge.data.curvePoints
      .filter(candidate => candidate.id !== point.id)
      .map(candidate => ({ ...candidate, position: [...candidate.position] }))
  }
  emit('designOperations', [{
    kind: 'topology.update_edge',
    edge_id: props.edge.id,
    value: { data: { curvePoints } },
  }])
}

onMounted(() => {
  props.map.addSource(sourceId, { type: 'geojson', data: renderedLine.value })
  if (!props.isTemporary) {
    props.map.addLayer({
      id: clickLayerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: CLICK_STYLE,
    })
  }
  props.map.addLayer({
    id: layerId,
    type: 'line',
    source: sourceId,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: props.isTemporary
      ? TEMPORARY_STYLE
      : (props.edge.isLogic ? LOGIC_STYLE : DEFAULT_STYLE),
  })

  if (!props.isTemporary) {
    props.map.on('click', clickLayerId, handleEdgeClick)
    props.map.on('mouseenter', clickLayerId, handleMouseEnter)
    props.map.on('mouseleave', clickLayerId, handleMouseLeave)
  }
  updateStyle(props.isSelected)
})

onUnmounted(() => {
  if (!props.isTemporary) {
    props.map.off('click', clickLayerId, handleEdgeClick)
    props.map.off('mouseenter', clickLayerId, handleMouseEnter)
    props.map.off('mouseleave', clickLayerId, handleMouseLeave)
  }
  if (props.map.getLayer(layerId)) props.map.removeLayer(layerId)
  if (props.map.getLayer(clickLayerId)) props.map.removeLayer(clickLayerId)
  if (props.map.getSource(sourceId)) props.map.removeSource(sourceId)
})

watch(renderedLine, updateLine, { deep: true })
watch(() => props.isSelected, selected => updateStyle(selected, isHovered.value))
</script>

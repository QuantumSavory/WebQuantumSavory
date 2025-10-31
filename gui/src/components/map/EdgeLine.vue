<template>
  <div class="edge-line"></div>
</template>
<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  edge:         { type: Object, required: true },
  map:          { type: Object, required: true },
  isSelected:   { type: Boolean, default: false },
  isTemporary:  { type: Boolean, default: false },
  isLogic:      { type: Boolean, default: false }
})

const emit = defineEmits(['select'])

const sourceId = `edge-${props.edge.id}`
const layerId = `edge-layer-${props.edge.id}`
const clickLayerId = `edge-click-layer-${props.edge.id}`

// Reactive state for hover
const isHovered = ref(false)

// Line styles
const DEFAULT_STYLE = {
  'line-color': '#76769e',
  'line-width': 2,
  'line-opacity': 0.8
}

const SELECTED_STYLE = {
  'line-color': '#484ab2',
  'line-width': 4,
  'line-opacity': 1
}

const TEMPORARY_STYLE = {
  'line-color': '#76769e',
  'line-width': 2,
  'line-opacity': 0.5,
  'line-dasharray': [2, 2]
}

const LOGIC_STYLE = {
  'line-color': '#76769e90',
  'line-width': 8,
  'line-opacity': 1,
  'line-dasharray': [.3, .3]
}

const SELECTED_LOGIC_STYLE = {
  'line-color': '#484ab2',
  'line-width': 8,
  'line-opacity': 1,
  'line-dasharray': [.3, .3]
}

// Invisible thick line for better click targeting
const CLICK_STYLE = {
  'line-color': 'transparent',
  'line-width': 30,
  'line-opacity': 1
}

// Hover styles (orange variants)
const HOVER_STYLE = {
  'line-color': '#7375ec',
  'line-width': 4,
  'line-opacity': 1
}

const HOVER_LOGIC_STYLE = {
  'line-color': '#7375ec',
  'line-width': 8,
  'line-opacity': 1,
  'line-dasharray': [.3, .3]
}

// Update edge line coordinates
function updateLine() {
  if (!props.map || !props.edge) return

  const source = props.map.getSource(sourceId)
  if (source) {
    let coordinates
    if (props.isTemporary) {
      // For temporary lines, ensure we get coordinates consistently
      const sourcePos = Array.isArray(props.edge.source) ? 
        props.edge.source : 
        (props.edge.source.position || props.edge.source.getPosition())
      
      const targetPos = Array.isArray(props.edge.target) ? 
        props.edge.target : 
        (props.edge.target.position || props.edge.target.getPosition())
      
      coordinates = [sourcePos, targetPos]
    } else {
      // For real edges, use getCoordinates method
      coordinates = props.edge.getCoordinates()
    }

    source.setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates
      }
    })
  }
}

// Update line style based on selection and hover
function updateStyle(selected = props.isSelected, hovered = isHovered.value) {
  if (!props.map) return
  
  let style
  if (selected) {
    // Selected state (highest priority)
    style = props.edge.isLogic ? SELECTED_LOGIC_STYLE : SELECTED_STYLE
  } else if (hovered) {
    // Hover state (when not selected)
    style = props.edge.isLogic ? HOVER_LOGIC_STYLE : HOVER_STYLE
  } else {
    // Default state
    style = props.edge.isLogic ? LOGIC_STYLE : DEFAULT_STYLE
  }
  
  if (props.map.getLayer(layerId)) {
    const entries = Object.entries(style);
    entries.forEach(([key, value]) => {
      props.map.setPaintProperty(layerId, key, value)
    })
  }
}

// Setup edge line on mount
onMounted(() => {
  if (!props.map || !props.edge) return

  let initialCoords
  if (props.isTemporary) {
    // For temporary lines, ensure we get coordinates consistently
    const sourcePos = Array.isArray(props.edge.source) ? 
      props.edge.source : 
      (props.edge.source.position || props.edge.source.getPosition())
    
    const targetPos = Array.isArray(props.edge.target) ? 
      props.edge.target : 
      (props.edge.target.position || props.edge.target.getPosition())
    
    initialCoords = [sourcePos, targetPos]
  } else {
    initialCoords = props.edge.getCoordinates()
  }

  // Add source
  props.map.addSource(sourceId, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: initialCoords
      }
    }
  })

  // Add thick invisible click layer first (below the visible line)
  if (!props.isTemporary) {
    props.map.addLayer({
      id: clickLayerId,
      type: 'line',
      source: sourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: CLICK_STYLE
    })
  }

  // Add visible line layer
  props.map.addLayer({
    id: layerId,
    type: 'line',
    source: sourceId,
    layout: {
      'line-join': 'round', // options: round, square, bevel
      'line-cap': 'square' // options: round, square, bevel
    },
    paint: props.isTemporary ? TEMPORARY_STYLE : props.edge.isLogic ? LOGIC_STYLE : DEFAULT_STYLE
  })

  // Add click handler to the thick invisible layer for better targeting
  if (!props.isTemporary) {
    props.map.on('click', clickLayerId, (e) => {
      emit('select', props.edge, 'edge')
    })
    
    // Add hover handlers
    props.map.on('mouseenter', clickLayerId, (e) => {
      const originalTarget = e.originalEvent.target;
      if (!originalTarget.classList.contains('maplibregl-canvas')) {
        return;
      }
      isHovered.value = true
      updateStyle(props.isSelected, true)
    })
    
    props.map.on('mouseleave', clickLayerId, (e) => {
      isHovered.value = false
      updateStyle(props.isSelected, false)
    })
  }

  // Set initial style
  updateStyle(props.isSelected)
})

// Cleanup on unmount
onUnmounted(() => {
  if (!props.map) return

  // Remove visible layer
  if (props.map.getLayer(layerId)) {
    props.map.removeLayer(layerId)
  }
  // Remove click layer
  if (props.map.getLayer(clickLayerId)) {
    props.map.removeLayer(clickLayerId)
  }
  // Remove source
  if (props.map.getSource(sourceId)) {
    props.map.removeSource(sourceId)
  }
})

// Watch for position changes
watch(
  () => {
    if (props.isTemporary) {
      return [props.edge.source, props.edge.target]
    }
    return [
      props.edge.source.getPosition(),
      props.edge.target.getPosition()
    ]
  },
  () => updateLine(),
  { deep: true }
)

// Watch for selection changes
watch(() => props.isSelected, (newSelected) => {
  updateStyle(newSelected, isHovered.value)
})
</script>

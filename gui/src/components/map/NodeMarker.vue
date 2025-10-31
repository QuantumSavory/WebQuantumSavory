<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import Slot from '../../models/Slot'
import Tooltip from 'primevue/tooltip';
import SlotIcon from './SlotIcon.vue';

const props = defineProps({
  node: {       type: Object,   required: true },
  map: {        type: Object,   required: true },
  isSelected: { type: Boolean,  default: false }
})

const emit = defineEmits(['select', 'startConnection', 'updateConnection', 'endConnection', 'nodePositionChanged'])
const marker = ref(null)
const markerEl = ref(null)
const isHovered = ref(false)
const isDraggingConnector = ref(false)
const slots = ref([])


// Update marker style based on selection
function updateMarkerStyle(selected) {
  if (!marker.value) return
  const el = marker.value.getElement()
  if (selected) {
    el.style.zIndex = '1'
  } else {
    el.style.zIndex = '0'
  }
}

onMounted(() => {
  // Create and initialize marker
  marker.value = new maplibregl.Marker({
    element: markerEl.value,
    draggable: true
  })

  // Set marker position and add to map
  marker.value.setLngLat(props.node.position)
    .addTo(props.map)

  // Handle drag events
  marker.value.on('drag', () => {
    const position = marker.value.getLngLat()
    props.node.updatePosition([position.lng, position.lat])
    emit('nodePositionChanged', props.node)
  })

  marker.value.on('dragend', () => {
    const position = marker.value.getLngLat()
    props.node.updatePosition([position.lng, position.lat])
    emit('nodePositionChanged', props.node)
  })

  // Set initial selection state
  updateMarkerStyle(props.isSelected)
})

onUnmounted(() => {
  if (marker.value) {
    marker.value.remove()
  }
})

// Watch for selection changes
watch(() => props.isSelected, updateMarkerStyle)

// Update marker if node position changes externally
function updatePosition(position) {
  if (marker.value) {
    marker.value.setLngLat(position)
  }
}

// Handle click
function handleClick(e) {
  if (!isDraggingConnector.value) {
    e.preventDefault()
    e.stopPropagation()
    emit('select', props.node, 'node')
  }
}

// Handle connector drag events
function handleConnectorMousedown(e) {
  e.preventDefault()
  e.stopPropagation()
  
  isDraggingConnector.value = true
  emit('startConnection', props.node)

  // Add global mouse move and up handlers
  const handleMousemove = (e) => {
    if (!isDraggingConnector.value) return
    const rect = props.map.getContainer().getBoundingClientRect()
    const point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
    const lngLat = props.map.unproject([point.x, point.y])

    // Check if we're over any markers
    const markerElements = document.querySelectorAll('.node-marker')
    let targetNode = null

    // Find if we're hovering over a marker
    markerElements.forEach(markerEl => {
      const markerRect = markerEl.getBoundingClientRect()
      if (e.clientX >= markerRect.left && e.clientX <= markerRect.right &&
          e.clientY >= markerRect.top && e.clientY <= markerRect.bottom) {
        // Get the node instance from the marker element
        const nodeId = markerEl.getAttribute('data-node-id')
        if (nodeId && nodeId !== props.node.id) {
          targetNode = { id: nodeId }
        }
      }
    })

    if (targetNode) {
      emit('updateConnection', targetNode)
    } else {
      emit('updateConnection', [lngLat.lng, lngLat.lat])
    }
  }

  const handleMouseup = (e) => {
    isDraggingConnector.value = false
    
    const markerElements = document.querySelectorAll('.node-marker')
    let targetNode = null

    markerElements.forEach(markerEl => {
      const markerRect = markerEl.getBoundingClientRect()
      if (e.clientX >= markerRect.left && e.clientX <= markerRect.right &&
          e.clientY >= markerRect.top && e.clientY <= markerRect.bottom) {
        const nodeId = markerEl.getAttribute('data-node-id')
        if (nodeId && nodeId !== props.node.id) {
          targetNode = { id: nodeId }
        }
      }
    })

    emit('endConnection', targetNode)
    window.removeEventListener('mousemove', handleMousemove)
    window.removeEventListener('mouseup', handleMouseup)
  }

  window.addEventListener('mousemove', handleMousemove)
  window.addEventListener('mouseup', handleMouseup)
}

// Remove node hover handlers since we're handling it in mousemove
function handleNodeEnter(e) {
  e.stopPropagation() // Prevent event from reaching line layers below
  isHovered.value = true
}

function handleNodeLeave(e) {
  e.stopPropagation() // Prevent event from reaching line layers below
  isHovered.value = false
}

function handleSlotClick(slot, e){
  e.stopPropagation()
  window.showEntangledSlots( slot.id );
}


// Expose methods to parent
defineExpose({ updatePosition })
</script>

<template>
  <div 
    ref="markerEl"
    class="node-marker"
    :class="{ 'is-selected': isSelected, 'is-hovered': isHovered }"
    :data-node-id="node.id"
    @click="handleClick"
    @mouseenter="handleNodeEnter"
    @mouseleave="handleNodeLeave" 
    
  >
    <div 
      class="connector output" 
      v-show="isHovered"
      @mousedown.stop="handleConnectorMousedown"
    ></div>
    <div class="node-name">{{ node.name }}</div>
    <div style="margin-left: 10px;" v-if="node.data.slots.length > 0">
      <div style="display: flex; flex-direction: row; max-width:120px; flex-wrap: wrap;">
        <SlotIcon 
          v-for="slot in node.data.slots"
          :key="slot.id" 
          :registerSlot="slot" 
          :node="node" 
          @click="handleSlotClick(slot, $event  )"
         
          />
      </div>
    </div>
  </div>
</template>

<style scoped>
.slot {
  background: #ffffff;
  width: 9px;
  height: 9px;
  position: relative;
  margin: 1px;
  border: 1px solid transparent; 
  border-radius: 1px;
}

.slot::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 150%; 
  height: 1px; 
  background: #fff; 
  transform: rotate(45deg);
  transform-origin: top left;
}

.slot:hover{
  border: solid 1px #fff;
}
.node-marker {
  padding: 4px 8px;
  background-color: #76769e;
  border-radius: 6px;
  border: 2px solid transparent;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  cursor: pointer;
  color: white;
  font-size: 1rem;
  font-weight: 500;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 60px;
  width: max-content;
  min-height: 30px;
  position: absolute;
  transform: translate(-50%, -50%);
  transition: box-shadow 0.2s ease, background-color 0.2s ease;
}

.node-marker.is-selected {
  background-color: #2d2e81;
  box-shadow: 0 0px 10px 3px #8586f6;
  font-weight: 600;
  transition: box-shadow 0.2s ease, background-color 0.2s ease;
}

.node-marker.is-hovered {
  background-color: #484ab2;
  box-shadow: 0 0px 8px 2px #6e6fd3;
  transition: box-shadow 0.2s ease, background-color 0.2s ease;
}

.node-name {
  margin: 0;
  padding: 0;
  line-height: 1.2;
}

.connector {
  position: absolute;
  width: 24px;
  height: 24px;
  background: #40418700;
  border-radius: 50%;
  top: 50%;
  transform: translateY(-50%);
  cursor: crosshair;
  z-index: 1;
}

.connector:hover {
  background: #40418740;
}

.connector:before {
  content: " ";
  position: absolute;
  z-index: -10;
  top: 7px;
  left: 7px;
  right: 7px;
  bottom: 7px;
  border: 2px solid #404187;
  background: #fff;
  border-radius: 50%;
}

.connector.output {
  right: -15px;
}

.is-selected .connector {
  border-color: #4345ac;
}
</style> 
<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import maplibregl from 'maplibre-gl'

const props = defineProps({
  stateId: {
    type: String,
    required: true
  },
  position: {
    type: Array,
    required: true
  },
  map: {
    type: Object,
    required: true
  },
  isVisible: {
    type: Boolean,
    default: true
  },
  stateObject: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['select'])
const marker = ref(null)
const markerEl = ref(null)

onMounted(() => {
  if (props.isVisible) {
    createMarker()
  }
})

onUnmounted(() => {
  removeMarker()
})

// Watch for visibility changes
watch(() => props.isVisible, (newVisible) => {
  if (newVisible) {
    createMarker()
  } else {
    removeMarker()
  }
})

// Watch for position changes
watch(() => props.position, (newPosition) => {
  if (marker.value && newPosition) {
    marker.value.setLngLat(newPosition)
  }
})

function createMarker() {
  if (!marker.value && markerEl.value && props.map) {
    marker.value = new maplibregl.Marker({
      element: markerEl.value,
      draggable: false
    })
    
    marker.value.setLngLat(props.position)
      .addTo(props.map)
  }
}

function removeMarker() {
  if (marker.value) {
    marker.value.remove()
    marker.value = null
  }
}

function handleClick(e) {
  e.preventDefault()
  e.stopPropagation()
  
  // Show results view for the entangled state using the first slot
  if (props.stateObject && props.stateObject.slots && props.stateObject.slots.length > 0) {
    const firstSlotRef = props.stateObject.slots[0]
    
    // Find the actual slot object from the project data
    let actualSlot = null
    let nodeName = 'Unknown Node'
    let slotIndex = 'Unknown'
    
    // Access projectData from window (global variable)
    if (window.projectData && window.projectData.net && window.projectData.net.nodes) {
      for (const node of window.projectData.net.nodes) {
        if (node.id === firstSlotRef.nodeId) {
          nodeName = node.name || node.id
          for (let i = 0; i < node.data.slots.length; i++) {
            const slot = node.data.slots[i]
            if (slot.id === firstSlotRef.slotId) {
              actualSlot = slot
              slotIndex = i
              break
            }
          }
          break
        }
      }
    }
    
    if (actualSlot) {
      const context = {
        stateId: props.stateId,
        slotCount: props.stateObject.slots.length,
        slotId: actualSlot.id,
        nodeName: nodeName,
        slotIndex: slotIndex
      }
      
      // Use the actual slot object to represent the entangled state
      window.showResultsView('slot', actualSlot, context)
    } else {
      console.warn('StateNode: Could not find actual slot object for', firstSlotRef)
    }
  } else {
    console.warn('StateNode: No slots available to show results for state', props.stateId)
  }
}

// Expose methods to parent
defineExpose({ 
  updatePosition: (position) => {
    if (marker.value) {
      marker.value.setLngLat(position)
    }
  },
  remove: removeMarker
})
</script>

<template>
  <div 
    ref="markerEl"
    class="state-node"
    :data-state-id="stateId"
    @click="handleClick"
  >
    <div class="state-content" @click="handleClick" >
      <div class="state-name">{{ stateObject.slots.length }}</div>
    </div>
  </div>
</template>

<style scoped>
.state-node {
  background-color: #cff3ff;
  border-radius: 50%;
  border: 2px solid #31ccff;
  box-shadow: 0 4px 8px #14719080;
  cursor: pointer;
  color: white;
  font-size: 0.9rem;
  font-weight: 600;
  white-space: nowrap;
  width: 30px;
  height: 30px;
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 1000;
}

.state-name {
  margin: 0;
  padding: 0;
  line-height: 1.2;
  color: #05a0d4;
  font-size: 16px;
}

.state-node:hover {
  background-color: #31ccff;
  transform: translate(-50%, -50%) scale(1.05);
  color: #fff;
}

.state-node:hover .state-name {
  color: #fff;
}

.state-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}


</style>
<template>
  <!-- NodePanel (already has BasePanel inside) -->
  <NodePanel
    v-if="selectedType === 'node' && selectedItem"
    :key="'node-' + selectedItem.id"
    :node="selectedItem" 
    :nodeIndex="nodeIndex"
    :justCreated="justCreated"
    :simulationState="simulationState"
    :variables="projectData.variables || []"
    @delete="$emit('delete')"
    @name-edit-complete="$emit('name-edit-complete')"
    @collapsed-changed="$emit('collapsed-changed', $event)"
  />
  
  <!-- EdgePanel (already has BasePanel inside) -->
  <EdgePanel 
    v-else-if="selectedType === 'edge' && selectedItem"
    :projectData="projectData"
    :key="'edge-' + selectedItem.id"
    :edge="selectedItem"
    :simulationState="simulationState"
    :variables="projectData.variables || []"
    @delete="$emit('delete')"
    @collapsed-changed="$emit('collapsed-changed', $event)"
  />
  
  <!-- VoidPanel (nothing selected) -->
  <VoidPanel v-else>
    <slot>Nothing selected</slot>
  </VoidPanel>
</template>

<script setup>
import NodePanel from './NodePanel.vue'
import EdgePanel from './EdgePanel.vue'
import VoidPanel from './VoidPanel.vue'

const props = defineProps({
  selectedType: {
    type: String,
    default: null
  },
  selectedItem: {
    type: Object,
    default: null
  },
  nodeIndex: {
    type: Number,
    default: null
  },
  justCreated: {
    type: Boolean,
    default: false
  },
  simulationState: {
    type: Object,
    default: null
  },
  projectData: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['delete', 'name-edit-complete', 'collapsed-changed'])
</script>

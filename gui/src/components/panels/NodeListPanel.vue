<template>
  <BasePanel 
    panel_id="node_list" 
    title="Nodes" 
    :collapsable="true"
    @collapsed-changed="$emit('collapsed-changed', $event)"
  >
    <template #content>
      <div v-if="!nodes.length" class="empty-list">No nodes</div>
      <div v-else style="max-height: 20vh; overflow-y: auto;">
        <div
          v-for="node in nodes"
          :key="node.id"
          class="node-list-item"
          :class="{ selected: selectedNode === node }"
          @click="handleSelect(node)"
        >
          <span class="node-list-name">{{ node.name }}</span>
          <span class="node-list-slotcount">{{ node.data.slots.length }} <span style="font-size: 0.8rem; opacity: 0.6;">slots</span></span>
        </div>
      </div>
      <div class="action-buttons">
        <button @click="handleNewNode" class="noborder"> + Add Node</button>
      </div>
    </template>
  </BasePanel>
</template>


<script setup>
import { defineProps, defineEmits } from 'vue'
import BasePanel from './BasePanel.vue'

const props = defineProps({
  nodes: {
    type: Array,
    required: true
  },
  selectedNode: {
    type: Object,
    default: null
  }
})
const emit = defineEmits(['select', 'addNewNode', 'collapsed-changed'])

function handleSelect(node) {
  emit('select', node)
}

function handleNewNode() {
  emit('addNewNode')
}
</script>


<style scoped>
.node-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 9px 3px 10px;
  margin: 4px 0px;
  border-radius: 4px;
  background: #f9f9f9;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.13s, color 0.13s;
}

.node-list-item.selected {
  background: #4345ac;
  color: #fff;
  font-weight: 600;
}

.node-list-item:hover {
  background: #dedff6;
}

.node-list-item.selected:hover {
  background: var(--p-primary-700);
}

.node-list-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 80%;
}

.node-list-type {
  font-size: 0.92rem;
  color: #888;
  background: #eee;
  border-radius: 4px;
  padding: 2px 8px;
  margin-left: 10px;
}

.empty-list {
  color: #aaa;
  font-size: 0.98rem;
  padding: 10px 18px;
  text-align: center;
}
</style> 
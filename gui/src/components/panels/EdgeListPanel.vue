<template>
  <BasePanel 
    panel_id="edge_list" 
    title="Edges" 
    :collapsable="true"
    @collapsed-changed="$emit('collapsed-changed', $event)"
  >
    <template #content>
      <div v-if="!edges.length" class="empty-list">No edges</div>
      <div v-else>
        <div
          v-for="edge in edges"
          :key="edge.id"
          class="edge-list-item"
          :class="{ selected: selectedEdge === edge }"
          @click="handleSelect(edge)"
        >
            <div class="edge-name-container">
                <div class="edge-name" :class="{ 'logic': edge.isLogic }">
                    {{ getNodeById(edge.source).name }}
                </div> 
                <div class="edge-name-connector" />
                <div class="edge-name" :class="{ 'logic': edge.isLogic }">
                    {{ getNodeById(edge.target).name }}
                </div>
            </div>
        </div>
      </div>
    </template>
  </BasePanel>
</template>



<script setup>
import { defineProps, defineEmits } from 'vue'
import BasePanel from './BasePanel.vue'

const props = defineProps({
  projectData: {
    type: Object,
    required: true
  },
  edges: {
    type: Array,
    required: true
  },
  selectedEdge: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['select', 'collapsed-changed'])

function getNodeById(id){
  const result =  props.projectData.net.nodes.find(node => node.id === id)
  return result ? result.name : id
}

function handleSelect(edge) {
  emit('select', edge)
}

function handleNewEdge() {
  emit('addNewEdge')
}
</script>


<style scoped>
.edge-list-item {
  display: flex;
  align-items: center;
  padding: 3px 9px 3px 3px;
  margin: 4px 0px;
  border-radius: 4px;
  background: #f9f9f9;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.13s, color 0.13s;
}

.edge-list-item.selected {
  font-weight: 500;
  background: #dedff6;
}

.edge-list-item:hover {
  background: #dedff6;
}

.edge-list-item.selected:hover {
  background: #dedff6;
}

.edge-name-container{
  display: flex;
  align-items: center;
  gap: 0px;
  max-width: 100%;
}

.edge-name{
  font-weight: 500;
  border-radius: 10px;
  padding: 1px 12px;
  margin-left: 0px;
  border: solid 1px #b5c0dd;
  font-size: 13px;
  background: #76769e;
  color: #fff;
  font-weight: 500;
  border-color: transparent;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edge-name.logic{
  border: dashed 2px #76769e;
  background: #76769e40;
  padding: 0px 12px;
  color: #44445a;
}

.edge-name-connector{
  background: #76769e;
  width: 15px;
  height: 3px;
  position: relative;
  padding: 0px;
}

.edge-list-item.selected .edge-name{
  background: #7375ec;
  color: #fff;
  border-color: transparent;
}

.edge-list-item.selected .edge-name.logic{
  background: #7375ec20;
  border: dashed 2px #7375ec;
  color: #4e4fa9;
}

.edge-list-item.selected .edge-name-connector{
  background: #7375ec;
}

.edge-list-name {
  font-weight: 500;
}

.edge-list-node-name{
    background: #dfdfee;
    border-radius: 3px;
    padding: 0px 8px;
    margin-left: 0px;
    border: solid 1px #b5c0dd;
}

.edge-list-item.selected .edge-list-node-name{
  background: #dedff6;
  color: #fff;
  font-weight: 600;
  border-color: transparent;
}

.edge-list-type {
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
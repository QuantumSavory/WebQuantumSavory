<template>
  <BasePanel 
    panel_id="edge_panel" 
    title="Selected Edge" 
    :collapsable="true"
    :collapsed="collapsed"
    @update:collapsed="emit('update:collapsed', $event)"
  >
    <template #content>

      <!-- Section 1: Name -->
      <section class="panel-section">
        <div class="edge-name-container" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="display: flex; align-items: center; max-width: calc(100% - 30px);">
            <div class="edge-name">
              {{ getNodeById(edge.source).name }}
            </div> 
            <div class="edge-name-connector" />
            <div class="edge-name">
              {{ getNodeById(edge.target).name }}
            </div>
          </div>
        <div class="" >
            <button class="options-btn noborder" @mouseover="showOptionsMenu" aria-label="Menu" style="font-weight: bold; color: #000;">
              <EllipsisVertical :size="18" aria-hidden="true" />
            </button>
            <Menu @mouseleave="hideOptionsMenu" ref="optionsMenuElement"  :model="mainMenuItems" :popup="true" style="transform: translate(10px, -30px);">
              <template #itemicon="{ item }">
                <LucideMenuIcon :item="item" />
              </template>
            </Menu>
          </div>
        </div>
      </section>

      <section v-if="!edge.isLogic" class="panel-section">
        <div class="panel-section-title">PHYSICAL PROPAGATION</div>
        <PhysicalEdgeControls
          :edge="edge"
          :physical-config="projectData.net.physicalConfig"
          :editing-locked="editingLocked"
          @design-operations="(...args) => emit('designOperations', ...args)"
        />
      </section>

      <!-- Section 2: Protocols Table -->
      <section class="panel-section">
        <div class="panel-section-title">PROTOCOLS ({{ props.edge.data.protocols.length }})</div>
        <ProtocolsManager 
          ref="protocolsManager"
          :protocols="props.edge.data.protocols" 
          protocolGroupName="edge" 
          :protocolClass="FloatingProtocol"
          :contextInfo="{
            sourceNodeName: props.edge.source.name,
            targetNodeName: props.edge.target.name
          }"
          :editingLocked="editingLocked"
          :variables="props.variables"
          :isVirtualEdge="props.edge.isLogic"
          :owner-id="props.edge.id"
          :numeric-expression-context="numericExpressionContext"
          @design-operations="(...args) => emit('designOperations', ...args)"
        />
      </section>
    </template>
  </BasePanel>
</template>



<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { api } from '../../utils/ApiConnector'
import BasePanel from './BasePanel.vue'
import FloatingProtocol from '../../models/FloatingProtocol'
import ProtocolsManager from './ProtocolsManager.vue'
import PhysicalEdgeControls from './PhysicalEdgeControls.vue'
import Menu from 'primevue/menu'
import { EllipsisVertical, Trash2 } from '@lucide/vue'
import LucideMenuIcon from '../LucideMenuIcon.vue'
import { buildNumericExpressionContext } from '../../utils/numericExpressionContext.js'

const props = defineProps({
  edge:             { type: Object, required: true }, 
  projectData:      { type: Object, required: true },
  editingLocked:    { type: Boolean, default: false },
  variables:        { type: Array, default: () => [] },
  collapsed:        { type: Boolean, default: false }
})

const emit = defineEmits([
  'slot-updated',
  'delete',
  'name-edit-complete',
  'update:collapsed',
  'designOperations',
])

const numericExpressionContext = computed(() => (
  buildNumericExpressionContext(props.projectData, 'edge', props.edge)
))

const optionsMenuElement = ref(null)
const mainMenuItems = computed(() => {
  let result = [
    { label: 'Delete', lucideIcon: Trash2, command: () => handleOptionsMenu('delete') },
  ];
  return result;
}) 

function handleOptionsMenu(action){
  if( action == "delete" ){
    emit('delete', props.edge, 'edge')
  }
}

function showOptionsMenu(event){
  console.log( 'showOptionsMenu', event, optionsMenuElement.value );
  optionsMenuElement.value.show(event)
}

function hideOptionsMenu(event){
  optionsMenuElement.value.hide(event)
}

function getNodeById(id){
  const result =  props.projectData.net.nodes.find(node => node.id === id)
  return result ? result.name : id
}

</script>




<style scoped>

.edge-name-container{
  display: flex;
  align-items: center;
  gap: 0px;
  margin-bottom: 15px;
}

.edge-name{
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 10px;
  padding: 0px 12px;
  margin-left: 0px;
  border: solid 1px #b5c0dd;
  font-size: 13px;
  background: #7375ec;
  color: #fff;
  font-weight: 500;
  border-color: transparent;
  max-width: 60%;
}
.edge-name-connector{
  background: #7375ec;
  width: 15px;
  height: 3px;
  position: relative;
  padding: 0px;
}

.options-btn {
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  color: #666;
  min-width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s, border-color 0.15s;
}

.options-btn:hover {
  background: #eeeeee;
  color: #444;
}

</style>

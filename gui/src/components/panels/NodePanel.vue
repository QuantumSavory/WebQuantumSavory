<template>
  <BasePanel 
    panel_id="node_panel" 
    :collapsable="true"
    :title="`Selected Node`" 
    @collapsed-changed="$emit('collapsed-changed', $event)"
  >
    <template #indicator>
      <NodeIndex :index="props.nodeIndex" />
    </template>
    <template #content>
      <!-- Section 1: Name -->
      <section class="panel-section">
        <div class="node-name" style="display: flex; justify-content: space-between; align-items: center;">
          <template v-if="editingName">
            <input
              id="node-name-input"
              v-model="nameInput"
              @blur="saveName"
              @keydown="handleNameKey"
              class="node-name-input"
            />
          </template>
          <template v-else>
            <span 
              @click="startEditName" 
              class="node-name-display" 
              :class="{ 'node-name-display--disabled': isNodeEditingLocked }"
              :title="isNodeEditingLocked ? 'Reset the simulation to edit node names' : 'Click to edit'"
            >
              {{ props.node.name }}
            </span>
          </template>
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

      <!-- Section 2: Slots Table -->
      <section class="panel-section">
        <div class="panel-section-title">SLOTS ({{ props.node.data.slots.length }})</div>
        <div v-if="props.node.data.slots.length > 0" class="slots-container">
          <!-- Slots List -->
          <div class="slots-list">
            <div v-for="slot in props.node.data.slots" :key="slot.id" :class="{ 'slot-row-container': true, 'expanded-slot': slot.ui_expanded}">
              <div :class="{ 'slot-row': true, 'expanded-slot': false }" >
                <div v-if="batchEditMode" class="slot-cell checkbox-cell">
                  <input 
                    type="checkbox" 
                    :checked="selectedSlots.has(slot.id)"
                    @change="toggleSlotSelection(slot.id)"
                    class="slot-checkbox"
                  />
                </div>
                <div class="slot-cell type-cell">
                  <SlotIcon 
                    @click="switchSlotType(slot)" 
                    :registerSlot="slot" 
                    :node="props.node"
                    :class="{ 'slot-type-icon--disabled': isNodeEditingLocked }"
                    :style="{ cursor: isNodeEditingLocked ? 'not-allowed' : 'pointer' }" 
                  />
                </div>
                <div class="slot-cell bg-noise-cell">
                  <select :value="slot.backgroundNoise.type" @change="updateSlotBgNoise(slot, $event)" class="bg-noise-select" :disabled="props.simulationState?.hasSimulationRun">
                    <option v-for="opt in bgNoiseOptions" :key="opt.type" :value="opt.type">{{ opt.type == 'default' ? 'No background noise' : opt.type }}</option>
                  </select>
                </div>
                <!-- <div class="slot-cell last-op-cell">
                  {{slot.lastOperationTime}}
                </div> -->
                <SlotEditor 
                  :registerSlot="slot"
                  :node="props.node"
                  @deleteSlot="deleteSlot(slot)" 
                  @toggleDetails="toggleSlotExpanded(slot)"
                />
                
              </div>
              <div class="slot-row-expanded" v-if="slot.ui_expanded">
                <b>Parameters</b>
                <div class="bg-noise-param-rows">
                  <div class="bg-noise-param-row" v-for="param in slot.backgroundNoise.parameters" :key="param.field">
                    <div 
                      v-tooltip.top="{
                        value: api.getBackgroundNoiseParameterDefinition( slot.backgroundNoise.type, param.field )?.doc || 'NO DOC',
                        escape: false, 
                        pt: {
                          arrow: {
                            style: {
                              borderTopColor: '#fff'
                            }
                          }
                        }
                      }"
                      class="">
                      {{ param.field }}
                    </div>
                    <div>
                      <input type="number" v-model.number="param.value" :disabled="props.simulationState?.hasSimulationRun" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="slot-controls">
          <button class="add-slot-btn noborder" @click="addSlot">
            <Plus :size="14" aria-hidden="true" />
            Add Slot
          </button>
        </div>
        
        <!-- Add N Slots Mini Form -->
        <div v-if="showAddNSlotsForm" class="add-n-slots-form">
          <div class="form-header">Add Multiple Slots</div>
          
          <div class="form-row">
            <label>Number of slots to add:</label>
            <input 
              type="number" 
              v-model.number="numberOfSlotsToAdd" 
              min="1" 
              max="50" 
              class="number-input"
            />
          </div>
          
          <div class="form-row">
            <label>Slot template:</label>
          </div>
          
          <!-- Slot Template Row (same structure as regular slots) -->
          <div class="add-slots-template">
            <!-- Header -->
            <div class="add-slots-header">
              <div class="slot-cell type-header"></div>
              <div class="slot-cell bg-noise-header">BG Noise</div>
            </div>
            
            <!-- Template Row -->
            <div class="add-slots-row">
              <div class="slot-cell type-cell">
                <span @click="switchSlotTemplateType" class="type-icon" v-html="typeIcon(slotTemplate.type)"></span>
              </div>
              <div class="slot-cell bg-noise-cell">
                <select :value="slotTemplate.backgroundNoise.type" @change="updateSlotTemplate('backgroundNoise', slotTemplate.backgroundNoise, $event)" class="bg-noise-select">
                  <option v-for="opt in bgNoiseOptions" :key="opt.type" :value="opt.type">{{ opt.type == 'default' ? 'No background noise' : opt.type }}</option>
                </select>
              </div>
            </div>
          </div>
          
          <div class="form-buttons">
            <button class="cancel-btn" @click="cancelAddNSlots">Cancel</button>
            <button class="" @click="executeAddNSlots">Add {{ numberOfSlotsToAdd }} Slot{{ numberOfSlotsToAdd !== 1 ? 's' : '' }}</button>
          </div>
        </div>
        
        <!-- Batch Edit Mini Form -->
        <div v-if="showBatchEditForm" class="batch-edit-form">
          <div class="form-header">
            {{ selectedSlots.size > 0 ? `Batch Edit ${selectedSlots.size} Slot${selectedSlots.size !== 1 ? 's' : ''}` : 'Batch Edit (No slots selected)' }}
          </div>
          
          <!-- Batch Edit Template Row -->
          <div class="batch-edit-template">
            <!-- Header -->
            <div class="batch-edit-header">
              <div class="slot-cell type-header"></div>
              <div class="slot-cell bg-noise-header">BG Noise</div>
            </div>
            
            <!-- Template Row -->
            <div class="batch-edit-row">
              <div class="slot-cell type-cell">
                <span 
                  @click="switchBatchEditTemplateType" 
                  class="type-icon" 
                  :class="{ 'changed-property': changedProperties.has('type') }"
                  v-html="typeIcon(batchEditTemplate.type)"
                ></span>
              </div>
              <div class="slot-cell bg-noise-cell">
                <select 
                  :value="batchEditTemplate.backgroundNoise.type" 
                  @change="updateBatchEditTemplate('backgroundNoise', batchEditTemplate.backgroundNoise, $event)"
                  class="bg-noise-select"
                  :class="{ 'changed-property': changedProperties.has('backgroundNoise') }"
                >
                  <option v-for="opt in bgNoiseOptions" :key="opt.type" :value="opt.type">{{ opt.type == 'default' ? 'No background noise' : opt.type }}</option>
                </select>
              </div>
            </div>
          </div>
          
          <div v-if="changedProperties.size > 0" class="changed-summary">
            <strong>Properties to change:</strong> {{ Array.from(changedProperties).join(', ') }}
          </div>
          
          <div class="form-buttons">
            <button class="cancel-btn" @click="cancelBatchEdit">Cancel</button>
            <button 
              class="" 
              @click="executeBatchEdit"
              :disabled="changedProperties.size === 0 || selectedSlots.size === 0"
            >
              {{ selectedSlots.size > 0 ? `Apply to ${selectedSlots.size} Slot${selectedSlots.size !== 1 ? 's' : ''}` : 'Apply' }}
            </button>
          </div>
        </div>
        <br/>

        <div class="panel-section-title">PROTOCOLS ({{ props.node.data.protocols.length }})</div>
        <ProtocolsManager 
          ref="protocolsManager"
          :protocols="props.node.data.protocols" 
          protocolGroupName="node" 
          :protocolClass="FloatingProtocol"
          :contextInfo="{
            nodeName: props.node.name
          }"
          :simulationState="props.simulationState"
          :variables="props.variables"
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
import SlotIcon from '../map/SlotIcon.vue'
import SlotEditor from './SlotEditor.vue'
import Menu from 'primevue/menu'
import NodeIndex from './NodeIndex.vue'
import { EllipsisVertical, ListChecks, ListPlus, Plus, Trash2 } from '@lucide/vue'
import LucideMenuIcon from '../LucideMenuIcon.vue'

// Props: node (Node instance), justCreated (bool: true if node was just created and selected)
const props = defineProps({
  node: {
    type: Object,
    required: true
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
    required: false,
    default: () => ({})
  },
  variables: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['slot-updated', 'delete', 'name-edit-complete', 'collapsed-changed'])

const bgNoiseOptions = api.config.value.bgNoiseOptions;

// Helper: get icon for slot type
function typeIcon(type) {
  if (!type) return '•'
  const t = type; //.trim().toLowerCase()
  if (t == "Qubit") return '<span style="color: #48ca82;">Q</span>' // Qubit/Qudit
  if (t == "Qumode") return '<span style="color: #ff9700;">M</span>' // Mode
  return t.charAt(0).toUpperCase()
}


function updateSlotBgNoise(slot, event) {
  let bgType = event.target.value;
  try{
    const bgTypeDefinition = bgNoiseOptions.find(opt => opt.type === bgType);
    slot.backgroundNoise = {
      type: bgTypeDefinition.type,
      doc: bgTypeDefinition.doc,
      parameters: bgTypeDefinition.parameters.map(param => ({
        field: param.field,
        type: param.type,
        doc: param.doc, 
        value: null,
      }))
    }
  }catch(error){
    console.warn('Error updating slot background noise:', error);
  }
  emit('slot-updated', slot)  
}

function toggleSlotExpanded(slot) {
  slot.ui_expanded = !slot.ui_expanded;
}

// Handler: add new slot
function addSlot() {
  // Prevent adding slots if simulation has run
  if (props.simulationState?.hasSimulationRun) {
    alert('Cannot add slots after simulation has started.\n\nPlease click the Reset button (or Stop button) to clear the simulation state and enable editing again.')
    return
  }

  if (props.node && typeof props.node.createNewSlot === 'function') {
    props.node.createNewSlot()
  }
}

function deleteSlot(slot) {
  // Prevent deleting slots if simulation has run
  if (props.simulationState?.hasSimulationRun) {
    alert('Cannot delete slots after simulation has started.\n\nPlease click the Reset button (or Stop button) to clear the simulation state and enable editing again.')
    return
  }

  props.node.data.slots = props.node.data.slots.filter(s => s.id !== slot.id)
  emit('slot-updated', props.node)
}

const optionsMenuElement = ref(null)
const mainMenuItems = computed(() => {
  let result = [
    { label: 'Delete', lucideIcon: Trash2, command: () => handleOptionsMenu('delete') },
    { label: 'Add N Slots', lucideIcon: ListPlus, command: () => addNSlots() },
    { label: 'Batch Edit', lucideIcon: ListChecks, command: () => toggleBatchEdit() },
  ];
  return result;
}) 


function handleOptionsMenu(action){
  if( action == "delete" ){
    emit('delete', props.node, 'node')
  }
}

function showOptionsMenu(event){
  console.log( 'showOptionsMenu', event, optionsMenuElement.value );
  optionsMenuElement.value.show(event)
}
function hideOptionsMenu(event){
  optionsMenuElement.value.hide(event)
}


// Editable node name logic
const isNodeEditingLocked = computed(() => props.simulationState?.hasSimulationRun || false)
const editingName = ref(false)
const nameInput = ref('')

watch(isNodeEditingLocked, (locked) => {
  if (locked && editingName.value) {
    editingName.value = false
    nameInput.value = props.node.name
  }
})
const NODE_NAME_LOCK_MESSAGE = 'Cannot rename nodes after simulation has started.\n\nPlease click the Reset button (or Stop button) to clear the simulation state and enable editing again.'
const SLOT_TYPE_LOCK_MESSAGE = 'Cannot change slot types after simulation has started.\n\nPlease click the Reset button (or Stop button) to clear the simulation state and enable editing again.'

// Options dropdown logic
const showOptionsDropdown = ref(false)

// Add N Slots form logic
const showAddNSlotsForm = ref(false)
const numberOfSlotsToAdd = ref(1)
const slotTemplate = ref({
  type: 'Qubit',
  backgroundNoise: api.getDefaultBgNoise(), 
  lastOperationTime: 0,
  assignment: false,
  isLocked: false
})

// Batch Edit logic
const batchEditMode = ref(false)
const selectedSlots = ref(new Set())
const showBatchEditForm = ref(false)
const batchEditTemplate = ref({
  type: 'Qubit',
  backgroundNoise: api.getDefaultBgNoise(), 
  lastOperationTime: 0,
  assignment: false,
  isLocked: false
})
const changedProperties = ref(new Set())

function hideOptionsDropdown() {
  showOptionsDropdown.value = false
}

function addNSlots() {
  console.log( 'addNSlots' );
  showAddNSlotsForm.value = true
  hideOptionsDropdown()
}

function cancelAddNSlots() {
  showAddNSlotsForm.value = false
  // Reset form values
  numberOfSlotsToAdd.value = 1
  slotTemplate.value = {
    type: 'Qubit',
    backgroundNoise: api.getDefaultBgNoise(), 
    lastOperationTime: 0,
    assignment: false,
    isLocked: false
  }
}

function executeAddNSlots() {
  // Prevent adding slots if simulation has run
  if (props.simulationState?.hasSimulationRun) {
    alert('Cannot add slots after simulation has started.\n\nPlease click the Reset button (or Stop button) to clear the simulation state and enable editing again.')
    return
  }

  if (numberOfSlotsToAdd.value > 0 && props.node && typeof props.node.createNewSlot === 'function') {
    for (let i = 0; i < numberOfSlotsToAdd.value; i++) {
      const newSlot = props.node.createNewSlot()
      // Apply template values to the new slot
      newSlot.type = slotTemplate.value.type
      newSlot.backgroundNoise = slotTemplate.value.backgroundNoise
      newSlot.lastOperationTime = slotTemplate.value.lastOperationTime
      newSlot.assignment = slotTemplate.value.assignment
      newSlot.isLocked = slotTemplate.value.isLocked
    }
  }
  showAddNSlotsForm.value = false
}

function updateSlotTemplate(key, value) {
  /* slotTemplate.value[key] = value */
  const bgType = event.target.value;
  const bgTypeDefinition = bgNoiseOptions.find(opt => opt.type === bgType);
  slotTemplate.value.backgroundNoise = {
    type: bgTypeDefinition.type,
    doc: bgTypeDefinition.doc,
    parameters: bgTypeDefinition.parameters.map(param => ({
      field: param.field,
      type: param.type,
      doc: param.doc, 
      value: null,
    }))
  }
}

function switchSlotTemplateType() {
  const slot = slotTemplate.value;
  if (slot.type == 'Qubit') {
    slot.type = 'Qumode'
  } else if (slot.type == 'Qumode') {
    slot.type = 'Qubit'
  } else {
    slot.type = 'Qubit'
  }
}

// Batch Edit Functions
function toggleBatchEdit() {
  batchEditMode.value = !batchEditMode.value
  if (batchEditMode.value) {
    // Entering batch edit mode - show form immediately
    showBatchEditForm.value = true
    resetBatchEditTemplate()
  } else {
    // Exit batch edit mode
    selectedSlots.value.clear()
    showBatchEditForm.value = false
    changedProperties.value.clear()
  }
  hideOptionsDropdown()
}

function toggleSlotSelection(slotId) {
  if (selectedSlots.value.has(slotId)) {
    selectedSlots.value.delete(slotId)
  } else {
    selectedSlots.value.add(slotId)
  }
}

function resetBatchEditTemplate() {
  batchEditTemplate.value = {
    type: 'Qubit',
    backgroundNoise: api.getDefaultBgNoise(), 
    lastOperationTime: 0,
    assignment: false,
    isLocked: false
  }
  changedProperties.value.clear()
}

function updateBatchEditTemplate(key, value, event) {
  const bgType = event.target.value;
  const bgTypeDefinition = bgNoiseOptions.find(opt => opt.type === bgType);
  batchEditTemplate.value.backgroundNoise = {
    type: bgTypeDefinition.type,
    doc: bgTypeDefinition.doc,
    parameters: bgTypeDefinition.parameters.map(param => ({
      field: param.field,
      type: param.type,
      doc: param.doc, 
      value: null,
    }))
  }
  changedProperties.value.add(key);
}

function switchBatchEditTemplateType() {
  if (batchEditTemplate.value.type == 'Qubit') {
    batchEditTemplate.value.type = 'Qumode'
  } else if (batchEditTemplate.value.type == 'Qumode') {
    batchEditTemplate.value.type = 'Qubit'
  } else {
    batchEditTemplate.value.type = 'Qubit'
  }
  changedProperties.value.add('type')
}

function cancelBatchEdit() {
  selectedSlots.value.clear()
  showBatchEditForm.value = false
  changedProperties.value.clear()
  batchEditMode.value = false
}

function executeBatchEdit() {
  const slotsToUpdate = props.node.data.slots.filter(slot => selectedSlots.value.has(slot.id))
  
  slotsToUpdate.forEach(slot => {
    changedProperties.value.forEach(property => {
      slot[property] = batchEditTemplate.value[property]
      emit('slot-updated', slot)
    })
  })
  
  // Clean up and exit batch edit mode
  selectedSlots.value.clear()
  showBatchEditForm.value = false
  changedProperties.value.clear()
  batchEditMode.value = false
}

// Close dropdown when clicking outside
function handleClickOutside(event) {
  if (showOptionsDropdown.value && !event.target.closest('.options-dropdown-container')) {
    hideOptionsDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

function startEditName() {
  if (isNodeEditingLocked.value) {
    alert(NODE_NAME_LOCK_MESSAGE)
    return
  }
  nameInput.value = props.node.name
  editingName.value = true
  setTimeout(() => {
    const el = document.getElementById('node-name-input')
    if (el) {
      el.focus()
      el.select()
    }
  }, 0)
}
function saveName() {
  if (nameInput.value.trim() && nameInput.value !== props.node.name) {
    props.node.name = nameInput.value.trim()
  }
  editingName.value = false
}
function handleNameKey(e) {
  if (e.key === 'Enter') saveName()
  if (e.key === 'Escape') editingName.value = false
}

function switchSlotType(slot) {
  if (isNodeEditingLocked.value) {
    alert(SLOT_TYPE_LOCK_MESSAGE)
    return
  }
  if (slot.type == 'Qubit') {
    slot.type = 'Qumode'
  } else if (slot.type == 'Qumode') {
    slot.type = 'Qubit'
  } else {
    slot.type = 'Qubit'
  }
}

// Watch for justCreated to trigger name editing
watch(
  () => props.justCreated,
  (val) => {
    if (val) {
      nextTick(() => {
        startEditName()
        emit('name-edit-complete')
      })
    }
  }
)

// Also handle the case where justCreated is true on mount
if (props.justCreated) {
  nextTick(() => {
    startEditName()
    emit('name-edit-complete')
  })
}
</script>




<style scoped>
.add-slot-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}


.node-name {
  font-size: 1.15rem;
  font-weight: 500;
  color: #222;
  margin-bottom: 2px;
  min-height: 28px;
}

.node-name-display {
  border-radius: 0px;
  padding: 0px;
  transition: background 0.15s;
  overflow: hidden;
}

.node-name-display:hover {
  border-bottom: solid 1px #000;
}

.node-name-display--disabled {
  cursor: not-allowed;
  color: #777;
}

.node-name-display--disabled:hover {
  border-bottom: none;
}

.slot-type-icon--disabled {
  opacity: 0.4;
}

.node-name-input {
  font-size: 1.08rem;
  font-weight: 500;
  color: #222;
  border: 1.5px solid #2196f3;
  border-radius: 3px;
  padding: 2px 6px;
  outline: none;
  width: 90%;
  background: #fff;
}
/* New Flexbox-based Slots Layout */
.slots-container {
  margin-bottom: 0.62rem;
}

.slots-list {
  /* max-height: 200px;
  overflow-y: auto; */
  overflow-x: hidden;
  padding-right: 0px;
  box-sizing: border-box;
}

.slot-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #f0f0f0;
  height: 26px;
  font-size: 1rem;
}
.slot-row-container {
  border: solid 1px transparent;
}

.slot-row:hover {
  background: #fafafa;
}

.slot-cell {
  display: flex;
  align-items: center;
  padding: 2px 3px;
  box-sizing: border-box;
  min-height: 25px;
}

/* Column-specific styles */
.checkbox-header, .checkbox-cell {
  width: 20px;
  min-width: 20px;
  max-width: 20px;
  justify-content: center;
}

.type-header, .type-cell {
  width: 20px;
  min-width: 20px;
  max-width: 20px;
  justify-content: center;
}

.bg-noise-header, .bg-noise-cell {
  flex: 1;
  min-width: 0;
}


.last-op-header, .last-op-cell {
  width: 80px;
  min-width: 80px;
  max-width: 80px;
  justify-content: right;
  padding-right: 10px;
}


.last-op-header {
  padding-right: 15px;
}

 
.type-icon {
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  width: 1.23rem;
  height: 1.23rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
 

 
.bg-noise-select {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  font-size: 1rem;
  padding: 0.15rem 0.25rem;
  box-sizing: border-box;
  border: 1px solid #ccc;
  border-radius: 3px;
}

 
 
 

/* Slot controls container */
.slot-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Options dropdown container */
 

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

 

 

/* Add N Slots Form */
.add-n-slots-form {
  margin-top: 12px;
  padding: 12px;
  background: #f9f9f9;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
}

.add-slots-template {
  margin: 8px 0;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  background: white;
}

.add-slots-header {
  display: flex;
  align-items: center;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
  font-size: 0.85rem;
  font-weight: 600;
  color: #666;
  height: 28px;
}

.add-slots-row {
  display: flex;
  align-items: center;
  height: 32px;
  font-size: 0.9rem;
}

.form-header {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
  text-align: center;
}

.form-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  gap: 8px;
}

.form-row label {
  font-size: 13px;
  color: #555;
  font-weight: 500;
  min-width: fit-content;
}

.number-input {
  width: 60px;
  padding: 4px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
  text-align: center;
}



.form-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}

 

.cancel-btn {
  background: #f5f5f5;
  border: 1px solid #ddd;
  color: #666;
}

.cancel-btn:hover {
  background: #eeeeee;
  border-color: #ccc;
}


/* Batch Edit Styles */
.slot-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.batch-edit-form {
  margin-top: 12px;
  padding: 12px 0px;
  border-top: 1px solid #00000040;
}

.batch-edit-template {
  margin: 8px 0;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  background: white;
}

.batch-edit-header {
  display: flex;
  align-items: center;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
  font-size: 0.85rem;
  font-weight: 600;
  color: #666;
  height: 28px;
}

.batch-edit-row {
  display: flex;
  align-items: center;
  height: 32px;
  font-size: 0.9rem;
}

.changed-property {
}

.changed-summary {
  margin: 8px 0;
  padding: 6px 8px;
  background: #e3f2fd;
  border: 1px solid #90caf9;
  border-radius: 4px;
  font-size: 12px;
  color: #1565c0;
}

 

.expanded-slot{
  border-radius: 4px 4px 0px 0px;
  margin: 0px 0px 10px;
  border: solid 1px #4345ac30;
}

.expanded-slot .slot-row {
  background: #f1f2fe;
  margin-bottom: 0px;
  border-bottom: none;
}

.slot-row-expanded {
  padding: 10px;
  position: relative;
}
  
.bg-noise-param-rows{
  display: flex;
  flex-direction: column;
}
.bg-noise-param-row{
  padding: 3px 3px;
  display: flex;
  flex-direction: row;
  flex: 1;
}
.bg-noise-param-row input{
      margin-left: 5px;
    width: 70px;
    padding: 0 5px;
    text-align: right;
}

</style>

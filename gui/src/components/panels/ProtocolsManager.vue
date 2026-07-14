<template>
<div>
    <div v-if="!computedProtocols.length" class="empty-list">No protocols</div>
    <div v-else style="">
        <ProtocolEditor 
        v-for="protocol in computedProtocols" 
        :key="protocol.id" 
        :protocol="protocol" 
        :isSelected="selectedProtocol?.id === protocol.id" 
        @select="handleSelect" 
        @delete="deleteProtocol"
        :category="protocolGroupName"
        :contextInfo="contextInfo"
        :editingLocked="editingLocked"
        :variables="props.variables"
        />
    </div>
    <div class="action-buttons" style="margin-top: 10px;">
        <button @click="toggleAddProtocolMenu" class="noborder add-protocol-btn">
          <Plus :size="14" aria-hidden="true" />
          Add Protocol
        </button>
        <Menu ref="addProtocolMenu" id="overlay_menu" :model="items" :popup="true" />
    </div>
</div>
</template>



<script setup>

import { computed, ref } from 'vue'
import ProtocolEditor from './ProtocolEditor.vue'
import Menu from 'primevue/menu';
import { api } from '../../utils/ApiConnector'
import { getCurrentInstance } from 'vue'
import { generateUUid } from '../../utils/Utils'
import { createProtocolFromDefinition } from '../../utils/protocolConstructors'
import { Plus } from '@lucide/vue'
import { SIMULATION_EDITING_LOCK_MESSAGE, useUiServices } from '../../composables/uiServices'
const { proxy } = getCurrentInstance()
const { showAlert } = useUiServices()

const props = defineProps({
  protocols: {
    type: Array,
    required: true
  },
  protocolGroupName: {
    type: String,
    required: true
  }, 
  protocolClass: {
    type: Function,
    required: true
  },
  contextInfo: {
    type: Object,
    required: false,
    default: () => ({})
  },
  editingLocked: {
    type: Boolean,
    default: false
  },
  variables: {
    type: Array,
    default: () => []
  },
  isVirtualEdge: {
    type: Boolean,
    required: false,
    default: false
  }
})

const protocolTypes = computed(() => api.config.value.protocolTypes?.[props.protocolGroupName] || [])
const addProtocolMenu = ref(null)
const selectedProtocol = ref(null)

// Computed property for menu items that filters based on virtual edge status
const items = computed(() => {
  if (!protocolTypes.value || !protocolTypes.value.length) {
    return []
  }
  
  let filteredTypes = protocolTypes.value
  
  // If this is a virtual edge, only show protocols with virtual: true
  if (props.isVirtualEdge) {
    filteredTypes = protocolTypes.value.filter(type => type.virtual === true)
  }
  
  return filteredTypes.map(type => ({
    label: getProtocolTypeSimpleName(type.type),
    value: type.type, 
    command: () => {
      handleAddProtocol(type.type)
    }
  }))
})


function deleteProtocol( protocol ){
  // Prevent deleting protocols if simulation has run
  if (props.editingLocked) {
    showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
    return
  }

  const protocolIndex = props.protocols.findIndex(p => p.id === protocol.id);
  if( protocolIndex !== -1 ){
    props.protocols.splice(protocolIndex, 1)
  }
  forceRerender();
}


function forceRerender() {
  proxy.$forceUpdate()
}

const computedProtocols = computed(() => {
    if( !props.protocols || !props.protocols ) return []
  return props.protocols.map(protocol => ({
    ...protocol,
    data: protocol.data || {}
  }))
})

function getProtocolTypeSimpleName( protocolType ){
  const simpleName = protocolType.split(".").pop();
  return simpleName;
}

function toggleAddProtocolMenu(event) {
  // Prevent adding protocols if simulation has run
  if (props.editingLocked) {
    showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
    return
  }
  addProtocolMenu.value.toggle(event)
}

function handleSelect(protocol) {
  if(selectedProtocol.value?.id === protocol.id) {
    selectedProtocol.value = null
  } else {
    selectedProtocol.value = protocol
  }
}

function handleAddProtocol( protocolTypeId) {
  // Prevent adding protocols if simulation has run
  if (props.editingLocked) {
    showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
    return
  }

  if( !protocolTypeId ){
    showAlert('Protocol required', 'Select a protocol type before adding it.')
    return;
  }
  const protocolId = generateUUid('protocol')

  const protocolTypeDefinitions = api.config.value.protocolTypes?.[props.protocolGroupName] || [];
  const defaultType = protocolTypeDefinitions.find(type => type.type === protocolTypeId);
  if (!defaultType) {
    showAlert('Protocol unavailable', 'The selected protocol is not available in the runtime metadata.')
    return
  }
  const protocolConstructor = createProtocolFromDefinition(defaultType)
  const newProtocol = new props.protocolClass({
    id: protocolId,
    ...protocolConstructor
  })
   props.protocols.push(newProtocol);
   forceRerender();
   handleSelect(newProtocol);
}


const emit = defineEmits(['select'])

defineExpose({
  handleSelect
})
</script>

<style scoped>
.add-protocol-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>

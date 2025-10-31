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
        :simulationState="props.simulationState"
        />
    </div>
    <div class="action-buttons" style="margin-top: 10px;">
        <button @click="toggleAddProtocolMenu" class="noborder add-protocol-btn"> + Add Protocol</button>
        <Menu ref="addProtocolMenu" id="overlay_menu" :model="items" :popup="true" />
    </div>
</div>
</template>



<script setup>

import { defineProps, defineEmits, onMounted, computed, ref } from 'vue'
import ProtocolEditor from './ProtocolEditor.vue'
import Menu from 'primevue/menu';
import { api } from '../../utils/ApiConnector'
import { getCurrentInstance } from 'vue'
import { generateUUid } from '../../utils/Utils'
const { proxy } = getCurrentInstance()

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
  simulationState: {
    type: Object,
    required: false,
    default: () => ({})
  }
})

const protocolTypes = ref( [] )
const addProtocolMenu = ref(null)
const selectedProtocol = ref(null)
const items = ref( [] );


function deleteProtocol( protocol ){
  // Prevent deleting protocols if simulation has run
  if (props.simulationState?.hasSimulationRun) {
    alert('Cannot delete protocols after simulation has started.\n\nPlease click the Reset button (or Stop button) to clear the simulation state and enable editing again.')
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

function toggleAddProtocolMenu() {
  // Prevent adding protocols if simulation has run
  if (props.simulationState?.hasSimulationRun) {
    alert('Cannot add protocols after simulation has started.\n\nPlease click the Reset button (or Stop button) to clear the simulation state and enable editing again.')
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
  if (props.simulationState?.hasSimulationRun) {
    alert('Cannot add protocols after simulation has started.\n\nPlease click the Reset button (or Stop button) to clear the simulation state and enable editing again.')
    return
  }

  if( !protocolTypeId ){
    alert('No protocol type selected')
    return;
  }
  const protocolId = generateUUid('protocol')

  const protocolTypeDefinitions = api.config.value.protocolTypes[props.protocolGroupName];
  const defaultType = protocolTypeDefinitions.find(type => type.type === protocolTypeId);
  const newProtocol = new props.protocolClass({
    id: protocolId,
    type: defaultType.type,
    parameters: defaultType.parameters.map(param => ({
      name: param.field,
      type: param.type,
      value: param.defaultValue
    }))
  })
   props.protocols.push(newProtocol);
   forceRerender();
   handleSelect(newProtocol);
}


onMounted(() => {
  protocolTypes.value = api.config.value.protocolTypes?.[props.protocolGroupName];
  items.value = protocolTypes.value.map(type => ({
    label: getProtocolTypeSimpleName(type.type),
    value: type.type, 
    command: ()=>{
      handleAddProtocol(type.type)
    }
  }));
})

const emit = defineEmits(['select'])

defineExpose({
  handleSelect
})
</script>

<style scoped>
</style>
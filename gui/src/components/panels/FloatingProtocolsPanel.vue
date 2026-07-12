<template>
  <BasePanel 
    panel_id="floating_protocols" 
    title="Floating Protocols" 
    :collapsable="true"
    :collapsed="collapsed"
    @update:collapsed="emit('update:collapsed', $event)"
  >
    <template #content>
      <ProtocolsManager 
        ref="protocolsManager"
        :protocols="protocols" 
        protocolGroupName="floating" 
        :protocolClass="FloatingProtocol"
        :simulationState="props.simulationState"
        :variables="props.variables"
      />
    </template>
  </BasePanel>
</template>



<script setup>
import { onMounted, computed, ref } from 'vue'
import BasePanel from './BasePanel.vue'
import ProtocolsManager from './ProtocolsManager.vue'
import FloatingProtocol from '../../models/FloatingProtocol'

const props = defineProps({
  protocols: {
    type: Array,
    required: true
  },
  simulationState: {
    type: Object,
    required: false,
    default: () => ({})
  },
  variables: {
    type: Array,
    default: () => []
  },
  collapsed: {
    type: Boolean,
    default: false
  }
})

const protocolsManager = ref(null)

function handleSelect(protocol) {
  protocolsManager.value.handleSelect(protocol)
}

const emit = defineEmits(['select', 'handleAddProtocolClick', 'update:collapsed'])

defineExpose({
  handleSelect
})

</script>


<style scoped>
.empty-list {
  color: #aaa;
  font-size: 0.98rem;
  padding: 10px 18px;
  text-align: center;
}
</style>

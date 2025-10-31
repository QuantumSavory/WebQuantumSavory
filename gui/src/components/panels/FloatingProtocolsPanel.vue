<template>
  <BasePanel 
    panel_id="floating_protocols" 
    title="Floating Protocols" 
    :collapsable="true"
    @collapsed-changed="$emit('collapsed-changed', $event)"
  >
    <template #content>
      <ProtocolsManager 
        ref="protocolsManager"
        :protocols="protocols" 
        protocolGroupName="floating" 
        :protocolClass="FloatingProtocol"
        :simulationState="props.simulationState"
      />
    </template>
  </BasePanel>
</template>



<script setup>
import { defineProps, defineEmits, onMounted, computed, ref } from 'vue'
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
  }
})

const protocolsManager = ref(null)

function handleSelect(protocol) {
  protocolsManager.value.handleSelect(protocol)
}

const emit = defineEmits(['select', 'handleAddProtocolClick', 'collapsed-changed'])

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
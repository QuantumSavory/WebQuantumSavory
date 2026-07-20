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
        :editingLocked="editingLocked"
        :variables="props.variables"
        :numeric-expression-context="numericExpressionContext"
        @design-operations="(...args) => emit('designOperations', ...args)"
      />
    </template>
  </BasePanel>
</template>



<script setup>
import { computed, ref } from 'vue'
import BasePanel from './BasePanel.vue'
import ProtocolsManager from './ProtocolsManager.vue'
import FloatingProtocol from '../../models/FloatingProtocol'
import { buildNumericExpressionContext } from '../../utils/numericExpressionContext.js'

const props = defineProps({
  protocols: {
    type: Array,
    required: true
  },
  editingLocked: {
    type: Boolean,
    default: false
  },
  variables: {
    type: Array,
    default: () => []
  },
  collapsed: {
    type: Boolean,
    default: false
  },
  projectData: {
    type: Object,
    required: true
  }
})

const numericExpressionContext = computed(() => (
  buildNumericExpressionContext(props.projectData, 'floating')
))

const protocolsManager = ref(null)

function handleSelect(protocol) {
  protocolsManager.value.handleSelect(protocol)
}

const emit = defineEmits([
  'select',
  'handleAddProtocolClick',
  'update:collapsed',
  'designOperations',
])

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

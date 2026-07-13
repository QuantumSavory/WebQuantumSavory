<template>
  <AppDialog
    :show="show"
    title="Repeater Chain Generator"
    width="min(520px, calc(100vw - 32px))"
    class="layout-generator-dialog"
    dismissable-mask
    @close="handleCancel"
  >
    <form id="repeater-chain-form" @submit.prevent="handleConfirm">
      <p class="dialog-description">
      Replace one template repeater and its edge with an evenly spaced chain.
      </p>

    <div class="form-grid">
        <label for="chain-start-node">Start node</label>
        <select id="chain-start-node" v-model="form.startNodeId" autofocus>
          <option value="" disabled>Select a node</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>

        <label for="chain-end-node">End node</label>
        <select id="chain-end-node" v-model="form.endNodeId">
          <option value="" disabled>Select a node</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>

        <label for="chain-template-node">Repeater node</label>
        <select id="chain-template-node" v-model="form.templateNodeId">
          <option value="" disabled>Select a template node</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>

        <label for="chain-template-edge">Repeater edge</label>
        <select
          id="chain-template-edge"
          v-model="form.templateEdgeId"
          :disabled="!form.templateNodeId || incidentEdges.length === 0"
        >
          <option value="" disabled>
            {{ form.templateNodeId ? 'Select a template edge' : 'Select a repeater node first' }}
          </option>
          <option v-for="edge in incidentEdges" :key="edge.id" :value="edge.id">
            {{ edgeLabel(edge) }}
          </option>
        </select>

        <label for="chain-repeater-count">Number of repeaters</label>
        <input
          id="chain-repeater-count"
          v-model.number="form.repeaterCount"
          type="number"
          min="1"
          max="100"
          step="1"
        >

        <label for="chain-create-virtual-edge">End-to-end virtual edge</label>
        <label class="checkbox-field" for="chain-create-virtual-edge">
          <input
            id="chain-create-virtual-edge"
            v-model="form.createVirtualEdge"
            type="checkbox"
          >
          Connect the start and end nodes directly
        </label>
    </div>

    <p class="template-note">
      The repeater node must have exactly one incident edge: the selected template edge.
    </p>
    <div v-if="validationMessage" class="validation-error" role="alert">
      {{ validationMessage }}
    </div>
    </form>

    <template #footer>
        <AppButton @click="handleCancel">Cancel</AppButton>
        <AppButton
          variant="primary"
          type="submit"
          form="repeater-chain-form"
          :disabled="!validation.valid"
        >
          Generate Chain
        </AppButton>
    </template>
  </AppDialog>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { validateRepeaterChain } from '../utils/repeaterChain.js'
import AppButton from './ui/AppButton.vue'
import AppDialog from './ui/AppDialog.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] }
})

const emit = defineEmits(['confirm', 'cancel'])

const form = reactive({
  startNodeId: '',
  endNodeId: '',
  templateNodeId: '',
  templateEdgeId: '',
  repeaterCount: 1,
  createVirtualEdge: true
})

const net = computed(() => ({ nodes: props.nodes, edges: props.edges }))

const incidentEdges = computed(() => {
  if (!form.templateNodeId) return []
  return props.edges.filter(edge =>
    edge.source?.id === form.templateNodeId || edge.target?.id === form.templateNodeId
  )
})

const validation = computed(() => validateRepeaterChain(net.value, {
  startNodeId: form.startNodeId,
  endNodeId: form.endNodeId,
  templateNodeId: form.templateNodeId,
  templateEdgeId: form.templateEdgeId,
  repeaterCount: form.repeaterCount
}))

const validationMessage = computed(() => {
  const hasStarted = form.startNodeId || form.endNodeId || form.templateNodeId || form.templateEdgeId
  return hasStarted && !validation.value.valid ? validation.value.error : ''
})

watch(() => form.templateNodeId, () => {
  if (!incidentEdges.value.some(edge => edge.id === form.templateEdgeId)) {
    form.templateEdgeId = ''
  }
})

watch(() => props.show, isShown => {
  if (isShown) {
    resetForm()
  }
})

function resetForm() {
  form.startNodeId = ''
  form.endNodeId = ''
  form.templateNodeId = ''
  form.templateEdgeId = ''
  form.repeaterCount = 1
  form.createVirtualEdge = true
}

function edgeLabel(edge) {
  return `${edge.source?.name || edge.source?.id || edge.source} to ${edge.target?.name || edge.target?.id || edge.target}`
}

function handleConfirm() {
  if (!validation.value.valid) return
  emit('confirm', {
    startNodeId: form.startNodeId,
    endNodeId: form.endNodeId,
    templateNodeId: form.templateNodeId,
    templateEdgeId: form.templateEdgeId,
    repeaterCount: form.repeaterCount,
    createVirtualEdge: form.createVirtualEdge
  })
}

function handleCancel() {
  emit('cancel')
}

</script>

<style scoped>
.checkbox-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 400 !important;
}

.checkbox-field input {
  width: auto;
  margin: 0;
}

</style>

<template>
  <div
    v-if="show"
    class="modal-overlay repeater-chain-overlay"
    @click.self="handleCancel"
  >
    <div
      class="modal-dialog repeater-chain-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="repeater-chain-title"
    >
      <h3 id="repeater-chain-title">Repeater Chain Generator</h3>
      <p class="dialog-description">
        Replace one template repeater and its edge with an evenly spaced chain.
      </p>

      <div class="form-grid">
        <label for="chain-start-node">Start node</label>
        <select id="chain-start-node" v-model="form.startNodeId" ref="firstInput">
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
      </div>

      <p class="template-note">
        The repeater node must have exactly one incident edge: the selected template edge.
      </p>
      <div v-if="validationMessage" class="validation-error" role="alert">
        {{ validationMessage }}
      </div>

      <div class="modal-actions">
        <button type="button" @click="handleCancel">Cancel</button>
        <button
          type="button"
          class="primary"
          :disabled="!validation.valid"
          @click="handleConfirm"
        >
          Generate Chain
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch, onUnmounted } from 'vue'
import { validateRepeaterChain } from '../utils/repeaterChain.js'

const props = defineProps({
  show: { type: Boolean, default: false },
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] }
})

const emit = defineEmits(['confirm', 'cancel'])

const firstInput = ref(null)
const form = reactive({
  startNodeId: '',
  endNodeId: '',
  templateNodeId: '',
  templateEdgeId: '',
  repeaterCount: 1
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

watch(() => props.show, async isShown => {
  if (isShown) {
    resetForm()
    document.addEventListener('keydown', handleGlobalKeydown)
    await nextTick()
    firstInput.value?.focus()
  } else {
    document.removeEventListener('keydown', handleGlobalKeydown)
  }
})

function resetForm() {
  form.startNodeId = ''
  form.endNodeId = ''
  form.templateNodeId = ''
  form.templateEdgeId = ''
  form.repeaterCount = 1
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
    repeaterCount: form.repeaterCount
  })
}

function handleCancel() {
  emit('cancel')
}

function handleGlobalKeydown(event) {
  if (event.key === 'Escape' && props.show) {
    handleCancel()
  } else if (event.key === 'Enter' && props.show && validation.value.valid) {
    handleConfirm()
  }
}

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.24);
}

.modal-dialog {
  width: min(520px, calc(100vw - 32px));
  padding: 24px 22px 18px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 4px 22px rgba(0, 0, 0, 0.2);
}

h3 {
  margin: 0 0 8px;
  font-size: 1.15rem;
}

.dialog-description,
.template-note {
  color: #555;
  line-height: 1.4;
}

.dialog-description {
  margin: 0 0 18px;
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(135px, auto) minmax(220px, 1fr);
  gap: 11px 14px;
  align-items: center;
}

.form-grid label {
  font-weight: 600;
  color: #333;
}

.form-grid select,
.form-grid input {
  width: 100%;
  min-width: 0;
}

.template-note {
  margin: 14px 0 0;
  font-size: 0.86rem;
}

.validation-error {
  margin-top: 7px;
  color: #b42318;
  font-size: 0.9rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

@media (max-width: 560px) {
  .form-grid {
    grid-template-columns: 1fr;
    gap: 5px;
  }

  .form-grid select,
  .form-grid input {
    margin-bottom: 7px;
  }
}
</style>

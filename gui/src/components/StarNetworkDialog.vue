<template>
  <div v-if="show" class="modal-overlay" @click.self="handleCancel">
    <div
      class="modal-dialog layout-helper-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="star-network-title"
    >
      <h3 id="star-network-title">Star Network Generator</h3>
      <p class="dialog-description">
        Replace one peripheral template with evenly spaced copies around a center node.
      </p>

      <div class="form-grid">
        <label for="star-center-node">Center node</label>
        <select id="star-center-node" ref="firstInput" v-model="form.centerNodeId">
          <option value="" disabled>Select a center node</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>

        <label for="star-peripheral-node">Peripheral template</label>
        <select id="star-peripheral-node" v-model="form.peripheralNodeId">
          <option value="" disabled>Select a peripheral node</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>

        <label for="star-template-edge">Edge template</label>
        <select
          id="star-template-edge"
          v-model="form.templateEdgeId"
          :disabled="!form.centerNodeId || !form.peripheralNodeId || candidateEdges.length === 0"
        >
          <option value="" disabled>
            {{ form.centerNodeId && form.peripheralNodeId
              ? 'Select an edge template'
              : 'Select both nodes first' }}
          </option>
          <option v-for="edge in candidateEdges" :key="edge.id" :value="edge.id">
            {{ edgeLabel(edge) }}
          </option>
        </select>

        <label for="star-peripheral-count">Number of peripheral nodes</label>
        <input
          id="star-peripheral-count"
          v-model.number="form.peripheralCount"
          type="number"
          min="1"
          max="12"
          step="1"
        >
      </div>

      <p class="template-note">
        The peripheral template and its edge are removed. The first generated node keeps the
        template position; the remaining nodes rotate counterclockwise around the center.
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
          Generate Star
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
import { endpointId } from '../utils/layoutTemplates'
import { validateStarNetwork } from '../utils/starNetwork'

const props = defineProps({
  show: { type: Boolean, default: false },
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] }
})

const emit = defineEmits(['confirm', 'cancel'])
const firstInput = ref(null)
const form = reactive({
  centerNodeId: '',
  peripheralNodeId: '',
  templateEdgeId: '',
  peripheralCount: 4
})

const net = computed(() => ({ nodes: props.nodes, edges: props.edges }))
const candidateEdges = computed(() => {
  if (!form.centerNodeId || !form.peripheralNodeId) return []
  return props.edges.filter(edge => {
    const endpoints = new Set([endpointId(edge.source), endpointId(edge.target)])
    return endpoints.has(form.centerNodeId) && endpoints.has(form.peripheralNodeId)
  })
})
const validation = computed(() => validateStarNetwork(net.value, { ...form }))
const validationMessage = computed(() => {
  const started = form.centerNodeId || form.peripheralNodeId || form.templateEdgeId
  return started && !validation.value.valid ? validation.value.error : ''
})

watch(
  () => [form.centerNodeId, form.peripheralNodeId],
  () => {
    if (!candidateEdges.value.some(edge => edge.id === form.templateEdgeId)) {
      form.templateEdgeId = ''
    }
  }
)

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
  form.centerNodeId = ''
  form.peripheralNodeId = ''
  form.templateEdgeId = ''
  form.peripheralCount = 4
}

function edgeLabel(edge) {
  return `${edge.source?.name || endpointId(edge.source)} to ${edge.target?.name || endpointId(edge.target)}`
}

function handleConfirm() {
  if (!validation.value.valid) return
  emit('confirm', { ...form })
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

onUnmounted(() => document.removeEventListener('keydown', handleGlobalKeydown))
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

.layout-helper-dialog {
  width: min(540px, calc(100vw - 32px));
  padding: 24px 22px 18px;
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
  grid-template-columns: minmax(150px, auto) minmax(220px, 1fr);
  gap: 11px 14px;
  align-items: center;
}

.form-grid label {
  color: #333;
  font-weight: 600;
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

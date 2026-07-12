<template>
  <div v-if="show" class="modal-overlay" @click.self="handleCancel">
    <div
      class="modal-dialog layout-helper-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="graph-network-title"
    >
      <h3 id="graph-network-title">Graph Network Generator</h3>
      <p class="dialog-description">
        Replace an isolated template edge and its endpoints with a grid or all-to-all network.
      </p>

      <div class="form-grid">
        <label for="graph-template-node">Node template</label>
        <select id="graph-template-node" ref="firstInput" v-model="form.templateNodeId">
          <option value="" disabled>Select a node template</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>

        <label for="graph-template-edge">Edge template</label>
        <select
          id="graph-template-edge"
          v-model="form.templateEdgeId"
          :disabled="!form.templateNodeId || incidentEdges.length === 0"
        >
          <option value="" disabled>
            {{ form.templateNodeId ? 'Select an edge template' : 'Select a node first' }}
          </option>
          <option v-for="edge in incidentEdges" :key="edge.id" :value="edge.id">
            {{ edgeLabel(edge) }}
          </option>
        </select>

        <label for="graph-topology">Graph type</label>
        <select id="graph-topology" v-model="form.topology">
          <option :value="GRAPH_TOPOLOGIES.GRID">2D grid</option>
          <option :value="GRAPH_TOPOLOGIES.ALL_TO_ALL">All-to-all</option>
        </select>

        <template v-if="form.topology === GRAPH_TOPOLOGIES.GRID">
          <label for="graph-grid-x-count">Nodes along x</label>
          <input
            id="graph-grid-x-count"
            v-model.number="form.xCount"
            type="number"
            min="1"
            max="6"
            step="1"
          >

          <label for="graph-grid-y-count">Nodes along y</label>
          <input
            id="graph-grid-y-count"
            v-model.number="form.yCount"
            type="number"
            min="1"
            max="6"
            step="1"
          >
        </template>

        <template v-else>
          <label for="graph-complete-node-count">Number of nodes</label>
          <input
            id="graph-complete-node-count"
            v-model.number="form.nodeCount"
            type="number"
            min="2"
            max="12"
            step="1"
          >
        </template>
      </div>

      <p class="template-note">
        Both edge endpoints and the selected edge are removed. Every generated node copies the
        selected node's configuration, while the edge endpoints define the first two positions.
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
          Generate Graph
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
import {
  GRAPH_TOPOLOGIES,
  validateGraphNetwork
} from '../utils/graphNetwork'
import { edgeHasNode, endpointId } from '../utils/layoutTemplates'

const props = defineProps({
  show: { type: Boolean, default: false },
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] }
})

const emit = defineEmits(['confirm', 'cancel'])
const firstInput = ref(null)
const form = reactive({
  templateNodeId: '',
  templateEdgeId: '',
  topology: GRAPH_TOPOLOGIES.GRID,
  xCount: 3,
  yCount: 2,
  nodeCount: 4
})

const net = computed(() => ({ nodes: props.nodes, edges: props.edges }))
const incidentEdges = computed(() => {
  if (!form.templateNodeId) return []
  return props.edges.filter(edge => edgeHasNode(edge, form.templateNodeId))
})
const validation = computed(() => validateGraphNetwork(net.value, { ...form }))
const validationMessage = computed(() => {
  const started = form.templateNodeId || form.templateEdgeId
  return started && !validation.value.valid ? validation.value.error : ''
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
  form.templateNodeId = ''
  form.templateEdgeId = ''
  form.topology = GRAPH_TOPOLOGIES.GRID
  form.xCount = 3
  form.yCount = 2
  form.nodeCount = 4
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
  width: min(560px, calc(100vw - 32px));
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
  grid-template-columns: minmax(145px, auto) minmax(220px, 1fr);
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

<template>
  <div class="physical-edge-controls">
    <QuantityField
      v-for="parameter in edgeParameters"
      :key="parameter.id"
      :field-id="parameter.controlId"
      :parameter="parameter"
      :value="displayValue(parameter)"
      :disabled="editingLocked"
      :unavailable="isDormant(parameter)"
      :resettable="!isDormant(parameter) && hasOverride(parameter)"
      :reset-title="resetTitle(parameter)"
      :reset-label="`Reset ${parameter.label.toLowerCase()} to automatic`"
      @update:value="setOverride(parameter, $event)"
      @reset="resetOverride(parameter)"
    />

    <p v-if="resolved.manualDelay" class="quantity-mode-help">
      Manual delay replaces the calculated propagation delay. Distance and refractive-index
      overrides remain saved and return to the controls when delay is reset.
    </p>
    <p v-if="resolved.manualTransmissivity" class="quantity-mode-help">
      Manual transmissivity replaces the calculated fiber transmission. The dormant global or
      per-edge loss remains saved and returns to the controls when transmissivity is reset.
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

import QuantityField from '../ui/QuantityField.vue'
import { resolveEdgePhysicalProperties } from '../../utils/edgeGeometry'
import {
  EDGE_PHYSICAL_PARAMETER_DESCRIPTORS,
  emptyPhysicalOverrides,
  formatPhysicalInputValue,
} from '../../utils/physicalParameters.js'

const props = defineProps({
  edge: { type: Object, required: true },
  physicalConfig: { type: Object, required: true },
  editingLocked: { type: Boolean, default: false },
})
const emit = defineEmits(['designOperations'])

const edgeParameters = EDGE_PHYSICAL_PARAMETER_DESCRIPTORS
const resolved = computed(() => resolveEdgePhysicalProperties(
  props.edge,
  props.physicalConfig,
))

function currentOverrides() {
  return {
    ...emptyPhysicalOverrides(),
    ...(props.edge.data.physicalOverrides || {}),
  }
}

function commitOverrides(physicalOverrides) {
  emit('designOperations', [{
    kind: 'topology.update_edge',
    edge_id: props.edge.id,
    value: { data: { physicalOverrides } },
  }])
}

function hasOverride(parameter) {
  return props.edge.data.physicalOverrides?.[parameter.overrideField] != null
}

function isDormant(parameter) {
  return parameter.dormantWhen ? resolved.value[parameter.dormantWhen] === true : false
}

function displayValue(parameter) {
  const override = props.edge.data.physicalOverrides?.[parameter.overrideField]
  return override ?? formatPhysicalInputValue(resolved.value[parameter.resolvedField])
}

function setOverride(parameter, value) {
  const overrides = currentOverrides()
  overrides[parameter.overrideField] = value
  commitOverrides(overrides)
}

function resetOverride(parameter) {
  const overrides = currentOverrides()
  overrides[parameter.overrideField] = null
  commitOverrides(Object.values(overrides).every(value => value == null) ? null : overrides)
}

function resetTitle(parameter) {
  return `Reset ${parameter.label.toLowerCase()} to ${parameter.automaticDescription}`
}
</script>

<style scoped>
.physical-edge-controls {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.quantity-mode-help {
  margin: 1px 0 0;
  color: var(--app-color-text-muted);
  font-size: 0.74rem;
  line-height: 1.35;
}
</style>

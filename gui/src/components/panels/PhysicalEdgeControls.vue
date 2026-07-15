<template>
  <div class="physical-edge-controls">
    <div class="physical-row">
      <label for="edge-distance-meters">Distance</label>
      <template v-if="resolved.manualDelay">
        <span id="edge-distance-meters" class="na-value">n/a</span>
      </template>
      <template v-else>
        <input
          id="edge-distance-meters"
          type="number"
          min="0"
          step="any"
          :value="resolved.distanceMeters"
          :disabled="editingLocked"
          @change="setOverride('distanceMeters', $event, resolved.distanceMeters)"
        >
        <span class="unit">m</span>
        <button
          v-if="hasOverride('distanceMeters')"
          type="button"
          class="reset-button"
          :disabled="editingLocked"
          title="Reset distance to the route-derived value"
          aria-label="Reset distance to automatic"
          @click="resetOverride('distanceMeters')"
        >
          <RotateCcw :size="14" aria-hidden="true" />
        </button>
      </template>
    </div>

    <div class="physical-row">
      <label for="edge-refractive-index">Refractive index</label>
      <template v-if="resolved.manualDelay">
        <span id="edge-refractive-index" class="na-value">n/a</span>
      </template>
      <template v-else>
        <input
          id="edge-refractive-index"
          type="number"
          min="0"
          step="any"
          :value="resolved.refractiveIndex"
          :disabled="editingLocked"
          @change="setOverride('refractiveIndex', $event, resolved.refractiveIndex, true)"
        >
        <button
          v-if="hasOverride('refractiveIndex')"
          type="button"
          class="reset-button"
          :disabled="editingLocked"
          title="Reset to the project refractive index"
          aria-label="Reset refractive index to automatic"
          @click="resetOverride('refractiveIndex')"
        >
          <RotateCcw :size="14" aria-hidden="true" />
        </button>
      </template>
    </div>

    <div class="physical-row">
      <label for="edge-delay-seconds">Propagation delay</label>
      <input
        id="edge-delay-seconds"
        type="number"
        min="0"
        step="any"
        :value="resolved.propagationDelaySeconds"
        :disabled="editingLocked"
        @change="setOverride('delaySeconds', $event, resolved.propagationDelaySeconds)"
      >
      <span class="unit">s</span>
      <button
        v-if="hasOverride('delaySeconds')"
        type="button"
        class="reset-button"
        :disabled="editingLocked"
        title="Reset delay to automatic propagation"
        aria-label="Reset propagation delay to automatic"
        @click="resetOverride('delaySeconds')"
      >
        <RotateCcw :size="14" aria-hidden="true" />
      </button>
    </div>

    <p v-if="resolved.manualDelay" class="manual-delay-help">
      Manual delay overrides distance and refractive index. Their saved overrides will return when delay is reset.
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { RotateCcw } from '@lucide/vue'

import { resolveEdgePhysicalProperties } from '../../utils/edgeGeometry'

const props = defineProps({
  edge: { type: Object, required: true },
  physicalConfig: { type: Object, required: true },
  editingLocked: { type: Boolean, default: false },
})

const resolved = computed(() => resolveEdgePhysicalProperties(
  props.edge,
  props.physicalConfig,
))

function ensureOverrides() {
  props.edge.data.physicalOverrides ??= {
    distanceMeters: null,
    refractiveIndex: null,
    delaySeconds: null,
  }
  return props.edge.data.physicalOverrides
}

function hasOverride(field) {
  return props.edge.data.physicalOverrides?.[field] != null
}

function setOverride(field, event, fallback, positive = false) {
  const value = Number(event.target.value)
  const valid = Number.isFinite(value) && (positive ? value > 0 : value >= 0)
  if (!valid) {
    event.target.value = fallback
    return
  }
  ensureOverrides()[field] = value
}

function resetOverride(field) {
  const overrides = ensureOverrides()
  overrides[field] = null
  if (Object.values(overrides).every(value => value == null)) {
    props.edge.data.physicalOverrides = null
  }
}
</script>

<style scoped>
.physical-edge-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.physical-row {
  display: grid;
  grid-template-columns: minmax(7.5rem, 1fr) minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 5px;
  font-size: 0.78rem;
}

.physical-row label {
  font-weight: 600;
}

.physical-row input {
  width: 100%;
  min-width: 0;
  padding: 4px 6px;
}

.unit,
.na-value {
  color: var(--app-color-text-muted);
}

.reset-button {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-color: transparent;
  background: transparent;
  color: var(--app-color-text-muted);
}

.reset-button:hover:not(:disabled) {
  background: var(--app-color-surface-hover);
}

.manual-delay-help {
  margin: 1px 0 0;
  color: var(--app-color-text-muted);
  font-size: 0.74rem;
  line-height: 1.35;
}
</style>

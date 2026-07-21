<template>
  <div
    class="quantity-field"
    :class="`quantity-field--${variant}`"
    :data-quantity="parameter.id"
    :data-unit="parameter.unit.id"
  >
    <label class="quantity-field__label" :for="fieldId">
      {{ parameter.label }}
    </label>
    <span
      v-if="unavailable"
      :id="fieldId"
      class="quantity-field__unavailable"
    >n/a</span>
    <template v-else>
      <input
        :id="fieldId"
        class="quantity-field__input"
        type="number"
        :min="parameter.minimum"
        :max="parameter.maximum"
        step="any"
        :value="value"
        :disabled="disabled"
        @change="commitValue"
      >
      <span
        class="quantity-field__unit"
        :class="{ 'quantity-field__unit--empty': !parameter.unit.symbol }"
        :title="parameter.unit.label"
      >{{ parameter.unit.symbol }}</span>
      <button
        v-if="resettable"
        type="button"
        class="quantity-field__reset"
        :disabled="disabled"
        :title="resetTitle"
        :aria-label="resetLabel"
        @click="emit('reset')"
      >
        <RotateCcw :size="14" aria-hidden="true" />
      </button>
    </template>
  </div>
</template>

<script setup>
import { RotateCcw } from '@lucide/vue'

import { isValidPhysicalParameterValue } from '../../utils/physicalParameters.js'

const props = defineProps({
  fieldId: { type: String, required: true },
  parameter: { type: Object, required: true },
  value: { type: [Number, String], default: '' },
  variant: {
    type: String,
    default: 'row',
    validator: value => ['row', 'stacked'].includes(value),
  },
  disabled: { type: Boolean, default: false },
  unavailable: { type: Boolean, default: false },
  resettable: { type: Boolean, default: false },
  resetLabel: { type: String, default: 'Reset quantity to automatic' },
  resetTitle: { type: String, default: 'Reset to automatic' },
})

const emit = defineEmits(['update:value', 'reset'])

function commitValue(event) {
  const value = Number(event.target.value)
  if (!isValidPhysicalParameterValue(props.parameter, value)) {
    event.target.value = props.value
    return
  }
  emit('update:value', value)
}
</script>

<style scoped>
.quantity-field {
  display: grid;
  align-items: center;
  gap: var(--app-space-2);
  color: var(--app-color-text);
}

.quantity-field--row {
  grid-template-columns: minmax(7.5rem, 1fr) minmax(0, 1fr) auto auto;
  font-size: 0.78rem;
}

.quantity-field--stacked {
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.quantity-field--stacked .quantity-field__label {
  grid-column: 1 / -1;
}

.quantity-field__label {
  font-size: 0.8rem;
  font-weight: 600;
}

.quantity-field__input {
  width: 100%;
  min-width: 0;
  min-height: 30px;
  padding: 4px 7px;
}

.quantity-field__unit,
.quantity-field__unavailable {
  color: var(--app-color-text-muted);
}

.quantity-field__unit--empty {
  width: 0;
}

.quantity-field__unavailable {
  grid-column: 2 / -1;
}

.quantity-field__reset {
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

.quantity-field__reset:hover:not(:disabled) {
  background: var(--app-color-surface-hover);
}

.quantity-field__input:disabled {
  border-color: var(--app-color-border);
  background: var(--app-color-disabled-surface);
  color: var(--app-color-disabled-text);
  cursor: not-allowed;
}
</style>

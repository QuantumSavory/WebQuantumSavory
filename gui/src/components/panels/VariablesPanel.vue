<template>
  <div class="variables-panel" data-testid="variables-panel">
    <div class="variables-header">
      <p class="variables-description">
        Define values once and link them to protocol parameters.
      </p>
      <button
        type="button"
        class="add-variable-button"
        :disabled="disabled"
        @click="addVariable"
      >
        + Add Variable
      </button>
    </div>

    <div v-if="variables.length === 0" class="empty-variables">
      No variables
    </div>

    <div v-else class="variables-list">
      <div
        v-for="variable in variables"
        :key="variable.id"
        class="variable-row"
        :data-variable-id="variable.id"
      >
        <label class="variable-field variable-name-field">
          <span>Name</span>
          <input
            v-model.trim="variable.name"
            type="text"
            class="variable-name-input"
            :class="{ 'invalid-variable-name': !!variableNameError(variable) }"
            :aria-invalid="!!variableNameError(variable)"
            :aria-describedby="variableNameError(variable) ? `variable-name-error-${variable.id}` : undefined"
            :aria-label="`Variable name for ${variable.id}`"
            :disabled="disabled"
          />
          <small
            v-if="variableNameError(variable)"
            :id="`variable-name-error-${variable.id}`"
            class="variable-error"
            role="alert"
          >
            {{ variableNameError(variable) }}
          </small>
        </label>

        <label class="variable-field variable-type-field">
          <span>Type</span>
          <select
            v-model="variable.type"
            class="variable-type-select"
            :aria-label="`Type for ${variable.name || variable.id}`"
            :disabled="disabled"
            @change="onTypeChanged(variable)"
          >
            <option v-for="type in variableTypes" :key="type" :value="type">
              {{ getTypeOptionLabel(type) }}
            </option>
          </select>
        </label>

        <div class="variable-field variable-value-field">
          <span>Value</span>
          <div class="variable-value-input">
            <TypedValueInput
              :parameter="variable"
              :type="variable.type"
              :disabled="disabled"
              category="node"
              placeholder="value"
              symbolic-initially-open
            />
          </div>
        </div>

        <button
          type="button"
          class="delete-variable-button noborder"
          :disabled="disabled || isReferenced(variable.id)"
          :title="deleteTitle(variable.id)"
          :aria-label="`Delete variable ${variable.name || variable.id}`"
          @click="deleteVariable(variable)"
        >
          <i class="pi pi-trash" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import Variable, { isVariableReferenced } from '../../models/Variable'
import {
  VARIABLE_PARAMETER_TYPES,
  getTypeOptionLabel,
  resetValueForType
} from '../../utils/parameterTypes'
import TypedValueInput from './TypedValueInput.vue'

const props = defineProps({
  variables: {
    type: Array,
    default: () => []
  },
  projectData: {
    type: Object,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const variableTypes = VARIABLE_PARAMETER_TYPES

function nextVariableName() {
  const existingNames = new Set(props.variables.map(variable => variable.name))
  let index = props.variables.length + 1
  let candidate = `variable_${index}`
  while (existingNames.has(candidate)) {
    index += 1
    candidate = `variable_${index}`
  }
  return candidate
}

function addVariable() {
  if (props.disabled) return
  props.variables.push(new Variable({ name: nextVariableName() }))
}

function deleteVariable(variable) {
  if (props.disabled || isReferenced(variable.id)) return
  const index = props.variables.findIndex(candidate => candidate.id === variable.id)
  if (index !== -1) props.variables.splice(index, 1)
}

function onTypeChanged(variable) {
  if (props.disabled) return
  resetValueForType(variable, variable.type)
}

function isReferenced(variableId) {
  return isVariableReferenced(props.projectData, variableId)
}

function deleteTitle(variableId) {
  if (props.disabled) return 'Reset the simulation to edit variables'
  if (isReferenced(variableId)) return 'Unlink this variable from protocol parameters before deleting it'
  return 'Delete variable'
}

function variableNameError(variable) {
  if (!variable.name?.trim()) return 'Name is required'
  const duplicateCount = props.variables.filter(candidate => (
    candidate.name?.trim() === variable.name.trim()
  )).length
  return duplicateCount > 1 ? 'Name must be unique' : ''
}
</script>

<style scoped>
.variables-panel {
  padding: 0 6px 8px;
}

.variables-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}

.variables-description {
  margin: 0;
  color: #666;
  font-size: 0.85rem;
}

.add-variable-button {
  flex: 0 0 auto;
}

.empty-variables {
  padding: 14px;
  color: #999;
  text-align: center;
}

.variables-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.variable-row {
  display: grid;
  grid-template-columns: minmax(130px, 0.8fr) minmax(150px, 0.7fr) minmax(220px, 1.5fr) 32px;
  align-items: start;
  gap: 10px;
  padding: 8px;
  border: 1px solid #e2e2ea;
  border-radius: 5px;
  background: #fafafe;
}

.variable-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  color: #666;
  font-size: 0.75rem;
  font-weight: 600;
}

.variable-field input,
.variable-field select {
  width: 100%;
  min-width: 0;
  font-size: 0.9rem;
  font-weight: 400;
}

.variable-value-input {
  min-height: 25px;
  color: #111;
  font-size: 0.9rem;
  font-weight: 400;
}

.variable-value-input :deep(input),
.variable-value-input :deep(select) {
  width: 100%;
}

.invalid-variable-name {
  border-color: #d33;
}

.variable-error {
  color: #b42318;
  font-weight: 400;
}

.delete-variable-button {
  width: 28px;
  height: 28px;
  margin-top: 17px;
  padding: 0;
  color: #666;
}

.delete-variable-button:not(:disabled):hover {
  color: #b42318;
}

@media (max-width: 850px) {
  .variable-row {
    grid-template-columns: 1fr 1fr 32px;
  }

  .variable-value-field {
    grid-column: 1 / 3;
    grid-row: 2;
  }
}
</style>

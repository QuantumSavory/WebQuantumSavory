<template>
  <div class="protocol-constructor-form">
    <div v-if="filteredParameters.length" class="params-container">
      <div class="param-item" v-for="param in filteredParameters" :key="param.name">
        <div
          class="param-item-row"
          :class="{
            'grayed-parameter': isGrayedParameter(param),
            'columnParamRow': !isVariableAssigned(param) && isCodeType(effectiveParameterType(param)),
            'controlled-parameter': isControlledParameter(param)
          }"
        >
          <div
            v-tooltip.top="{
              value: protocolParameterDefinitionText(param),
              pt: { arrow: { style: { borderTopColor: '#fff' } } }
            }"
            class="param-name"
          >
            {{ param.name }}
            <span v-if="paramUnknownTypes(param).length > 0" class="unknown-type-indicator">
              <TriangleAlert :size="13" aria-hidden="true" />
            </span>
            <template v-if="parameterTypeChoices(param)">
              <br/>
              <select
                v-model="param.selectedType"
                class="complexTypeSelector"
                :disabled="parameterDisabled(param) || isVariableAssigned(param)"
                :aria-label="`Type for ${param.name}`"
                :aria-describedby="controlledDescriptionId(param)"
                @change="onSelectedTypeChanged(param)"
              >
                <option
                  v-for="type in parameterTypeChoices(param)"
                  :key="type"
                  :value="type"
                  :disabled="!parameterTypeIsKnown(type)"
                >
                  {{ getTypeOptionLabel(type) }}
                </option>
              </select>
            </template>
          </div>

          <div
            class="param-value"
            :class="{
              noInteraction: isGrayedParameter(param)
                && !isVariableAssigned(param)
                && !isVariablePickerOpen(param)
            }"
          >
            <div
              v-if="isVariableAssigned(param) || isVariablePickerOpen(param)"
              class="variable-assignment"
            >
              <Link2 :size="14" aria-hidden="true" />
              <select
                class="variable-selector"
                :value="isVariableAssigned(param) ? param.value.id : ''"
                :disabled="parameterDisabled(param)"
                :aria-label="`Variable for ${param.name}`"
                :aria-describedby="controlledDescriptionId(param)"
                @change="assignVariable(param, $event.target.value)"
              >
                <option v-if="!isVariableAssigned(param)" value="" disabled>
                  Select a variable
                </option>
                <option
                  v-else-if="!assignedVariable(param)"
                  :value="param.value.id"
                  disabled
                >
                  Missing variable ({{ param.value.id }})
                </option>
                <option
                  v-else-if="!variableIsCompatible(param, assignedVariable(param))"
                  :value="param.value.id"
                  disabled
                >
                  Incompatible variable: {{ assignedVariable(param).name }}
                  ({{ getTypeOptionLabel(assignedVariable(param).type) }})
                </option>
                <option
                  v-for="variable in compatibleVariables(param)"
                  :key="variable.id"
                  :value="variable.id"
                >
                  {{ variable.name }} ({{ getTypeOptionLabel(variable.type) }})
                </option>
              </select>
            </div>
            <NamedTagTypeAutocomplete
              v-else-if="isNamedTagTypeParameter(param)"
              :model-value="param.value"
              :nullable="namedTagTypeIsNullable(param)"
              :disabled="parameterDisabled(param)"
              :parameter-name="param.name"
              :aria-describedby="controlledDescriptionId(param)"
              @update:model-value="updateNamedTagTypeValue(param, $event)"
            />
            <TypedValueInput
              v-else
              :parameter="param"
              :type="effectiveParameterType(param)"
              :disabled="parameterDisabled(param)"
              :category="category"
              :aria-describedby="controlledDescriptionId(param)"
            />
          </div>

          <span
            class="variable-binding-control"
            v-tooltip.top="variableButtonTitle(param)"
          >
            <button
              type="button"
              class="variable-binding-button noborder"
              :class="{ active: isVariableAssigned(param) || isVariablePickerOpen(param) }"
              :disabled="variableButtonDisabled(param)"
              :aria-label="variableButtonLabel(param)"
              :aria-describedby="controlledDescriptionId(param)"
              @click="toggleVariableAssignment(param)"
            >
              <Unlink2 v-if="isVariableAssigned(param)" :size="14" aria-hidden="true" />
              <Link2 v-else :size="14" aria-hidden="true" />
            </button>
          </span>
        </div>

        <p
          v-if="controlledReason(param)"
          :id="controlledDescriptionId(param)"
          class="controlled-parameter-note"
          role="status"
        >
          Strategy-controlled: {{ controlledReason(param) }}
        </p>
      </div>
    </div>

    <p v-else-if="emptyText" class="empty-protocol-parameters">
      {{ emptyText }}
    </p>
  </div>
</template>

<script setup>
import { computed, shallowRef, watch, watchEffect } from 'vue'
import { Link2, TriangleAlert, Unlink2 } from '@lucide/vue'
import { useDomId } from '../../composables/useDomId'
import { api } from '../../utils/ApiConnector'
import { VariableReference, isVariableReference } from '../../models/Variable'
import {
  getTypeOptionLabel,
  isCodeType,
  isWildcardType,
  parameterTypeIsKnown,
  parameterTypeSupportsVariableType,
  parseJuliaType,
  unknownParameterTypes
} from '../../utils/parameterTypes'
import NamedTagTypeAutocomplete from './NamedTagTypeAutocomplete.vue'
import TypedValueInput from './TypedValueInput.vue'

const props = defineProps({
  protocol: {
    type: Object,
    required: true
  },
  category: {
    type: String,
    default: 'floating'
  },
  variables: {
    type: Array,
    default: () => []
  },
  editingLocked: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  controlledParameters: {
    type: Object,
    default: () => ({})
  },
  emptyText: {
    type: String,
    default: 'No configurable parameters.'
  }
})

const blacklistParamNames = new Set(['sim', 'net', 'node', 'nodeA', 'nodeB'])
const directParameterValues = new WeakMap()
const variablePickerParameter = shallowRef(null)
const formId = useDomId('protocol-constructor')

const isEditingDisabled = computed(() => props.disabled || props.editingLocked)
const filteredParameters = computed(() => {
  const parameters = props.protocol?.parameters
  if (!Array.isArray(parameters)) {
    console.warn('Protocol parameters is not an array:', parameters)
    return []
  }
  return parameters.filter(param => !blacklistParamNames.has(param.name))
})

function isGrayedParameter(param) {
  return !isNamedTagTypeParameter(param) && param.type === 'Any'
}

function hasControlledParameter(param) {
  return Object.prototype.hasOwnProperty.call(props.controlledParameters || {}, param.name)
}

function isControlledParameter(param) {
  return hasControlledParameter(param)
}

function controlledReason(param) {
  if (!hasControlledParameter(param)) return ''
  const reason = props.controlledParameters[param.name]
  return typeof reason === 'string' && reason.trim()
    ? reason.trim()
    : 'This value is set by the selected strategy.'
}

function controlledDescriptionId(param) {
  if (!controlledReason(param)) return undefined
  const parameterName = String(param.name || 'parameter').replace(/[^a-zA-Z0-9_-]/g, '-')
  return `${formId}-${parameterName}-controlled`
}

function parameterDisabled(param) {
  return isEditingDisabled.value || isControlledParameter(param)
}

function protocolParameterDefinitionText(param) {
  let result = runtimeParameterDefinition(param)?.doc || 'NO DOC'
  const unknownTypes = paramUnknownTypes(param)
  if (unknownTypes.length > 0) {
    result += '\n\n**Unsupported:** '
      + unknownTypes.map(type => `\`${type}\``).join(', ')
  }
  return result
}

function runtimeParameterDefinition(param) {
  return api.getProtocolParameterDefinition(
    props.category,
    props.protocol.type,
    param.name
  )
}

function isNamedTagTypeParameter(param) {
  return runtimeParameterDefinition(param)?.kind === 'named_tag_type'
}

function namedTagTypeIsNullable(param) {
  return isNamedTagTypeParameter(param)
    && runtimeParameterDefinition(param)?.nullable === true
}

function paramUnknownTypes(param) {
  return isNamedTagTypeParameter(param) ? [] : unknownParameterTypes(param.type)
}

function updateNamedTagTypeValue(param, value) {
  if (parameterDisabled(param) || isVariableAssigned(param)) return
  param.value = value
  delete param.error
  delete param.latex
}

function onSelectedTypeChanged(param) {
  if (parameterDisabled(param)) return
  if (param.selectedType === 'default') {
    param.value = null
  } else if (isWildcardType(param.selectedType)) {
    param.value = 'Wildcard'
  } else if (param.selectedType === 'Nothing') {
    param.value = 'nothing'
  } else if (param.value === 'Wildcard' || param.value === 'nothing') {
    param.value = null
  }
}

function parameterTypeChoices(param) {
  if (isNamedTagTypeParameter(param)) return null
  const parsedType = parseJuliaType(param.type)
  return Array.isArray(parsedType) ? parsedType : null
}

function effectiveParameterType(param) {
  if (isNamedTagTypeParameter(param)) return 'named_tag_type'
  return parameterTypeChoices(param) ? (param.selectedType || '') : param.type
}

function isVariableAssigned(param) {
  return isVariableReference(param.value)
}

function assignedVariable(param) {
  if (!isVariableAssigned(param)) return null
  return props.variables.find(variable => variable.id === param.value.id) || null
}

function declaredParameterType(param) {
  return runtimeParameterDefinition(param)?.type ?? param.type
}

function variableIsCompatible(param, variable) {
  if (isNamedTagTypeParameter(param)) return false
  return !!variable && parameterTypeSupportsVariableType(
    declaredParameterType(param),
    variable.type
  )
}

function compatibleVariables(param) {
  if (isNamedTagTypeParameter(param)) return []
  return props.variables.filter(variable => variableIsCompatible(param, variable))
}

function isVariablePickerOpen(param) {
  return variablePickerParameter.value === param
}

function assignVariable(param, variableId) {
  if (parameterDisabled(param)) return
  if (!compatibleVariables(param).some(variable => variable.id === variableId)) return
  if (!isVariableAssigned(param)) directParameterValues.set(param, param.value)
  param.value = new VariableReference(variableId)
  variablePickerParameter.value = null
  delete param.error
  delete param.latex
}

function clearVariableAssignment(param) {
  if (parameterDisabled(param)) return
  param.value = directParameterValues.has(param) ? directParameterValues.get(param) : null
  directParameterValues.delete(param)
  if (isVariablePickerOpen(param)) variablePickerParameter.value = null
}

function toggleVariableAssignment(param) {
  if (parameterDisabled(param)) return
  if (isVariableAssigned(param)) {
    clearVariableAssignment(param)
  } else if (isVariablePickerOpen(param)) {
    variablePickerParameter.value = null
  } else if (compatibleVariables(param).length > 0) {
    variablePickerParameter.value = param
  }
}

function variableButtonDisabled(param) {
  if (parameterDisabled(param)) return true
  if (isVariableAssigned(param)) return false
  if (isNamedTagTypeParameter(param)) return true
  return compatibleVariables(param).length === 0
}

function variableButtonTitle(param) {
  if (isControlledParameter(param)) return controlledReason(param)
  if (isEditingDisabled.value) return 'Reset the simulation to edit protocol parameters'
  if (isVariableAssigned(param)) return 'Use a direct value'
  if (isNamedTagTypeParameter(param)) {
    return 'Named tag type parameters cannot use Variables yet'
  }
  if (isVariablePickerOpen(param)) return 'Cancel choosing a variable'
  if (compatibleVariables(param).length === 0) {
    return props.variables.length === 0
      ? 'Create a compatible variable in the Variables tab first'
      : 'No variables have a type supported by this parameter'
  }
  return 'Choose a compatible variable for this parameter'
}

function variableButtonLabel(param) {
  if (isVariableAssigned(param)) return `Use a direct value for ${param.name}`
  if (isVariablePickerOpen(param)) return `Cancel choosing a variable for ${param.name}`
  return `Set ${param.name} from a variable`
}

watch(() => props.protocol, () => {
  variablePickerParameter.value = null
})

watchEffect(() => {
  const param = variablePickerParameter.value
  if (param && (parameterDisabled(param) || compatibleVariables(param).length === 0)) {
    variablePickerParameter.value = null
  }
})
</script>

<style scoped>
.params-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-item {
  border-bottom: none;
}

.param-item:not(:last-child) {
  border-bottom: solid 1px #ccc;
}

.param-item-row {
  display: flex;
  padding: 0px 0px 3px;
  gap: 10px;
}

.param-name {
  font-weight: 600;
  color: #666;
  width: 50%;
  cursor: default;
}

.param-value {
  font-weight: 400;
  color: #000;
  text-align: right;
  flex: 1;
  display: flex;
  justify-content: end;
  align-items: center;
  min-width: 0;
}

.param-value :deep(input[type="text"]) {
  width: 60%;
  text-align: right;
  padding: 0px 10px;
}

.param-value :deep(input[type="number"]) {
  width: 60%;
  text-align: right;
  padding: 0px 0px;
}

.param-value :deep(.code-value-input) {
  width: 100%;
}

.complexTypeSelector {
  background: #e0dbf6;
  font-size: 0.8rem;
  padding: 0px 1px;
  border-radius: 4px;
  max-width: 65px;
  height: 16px;
}

.grayed-parameter {
  opacity: 0.6;
}

.columnParamRow {
  flex-direction: column;
  position: relative;
}

.columnParamRow .param-value {
  width: 100%;
}

.columnParamRow .variable-binding-control {
  position: absolute;
  top: 0;
  right: 0;
}

.noInteraction {
  pointer-events: none;
  opacity: 0.6;
  cursor: not-allowed;
}

.param-value :deep(input::placeholder) {
  font-size: 0.85em;
}

.unknown-type-indicator {
  display: inline-block;
  margin-left: 2px;
  color: #f00;
}

.variable-assignment {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  color: #4345ac;
}

.variable-selector {
  min-width: 0;
  max-width: 100%;
}

.variable-binding-control {
  flex: 0 0 25px;
  width: 25px;
  height: 25px;
  display: inline-flex;
}

.variable-binding-button {
  width: 100%;
  height: 100%;
  padding: 0;
  border-radius: 4px;
  color: #777;
}

.variable-binding-button:not(:disabled):hover,
.variable-binding-button.active {
  background: #eeeeff;
  color: #4345ac;
}

.controlled-parameter {
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface-subtle);
}

.controlled-parameter-note {
  margin: 0 0 var(--app-space-2);
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
  line-height: 1.35;
}

.empty-protocol-parameters {
  margin: 0;
  color: var(--app-color-text-muted);
  font-size: 0.85rem;
}
</style>

<template>
  <div class="protocol-editor protocol-list-item"
        :class="{ 'selected':isSelected }" 
      >
    <div class="protocol-list-type" @click="toggleDetails">
        <div>{{ getProtocolTypeSimpleName(protocol.type) }}</div>
        <div class="protocol-header-actions">
          <button
            type="button"
            class="protocol-header-action noborder"
            aria-label="Show results"
            v-tooltip.top="'Show results'"
            @click.stop="showResults"
          >
            <ChartNoAxesCombined :size="15" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="protocol-header-action noborder"
            aria-label="Delete protocol"
            v-tooltip.top="'Delete protocol'"
            @click.stop="deleteProtocol"
          >
            <Trash2 :size="15" aria-hidden="true" />
          </button>
        </div>
    </div>
    <div class="protocol-container" v-if="isSelected">
        <div class="params-container">
          <div class="param-item" v-for="param in filteredParameters" :key="param.name">
              <div
                class="param-item-row"
                :class="{
                  'grayed-parameter': isGrayedParameter(param),
                  'columnParamRow': !isVariableAssigned(param) && isCodeType(effectiveParameterType(param))
                }"
              >
                <div
                  v-tooltip.top="{
                    value: getProtocolParameterDefinitoinText(category, protocol, param),
                    escape: false,
                    pt: { arrow: { style: { borderTopColor: '#fff' } } }
                  }"
                  class="param-name"
                >
                  {{ param.name }}
                  <span v-if="paramUnknownTypes(param.type).length > 0" class="unknown-type-indicator">
                    <TriangleAlert :size="13" aria-hidden="true" />
                  </span>
                  <template v-if="parameterTypeChoices(param)">
                    <br/>
                    <select
                      v-model="param.selectedType"
                      class="complexTypeSelector"
                      :disabled="isEditingDisabled || isVariableAssigned(param)"
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
                      :disabled="isEditingDisabled"
                      :aria-label="`Variable for ${param.name}`"
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
                  <TypedValueInput
                    v-else
                    :parameter="param"
                    :type="effectiveParameterType(param)"
                    :disabled="isEditingDisabled"
                    :category="category"
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
                    @click="toggleVariableAssignment(param)"
                  >
                    <Unlink2 v-if="isVariableAssigned(param)" :size="14" aria-hidden="true" />
                    <Link2 v-else :size="14" aria-hidden="true" />
                  </button>
                </span>
              </div>
          </div>
        </div>
    </div>
  </div>
</template>



<script setup>
import { computed, shallowRef, watchEffect } from 'vue'
import { ChartNoAxesCombined, Link2, Trash2, TriangleAlert, Unlink2 } from '@lucide/vue'
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
import TypedValueInput from './TypedValueInput.vue'
import { useUiServices } from '../../composables/uiServices'

const props = defineProps({
  protocol: {
    type: Object,
    required: true
  }, 
  isSelected: {
    type: Boolean,
    default: false
  }, 
  category: {
    type: String,
    default: 'floating'
  },
  contextInfo: {
    type: Object,
    required: false,
    default: () => ({})
  },
  simulationState: {
    type: Object,
    required: false,
    default: () => ({})
  },
  variables: {
    type: Array,
    default: () => []
  }
})
const emit = defineEmits(['select', 'delete'])
const { showResultsView } = useUiServices()

// Check if protocol editing should be disabled
const isEditingDisabled = computed(() => {
  return props.simulationState?.hasSimulationRun || false
})
const directParameterValues = new WeakMap()
const variablePickerParameter = shallowRef(null)

function toggleDetails(){
  emit('select', props.protocol)
}

function showResults(){
  const context = {
    ...props.contextInfo,
    protocolType: getProtocolTypeSimpleName(props.protocol.type)
  }
  showResultsView('protocol', props.protocol, context)
}

function isGrayedParameter(param){
  return param.type === "Any"
}

function getProtocolTypeSimpleName( protocolType ){
  const simpleName = protocolType.split(".").pop();
  return simpleName;
}

const blacklistParamNames = [
  'sim', 
  'net', 
  'node', 
  'nodeA',
  'nodeB'
]

const filteredParameters = computed(() => {
  //return props.protocol?.parameters;
  const parameters = props.protocol?.parameters;
  if (!Array.isArray(parameters)) {
    console.warn('Protocol parameters is not an array:', parameters);
    return [];
  }
  const filtered = parameters.filter(param => !blacklistParamNames.includes(param.name)) || [];
  return filtered;
})

function getProtocolParameterDefinitoinText( category, protocol, param){
  let result = api.getProtocolParameterDefinition( category, protocol.type, param.name )?.doc || 'NO DOC';
  const unknownTypes = paramUnknownTypes(param.type);
  if( unknownTypes.length > 0 ){
    result += '<br/><br/>';
    result += '<span style="color: #ff0000;"><b>Unsupported:</b> ' + unknownTypes.join(', ') + '</span>';
  }
  return result;
}

function paramUnknownTypes(param){
  return unknownParameterTypes(param)
}

function onSelectedTypeChanged(param) {
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
  const parsedType = parseJuliaType(param.type)
  return Array.isArray(parsedType) ? parsedType : null
}

function effectiveParameterType(param) {
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
  const protocolDefinition = api.getProtocolDefinition(props.category, props.protocol.type)
  return protocolDefinition?.parameters?.find(definition => definition.field === param.name)?.type
    ?? param.type
}

function variableIsCompatible(param, variable) {
  return !!variable && parameterTypeSupportsVariableType(
    declaredParameterType(param),
    variable.type
  )
}

function compatibleVariables(param) {
  return props.variables.filter(variable => variableIsCompatible(param, variable))
}

function isVariablePickerOpen(param) {
  return variablePickerParameter.value === param
}

function assignVariable(param, variableId) {
  if (isEditingDisabled.value) return
  if (!compatibleVariables(param).some(variable => variable.id === variableId)) return
  if (!isVariableAssigned(param)) directParameterValues.set(param, param.value)
  param.value = new VariableReference(variableId)
  variablePickerParameter.value = null
  delete param.error
  delete param.latex
}

function clearVariableAssignment(param) {
  if (isEditingDisabled.value) return
  param.value = directParameterValues.has(param) ? directParameterValues.get(param) : null
  directParameterValues.delete(param)
  if (isVariablePickerOpen(param)) variablePickerParameter.value = null
}

function toggleVariableAssignment(param) {
  if (isVariableAssigned(param)) {
    clearVariableAssignment(param)
  } else if (isVariablePickerOpen(param)) {
    variablePickerParameter.value = null
  } else if (compatibleVariables(param).length > 0) {
    variablePickerParameter.value = param
  }
}

function variableButtonDisabled(param) {
  return isEditingDisabled.value
    || (!isVariableAssigned(param) && compatibleVariables(param).length === 0)
}

function variableButtonTitle(param) {
  if (isEditingDisabled.value) return 'Reset the simulation to edit protocol parameters'
  if (isVariableAssigned(param)) return 'Use a direct value'
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

watchEffect(() => {
  const param = variablePickerParameter.value
  if (param && compatibleVariables(param).length === 0) variablePickerParameter.value = null
})

function deleteProtocol(  ){
  emit('delete', props.protocol)
}

</script>



<style scoped>
.protocol-list-item {
  display: flex;
  flex-direction: column;
  text-align: left;
  justify-content: space-between;
  align-items: left;
  margin: 2px 0px;
  border-radius: 6px;
  border: solid 1px transparent;
  font-size: 1rem;
  transition: background 0.13s, color 0.13s;
}

.protocol-list-item.selected{
  border:solid 1px #4345ac30;
  margin: 0px 0px 10px;
}

.protocol-list-item > .protocol-list-type{
  background: #f6f6fd;
  font-weight: 400;
  padding: 3px 9px 3px 10px;
  border-radius: 4px;
  color: #5c5b61;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
  cursor: pointer;
}

.protocol-header-actions{
  display: flex;
  align-items: center;
  gap: 4px;
}

button.protocol-header-action{
  width: 24px;
  min-width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 4px;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
}

button.protocol-header-action:hover{
  background: #eeeeee;
  color: #4345ac;
}

.protocol-list-item.selected > .protocol-list-type{
  background:#dfe0fc;
  color: #26286b;
  font-weight: 600;
  border-radius: 4px 4px 0px 0px;
  transition: background 0.5s, color 0.25s;
}

.protocol-container{
  padding: 6px 9px 6px 10px;
  position: relative;
}

.params-container{
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-item{
  border-bottom: none;
}

.param-item:not(:last-child){
  border-bottom: solid 1px #ccc;
}

.param-item-row{
  display: flex;
  padding: 0px 0px 3px;
  gap: 10px;
}

.param-name{
  font-weight: 600;
  color: #666;
  width: 50%;
  cursor: default;
}

.param-value{
  font-weight: 400;
  color: #000;
  text-align: right;
  flex: 1;
  display: flex;
  justify-content: end;
  align-items: center;
  min-width: 0;
}

.param-value :deep(input[type="text"]){
  width: 60%;
  text-align: right;
  padding: 0px 10px;
}

.param-value :deep(input[type="number"]){
  width: 60%;
  text-align: right;
  padding: 0px 0px;
}

.param-value :deep(.code-value-input){
  width: 100%;
}

.complexTypeSelector{
  background: #e0dbf6;
  font-size: 0.8rem;
  padding: 0px 1px;
  border-radius: 4px;
  max-width: 65px;
  height: 16px;
}

.grayed-parameter{
  opacity: 0.6;
}

.columnParamRow{
  flex-direction: column;
  position: relative;
}

.columnParamRow .param-value{
  width: 100%;
}

.columnParamRow .variable-binding-control{
  position: absolute;
  top: 0;
  right: 0;
}

.noInteraction{
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

</style>

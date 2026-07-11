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
            <i class="pi pi-chart-line" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            class="protocol-header-action noborder"
            aria-label="Delete protocol"
            v-tooltip.top="'Delete protocol'"
            @click.stop="deleteProtocol"
          >
            <i class="pi pi-trash" aria-hidden="true"></i>
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
                    <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
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
                  :class="{ noInteraction: isGrayedParameter(param) && !isVariableAssigned(param) }"
                >
                  <div v-if="isVariableAssigned(param)" class="variable-assignment">
                    <i class="pi pi-link" aria-hidden="true"></i>
                    <select
                      class="variable-selector"
                      :value="param.value.id"
                      :disabled="isEditingDisabled"
                      :aria-label="`Variable for ${param.name}`"
                      @change="assignVariable(param, $event.target.value)"
                    >
                      <option
                        v-if="!assignedVariable(param)"
                        :value="param.value.id"
                        disabled
                      >
                        Missing variable ({{ param.value.id }})
                      </option>
                      <option v-for="variable in variables" :key="variable.id" :value="variable.id">
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

                <button
                  type="button"
                  class="variable-binding-button noborder"
                  :class="{ active: isVariableAssigned(param) }"
                  :disabled="variableButtonDisabled(param)"
                  :title="variableButtonTitle(param)"
                  :aria-label="variableButtonLabel(param)"
                  @click="toggleVariableAssignment(param)"
                >
                  <i :class="isVariableAssigned(param) ? 'pi pi-times' : 'pi pi-link'" aria-hidden="true"></i>
                </button>
              </div>
          </div>
        </div>
    </div>
  </div>
</template>



<script setup>
import { computed } from 'vue'
import { api } from '../../utils/ApiConnector'
import { VariableReference, isVariableReference } from '../../models/Variable'
import {
  getTypeOptionLabel,
  isCodeType,
  isWildcardType,
  parameterTypeIsKnown,
  parseJuliaType,
  unknownParameterTypes
} from '../../utils/parameterTypes'
import TypedValueInput from './TypedValueInput.vue'

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

// Check if protocol editing should be disabled
const isEditingDisabled = computed(() => {
  return props.simulationState?.hasSimulationRun || false
})
const directParameterValues = new WeakMap()

function toggleDetails(){
  emit('select', props.protocol)
}

function showResults(){
  const context = {
    ...props.contextInfo,
    protocolType: getProtocolTypeSimpleName(props.protocol.type)
  }
  window.showResultsView( 'protocol', props.protocol, context )
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
    result += '<i style="color: #ff0000; font-size: 10px; position: relative; top: -1px;" class="pi pi-exclamation-triangle"></i> <span style="color: #ff0000;"><b>' + unknownTypes.join(', ') + '</b> not supported</span>';
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

function assignVariable(param, variableId) {
  if (isEditingDisabled.value) return
  if (!isVariableAssigned(param)) directParameterValues.set(param, param.value)
  param.value = new VariableReference(variableId)
  delete param.error
  delete param.latex
}

function clearVariableAssignment(param) {
  if (isEditingDisabled.value) return
  param.value = directParameterValues.has(param) ? directParameterValues.get(param) : null
  directParameterValues.delete(param)
}

function toggleVariableAssignment(param) {
  if (isVariableAssigned(param)) {
    clearVariableAssignment(param)
  } else if (props.variables.length > 0) {
    assignVariable(param, props.variables[0].id)
  }
}

function variableButtonDisabled(param) {
  return isEditingDisabled.value || (!isVariableAssigned(param) && props.variables.length === 0)
}

function variableButtonTitle(param) {
  if (isEditingDisabled.value) return 'Reset the simulation to edit protocol parameters'
  if (isVariableAssigned(param)) return 'Use a direct value'
  if (props.variables.length === 0) return 'Create a variable in the Variables tab first'
  return 'Set this parameter from a variable'
}

function variableButtonLabel(param) {
  return isVariableAssigned(param)
    ? `Use a direct value for ${param.name}`
    : `Set ${param.name} from a variable`
}

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

.columnParamRow .variable-binding-button{
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
  font-size: 8px;
  position: relative;
  top: -1px;
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

.variable-binding-button {
  flex: 0 0 25px;
  width: 25px;
  height: 25px;
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

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
          
          <!-- ---------------- PARAM ITEM (ROW) ---------------- -->
            <div class="param-item" v-for="param in filteredParameters" :key="param.name">

              <!-- ---------------- STRING PARAMETER ---------------- -->
              <div class="param-item-row" v-if="typeof parseJuliaType(param.type) === 'string'" 
                :class="{ 'grayed-parameter': isGrayedParameter(param), 'columnParamRow': param.type === 'Lambda' || param.type === 'SymbolicUtils.Symbolic' || param.type === 'Symbolic' }">
                
                <!-- ---------------- PARAM NAME ---------------- -->
                <div 
                  v-tooltip.top="{
                    value: getProtocolParameterDefinitoinText( category, protocol, param ),
                    escape: false, // allow HTML instead of escaping
                    pt: {
                      arrow: {
                        style: {
                          borderTopColor: '#fff'
                        }
                      }
                    }
                  }"
                  class="param-name">
                  {{ param.name }}
                   <div style="margin-left: 2px; display: inline-block;" v-if="!paramIsKnownType(param.type)">
                    <i style="color: #ff0000; font-size: 8px; position: relative; top: -1px;" class="pi pi-exclamation-triangle"></i>
                  </div>
                </div>

                <!-- ---------------- PARAM VALUE ---------------- -->
                <div class="param-value" :class="{ noInteraction: isGrayedParameter(param) }">
                    <input v-if="paramTypeIsNumber(param)" type="number" v-model="param.value" :min="param.min" :max="param.max" placeholder="default" :disabled="isEditingDisabled" />
                    <Checkbox v-else-if="param.type === 'Bool'" v-model="param.value" binary :disabled="isEditingDisabled" />
                    <div v-else-if="param.type === 'Lambda' || param.type === 'SymbolicUtils.Symbolic' || param.type === 'Symbolic'" style="width:100%;" >
                      <CodeEditorWithSymbols
                        :modelValue="param.value"
                        :readOnly="isEditingDisabled || !unsafeCodeEvaluationEnabled"
                        :evaluationEnabled="unsafeCodeEvaluationEnabled"
                        :errorMessage="param.error"
                        :showLatex="param.type === 'SymbolicUtils.Symbolic' || param.type === 'Symbolic'"
                        :latexExpression="param.latex"
                        :paramType="param.type"
                        @update:modelValue="onCodeEditorValueChanged(param, $event)"
                        @validate="validateFunction(param)"
                      />
                    </div>
                  <input v-else type="text" v-model="param.value" style="border-color: transparent;" placeholder="default" :disabled="isEditingDisabled" />
                </div>
              </div>

              <!-- ---------------- COMPLEX PARAMETER ---------------- -->
              <div class="param-item-row" :class="{ 'columnParamRow': param.selectedType === 'Lambda' || param.type === 'SymbolicUtils.Symbolic' || param.type === 'Symbolic' }" v-if="typeof parseJuliaType(param.type) === 'object'">

                <!-- ---------------- PARAM NAME ---------------- -->
                <div 
                  v-tooltip.top="{
                    value: getProtocolParameterDefinitoinText( category, protocol, param ),
                    escape: false, // allow HTML instead of escaping
                    pt: {
                      arrow: {
                        style: {
                          borderTopColor: '#fff'
                        }
                      }
                    }
                  }"
                  class="param-name">{{ param.name }} 
                  <div style="margin-left: 2px; display: inline-block;" v-if="paramUnknownTypes(param.type).length > 0">
                    <i style="color: #ff0000; font-size: 8px; position: relative; top: -1px;" class="pi pi-exclamation-triangle"></i>
                  </div>
                  <br/>
                  <select v-model="param.selectedType" class="complexTypeSelector" :disabled="isEditingDisabled">
                    <option :disabled="!paramIsKnownType(type)" v-for="type in parseJuliaType(param.type)" :key="type" :value="type">
                      {{ type == 'default' ? 'Default' : type }}
                    </option>
                  </select>
                </div>

                <!-- ---------------- PARAM VALUE ---------------- -->
                <div class="param-value">
                    <input v-if="paramTypeIsNumber(param.selectedType)" type="number" v-model="param.value" :min="param.min" :max="param.max" :disabled="isEditingDisabled" />
                    <Checkbox v-else-if="param.selectedType === 'Bool'" v-model="param.value" binary :disabled="isEditingDisabled" />
                    <div v-else-if="param.selectedType === 'Lambda' || param.selectedType === 'SymbolicUtils.Symbolic' || param.selectedType === 'Symbolic'" style="width:100%;" >
                      <CodeEditorWithSymbols
                        :modelValue="param.value"
                        :readOnly="isEditingDisabled || !unsafeCodeEvaluationEnabled"
                        :evaluationEnabled="unsafeCodeEvaluationEnabled"
                        :errorMessage="param.error"
                        :showLatex="param.selectedType === 'SymbolicUtils.Symbolic' || param.selectedType === 'Symbolic'"
                        :latexExpression="param.latex"
                        :paramType="param.selectedType"
                        @update:modelValue="onCodeEditorValueChanged(param, $event)"
                        @validate="validateFunction(param)"
                      />
                    </div>

                    <div v-else-if="param.selectedType === 'Function'" >
                      <select v-model="param.value" class="functionSelector" :disabled="isEditingDisabled">
                        <option value="default">Default</option>
                        <option v-for="func in selectableFunctions" :key="func" :value="func">{{ func }}</option>
                      </select>
                    </div>
                    
                  <input v-else type="text" v-model="param.value" style="border-color: transparent;" :disabled="isEditingDisabled" />
                </div>
              </div>
            </div>
        </div>
    </div>
  </div>
</template>



<script setup>
import { defineProps, defineEmits, onMounted, computed, ref, reactive, defineAsyncComponent } from 'vue'
import Checkbox from 'primevue/checkbox';
import { api } from '../../utils/ApiConnector'

const CodeEditorWithSymbols = defineAsyncComponent(() => import('./CodeEditorWithSymbols.vue'))

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
  }
})
const emit = defineEmits(['select', 'delete'])

const resultFromShowEndpoint = ref(`placeholder`);

// Check if protocol editing should be disabled
const isEditingDisabled = computed(() => {
  return props.simulationState?.hasSimulationRun || false
})
const unsafeCodeEvaluationEnabled = computed(() => api.isUnsafeCodeEvaluationEnabled())
const selectableFunctions = computed(() => api.getKnownFunctions().filter(func =>
  props.category === 'node' || !func.endsWith('(self)')
))

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

function parseJuliaType( inputType ) {
  if( Array.isArray( inputType ) ){
    const containsFunction = inputType.some( type => type === 'Function' );
    if( containsFunction ){
      return ['default', ...inputType, 'Lambda'];
    }else{
      return ['default', ...inputType];
    }
  }
  else{
    return inputType;
  }
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

const knownTypes = ['Float64', 'Int64', 'Bool', 'String', 'Function', 'Nothing', 'Symbolic', 'Vector{Int64}', 'Vector{Float64}', 'Lambda', 'SymbolicUtils.Symbolic', 'default' ];

function paramIsKnownType(param){
  if( param == undefined ){
    return false;
  }

  const originalType = typeof param === 'object' ? param.type : param;
  const isKnownType = knownTypes.includes(originalType);
  return isKnownType;
}

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
  if( param == undefined ){
    return [];
  }
  let unknownTypes = [];
  if( typeof param === 'string' && !knownTypes.includes(param) ){
    unknownTypes.push(param);
  }
  if( Array.isArray( param ) ){
    unknownTypes = param.filter(type => !knownTypes.includes(type));
  }
  return unknownTypes;
}

function paramTypeIsNumber(param){
  if( param == undefined ){
    return false;
  }
  const originalType = typeof param === 'object' ? param.type : param;
  const lower = originalType.toLowerCase();
  const isSupportedNumber = lower == 'int' || lower == 'int64' || lower.startsWith('float');
  return isSupportedNumber;
}

function onCodeEditorValueChanged(paramObject, value) {
  paramObject.value = value;
  delete paramObject.error;
}

async function validateFunction(param){
  console.log( 'validateFunction', param );
  if( !unsafeCodeEvaluationEnabled.value ){
    param.error = '<pre>Server-side Julia evaluation is disabled.</pre>';
    return;
  }

  let response;
  if( param.type === 'SymbolicUtils.Symbolic' || param.type === 'Symbolic' ){
    response = await api.validateSymbolicFunction( param.value );
  }else{
    response = await api.validateFunction( param.value );
  }
  if( response.success ){
    delete param.error;
    if( param.type === 'SymbolicUtils.Symbolic' || param.type === 'Symbolic' ){
      param.latex = response.results.latex.replace(/^\$+|\$+$/g, '');
    }
  }else{
    delete param.latex;
    // Escape HTML first to prevent XSS
    const escaped = response.error
      .split('\\n').join('\n')
      .split('\\"').join('"')
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    // Preserve newlines with <br>, or wrap in <pre>
    param.error = `<pre>${escaped}</pre>`;
  }
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
}

input[type="text"]{
  width: 60%;
  text-align: right;
  padding: 0px 10px;
}

input[type="number"]{
  width: 60%;
  text-align: right;
  padding: 0px 0px;
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
}

.noInteraction{
  pointer-events: none;
  opacity: 0.6;
  cursor: not-allowed;
}

input::placeholder {
  font-size: 0.85em;
}

</style>

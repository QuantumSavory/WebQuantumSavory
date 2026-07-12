<template>
  <div class="states-zoo-panel" data-testid="states-zoo-panel">
    <div class="states-zoo-header">
      <p class="states-zoo-description">
        Create reusable symbolic states and preview their density matrices.
      </p>
      <button
        type="button"
        class="add-states-zoo-button"
        :disabled="disabled || typesLoading || statesZooTypes.length === 0"
        @click="addStateVariable"
      >
        <Plus :size="15" aria-hidden="true" />
        Add State
      </button>
    </div>

    <div v-if="typesLoading" class="states-zoo-catalog-status" role="status">
      Loading States Zoo types…
    </div>
    <div v-else-if="typesError" class="states-zoo-catalog-error" role="alert">
      <span>{{ typesError }}</span>
      <button type="button" @click="loadStatesZooTypes">Retry types</button>
    </div>

    <div v-if="zooVariables.length === 0" class="empty-states-zoo">
      No States Zoo variables
    </div>

    <div v-else class="states-zoo-list">
      <article
        v-for="variable in zooVariables"
        :key="variable.id"
        class="states-zoo-row"
        :data-variable-id="variable.id"
      >
        <div class="states-zoo-row-header">
          <label class="states-zoo-field states-zoo-name-field">
            <span>Name</span>
            <input
              v-model.trim="variable.name"
              type="text"
              class="states-zoo-name-input"
              :class="{ 'invalid-states-zoo-name': !!variableNameError(variable) }"
              :aria-invalid="!!variableNameError(variable)"
              :aria-describedby="variableNameError(variable) ? `states-zoo-name-error-${variable.id}` : undefined"
              :aria-label="`State variable name for ${variable.id}`"
              :disabled="disabled"
            />
            <small
              v-if="variableNameError(variable)"
              :id="`states-zoo-name-error-${variable.id}`"
              class="states-zoo-name-error"
              role="alert"
            >
              {{ variableNameError(variable) }}
            </small>
          </label>

          <button
            type="button"
            class="delete-states-zoo-button noborder"
            :disabled="disabled || isReferenced(variable.id)"
            :title="deleteTitle(variable.id)"
            :aria-label="`Delete state variable ${variable.name || variable.id}`"
            @click="deleteStateVariable(variable)"
          >
            <Trash2 :size="15" aria-hidden="true" />
          </button>
        </div>

        <div class="states-zoo-row-content">
          <div class="states-zoo-controls">
            <label class="states-zoo-field states-zoo-type-field">
              <span>State type</span>
              <select
                class="states-zoo-type-select"
                :value="variable.value.state_type"
                :aria-label="`State type for ${variable.name || variable.id}`"
                :disabled="disabled || typesLoading || statesZooTypes.length === 0"
                @change="changeStateType(variable, $event.target.value)"
              >
                <option
                  v-if="!stateType(variable.value.state_type)"
                  :value="variable.value.state_type"
                  disabled
                >
                  Unavailable type ({{ variable.value.state_type }})
                </option>
                <option v-for="type in statesZooTypes" :key="type.id" :value="type.id">
                  {{ type.displayName }}
                </option>
              </select>
            </label>

            <div
              v-for="parameter in parametersFor(variable)"
              :key="parameter.name"
              class="states-zoo-parameter-control"
              :data-parameter-name="parameter.name"
            >
              <div class="states-zoo-parameter-label">
                <span>{{ parameter.name }}</span>
                <span class="states-zoo-parameter-range-text">
                  {{ parameter.min }}–{{ parameter.max }}
                </span>
              </div>
              <div class="states-zoo-parameter-inputs">
                <input
                  type="range"
                  class="states-zoo-parameter-range"
                  :min="parameter.min"
                  :max="parameter.max"
                  step="any"
                  :value="variable.value.parameters[parameter.name]"
                  :aria-label="`${parameter.name} range for ${variable.name || variable.id}`"
                  :disabled="disabled"
                  @input="changeParameter(variable, parameter.name, $event.target.value)"
                />
                <input
                  type="number"
                  class="states-zoo-parameter-input"
                  :min="parameter.min"
                  :max="parameter.max"
                  step="any"
                  :value="variable.value.parameters[parameter.name]"
                  :aria-label="`${parameter.name} value for ${variable.name || variable.id}`"
                  :disabled="disabled"
                  @input="changeParameter(variable, parameter.name, $event.target.value)"
                />
              </div>
            </div>

            <p
              v-if="!stateType(variable.value.state_type) && !typesLoading"
              class="states-zoo-row-type-error"
              role="alert"
            >
              This saved state type is not available from the server.
            </p>
          </div>

          <div class="states-zoo-preview-column">
            <div
              class="states-zoo-preview"
              :aria-busy="previewState(variable.id).busy"
            >
              <img
                v-if="previewState(variable.id).imageUrl"
                class="states-zoo-preview-image"
                :src="previewState(variable.id).imageUrl"
                :alt="`State preview for ${variable.name || variable.id}`"
              />
              <div v-else class="states-zoo-preview-placeholder">
                Preview unavailable
              </div>
              <div
                v-if="previewState(variable.id).busy"
                class="states-zoo-preview-overlay"
                role="status"
                aria-label="Rendering state preview"
              >
                <LoaderCircle class="states-zoo-preview-spinner" :size="28" aria-hidden="true" />
                <span class="visually-hidden">Rendering state preview</span>
              </div>
            </div>
            <div
              v-if="previewState(variable.id).error"
              class="states-zoo-preview-error"
              role="alert"
            >
              <span>{{ previewState(variable.id).error }}</span>
              <button
                type="button"
                :disabled="previewState(variable.id).busy"
                @click="retryPreview(variable)"
              >
                Retry preview
              </button>
            </div>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { LoaderCircle, Plus, Trash2 } from '@lucide/vue'
import Variable, {
  STATES_ZOO_VALUE_KIND,
  isStatesZooVariable,
  isVariableReferenced
} from '../../models/Variable'
import { api } from '../../utils/ApiConnector'

const PREVIEW_DEBOUNCE_MS = 500

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

const statesZooTypes = ref([])
const typesLoading = ref(false)
const typesError = ref('')
const previewStates = reactive({})
const previewTimers = new Map()
const previewControllers = new Map()
const previewGenerations = new Map()
let catalogController = null
let isUnmounted = false

const zooVariables = computed(() => props.variables.filter(isStatesZooVariable))

function normalizeParameter(parameter) {
  return {
    name: String(parameter.name),
    min: Number(parameter.min),
    max: Number(parameter.max),
    good: Number(parameter.good)
  }
}

function normalizeStateType(type) {
  return {
    id: String(type.id),
    displayName: type.display_name || type.id,
    parameters: Array.isArray(type.parameters)
      ? type.parameters.map(normalizeParameter)
      : []
  }
}

function stateType(typeId) {
  return statesZooTypes.value.find(type => type.id === typeId)
}

function parametersFor(variable) {
  return stateType(variable.value.state_type)?.parameters || []
}

function defaultParameters(type) {
  return Object.fromEntries(type.parameters.map(parameter => [parameter.name, parameter.good]))
}

function previewState(variableId) {
  if (!previewStates[variableId]) {
    previewStates[variableId] = {
      busy: false,
      error: '',
      imageUrl: ''
    }
  }
  return previewStates[variableId]
}

function nextVariableName() {
  const existingNames = new Set(props.variables.map(variable => variable.name))
  let index = props.variables.length + 1
  let candidate = `state_${index}`
  while (existingNames.has(candidate)) {
    index += 1
    candidate = `state_${index}`
  }
  return candidate
}

function addStateVariable() {
  if (props.disabled || statesZooTypes.value.length === 0) return
  const type = statesZooTypes.value[0]
  props.variables.push(new Variable({
    name: nextVariableName(),
    type: 'Symbolic',
    value: {
      kind: STATES_ZOO_VALUE_KIND,
      state_type: type.id,
      parameters: defaultParameters(type)
    }
  }))
}

function deleteStateVariable(variable) {
  if (props.disabled || isReferenced(variable.id)) return
  cleanupPreview(variable.id)
  const index = props.variables.findIndex(candidate => candidate.id === variable.id)
  if (index !== -1) props.variables.splice(index, 1)
}

function changeStateType(variable, typeId) {
  if (props.disabled) return
  const type = stateType(typeId)
  if (!type) return
  variable.value.state_type = type.id
  variable.value.parameters = defaultParameters(type)
  schedulePreview(variable)
}

function changeParameter(variable, parameterName, rawValue) {
  if (props.disabled) return
  variable.value.parameters[parameterName] = rawValue === '' ? null : Number(rawValue)
  schedulePreview(variable)
}

function isReferenced(variableId) {
  return isVariableReferenced(props.projectData, variableId)
}

function deleteTitle(variableId) {
  if (props.disabled) return 'Reset the simulation to edit state variables'
  if (isReferenced(variableId)) return 'Unlink this variable from protocol parameters before deleting it'
  return 'Delete state variable'
}

function variableNameError(variable) {
  if (!variable.name?.trim()) return 'Name is required'
  const duplicateCount = props.variables.filter(candidate => (
    candidate.name?.trim() === variable.name.trim()
  )).length
  return duplicateCount > 1 ? 'Name must be unique' : ''
}

function cancelPreviewWork(variableId) {
  const timer = previewTimers.get(variableId)
  if (timer !== undefined) {
    clearTimeout(timer)
    previewTimers.delete(variableId)
  }

  const controller = previewControllers.get(variableId)
  if (controller) {
    controller.abort()
    previewControllers.delete(variableId)
  }
}

function cleanupPreview(variableId) {
  cancelPreviewWork(variableId)
  previewGenerations.set(variableId, (previewGenerations.get(variableId) || 0) + 1)
  delete previewStates[variableId]
}

function schedulePreview(variable, delay = PREVIEW_DEBOUNCE_MS) {
  if (isUnmounted || !isStatesZooVariable(variable)) return

  const variableId = variable.id
  const generation = (previewGenerations.get(variableId) || 0) + 1
  previewGenerations.set(variableId, generation)
  cancelPreviewWork(variableId)
  previewState(variableId).busy = false

  const timer = setTimeout(() => {
    previewTimers.delete(variableId)
    renderPreview(variable, generation)
  }, delay)
  previewTimers.set(variableId, timer)
}

function previewImageUrl(response) {
  const png = response?.png_base64
  if (typeof png !== 'string' || png.length === 0) {
    throw new Error('The server returned an invalid state preview')
  }
  return png.startsWith('data:image/png;base64,') ? png : `data:image/png;base64,${png}`
}

async function renderPreview(variable, generation) {
  const variableId = variable.id
  if (isUnmounted || previewGenerations.get(variableId) !== generation) return
  if (!props.variables.some(candidate => candidate === variable)) return

  const state = previewState(variableId)
  const controller = new AbortController()
  previewControllers.set(variableId, controller)
  state.busy = true
  state.error = ''

  try {
    const response = await api.fetchStatesZooPreview(
      variable.value.state_type,
      { ...variable.value.parameters },
      { signal: controller.signal }
    )
    if (response?.success === false) {
      throw new Error(response.error || response.message || 'State preview failed')
    }
    if (previewGenerations.get(variableId) !== generation || isUnmounted) return
    state.imageUrl = previewImageUrl(response)
  } catch (error) {
    if (error?.name === 'AbortError') return
    if (previewGenerations.get(variableId) !== generation || isUnmounted) return
    state.error = error?.message || 'State preview failed'
  } finally {
    if (previewControllers.get(variableId) === controller) {
      previewControllers.delete(variableId)
    }
    if (previewGenerations.get(variableId) === generation && !isUnmounted) {
      state.busy = false
    }
  }
}

function retryPreview(variable) {
  schedulePreview(variable, 0)
}

async function loadStatesZooTypes() {
  catalogController?.abort()
  catalogController = new AbortController()
  const controller = catalogController
  typesLoading.value = true
  typesError.value = ''

  try {
    const types = await api.fetchStatesZooTypes({
      signal: controller.signal,
      force: true
    })
    if (isUnmounted || catalogController !== controller) return
    statesZooTypes.value = types.map(normalizeStateType)
    zooVariables.value.forEach(variable => schedulePreview(variable, 0))
  } catch (error) {
    if (error?.name === 'AbortError' || isUnmounted) return
    typesError.value = error?.message || 'Unable to load States Zoo types'
  } finally {
    if (catalogController === controller) {
      catalogController = null
      if (!isUnmounted) typesLoading.value = false
    }
  }
}

watch(
  () => zooVariables.value.map(variable => variable.id),
  (ids, oldIds = []) => {
    const currentIds = new Set(ids)
    oldIds.forEach(id => {
      if (!currentIds.has(id)) cleanupPreview(id)
    })

    if (statesZooTypes.value.length === 0) return
    const previousIds = new Set(oldIds)
    zooVariables.value.forEach(variable => {
      if (!previousIds.has(variable.id)) schedulePreview(variable, 0)
    })
  },
  { immediate: true }
)

watch(
  () => props.variables,
  (variables, previousVariables) => {
    if (variables === previousVariables || statesZooTypes.value.length === 0) return
    zooVariables.value.forEach(variable => schedulePreview(variable, 0))
  }
)

onMounted(loadStatesZooTypes)

onUnmounted(() => {
  isUnmounted = true
  catalogController?.abort()
  catalogController = null
  for (const variableId of new Set([
    ...previewTimers.keys(),
    ...previewControllers.keys(),
    ...Object.keys(previewStates)
  ])) {
    cleanupPreview(variableId)
  }
})
</script>

<style scoped>
.states-zoo-panel {
  padding: 0 6px 8px;
}

.states-zoo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}

.add-states-zoo-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.states-zoo-description {
  margin: 0;
  color: #666;
  font-size: 0.85rem;
}

.add-states-zoo-button {
  flex: 0 0 auto;
}

.states-zoo-catalog-status,
.states-zoo-catalog-error,
.empty-states-zoo {
  padding: 14px;
  color: #777;
  text-align: center;
}

.states-zoo-catalog-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #b42318;
}

.states-zoo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.states-zoo-row {
  padding: 8px;
  border: 1px solid #e2e2ea;
  border-radius: 5px;
  background: #fafafe;
}

.states-zoo-row-header {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 32px;
  align-items: start;
  gap: 10px;
  margin-bottom: 9px;
}

.states-zoo-row-content {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(260px, 1.15fr);
  gap: 14px;
}

.states-zoo-controls,
.states-zoo-preview-column {
  min-width: 0;
}

.states-zoo-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  color: #666;
  font-size: 0.75rem;
  font-weight: 600;
}

.states-zoo-field input,
.states-zoo-field select {
  width: 100%;
  min-width: 0;
  font-size: 0.9rem;
  font-weight: 400;
}

.states-zoo-type-field {
  margin-bottom: 7px;
}

.states-zoo-parameter-control {
  margin-top: 6px;
}

.states-zoo-parameter-label {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #555;
  font-size: 0.78rem;
  font-weight: 600;
}

.states-zoo-parameter-range-text {
  color: #888;
  font-size: 0.72rem;
  font-weight: 400;
}

.states-zoo-parameter-inputs {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) 92px;
  align-items: center;
  gap: 8px;
}

.states-zoo-parameter-range,
.states-zoo-parameter-input {
  width: 100%;
  min-width: 0;
}

.states-zoo-parameter-input {
  padding: 0 6px;
}

.invalid-states-zoo-name {
  border-color: #d33;
}

.states-zoo-name-error,
.states-zoo-row-type-error,
.states-zoo-preview-error {
  color: #b42318;
  font-weight: 400;
}

.delete-states-zoo-button {
  width: 28px;
  height: 28px;
  margin-top: 17px;
  padding: 0;
  color: #666;
}

.delete-states-zoo-button:not(:disabled):hover {
  color: #b42318;
}

.states-zoo-preview {
  position: relative;
  display: flex;
  min-height: 150px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid #e2e2ea;
  border-radius: 4px;
  background: #fff;
}

.states-zoo-preview-image {
  display: block;
  width: 100%;
  height: auto;
  max-height: 230px;
  object-fit: contain;
}

.states-zoo-preview-placeholder {
  color: #999;
  font-size: 0.82rem;
}

.states-zoo-preview-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(255 255 255 / 64%);
}

.states-zoo-preview-spinner {
  color: #4345ac;
  animation: states-zoo-spin 0.75s linear infinite;
}

.states-zoo-preview-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 5px;
  font-size: 0.78rem;
}

.states-zoo-preview-error button {
  flex: 0 0 auto;
  height: 23px;
  padding: 2px 8px;
  font-size: 0.75rem;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes states-zoo-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .states-zoo-preview-spinner {
    animation-duration: 1.8s;
  }
}

@media (max-width: 850px) {
  .states-zoo-row-content {
    grid-template-columns: 1fr;
  }
}
</style>

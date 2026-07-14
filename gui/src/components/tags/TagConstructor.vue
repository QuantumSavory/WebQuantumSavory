<template>
  <form class="tag-constructor" @submit.prevent="submit">
    <div class="tag-type-picker">
      <label :for="comboboxId">Tag type</label>
      <div class="tag-combobox-wrap">
        <input
          :id="comboboxId"
          v-model="search"
          type="text"
          role="combobox"
          autocomplete="off"
          :class="{ 'named-tag-selection': selectedDefinition?.kind === 'named' }"
          :aria-expanded="listOpen"
          :aria-controls="listboxId"
          :aria-activedescendant="activeOptionId"
          :disabled="disabled"
          placeholder="Filter named and general tags"
          @focus="openList"
          @input="onSearchInput"
          @keydown="handleComboboxKeydown"
          @blur="closeListSoon"
        />
        <Search :size="15" aria-hidden="true" />
      </div>

      <div
        v-if="listOpen"
        :id="listboxId"
        class="tag-option-list"
        role="listbox"
      >
        <template v-for="group in filteredGroups" :key="group.id">
          <div class="tag-option-group" role="presentation">{{ group.label }}</div>
          <button
            v-for="option in group.options"
            :id="optionId(option)"
            :key="option.id"
            type="button"
            role="option"
            class="tag-option"
            :class="{
              active: flatOptions[activeOptionIndex]?.id === option.id,
              'named-tag-option': option.kind === 'named'
            }"
            :aria-selected="selectedDefinition?.id === option.id"
            :title="option.doc || option.label"
            @mousedown.prevent="selectDefinition(option)"
          >
            <span>{{ option.label }}</span>
            <small>{{ option.kind === 'named' ? 'Named' : option.headKind }}</small>
          </button>
        </template>
        <p v-if="!flatOptions.length" class="tag-options-empty">No matching tag types</p>
      </div>
    </div>

    <div v-if="selectedDefinition" class="selected-tag-definition">
      <div class="selected-tag-heading">
        <span
          class="tag-definition-badge"
          :class="selectedDefinition.kind === 'named' ? 'named' : 'general'"
        >
          {{ selectedDefinition.label }}
        </span>
        <OptionHelpTooltip
          v-if="selectedDefinition.doc"
          :label="`Documentation for ${selectedDefinition.label}`"
          :text="selectedDefinition.doc"
        />
      </div>

      <label v-if="draft?.kind === 'general'" class="tag-field-row general-head-row">
        <span>
          Head
          <small>{{ draft.headKind }}</small>
        </span>
        <select
          v-if="draft.headKind === 'DataType'"
          v-model="draft.head"
          :disabled="disabled"
          aria-label="General tag DataType head"
        >
          <option v-for="type in compatibleDataTypes" :key="type.id" :value="type.id">
            {{ type.label }}
          </option>
        </select>
        <input
          v-else
          v-model="draft.head"
          type="text"
          :disabled="disabled"
          placeholder="Symbol"
          aria-label="General tag Symbol head"
        />
      </label>

      <div class="tag-fields">
        <div v-for="(field, index) in draft?.fields || []" :key="`${field.name}-${index}`" class="tag-field-block">
          <div class="tag-field-row">
            <span
              class="tag-field-label"
              :title="field.doc ? undefined : `${field.name}: ${field.type}`"
            >
              <span>
                {{ field.name }}
                <small>{{ field.type }}</small>
              </span>
              <OptionHelpTooltip
                v-if="field.doc"
                :label="`Documentation for ${field.name}`"
                :text="field.doc"
              />
            </span>

            <select
              v-if="query"
              v-model="field.termKind"
              class="query-term-kind"
              :class="`query-term-${field.termKind}`"
              :disabled="disabled"
              :aria-label="`Query term for ${field.name}`"
              @change="resetPredicate(field)"
            >
              <option value="exact">Exact</option>
              <option value="wildcard">Wildcard</option>
              <option value="predicate">Predicate</option>
            </select>

            <template v-if="!query || field.termKind === 'exact'">
              <select
                v-if="field.type === 'DataType'"
                v-model="field.value"
                :disabled="disabled"
                :aria-label="`${field.name} value`"
              >
                <option v-for="type in catalog.dataTypes" :key="type.id" :value="type.id">
                  {{ type.label }}
                </option>
              </select>
              <input
                v-else
                v-model="field.value"
                :type="inputType(field.type)"
                :step="inputStep(field.type)"
                :disabled="disabled"
                :placeholder="field.type"
                :aria-label="`${field.name} value`"
              />
            </template>

            <span v-else-if="field.termKind === 'wildcard'" class="wildcard-term">
              Any value
            </span>

            <template v-else>
              <select
                v-model="field.predicateKind"
                :disabled="disabled"
                :aria-label="`Predicate kind for ${field.name}`"
              >
                <option value="preset">Preset</option>
                <option value="custom" :disabled="!evaluationEnabled">Custom</option>
              </select>
              <template v-if="field.predicateKind === 'preset'">
                <select
                  v-model="field.operator"
                  class="predicate-operator"
                  :disabled="disabled"
                  :aria-label="`Predicate operator for ${field.name}`"
                >
                  <option v-for="operator in predicateOperators" :key="operator" :value="operator">
                    {{ operator }}
                  </option>
                </select>
                <select
                  v-if="field.type === 'DataType'"
                  v-model="field.value"
                  :disabled="disabled"
                  :aria-label="`Predicate operand for ${field.name}`"
                >
                  <option v-for="type in catalog.dataTypes" :key="type.id" :value="type.id">
                    {{ type.label }}
                  </option>
                </select>
                <input
                  v-else
                  v-model="field.value"
                  :type="inputType(field.type)"
                  :step="inputStep(field.type)"
                  :disabled="disabled"
                  :placeholder="field.type"
                  :aria-label="`Predicate operand for ${field.name}`"
                />
              </template>
            </template>

            <button
              v-if="draft.kind === 'general' && canRemoveGeneralField(index)"
              type="button"
              class="tag-field-remove noborder"
              :disabled="disabled"
              :aria-label="`Remove ${field.name}`"
              @click="removeGeneralField"
            >
              <Trash2 :size="14" aria-hidden="true" />
            </button>
          </div>

          <div
            v-if="query && field.termKind === 'predicate' && field.predicateKind === 'custom'"
            class="custom-predicate-editor"
          >
            <p v-if="!evaluationEnabled" class="evaluation-guidance" role="status">
              Custom Julia predicates require server-side unsafe evaluation. Use a preset predicate on this server.
            </p>
            <CodeEditorWithSymbols
              :model-value="field.source"
              :read-only="disabled || !evaluationEnabled"
              :evaluation-enabled="evaluationEnabled"
              :error-message="field.error || ''"
              param-type="Function"
              :show-context-help="false"
              @update:model-value="updateCustomSource(field, $event)"
              @validate="validateCustomPredicate(field)"
            />
          </div>
          <p
            v-else-if="query && field.termKind === 'predicate' && !evaluationEnabled"
            class="evaluation-guidance compact"
            role="status"
          >
            Custom predicates are unavailable because server-side unsafe evaluation is disabled.
          </p>
        </div>
      </div>

      <div v-if="draft?.kind === 'general' && canAddGeneralField" class="add-general-field-row">
        <label v-if="nextGeneralFieldTypes.length > 1">
          <span>Next field type</span>
          <select v-model="nextGeneralFieldType" :disabled="disabled">
            <option v-for="type in nextGeneralFieldTypes" :key="type" :value="type">
              {{ type }}
            </option>
          </select>
        </label>
        <button
          type="button"
          class="add-general-field"
          :disabled="disabled"
          @click="addGeneralField"
        >
          <Plus :size="15" aria-hidden="true" />
          Add field
        </button>
      </div>
    </div>

    <div v-if="!query && selectedDefinition" class="tag-preview" aria-live="polite">
      <span>Preview</span>
      <LoaderCircle v-if="previewPending" class="tag-preview-spinner" :size="15" aria-hidden="true" />
      <code v-else-if="previewRendered">{{ previewRendered }}</code>
      <span v-else class="tag-preview-placeholder">
        {{ complete ? 'Waiting for preview' : 'Complete every field to preview this tag' }}
      </span>
    </div>

    <p v-if="previewError" class="tag-constructor-error" role="alert">{{ previewError }}</p>

    <button
      type="submit"
      class="primary tag-constructor-submit"
      :disabled="submitDisabled"
    >
      <Search v-if="query" :size="15" aria-hidden="true" />
      <Plus v-else :size="15" aria-hidden="true" />
      {{ actionLabel }}
    </button>
  </form>
</template>

<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, ref, useId, watch } from 'vue'
import { LoaderCircle, Plus, Search, Trash2 } from '@lucide/vue'
import { api } from '../../utils/ApiConnector.js'
import {
  createTagDraft,
  isTagDraftComplete,
  normalizeTagPreview,
  serializeTagDraft
} from '../../utils/tagExplorer.js'
import { escapeErrorHtml } from '../../utils/errorHtml.js'
import OptionHelpTooltip from '../ui/OptionHelpTooltip.vue'

const CodeEditorWithSymbols = defineAsyncComponent(() => import('../panels/CodeEditorWithSymbols.vue'))

const props = defineProps({
  catalog: {
    type: Object,
    required: true
  },
  query: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  busy: {
    type: Boolean,
    default: false
  },
  actionLabel: {
    type: String,
    default: 'Add tag'
  },
  unsafeEvaluationEnabled: {
    type: Boolean,
    default: false
  },
  previewer: {
    type: Function,
    default: (tag, options) => api.previewTag(tag, options)
  }
})

const emit = defineEmits(['submit'])
const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const comboboxId = `${instanceId}-tag-combobox`
const listboxId = `${instanceId}-tag-options`
const search = ref('')
const listOpen = ref(false)
const activeOptionIndex = ref(0)
const selectedDefinition = ref(null)
const draft = ref(null)
const previewPending = ref(false)
const previewRendered = ref('')
const previewError = ref('')
const nextGeneralFieldType = ref('')
let closeTimer = null
let previewTimer = null
let previewController = null
let previewGeneration = 0

const predicateOperators = ['<', '>', '≤', '≥', '==', '!=']
const evaluationEnabled = computed(() => props.unsafeEvaluationEnabled)
const filteredGroups = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return props.catalog.groups.map(group => ({
    ...group,
    options: group.options.filter(option => (
      !needle
      || option.label.toLowerCase().includes(needle)
      || option.id.toLowerCase().includes(needle)
    ))
  })).filter(group => group.options.length)
})
const flatOptions = computed(() => filteredGroups.value.flatMap(group => group.options))
const activeOptionId = computed(() => {
  const option = flatOptions.value[activeOptionIndex.value]
  return option ? optionId(option) : undefined
})
const complete = computed(() => isTagDraftComplete(draft.value, { query: props.query }))
const serialized = computed(() => serializeTagDraft(draft.value, { query: props.query }))
const matchingGeneralSignatures = computed(() => {
  if (draft.value?.kind !== 'general') return []
  return props.catalog.general.filter(signature => signature.headKind === draft.value.headKind)
})
const compatibleDataTypes = computed(() => {
  const allowedIds = selectedDefinition.value?.allowedDataTypeIds || []
  if (!allowedIds.length) return props.catalog.dataTypes
  return props.catalog.dataTypes.filter(type => allowedIds.includes(type.id))
})
const nextGeneralSignatures = computed(() => {
  if (draft.value?.kind !== 'general') return []
  const currentTypes = draft.value.fields.map(field => field.type)
  const extensions = matchingGeneralSignatures.value.filter(signature => (
    signature.fields.length === currentTypes.length + 1
    && currentTypes.every((type, index) => signature.fields[index]?.type === type)
  ))
  if (extensions.length) return extensions
  return selectedDefinition.value?.variadic ? [selectedDefinition.value] : []
})
const nextGeneralFieldTypes = computed(() => [...new Set(nextGeneralSignatures.value.map(signature => {
  const field = signature.fields[draft.value?.fields.length]
    || signature.fields[signature.fields.length - 1]
  return field?.type || 'Symbol'
}))])
const canAddGeneralField = computed(() => nextGeneralSignatures.value.length > 0)
const submitDisabled = computed(() => (
  props.disabled
  || props.busy
  || !complete.value
  || (!props.query && (previewPending.value || !previewRendered.value || Boolean(previewError.value)))
))

watch(
  () => JSON.stringify(serialized.value),
  () => schedulePreview(),
  { flush: 'post' }
)

watch(
  () => props.query,
  () => resetSelection()
)

watch(
  nextGeneralFieldTypes,
  types => {
    if (!types.includes(nextGeneralFieldType.value)) nextGeneralFieldType.value = types[0] || ''
  },
  { immediate: true }
)

watch(
  compatibleDataTypes,
  types => {
    if (draft.value?.headKind !== 'DataType') return
    if (!types.some(type => type.id === draft.value.head)) {
      draft.value.head = types[0]?.id || ''
    }
  },
  { immediate: true }
)

function optionId(option) {
  return `${instanceId}-option-${String(option.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function openList() {
  clearTimeout(closeTimer)
  listOpen.value = true
  activeOptionIndex.value = Math.min(activeOptionIndex.value, Math.max(0, flatOptions.value.length - 1))
}

function closeListSoon() {
  closeTimer = setTimeout(() => { listOpen.value = false }, 100)
}

function onSearchInput() {
  listOpen.value = true
  activeOptionIndex.value = 0
  if (selectedDefinition.value && search.value !== selectedDefinition.value.label) {
    selectedDefinition.value = null
    draft.value = null
    clearPreview()
  }
}

function handleComboboxKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    openList()
    activeOptionIndex.value = (activeOptionIndex.value + 1) % Math.max(1, flatOptions.value.length)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    openList()
    activeOptionIndex.value = (activeOptionIndex.value - 1 + Math.max(1, flatOptions.value.length))
      % Math.max(1, flatOptions.value.length)
  } else if (event.key === 'Enter' && listOpen.value && flatOptions.value.length) {
    event.preventDefault()
    selectDefinition(flatOptions.value[activeOptionIndex.value])
  } else if (event.key === 'Escape') {
    listOpen.value = false
  }
}

function selectDefinition(definition) {
  selectedDefinition.value = definition
  draft.value = createTagDraft(definition, props.catalog, props.query)
  search.value = definition.label
  listOpen.value = false
  schedulePreview()
}

function resetSelection() {
  selectedDefinition.value = null
  draft.value = null
  search.value = ''
  clearPreview()
}

function inputType(type) {
  const normalized = String(type).toLowerCase()
  return normalized.includes('int')
    || normalized.includes('float')
    || normalized === 'real'
    || normalized === 'number'
    ? 'number'
    : 'text'
}

function inputStep(type) {
  return String(type).toLowerCase().includes('int') ? '1' : 'any'
}

function resetPredicate(field) {
  field.predicateKind = 'preset'
  field.operator = '=='
  field.source = ''
  delete field.error
}

function updateCustomSource(field, value) {
  field.source = value
  delete field.error
}

async function validateCustomPredicate(field) {
  if (!evaluationEnabled.value) {
    field.error = '<pre>Server-side Julia evaluation is disabled.</pre>'
    return
  }
  try {
    const response = await api.validateFunction(field.source)
    if (response?.success) {
      delete field.error
      return
    }
    field.error = `<pre>${escapeErrorHtml(response?.error || 'Validation failed')}</pre>`
  } catch (error) {
    field.error = `<pre>${escapeErrorHtml(error?.message || 'Validation failed')}</pre>`
  }
}

function canRemoveGeneralField(index) {
  if (index !== draft.value.fields.length - 1) return false
  const shorterLength = draft.value.fields.length - 1
  return matchingGeneralSignatures.value.some(signature => signature.fields.length === shorterLength)
    || selectedDefinition.value?.variadic
}

function addGeneralField() {
  const currentLength = draft.value.fields.length
  const signature = nextGeneralSignatures.value.find(candidate => {
    const nextField = candidate.fields[currentLength]
      || candidate.fields[candidate.fields.length - 1]
    return (nextField?.type || 'Symbol') === nextGeneralFieldType.value
  }) || nextGeneralSignatures.value[0]
  if (!signature) return
  const template = signature.fields[currentLength]
    || signature.fields[signature.fields.length - 1]
    || { name: `arg${currentLength + 1}`, type: 'Symbol', doc: '' }
  draft.value.fields.push({
    ...template,
    name: template.name || `arg${currentLength + 1}`,
    value: template.type === 'DataType' ? (props.catalog.dataTypes[0]?.id ?? '') : '',
    termKind: props.query ? 'exact' : undefined,
    operator: '==',
    predicateKind: 'preset',
    source: ''
  })
  if (signature.id !== selectedDefinition.value.id) {
    selectedDefinition.value = signature
    draft.value.signatureId = signature.id
    search.value = signature.label
  }
}

function removeGeneralField() {
  if (!draft.value?.fields.length) return
  draft.value.fields.pop()
  const types = draft.value.fields.map(field => field.type)
  const signature = matchingGeneralSignatures.value.find(candidate => (
    candidate.fields.length === types.length
    && types.every((type, index) => candidate.fields[index]?.type === type)
  ))
  if (signature) {
    selectedDefinition.value = signature
    draft.value.signatureId = signature.id
    search.value = signature.label
  }
}

function clearPreview() {
  clearTimeout(previewTimer)
  previewTimer = null
  previewController?.abort()
  previewController = null
  previewGeneration += 1
  previewPending.value = false
  previewRendered.value = ''
  previewError.value = ''
}

function schedulePreview() {
  clearPreview()
  if (props.query || props.disabled || !complete.value) return
  const generation = previewGeneration
  previewPending.value = true
  previewTimer = setTimeout(async () => {
    const controller = new AbortController()
    previewController = controller
    try {
      const response = await props.previewer(serialized.value, { signal: controller.signal })
      if (controller.signal.aborted || generation !== previewGeneration) return
      previewRendered.value = normalizeTagPreview(response).rendered
    } catch (error) {
      if (error?.name !== 'AbortError' && generation === previewGeneration) {
        previewError.value = error?.message || 'Tag preview failed'
      }
    } finally {
      if (generation === previewGeneration) previewPending.value = false
      if (previewController === controller) previewController = null
    }
  }, 350)
}

function submit() {
  if (submitDisabled.value) return
  emit('submit', serialized.value)
}

onBeforeUnmount(() => {
  clearTimeout(closeTimer)
  clearPreview()
})
</script>

<style scoped>
.tag-constructor {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: var(--app-space-3);
}

.tag-type-picker {
  position: relative;
  display: grid;
  gap: 2px;
}

.tag-type-picker > label {
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
  font-weight: 600;
}

.tag-combobox-wrap {
  position: relative;
}

.tag-combobox-wrap input {
  width: 100%;
  padding-right: 30px;
}

.tag-combobox-wrap > .lucide {
  position: absolute;
  top: 4px;
  right: 8px;
  color: var(--app-color-text-muted);
  pointer-events: none;
}

.tag-combobox-wrap .named-tag-selection {
  border-color: var(--app-color-tag-named);
  background: var(--app-color-tag-named-soft);
  color: var(--app-color-tag-named);
  font-weight: 700;
}

.tag-option-list {
  position: absolute;
  z-index: 12;
  top: 44px;
  right: 0;
  left: 0;
  max-height: 210px;
  overflow-y: auto;
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface);
  box-shadow: var(--app-shadow-dialog);
}

.tag-option-group {
  padding: var(--app-space-1) var(--app-space-3);
  background: var(--app-color-surface-subtle);
  color: var(--app-color-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.tag-option {
  display: flex;
  width: 100%;
  height: auto;
  min-height: 28px;
  align-items: center;
  justify-content: space-between;
  padding: var(--app-space-1) var(--app-space-3);
  border: 0;
  border-radius: 0;
  color: var(--app-color-text);
  text-align: left;
}

.tag-option small {
  color: var(--app-color-text-muted);
}

.tag-option.active,
.tag-option:hover {
  background: var(--app-color-surface-hover);
  color: var(--app-color-text);
}

.tag-option.named-tag-option span {
  color: var(--app-color-tag-named);
  font-weight: 700;
}

.tag-options-empty {
  padding: var(--app-space-3);
  color: var(--app-color-text-muted);
}

.selected-tag-definition,
.tag-fields {
  display: grid;
  gap: var(--app-space-2);
}

.selected-tag-heading {
  display: flex;
  align-items: center;
  gap: var(--app-space-1);
}

.tag-definition-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 700;
}

.tag-definition-badge.named {
  background: var(--app-color-tag-named-soft);
  color: var(--app-color-tag-named);
}

.tag-definition-badge.general {
  background: var(--app-color-tag-general-soft);
  color: var(--app-color-tag-general);
}

.tag-field-block {
  min-width: 0;
}

.tag-field-row {
  display: grid;
  grid-template-columns: minmax(90px, 0.65fr) minmax(110px, 1fr);
  min-width: 0;
  align-items: center;
  gap: var(--app-space-2);
}

.tag-field-row:has(.query-term-kind) {
  grid-template-columns: minmax(80px, 0.55fr) 92px minmax(100px, 1fr) auto auto;
}

.tag-field-label,
.tag-field-row > span:first-child {
  min-width: 0;
  font-weight: 600;
}

.tag-field-label {
  display: flex;
  align-items: center;
  gap: var(--app-space-1);
}

.tag-field-label > span {
  min-width: 0;
}

.tag-field-label small,
.tag-field-row > span:first-child small {
  display: block;
  color: var(--app-color-text-muted);
  font-size: 0.7rem;
  font-weight: 400;
}

.tag-field-row input,
.tag-field-row select {
  width: 100%;
  min-width: 0;
}

.query-term-kind.query-term-wildcard {
  border-color: var(--app-color-tag-wildcard);
  background: var(--app-color-tag-wildcard-soft);
  color: var(--app-color-tag-wildcard);
}

.query-term-kind.query-term-predicate {
  border-color: var(--app-color-tag-predicate);
  background: var(--app-color-tag-predicate-soft);
  color: var(--app-color-tag-predicate);
}

.wildcard-term {
  color: var(--app-color-tag-wildcard);
  font-style: italic;
}

.predicate-operator {
  max-width: 64px;
}

.tag-field-remove {
  width: 25px;
  height: 25px;
  color: var(--app-color-danger);
}

.custom-predicate-editor {
  margin-top: var(--app-space-2);
  padding-left: min(120px, 15%);
}

.evaluation-guidance,
.tag-constructor-error {
  padding: var(--app-space-2);
  border-radius: var(--app-radius-control);
  background: var(--app-color-danger-soft);
  color: var(--app-color-danger);
}

.evaluation-guidance.compact {
  margin-top: var(--app-space-1);
  padding: var(--app-space-1) var(--app-space-2);
  font-size: 0.75rem;
}

.add-general-field,
.tag-constructor-submit {
  display: inline-flex;
  width: max-content;
  align-items: center;
  gap: var(--app-space-1);
}

.add-general-field-row {
  display: flex;
  align-items: end;
  gap: var(--app-space-2);
}

.add-general-field-row label {
  display: grid;
  gap: 2px;
  color: var(--app-color-text-muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.tag-preview {
  display: flex;
  min-width: 0;
  min-height: 28px;
  align-items: center;
  gap: var(--app-space-2);
  padding: var(--app-space-1) var(--app-space-2);
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface-subtle);
}

.tag-preview > span:first-child {
  color: var(--app-color-text-muted);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.tag-preview code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-preview-placeholder {
  color: var(--app-color-text-muted);
  font-style: italic;
}

.tag-preview-spinner {
  animation: tag-preview-spin 0.8s linear infinite;
}

@keyframes tag-preview-spin {
  to { transform: rotate(360deg); }
}
</style>

<template>
  <form class="tag-constructor" @submit.prevent="submit">
    <TagBadgeSequence
      :identity="identityBadge"
      :fields="fieldBadges"
      :trailing="chooserBadge"
      editable
    >
      <template #identity>
        <div class="tag-head-combobox">
          <input
            :id="comboboxId"
            v-model="search"
            type="text"
            role="combobox"
            aria-label="Tag type"
            autocomplete="off"
            :aria-expanded="listOpen"
            :aria-controls="listboxId"
            :aria-activedescendant="activeOptionId"
            :disabled="disabled"
            placeholder="Named tag, :Symbol, or DataType"
            @focus="openList"
            @input="onSearchInput"
            @keydown="handleComboboxKeydown"
            @blur="closeListSoon"
          />
          <Search :size="14" aria-hidden="true" />

          <div
            v-if="listOpen"
            :id="listboxId"
            class="tag-option-list"
            role="listbox"
          >
            <div v-if="headOptions.length" class="tag-option-group" role="presentation">
              {{ optionGroupLabel }}
            </div>
            <button
              v-for="option in headOptions"
              :id="optionId(option)"
              :key="option.id"
              type="button"
              role="option"
              class="tag-option"
              :class="{
                active: activeOption?.id === option.id,
                'named-tag-option': option.kind === 'named'
              }"
              :aria-selected="headSelection?.id === option.id"
              :disabled="option.disabled"
              :title="option.doc || option.label"
              @mousedown.prevent
              @click="commitHead(option)"
            >
              <span>{{ option.label }}</span>
              <small>{{ option.detail }}</small>
            </button>
            <p v-if="!headOptions.length" class="tag-options-empty">
              {{ emptyOptionsText }}
            </p>
          </div>
        </div>
      </template>

      <template #field="{ field, index }">
        <div class="tag-field-controls" :class="{ 'query-field-controls': query }">
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

            <div
              v-else
              class="custom-predicate-editor"
            >
              <CodeEditorWithSymbols
                :model-value="field.source"
                :read-only="disabled || !evaluationEnabled"
                :evaluation-enabled="evaluationEnabled"
                :error-message="field.error || ''"
                param-type="Function"
                source-profile="query_predicate"
                @update:model-value="updateCustomSource(field, $event)"
                @validate="validateCustomPredicate(field)"
              />
            </div>
          </template>

          <button
            v-if="draft?.kind === 'general' && index === draft.fields.length - 1"
            type="button"
            class="tag-field-remove noborder"
            :disabled="disabled"
            :aria-label="`Remove ${field.name}`"
            @click="removeGeneralField"
          >
            <Trash2 :size="14" aria-hidden="true" />
          </button>
        </div>
      </template>

      <template #trailing>
        <select
          v-model="nextGeneralFieldType"
          :disabled="disabled"
          aria-label="Next field type"
          @change="addGeneralField"
        >
          <option value="" disabled>Add field…</option>
          <option v-for="field in nextGeneralFields" :key="field.type" :value="field.type">
            {{ field.type }}
          </option>
        </select>
      </template>
    </TagBadgeSequence>

    <p
      v-if="query && hasPredicate && !evaluationEnabled"
      class="evaluation-guidance compact"
      role="status"
    >
      Custom predicates are unavailable because server-side unsafe evaluation is disabled.
    </p>

    <div v-if="!query && draft" class="tag-preview" aria-live="polite">
      <span>Preview</span>
      <LoaderCircle v-if="previewPending" class="tag-preview-spinner" :size="15" aria-hidden="true" />
      <code v-else-if="previewRendered">{{ previewRendered }}</code>
      <span v-else class="tag-preview-placeholder">
        {{ complete ? 'Waiting for preview' : 'Choose a complete signature and fill every field' }}
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
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { LoaderCircle, Plus, Search, Trash2 } from '@lucide/vue'
import { useDomId } from '../../composables/useDomId'
import { api } from '../../utils/ApiConnector.js'
import { markdownCodeBlock } from '../../utils/markdown.js'
import {
  appendGeneralField,
  completeGeneralSignature,
  createGeneralTagDraft,
  createTagDraft,
  isTagDraftComplete,
  nextGeneralFieldChoices,
  normalizeTagPreview,
  resolveCatalogDataType,
  serializeTagDraft,
  shortTypeName
} from '../../utils/tagExplorer.js'
import TagBadgeSequence from './TagBadgeSequence.vue'

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
const instanceId = useDomId('tag-constructor')
const comboboxId = `${instanceId}-tag-combobox`
const listboxId = `${instanceId}-tag-options`
const search = ref('')
const listOpen = ref(false)
const activeOptionIndex = ref(0)
const headSelection = ref(null)
const draft = ref(null)
const nextGeneralFieldType = ref('')
const previewPending = ref(false)
const previewRendered = ref('')
const previewError = ref('')
let closeTimer = null
let previewTimer = null
let previewController = null
let previewGeneration = 0
const customValidationGenerations = new WeakMap()

const predicateOperators = ['<', '>', '≤', '≥', '==', '!=']
const evaluationEnabled = computed(() => props.unsafeEvaluationEnabled)

const headOptions = computed(() => {
  const value = search.value.trim()
  if (!value) {
    return props.catalog.named.map(namedOption)
  }

  if (value.startsWith(':')) {
    const symbol = value.slice(1).trim()
    return [{
      id: `general-symbol:${symbol}`,
      kind: 'general',
      headKind: 'Symbol',
      headValue: symbol,
      label: 'General Tag: Symbol',
      detail: symbol ? `:${symbol}` : 'Enter a symbol after :',
      disabled: !symbol,
      doc: ''
    }]
  }

  const needle = value.toLowerCase()
  const named = props.catalog.named.filter(option => (
    option.label.toLowerCase().includes(needle)
    || option.id.toLowerCase().includes(needle)
  ))
  if (named.length) return named.map(namedOption)

  const dataType = resolveCatalogDataType(props.catalog.dataTypes, value)
  if (!dataType || !props.catalog.general.some(signature => (
    signature.headKind === 'DataType'
    && signature.allowedDataTypeIds.includes(dataType.id)
  ))) return []

  return [{
    id: `general-datatype:${dataType.id}`,
    kind: 'general',
    headKind: 'DataType',
    headValue: dataType.id,
    dataType,
    label: 'General Tag: DataType',
    detail: dataType.label,
    disabled: false,
    doc: ''
  }]
})

const activeOption = computed(() => headOptions.value[activeOptionIndex.value] || null)
const activeOptionId = computed(() => activeOption.value ? optionId(activeOption.value) : undefined)
const optionGroupLabel = computed(() => (
  headOptions.value[0]?.kind === 'named' ? 'Named tags' : 'General tag'
))
const emptyOptionsText = computed(() => (
  search.value.trim()
    ? 'No matching named tag or uniquely allowed DataType'
    : 'No named tag types are available'
))
const matchingCompleteSignature = computed(() => completeGeneralSignature(props.catalog, draft.value))
const serializableDraft = computed(() => {
  if (draft.value?.kind !== 'general') return draft.value
  return {
    ...draft.value,
    signatureId: matchingCompleteSignature.value?.id,
    fields: draft.value.fields
  }
})
const complete = computed(() => isTagDraftComplete(serializableDraft.value, { query: props.query }))
const serialized = computed(() => serializeTagDraft(serializableDraft.value, { query: props.query }))
const nextGeneralFields = computed(() => nextGeneralFieldChoices(props.catalog, draft.value))
const chooserBadge = computed(() => (
  draft.value?.kind === 'general' && nextGeneralFields.value.length
    ? {
        key: 'next-field',
        name: 'Next field',
        type: 'Type',
        value: 'Add field',
        kind: 'general',
        doc: '**Next field**\n\nChoose one of the field types allowed by the remaining catalog signatures.'
      }
    : null
))
const identityBadge = computed(() => {
  if (draft.value?.kind === 'named') {
    return {
      key: 'identity',
      kind: 'named',
      name: 'Tag',
      type: 'Named',
      value: headSelection.value?.label || search.value,
      doc: headSelection.value?.doc || ''
    }
  }
  if (draft.value?.kind === 'general') {
    return {
      key: 'identity',
      kind: 'general',
      badgeKind: draft.value.headKind === 'Symbol' ? 'symbol' : 'datatype',
      name: 'General Tag',
      type: draft.value.headKind,
      value: search.value,
      doc: ''
    }
  }
  const pendingType = search.value.trim().startsWith(':')
    ? 'Symbol'
    : (headOptions.value[0]?.headKind || 'Named / general')
  return {
    key: 'identity',
    kind: 'named',
    badgeKind: pendingType === 'Symbol'
      ? 'symbol'
      : (pendingType === 'DataType' ? 'datatype' : 'named'),
    name: 'Tag head',
    type: pendingType,
    value: search.value,
    doc: ''
  }
})
// Keep the original field objects here: controls in the shared badge slots
// intentionally mutate the draft while the badge component remains purely
// presentational.
const fieldBadges = computed(() => draft.value?.fields || [])
const hasPredicate = computed(() => fieldBadges.value.some(field => field.termKind === 'predicate'))
const hasPredicateError = computed(() => (
  props.query && fieldBadges.value.some(field => (
    field.termKind === 'predicate'
    && field.predicateKind === 'custom'
    && Boolean(field.error)
  ))
))
const submitDisabled = computed(() => (
  props.disabled
  || props.busy
  || !complete.value
  || hasPredicateError.value
  || (!props.query && (previewPending.value || !previewRendered.value || Boolean(previewError.value)))
))

watch(
  () => props.query,
  () => resetSelection()
)

watch(
  () => complete.value ? JSON.stringify(serialized.value) : '',
  () => schedulePreview(),
  { flush: 'post' }
)

watch(nextGeneralFields, fields => {
  if (!fields.some(field => field.type === nextGeneralFieldType.value)) {
    nextGeneralFieldType.value = ''
  }
})

function namedOption(option) {
  return {
    ...option,
    detail: 'Named'
  }
}

function optionId(option) {
  return `${instanceId}-option-${String(option.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function openList() {
  clearTimeout(closeTimer)
  listOpen.value = true
  activeOptionIndex.value = Math.min(activeOptionIndex.value, Math.max(0, headOptions.value.length - 1))
}

function closeListSoon() {
  closeTimer = setTimeout(() => { listOpen.value = false }, 100)
}

function onSearchInput() {
  listOpen.value = true
  activeOptionIndex.value = 0
  if (draft.value) {
    headSelection.value = null
    draft.value = null
    clearPreview()
  }
}

function handleComboboxKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    openList()
    if (headOptions.value.length) {
      activeOptionIndex.value = (activeOptionIndex.value + 1) % headOptions.value.length
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    openList()
    if (headOptions.value.length) {
      activeOptionIndex.value = (activeOptionIndex.value - 1 + headOptions.value.length)
        % headOptions.value.length
    }
  } else if (event.key === 'Enter') {
    event.preventDefault()
    if (listOpen.value && activeOption.value && !activeOption.value.disabled) {
      commitHead(activeOption.value)
    }
  } else if (event.key === 'Escape') {
    listOpen.value = false
  }
}

function commitHead(option) {
  if (!option || option.disabled) return
  headSelection.value = option
  if (option.kind === 'named') {
    draft.value = createTagDraft(option, props.catalog, props.query)
    search.value = option.label
  } else {
    draft.value = createGeneralTagDraft(
      option.headKind,
      option.headValue,
      props.catalog,
      props.query
    )
    search.value = option.headKind === 'Symbol'
      ? `:${option.headValue}`
      : (option.dataType?.label || shortTypeName(option.headValue))
  }
  listOpen.value = false
}

function resetSelection() {
  headSelection.value = null
  draft.value = null
  search.value = ''
  listOpen.value = false
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
    field.error = markdownCodeBlock('Server-side Julia evaluation is disabled.')
    return
  }
  const source = field.source
  const generation = (customValidationGenerations.get(field) || 0) + 1
  customValidationGenerations.set(field, generation)
  const isCurrent = () => (
    customValidationGenerations.get(field) === generation
    && field.termKind === 'predicate'
    && field.predicateKind === 'custom'
    && field.source === source
  )
  try {
    const response = await api.validateFunction(source, 'query')
    if (!isCurrent()) return
    if (response?.success) {
      delete field.error
      return
    }
    field.error = markdownCodeBlock(response?.error || 'Validation failed')
  } catch (error) {
    if (!isCurrent()) return
    field.error = markdownCodeBlock(error?.message || 'Validation failed')
  }
}

function addGeneralField() {
  const field = nextGeneralFields.value.find(candidate => (
    candidate.type === nextGeneralFieldType.value
  ))
  if (!field) return
  appendGeneralField(draft.value, field, props.catalog, props.query)
  nextGeneralFieldType.value = ''
}

function removeGeneralField() {
  if (!draft.value?.fields.length) return
  draft.value.fields.pop()
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

.tag-head-combobox {
  position: relative;
  min-width: 0;
}

.tag-head-combobox input {
  width: min(245px, 100%);
  padding-right: 27px;
  border-color: transparent;
  background: transparent;
  color: var(--app-color-text);
  font-weight: 600;
}

.tag-head-combobox input:focus {
  border-color: var(--app-color-focus);
  background: var(--app-color-surface);
}

.tag-head-combobox > .lucide {
  position: absolute;
  top: 5px;
  right: 6px;
  color: var(--app-color-text-muted);
  pointer-events: none;
}

.tag-option-list {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  width: max(100%, 270px);
  max-height: 230px;
  overflow-y: auto;
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface);
  box-shadow: var(--app-shadow-dialog);
  color: var(--app-color-text);
}

.tag-option-group {
  padding: var(--app-space-1) var(--app-space-3);
  background: var(--app-color-surface-subtle);
  color: var(--app-color-text-muted);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.tag-option {
  display: flex;
  width: 100%;
  height: auto;
  min-height: 30px;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-2);
  padding: var(--app-space-1) var(--app-space-3);
  border: 0;
  border-radius: 0;
  color: var(--app-color-text);
  text-align: left;
}

.tag-option small {
  color: var(--app-color-text-muted);
  font-weight: 400;
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
  font-size: 0.78rem;
  font-weight: 400;
}

.tag-field-controls {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--app-space-1);
  flex-wrap: wrap;
}

.tag-field-controls input,
.tag-field-controls select,
.tag-badge-trailing select {
  min-width: 0;
  max-width: 150px;
}

.query-term-kind {
  max-width: 94px;
}

.query-term-kind.query-term-wildcard {
  border-color: var(--app-color-tag-wildcard);
  color: var(--app-color-tag-wildcard);
}

.query-term-kind.query-term-predicate {
  border-color: var(--app-color-tag-predicate);
  color: var(--app-color-tag-predicate);
}

.wildcard-term {
  color: var(--app-color-tag-wildcard);
  font-style: italic;
}

.predicate-operator {
  width: 58px;
}

.tag-field-remove {
  width: 25px;
  height: 25px;
  color: var(--app-color-danger);
}

.custom-predicate-editor {
  width: min(285px, 100%);
  color: var(--app-color-text);
  font-weight: 400;
}

.evaluation-guidance,
.tag-constructor-error {
  padding: var(--app-space-2);
  border-radius: var(--app-radius-control);
  background: var(--app-color-danger-soft);
  color: var(--app-color-danger);
}

.evaluation-guidance.compact {
  padding: var(--app-space-1) var(--app-space-2);
  font-size: 0.75rem;
}

.tag-constructor-submit {
  display: inline-flex;
  width: max-content;
  align-items: center;
  gap: var(--app-space-1);
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
  font-size: 0.72rem;
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

:deep(.tag-badge-identity.tag-badge-editable) {
  overflow: visible;
}

:deep(.tag-field-badge:has(.custom-predicate-editor)) {
  width: min(320px, 100%);
  max-width: 320px;
}
</style>

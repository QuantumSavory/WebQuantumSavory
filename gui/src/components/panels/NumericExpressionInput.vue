<template>
  <div
    class="numeric-expression-input"
    :data-testid="linked ? 'linked-numeric-expression' : 'numeric-expression-input'"
  >
    <CodeEditorWithSymbols
      editor-kind="numeric"
      :model-value="source"
      :read-only="disabled"
      :evaluation-enabled="evaluationEnabled"
      :error-message="previewError"
      error-label="Validation failed"
      error-test-id="numeric-expression-error"
      show-error-message
      show-context-help
      context-help-label="Numeric expression context"
      context-help-subject="numeric expressions"
      collapsible
      :collapsed="linked || !editorOpen"
      :summary-editable="!linked && !disabled"
      :summary-result="visiblePreviewResult"
      :summary-result-aria-label="`${displayName || 'Numeric expression'} result`"
      :summary-deferred-message="previewDeferredMessage"
      source-test-id="numeric-expression-source"
      :source-label="sourceLabel"
      :aria-describedby="ariaDescribedby"
      source-placeholder="Julia numeric expression"
      editor-height="90px"
      :validation-pending="previewPending"
      disable-validation-when-empty
      :validate-aria-label="`Validate ${displayName || 'numeric'} expression`"
      evaluation-disabled-message="Numeric expression validation is unavailable because server-side Julia evaluation is disabled."
      disabled-notice-test-id="numeric-expression-disabled"
      @update:model-value="onSourceInput"
      @validate="validate({ commit: true })"
      @edit="openEditor"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { api } from '../../utils/ApiConnector.js'
import {
  createNumericExpressionValue,
  isNumericExpressionValue,
} from '../../utils/parameterTypes.js'
import CodeEditorWithSymbols from './CodeEditorWithSymbols.vue'

const props = defineProps({
  parameter: { type: Object, required: true },
  parameterName: { type: String, default: '' },
  validationTarget: { type: Object, default: undefined },
  targetType: { type: String, required: true },
  placement: { type: String, default: 'floating' },
  context: { type: Object, default: undefined },
  template: { type: Boolean, default: false },
  linked: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  ariaDescribedby: { type: String, default: undefined },
  minimum: { type: Number, default: undefined },
  maximum: { type: Number, default: undefined },
})
const emit = defineEmits(['commit'])

let requestController = null
let requestGeneration = 0
let ownedError = null
let ownedErrorTarget = null
let locallyCommittedSource = null
const previewResult = ref(null)
const previewError = ref('')
const previewDeferred = ref(false)
const previewPending = ref(false)

const persistedSource = computed(() => (
  isNumericExpressionValue(props.parameter.value)
    ? props.parameter.value.source
    : ''
))
const source = ref(persistedSource.value)
const editorOpen = ref(!props.linked && !persistedSource.value.trim())
const displayName = computed(() => (
  props.parameterName || props.parameter.name || props.parameter.field || ''
))
const sourceLabel = computed(() => (
  `${displayName.value || 'Parameter'} numeric expression source`
))
const evaluationEnabled = computed(() => api.isUnsafeCodeEvaluationEnabled())
const effectiveValidationTarget = computed(() => props.validationTarget || props.parameter)
const visiblePreviewResult = computed(() => (
  previewResult.value != null && !(props.linked && props.template)
    ? previewResult.value
    : null
))
const previewDeferredMessage = computed(() => {
  if (previewError.value || !previewDeferred.value) return ''
  return props.template
    ? 'Representative result; evaluated again when assigned.'
    : 'Evaluated when assigned.'
})

function openEditor() {
  if (!props.linked && !props.disabled) editorOpen.value = true
}

function abortRequest() {
  requestController?.abort()
  requestController = null
  requestGeneration += 1
  previewPending.value = false
}

function setOwnedError(message) {
  if (ownedErrorTarget && ownedErrorTarget !== effectiveValidationTarget.value) {
    if (ownedErrorTarget.error === ownedError) delete ownedErrorTarget.error
  }
  ownedError = message
  ownedErrorTarget = effectiveValidationTarget.value
  ownedErrorTarget.error = message
}

function clearOwnedError() {
  if (ownedErrorTarget && ownedErrorTarget.error === ownedError) delete ownedErrorTarget.error
  ownedError = null
  ownedErrorTarget = null
}

function clearPreview() {
  abortRequest()
  previewResult.value = null
  previewError.value = ''
  previewDeferred.value = false
}

function setValidationError(message) {
  previewError.value = message
  setOwnedError(message)
  if (!props.linked) editorOpen.value = true
  return false
}

function onSourceInput(value) {
  if (props.disabled || !evaluationEnabled.value || props.linked) return
  source.value = value
  editorOpen.value = true
  clearPreview()
  setValidationError('Validate this expression before continuing')
}

async function validate({ commit = false, automatic = false } = {}) {
  const currentSource = source.value
  if (props.disabled) return false
  if (!automatic && !props.linked) editorOpen.value = true
  const localError = !currentSource.trim()
    ? 'Validate this expression before continuing'
    : !evaluationEnabled.value
      ? 'Server-side Julia evaluation is disabled'
      : !props.template && props.placement !== 'variable' && props.context == null
        ? 'A concrete assignment context is required for validation'
        : null
  if (localError) {
    clearPreview()
    return setValidationError(localError)
  }

  abortRequest()
  const generation = ++requestGeneration
  requestController = new AbortController()
  previewPending.value = true
  previewError.value = ''
  previewResult.value = null
  previewDeferred.value = false
  setOwnedError('Expression validation is in progress')

  let response
  try {
    response = await api.validateNumericExpression(
      currentSource,
      props.targetType,
      props.placement,
      {
        context: props.template || props.placement === 'variable'
          ? undefined
          : props.context,
        signal: requestController.signal,
      },
    )
  } catch (error) {
    if (error?.name === 'AbortError' || generation !== requestGeneration) return false
    previewPending.value = false
    return setValidationError(error?.message || 'Numeric expression validation failed.')
  }
  if (generation !== requestGeneration || currentSource !== source.value) return false

  requestController = null
  previewPending.value = false
  if (response?.success !== true) {
    const error = typeof response?.error === 'string'
      ? response.error
      : response?.error?.message
    return setValidationError(error || 'Numeric expression validation failed.')
  }

  const evaluatedValue = response.results?.value
  const numericValue = evaluatedValue == null ? null : Number(evaluatedValue)
  if (
    numericValue != null
    && (
      (Number.isFinite(props.minimum) && numericValue < props.minimum)
      || (Number.isFinite(props.maximum) && numericValue > props.maximum)
    )
  ) {
    return setValidationError(`${displayName.value || 'Value'} must be`
      + `${Number.isFinite(props.minimum) ? ` at least ${props.minimum}` : ''}`
      + `${Number.isFinite(props.minimum) && Number.isFinite(props.maximum) ? ' and' : ''}`
      + `${Number.isFinite(props.maximum) ? ` at most ${props.maximum}` : ''}.`)
  }

  if (!props.linked) {
    locallyCommittedSource = currentSource
    props.parameter.value = createNumericExpressionValue(currentSource)
  }
  previewDeferred.value = response.results?.deferred === true
  if (evaluatedValue != null) {
    previewResult.value = String(evaluatedValue)
  }
  clearOwnedError()
  if (!props.linked) editorOpen.value = false
  if (commit) emit('commit')
  return true
}

watch(
  () => [
    props.targetType,
    props.placement,
    props.template,
    JSON.stringify(props.context),
  ],
  () => {
    const shouldRevalidate = props.linked || persistedSource.value === source.value
    clearPreview()
    if (shouldRevalidate && source.value.trim()) {
      void validate({ automatic: true })
    }
  },
)

watch(
  [persistedSource, () => props.linked],
  ([persisted, linked]) => {
    if (persisted === locallyCommittedSource && persisted === source.value) {
      locallyCommittedSource = null
      return
    }
    locallyCommittedSource = null
    if (persisted !== source.value) source.value = persisted
    editorOpen.value = !linked && !source.value.trim()
    clearPreview()
    if (!source.value.trim()) {
      setValidationError('Validate this expression before continuing')
    } else {
      void validate({ automatic: true })
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  abortRequest()
  clearOwnedError()
})
</script>

<style scoped>
.numeric-expression-input {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  align-items: stretch;
  gap: var(--app-space-1);
  text-align: left;
}
</style>

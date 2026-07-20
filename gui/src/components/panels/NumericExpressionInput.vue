<template>
  <div
    class="numeric-expression-input"
    :data-testid="linked ? 'linked-numeric-expression' : 'numeric-expression-input'"
  >
    <CustomFunctionContextHelp
      label="Numeric expression context"
      subject="numeric expressions"
    />
    <label v-if="!linked" class="numeric-expression-source-label">
      <span class="sr-only">{{ sourceLabel }}</span>
      <textarea
        :value="source"
        class="numeric-expression-source"
        data-testid="numeric-expression-source"
        :aria-label="sourceLabel"
        :aria-describedby="ariaDescribedby"
        :aria-invalid="Boolean(previewError)"
        :disabled="disabled"
        :readonly="!evaluationEnabled"
        rows="3"
        placeholder="Julia numeric expression"
        @input="onSourceInput($event.target.value)"
      />
    </label>
    <code
      v-else
      class="numeric-expression-linked-source"
      data-testid="numeric-expression-source"
      :aria-label="sourceLabel"
    >{{ source }}</code>

    <div
      v-if="!evaluationEnabled"
      class="numeric-expression-disabled-notice"
      data-testid="numeric-expression-disabled"
      role="status"
    >
      Numeric expression validation is unavailable because server-side Julia
      evaluation is disabled.
    </div>

    <button
      v-if="!linked"
      type="button"
      class="numeric-expression-validate"
      :disabled="disabled || !evaluationEnabled || !source.trim() || previewPending"
      :aria-label="`Validate ${parameter.name || 'numeric'} expression`"
      @click="validateAndCommit"
    >
      {{ previewPending ? 'Validating…' : 'Validate' }}
    </button>

    <p
      v-if="previewError"
      class="numeric-expression-error"
      data-testid="numeric-expression-error"
      role="alert"
    >
      {{ previewError }}
    </p>
    <p
      v-else-if="previewDeferred"
      class="numeric-expression-deferred"
      data-testid="numeric-expression-deferred"
      role="status"
    >
      Evaluated when assigned.
    </p>
    <p
      v-else-if="previewResult != null"
      class="numeric-expression-result"
      data-testid="numeric-expression-result"
      role="status"
      :aria-label="`${parameter.name || 'Numeric expression'} result`"
    >
      Result: {{ previewResult }}
    </p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { api } from '../../utils/ApiConnector.js'
import {
  createNumericExpressionValue,
  isNumericExpressionValue,
} from '../../utils/parameterTypes.js'
import CustomFunctionContextHelp from './CustomFunctionContextHelp.vue'

const props = defineProps({
  parameter: { type: Object, required: true },
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
let validatedSource = null
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
const sourceLabel = computed(() => (
  `${props.parameter.name || 'Parameter'} numeric expression source`
))
const evaluationEnabled = computed(() => api.isUnsafeCodeEvaluationEnabled())
const effectiveContext = computed(() => (
  props.template || props.placement === 'variable' ? undefined : props.context
))

function abortRequest() {
  requestController?.abort()
  requestController = null
  requestGeneration += 1
  previewPending.value = false
}

function clearPreview() {
  abortRequest()
  previewResult.value = null
  previewError.value = ''
  previewDeferred.value = false
}

function onSourceInput(value) {
  if (props.disabled || !evaluationEnabled.value) return
  source.value = value
  validatedSource = null
  clearPreview()
}

function responseError(response) {
  if (typeof response?.error === 'string') return response.error
  if (typeof response?.error?.message === 'string') return response.error.message
  return 'Numeric expression validation failed.'
}

async function validate({ commit = false } = {}) {
  const currentSource = source.value
  if (props.disabled || !currentSource.trim()) return false
  if (!evaluationEnabled.value) {
    clearPreview()
    previewError.value = 'Server-side Julia evaluation is disabled.'
    return false
  }

  abortRequest()
  const generation = ++requestGeneration
  requestController = new AbortController()
  previewPending.value = true
  previewError.value = ''
  previewResult.value = null
  previewDeferred.value = false

  let response
  try {
    response = await api.validateNumericExpression(
      currentSource,
      props.targetType,
      props.placement,
      {
        context: effectiveContext.value,
        signal: requestController.signal,
      },
    )
  } catch (error) {
    if (error?.name === 'AbortError' || generation !== requestGeneration) return false
    previewPending.value = false
    previewError.value = error?.message || 'Numeric expression validation failed.'
    return false
  }
  if (generation !== requestGeneration || currentSource !== source.value) return false

  requestController = null
  previewPending.value = false
  if (response?.success !== true) {
    previewError.value = responseError(response)
    return false
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
    previewError.value = `${props.parameter.name || 'Value'} must be`
      + `${Number.isFinite(props.minimum) ? ` at least ${props.minimum}` : ''}`
      + `${Number.isFinite(props.minimum) && Number.isFinite(props.maximum) ? ' and' : ''}`
      + `${Number.isFinite(props.maximum) ? ` at most ${props.maximum}` : ''}.`
    return false
  }

  validatedSource = currentSource
  if (!props.linked) {
    props.parameter.value = createNumericExpressionValue(currentSource)
  }
  previewDeferred.value = response.results?.deferred === true
  if (evaluatedValue != null) {
    previewResult.value = String(evaluatedValue)
  }
  if (commit) emit('commit')
  return true
}

async function validateAndCommit() {
  await validate({ commit: true })
}

watch(
  persistedSource,
  value => {
    if (value === source.value) return
    source.value = value
    validatedSource = value || null
  },
)

watch(
  () => [
    props.targetType,
    props.placement,
    props.template,
    JSON.stringify(props.context),
  ],
  () => {
    const shouldRevalidate = props.linked || validatedSource === source.value
    clearPreview()
    if (shouldRevalidate && source.value.trim()) void validate()
  },
)

watch(
  () => [source.value, props.linked],
  ([currentSource, linked], previous = []) => {
    if (currentSource === previous[0] && linked === previous[1]) return
    clearPreview()
    if (
      evaluationEnabled.value
      && currentSource.trim()
      && (linked || currentSource === persistedSource.value)
    ) {
      void validate()
    }
  },
  { immediate: true },
)

onBeforeUnmount(abortRequest)
</script>

<style scoped>
.numeric-expression-input {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  text-align: left;
}

.numeric-expression-source {
  width: 100%;
  min-height: 58px;
  resize: vertical;
  font-family: var(--font-family-monospace, monospace);
  font-size: 0.82rem;
}

.numeric-expression-linked-source {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.numeric-expression-validate {
  align-self: flex-end;
}

.numeric-expression-error {
  color: #b42318;
}

.numeric-expression-deferred,
.numeric-expression-result,
.numeric-expression-disabled-notice,
.numeric-expression-error {
  margin: 0;
  font-size: 0.78rem;
}
</style>

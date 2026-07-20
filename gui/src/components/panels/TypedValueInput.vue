<template>
  <NumericExpressionInput
    v-if="isNumericExpressionOptionId(type)"
    :parameter="parameter"
    :target-type="numericExpressionTargetType(type)"
    :placement="category"
    :context="numericExpressionContext"
    :template="template"
    :disabled="disabled"
    :minimum="numericMinimum"
    :maximum="numericMaximum"
    :aria-describedby="ariaDescribedby"
    @commit="emit('commit')"
  />
  <input
    v-else-if="parameterTypeIsNumber(type)"
    type="number"
    v-model="parameter.value"
    :min="numericMinimum ?? parameter.min"
    :max="numericMaximum ?? parameter.max"
    :step="numberInputStep"
    :placeholder="placeholder"
    :aria-label="valueInputLabel"
    :aria-describedby="ariaDescribedby"
    :aria-invalid="numericValueInvalid"
    :disabled="disabled"
    @change="commitNumericLiteral"
  />
  <Checkbox
    v-else-if="type === 'Bool'"
    v-model="parameter.value"
    binary
    :aria-label="valueInputLabel"
    :aria-describedby="ariaDescribedby"
    :disabled="disabled"
    @change="emit('commit')"
  >
    <template #icon="{ checked, class: iconClass }">
      <Check v-if="checked" :class="iconClass" :size="14" aria-hidden="true" />
    </template>
  </Checkbox>
  <fieldset
    v-else-if="isCodeType(type)"
    class="code-value-input"
    role="group"
    :aria-label="valueInputLabel"
    :aria-describedby="ariaDescribedby"
    :aria-invalid="codeDraftInvalid"
    :disabled="disabled"
  >
    <CodeEditorWithSymbols
      :modelValue="parameter.value || ''"
      :readOnly="disabled || !unsafeCodeEvaluationEnabled"
      :evaluationEnabled="unsafeCodeEvaluationEnabled"
      :errorMessage="parameter.error"
      :showLatex="isSymbolicType(type)"
      :latexExpression="parameter.latex"
      :paramType="type"
      collapsible
      :collapsed="!codeEditorOpen"
      @update:modelValue="onCodeEditorValueChanged"
      @validate="validateAndCommitCode"
      @edit="openCodeEditor"
    />
  </fieldset>
  <select
    v-else-if="type === 'Function'"
    v-model="parameter.value"
    class="functionSelector"
    :aria-label="valueInputLabel"
    :aria-describedby="ariaDescribedby"
    :disabled="disabled"
    @change="commitPredefinedFunction"
  >
    <option value="" disabled>Select a function</option>
    <option v-for="func in selectableFunctions" :key="func" :value="func">{{ func }}</option>
  </select>
  <span v-else-if="type === 'default'">Use protocol default</span>
  <span v-else-if="isWildcardType(type)">Wildcard</span>
  <span v-else-if="type === 'Nothing'">Nothing</span>
  <input
    v-else
    type="text"
    v-model="parameter.value"
    :placeholder="placeholder"
    :aria-label="valueInputLabel"
    :aria-describedby="ariaDescribedby"
    :disabled="disabled"
    @change="commitTextLiteral"
  />
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import Checkbox from 'primevue/checkbox'
import { Check } from '@lucide/vue'
import { api } from '../../utils/ApiConnector'
import { markdownCodeBlock } from '../../utils/markdown.js'
import {
  isNumericExpressionOptionId,
  isCodeType,
  isSymbolicType,
  isWildcardType,
  numericExpressionTargetType,
  parameterTypeIsNumber,
  parseNumericParameterValue
} from '../../utils/parameterTypes'
import NumericExpressionInput from './NumericExpressionInput.vue'

const CodeEditorWithSymbols = defineAsyncComponent(() => import('./CodeEditorWithSymbols.vue'))

const props = defineProps({
  parameter: {
    type: Object,
    required: true
  },
  type: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  },
  category: {
    type: String,
    default: 'floating'
  },
  placeholder: {
    type: String,
    default: 'default'
  },
  initiallyOpen: {
    type: Boolean,
    default: false
  },
  ariaDescribedby: {
    type: String,
    default: undefined
  },
  numericExpressionContext: {
    type: Object,
    default: undefined
  },
  template: {
    type: Boolean,
    default: false
  },
  numericMinimum: {
    type: Number,
    default: undefined
  },
  numericMaximum: {
    type: Number,
    default: undefined
  }
})
const emit = defineEmits(['commit'])

const unsafeCodeEvaluationEnabled = computed(() => api.isUnsafeCodeEvaluationEnabled())
const valueInputLabel = computed(() => `${props.parameter.name || 'Parameter'} value`)
const numberInputStep = computed(() => {
  const normalizedType = String(props.type || '').toLowerCase()
  return normalizedType === 'int' || normalizedType === 'int64' ? 1 : 'any'
})
const selectableFunctions = computed(() => api.getKnownFunctions().filter(func => (
  ['node', 'variable'].includes(props.category) || !func.endsWith('(self)')
)))
const codeEditorOpen = ref(false)
const codeDraftDirty = ref(false)
const numericValueInvalid = computed(() => !parseNumericParameterValue(
  props.type,
  props.parameter.value,
  {
    ...props.parameter,
    min: props.numericMinimum ?? props.parameter.min,
    max: props.numericMaximum ?? props.parameter.max,
  },
).valid)
const codeDraftInvalid = computed(() => (
  Boolean(props.parameter.error) || codeDraftDirty.value
))

watch(
  () => props.type,
  (type, previousType) => {
    if (type === 'default') {
      props.parameter.value = null
    } else if (isWildcardType(type)) {
      props.parameter.value = 'Wildcard'
    } else if (type === 'Nothing') {
      props.parameter.value = 'nothing'
    } else if (
      (isWildcardType(previousType) && props.parameter.value === 'Wildcard')
      || (previousType === 'Nothing' && props.parameter.value === 'nothing')
    ) {
      props.parameter.value = null
    }

    codeEditorOpen.value = isCodeType(type)
      ? props.initiallyOpen && !(isSymbolicType(type) && props.parameter.latex)
      : false
    codeDraftDirty.value = false
  },
  { immediate: true }
)

watch(
  () => props.parameter,
  () => {
    codeDraftDirty.value = false
  }
)

function onCodeEditorValueChanged(value) {
  if (props.disabled) return
  props.parameter.value = value
  delete props.parameter.error
  codeDraftDirty.value = true
}

function openCodeEditor() {
  if (!props.disabled && isCodeType(props.type)) codeEditorOpen.value = true
}

function commitNumericLiteral() {
  const parsed = parseNumericParameterValue(props.type, props.parameter.value, {
    ...props.parameter,
    min: props.numericMinimum ?? props.parameter.min,
    max: props.numericMaximum ?? props.parameter.max,
  })
  if (parsed.valid && !parsed.empty) emit('commit')
}

function commitPredefinedFunction() {
  if (typeof props.parameter.value === 'string' && props.parameter.value.trim()) {
    emit('commit')
  }
}

function commitTextLiteral() {
  if (
    (typeof props.parameter.value === 'string' && props.parameter.value.trim())
    || (Array.isArray(props.parameter.value) && props.parameter.value.length)
  ) {
    emit('commit')
  }
}

async function validateCode() {
  if (props.disabled) return
  if (!unsafeCodeEvaluationEnabled.value) {
    props.parameter.error = markdownCodeBlock('Server-side Julia evaluation is disabled.')
    codeDraftDirty.value = true
    return
  }

  let response
  try {
    response = isSymbolicType(props.type)
      ? await api.validateSymbolicFunction(props.parameter.value)
      : await api.validateFunction(props.parameter.value, props.category)
  } catch (error) {
    codeEditorOpen.value = true
    delete props.parameter.latex
    props.parameter.error = markdownCodeBlock(error?.message || 'Validation failed')
    codeDraftDirty.value = true
    return
  }

  if (response.success) {
    delete props.parameter.error
    if (isSymbolicType(props.type)) {
      props.parameter.latex = response.results.latex.replace(/^\$+|\$+$/g, '')
    }
    codeEditorOpen.value = false
    codeDraftDirty.value = false
    return
  }

  codeEditorOpen.value = true
  delete props.parameter.latex
  props.parameter.error = markdownCodeBlock(response.error)
  codeDraftDirty.value = true
}

async function validateAndCommitCode() {
  await validateCode()
  if (!props.parameter.error) emit('commit')
}
</script>

<style scoped>
.code-value-input {
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

input[type="text"],
input[type="number"],
select {
  max-width: 100%;
}
</style>

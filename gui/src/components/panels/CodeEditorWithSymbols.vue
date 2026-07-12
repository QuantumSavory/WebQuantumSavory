<template>
  <div class="code-editor-with-symbols">
    <button
      v-if="collapsible && collapsed"
      type="button"
      class="symbolic-collapsed-view"
      :class="{ 'symbolic-compact-value': !latexExpression }"
      data-testid="symbolic-collapsed-view"
      :aria-label="latexExpression ? 'Edit symbolic expression' : 'Enter symbolic expression'"
      @click="emit('edit')"
    >
      <vue-latex
        v-if="latexExpression"
        :expression="latexExpression"
        display-mode
        :fontsize="10"
        :options="latexOptions"
        class="latex-wrap"
      />
      <span v-else :class="{ 'symbolic-placeholder': !modelValue }">
        {{ modelValue || 'default' }}
      </span>
    </button>

    <template v-else>
      <div
        v-if="!evaluationEnabled"
        class="evaluation-disabled-notice"
        role="status"
        data-testid="evaluation-disabled-notice"
      >
        Server-side Julia evaluation is disabled. Raw lambda and symbolic
        validation are unavailable; choose a listed function when supported.
      </div>

      <div
        v-if="hasError"
        class="function-error-badge"
        v-tooltip.top="{
          value: errorMessage,
          escape: false,
          autoHide: false,
          class: 'reduce-y-tooltip'
        }"
      >
        <TriangleAlert :size="14" aria-hidden="true" />
        Error!
      </div>

      <div
        v-if="showLatex && latexExpression && !collapsible"
        class="latex-wrap-container">
        <vue-latex :expression="latexExpression"
          display-mode
          :fontsize="10"
          :options="latexOptions"
          class="latex-wrap"
        />
      </div>

      <HighCode
        ref="codeEditorRef"
        :codeValue="modelValue"
        @getCodeValue="handleValueChange"
        :textEditor="true"
        lang="julia"
        width="100%"
        height="150px"
        theme="light"
        fontSize="12px"
        :copy="false"
        borderRadius="4px"
        :readOnly="interactionDisabled"
        :class="{
          'function-container': true,
          'function-syntax-error': hasError,
          'noInteraction': interactionDisabled
        }"
        @click="captureCursorPosition"
        @mousedown="captureCursorPosition"
        @keyup="captureCursorPosition"
      />
      
      <div class="buttons-row">
        <div class="symbol-buttons-container">
          <button
            v-for="symbol in unicodeSymbols"
            :key="symbol"
            class="symbol-button"
            :class="{ 'subscript-char': isSubscriptChar(symbol) }"
            @mousedown="handleSymbolClick($event, symbol)"
            :disabled="interactionDisabled"
            :title="'Insert ' + symbol"
          >
            <span class="symbol-content">{{ symbol }}</span>
          </button>
        </div>

        <button
          @click="handleValidate"
          :disabled="interactionDisabled"
          :title="evaluationEnabled ? 'Validate' : 'Server-side Julia evaluation is disabled'"
          class="validate-button"
        >Validate</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { VueLatex } from 'vatex'
import { HighCode } from 'vue-highlight-code';
import 'vue-highlight-code/dist/style.css';
import { api } from '../../utils/ApiConnector'
import { TriangleAlert } from '@lucide/vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  readOnly: {
    type: Boolean,
    default: false
  },
  evaluationEnabled: {
    type: Boolean,
    default: false
  },
  errorMessage: {
    type: String,
    default: ''
  },
  showLatex: {
    type: Boolean,
    default: false
  },
  latexExpression: {
    type: String,
    default: null
  },
  paramType: {
    type: String,
    default: ''
  },
  collapsible: {
    type: Boolean,
    default: false
  },
  collapsed: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'validate', 'edit'])

const codeEditorRef = ref(null)
const cursorPosition = ref(0)

const unicodeSymbols = ref(['₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉', '₀', '⊗','√'])

function isSubscriptChar(symbol) {
  // Check if the character is a subscript (Unicode range for subscript digits and letters)
  const code = symbol.charCodeAt(0)
  // Unicode ranges for subscripts: ₀-₉ (U+2080-U+2089), ₐ-ᵢ (U+2090-U+209C)
  return (code >= 0x2080 && code <= 0x2089) || (code >= 0x2090 && code <= 0x209C)
}

const latexOptions = ref({
  displayMode: true,
  throwOnError: false,
  fleqn: false,
  maxSize: Infinity,
  maxExpand: Infinity,
  strict: false,
  output: 'html',
  trust: true
})

const hasError = computed(() => !!props.errorMessage)
const interactionDisabled = computed(() => props.readOnly || !props.evaluationEnabled)

function handleValueChange(value) {
  emit('update:modelValue', value)
}

function captureCursorPosition() {
  // Try to capture cursor position from the editor
  // This is a simplified approach - we'll track it on click/focus
  try {
    const editorElement = codeEditorRef.value?.$el
    if (editorElement) {
      const textarea = editorElement.querySelector('textarea') || editorElement
      if (textarea && typeof textarea.selectionStart === 'number') {
        cursorPosition.value = textarea.selectionStart
      }
    }
  } catch (e) {
    console.warn('Could not capture cursor position:', e)
  }
}

async function handleSymbolClick(event, symbol) {
  event.preventDefault()
  
  // Capture current cursor position
  captureCursorPosition()
  
  // Small delay to ensure cursor position is captured
  await nextTick()
  
  const currentValue = props.modelValue || ''
  const cursorPos = cursorPosition.value
  
  // Insert symbol at cursor position
  const newValue = currentValue.slice(0, cursorPos) + symbol + currentValue.slice(cursorPos)
  
  // Emit the update to parent
  emit('update:modelValue', newValue)
  
  // Also update the textarea directly to ensure it reflects the change immediately
  nextTick(() => {
    try {
      const editorElement = codeEditorRef.value?.$el
      if (editorElement) {
        const textarea = editorElement.querySelector('textarea')
        if (textarea) {
          // Set the new value directly on the textarea
          textarea.value = newValue
          
          // Set cursor position after the inserted symbol
          const newCursorPos = cursorPos + symbol.length
          textarea.setSelectionRange(newCursorPos, newCursorPos)
          
          // Trigger the input event to notify HighCode of the change
          const inputEvent = new Event('input', { bubbles: true })
          textarea.dispatchEvent(inputEvent)
          
          // Also manually call handleValueChange to ensure the parent is updated
          handleValueChange(newValue)
          
          textarea.focus()
        }
      }
    } catch (e) {
      console.warn('Could not update textarea:', e)
    }
  })
}

function handleValidate() {
  emit('validate')
}

onMounted(() => {
  // Add event listeners to track cursor position on the textarea
  // These will be added after the next tick to ensure the ref is ready
  nextTick(() => {
    if (codeEditorRef.value?.$el) {
      const editorElement = codeEditorRef.value.$el
      const textarea = editorElement.querySelector('textarea')
      
      if (textarea) {
        textarea.addEventListener('keyup', captureCursorPosition)
        textarea.addEventListener('click', captureCursorPosition)
        textarea.addEventListener('focus', captureCursorPosition)
      }
    }
  })
})
</script>

<style scoped>
.code-editor-with-symbols {
  width: 100%;
}

.symbolic-collapsed-view {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: inherit;
}

.symbolic-collapsed-view:hover {
  border-color: #c7c7df;
  background: #f8f8fd;
}

.symbolic-compact-value {
  width: 60%;
  min-height: 22px;
  margin-left: auto;
  padding: 1px 10px;
  border-color: #ccc;
  border-radius: 2px;
  background: #fff;
  text-align: right;
}

.symbolic-placeholder {
  color: #999;
}

.evaluation-disabled-notice {
  margin-bottom: 0.5rem;
  color: #8a4b08;
  font-size: 0.8rem;
}

.function-error-badge {
  color: #f00;
  font-size: 0.8rem;
  font-weight: 600;
  display: flex;
  flex-direction: row;
  width: max-content;
  justify-content: flex-end;
  padding: 0px 0px 2px 10px;
}

.function-syntax-error {
  border: solid 1px #f00;
}

.noInteraction {
  pointer-events: none;
  opacity: 0.6;
  cursor: not-allowed;
}

.latex-wrap-container {
  padding: 0px 0px; 
  margin: 5px 0px;
}

.latex-wrap {
  white-space: normal;
  overflow-wrap: break-word;
  word-break: break-word;
  overflow: auto;
  width: 100%;
}

:deep(.katex-display) {
  margin: 1px 0px;
}

.buttons-row {
  display: flex;
  align-items: top;
  gap: 2px;
  margin: 5px 0px;
}

.symbol-buttons-container {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  /* padding: 2px; */
  border-radius: 3px;
  /* background: #f8f8f8; */
}

.symbol-button {
  background: #ebebf9;
  border: 1px solid transparent;
  border-radius: 2px;
  padding: 1px 4px;
  font-size: 13px;
  font-weight: 600;
  color: #333;
  cursor: pointer;
  transition: all 0.15s ease;
  width: 15px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.symbol-content {
  display: inline-block;
  font-family: sans-serif;
}

.symbol-button.subscript-char .symbol-content {
  transform: translateY(-3.5px);
}

.symbol-button:hover:not(:disabled) {
  background: #d5d5ff;
}
.symbol-button:not(.subscript-char):hover:not(:disabled) {
  transform: translateY(-1px);
}

.symbol-button:not(.subscript-char):active:not(:disabled) {
  transform: translateY(0);
}


.symbol-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.validate-button {
  background: #4345ac;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.validate-button:hover:not(:disabled) {
  background: #383991;
}

.validate-button:active:not(:disabled) {
  transform: translateY(1px);
}

.validate-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

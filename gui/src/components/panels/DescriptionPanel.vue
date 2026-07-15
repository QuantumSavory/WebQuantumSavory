<template>
  <div class="description-panel" data-testid="description-panel">
    <form v-if="isEditing" class="description-editor" @submit.prevent="saveDescription">
      <label for="project-description-editor" class="visually-hidden">
        Project description in Markdown
      </label>
      <textarea
        id="project-description-editor"
        ref="editor"
        v-model="draft"
        class="description-textarea"
        aria-describedby="description-editor-help"
        :aria-busy="isEmbeddingImage"
        placeholder="Describe this simulation with Markdown and LaTeX math…"
        :readonly="isEmbeddingImage"
        @paste="handlePaste"
      />
      <p v-if="isEmbeddingImage" class="description-paste-status" role="status">
        Embedding pasted image…
      </p>
      <p v-if="pasteError" class="description-paste-error" role="alert">
        {{ pasteError }}
      </p>
      <div class="description-editor-footer">
        <p id="description-editor-help" class="description-help">
          Markdown, $inline math$, $$display math$$, and PNG/JPEG/GIF/WebP image pasting as data URLs are supported.
        </p>
        <div class="description-actions">
          <button
            type="submit"
            class="description-action primary-action"
            aria-label="Save project description"
            :disabled="isEmbeddingImage"
          >
            <Save :size="15" aria-hidden="true" />
            Save
          </button>
          <button type="button" class="description-action" aria-label="Cancel description editing" @click="cancelEditing">
            <X :size="15" aria-hidden="true" />
            Cancel
          </button>
        </div>
      </div>
    </form>

    <template v-else>
      <div class="description-toolbar">
        <button type="button" class="description-action" aria-label="Edit project description" @click="startEditing">
          <PencilLine :size="15" aria-hidden="true" />
          Edit
        </button>
      </div>
      <div
        v-if="modelValue"
        class="description-markdown"
        data-testid="rendered-description"
        v-html="renderedDescription"
      />
      <p v-else class="empty-description">No description yet.</p>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { PencilLine, Save, X } from '@lucide/vue'
import { renderMarkdown } from '../../utils/markdown.js'
import { getClipboardImageFiles, imageFilesToMarkdown } from '../../utils/markdownImagePaste'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue'])

const isEditing = ref(false)
const draft = ref(props.modelValue)
const editor = ref(null)
const pasteError = ref('')
const isEmbeddingImage = ref(false)
const renderedDescription = computed(() => renderMarkdown(props.modelValue))
let pasteOperation = 0

function resetPasteState() {
  pasteOperation += 1
  isEmbeddingImage.value = false
  pasteError.value = ''
}

watch(() => props.modelValue, value => {
  draft.value = value
  isEditing.value = false
  resetPasteState()
})

async function startEditing() {
  draft.value = props.modelValue
  isEditing.value = true
  resetPasteState()
  await nextTick()
  editor.value?.focus()
}

async function handlePaste(event) {
  const imageFiles = getClipboardImageFiles(event.clipboardData)
  if (imageFiles.length === 0) return

  event.preventDefault()
  if (isEmbeddingImage.value) return

  const operation = ++pasteOperation
  isEmbeddingImage.value = true
  pasteError.value = ''

  const textarea = event.currentTarget
  const selectionStart = textarea.selectionStart
  const selectionEnd = textarea.selectionEnd

  try {
    const pastedMarkdown = await imageFilesToMarkdown(imageFiles)
    if (operation !== pasteOperation || !isEditing.value || editor.value !== textarea) return

    draft.value = `${draft.value.slice(0, selectionStart)}${pastedMarkdown}${draft.value.slice(selectionEnd)}`
    isEmbeddingImage.value = false
    await nextTick()

    if (operation !== pasteOperation || !isEditing.value || editor.value !== textarea) return
    const caretPosition = selectionStart + pastedMarkdown.length
    textarea.setSelectionRange(caretPosition, caretPosition)
  } catch {
    if (operation === pasteOperation && isEditing.value && editor.value === textarea) {
      pasteError.value = 'The pasted image could not be read. Please try again.'
    }
  } finally {
    if (operation === pasteOperation) {
      isEmbeddingImage.value = false
    }
  }
}

function saveDescription() {
  if (isEmbeddingImage.value) return
  emit('update:modelValue', draft.value)
  isEditing.value = false
}

function cancelEditing() {
  draft.value = props.modelValue
  isEditing.value = false
  resetPasteState()
}
</script>

<style scoped>
.description-panel {
  min-height: 132px;
  padding: 0 4px 4px 0;
  color: #2b2b2b;
}

.description-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 4px;
}

.description-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 28px;
  padding: 4px 10px;
}

.description-action:focus-visible {
  outline: 2px solid #4345ac;
  outline-offset: 2px;
}

.primary-action {
  border-color: #4345ac;
  background: #4345ac;
  color: #fff;
}

.primary-action:hover {
  background: #353796;
}

.description-editor {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.description-textarea {
  width: 100%;
  min-height: 145px;
  resize: vertical;
  padding: 9px 10px;
  border: 1px solid #b8b8c8;
  border-radius: 4px;
  background: #fff;
  color: #222;
  font: 0.9rem/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.description-textarea:focus {
  border-color: #4345ac;
  outline: 2px solid #4345ac33;
}

.description-editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.description-help {
  margin: 0;
  color: #666;
  font-size: 0.78rem;
}

.description-paste-status,
.description-paste-error {
  margin: 0;
  font-size: 0.78rem;
}

.description-paste-status {
  color: #666;
}

.description-paste-error {
  color: var(--app-color-danger);
}

.description-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.empty-description {
  margin: 8px 4px;
  color: #777;
  font-style: italic;
}

.description-markdown {
  padding: 2px 7px 12px;
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.description-markdown :deep(h1),
.description-markdown :deep(h2),
.description-markdown :deep(h3) {
  margin: 0.8em 0 0.35em;
  line-height: 1.25;
}

.description-markdown :deep(h1:first-child),
.description-markdown :deep(h2:first-child),
.description-markdown :deep(h3:first-child) {
  margin-top: 0;
}

.description-markdown :deep(p),
.description-markdown :deep(ul),
.description-markdown :deep(ol),
.description-markdown :deep(blockquote),
.description-markdown :deep(pre) {
  margin: 0 0 0.75em;
}

.description-markdown :deep(ul),
.description-markdown :deep(ol) {
  padding-left: 1.6em;
}

.description-markdown :deep(blockquote) {
  padding-left: 0.8em;
  border-left: 3px solid #c9c9d8;
  color: #555;
}

.description-markdown :deep(code) {
  padding: 0.1em 0.3em;
  border-radius: 3px;
  background: #f1f1f5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.description-markdown :deep(pre) {
  overflow: auto;
  padding: 8px 10px;
  border-radius: 4px;
  background: #f1f1f5;
}

.description-markdown :deep(pre code) {
  padding: 0;
  background: transparent;
}

.description-markdown :deep(img) {
  max-width: 100%;
  height: auto;
}

.description-markdown :deep(.katex-display) {
  overflow-x: auto;
  overflow-y: hidden;
}

@media (max-width: 620px) {
  .description-editor-footer {
    align-items: flex-end;
    flex-direction: column;
  }
}
</style>

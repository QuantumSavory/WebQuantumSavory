<template>
  <div class="markdown-editor">
    <form v-if="isEditing" class="markdown-editor-form" @submit.prevent="saveMarkdown">
      <label :for="editorId" class="visually-hidden">
        {{ editorLabel }}
      </label>
      <textarea
        :id="editorId"
        ref="editor"
        v-model="draft"
        class="markdown-editor-textarea"
        :aria-describedby="helpId"
        :aria-busy="isEmbeddingImage"
        :placeholder="placeholder"
        :readonly="isEmbeddingImage"
        @paste="handlePaste"
      />
      <p v-if="isEmbeddingImage" class="markdown-paste-status" role="status">
        Embedding pasted image…
      </p>
      <p v-if="pasteError" class="markdown-paste-error" role="alert">
        {{ pasteError }}
      </p>
      <div class="markdown-editor-footer">
        <p :id="helpId" class="markdown-editor-help">
          Markdown, $inline math$, $$display math$$, and PNG/JPEG/GIF/WebP image pasting as
          data URLs are supported.
        </p>
        <div class="markdown-editor-actions">
          <button
            type="submit"
            class="markdown-editor-action primary-action"
            :aria-label="saveButtonLabel"
            :disabled="isEmbeddingImage"
          >
            <Save :size="15" aria-hidden="true" />
            Save
          </button>
          <button
            type="button"
            class="markdown-editor-action"
            :aria-label="cancelButtonLabel"
            @click="cancelEditing"
          >
            <X :size="15" aria-hidden="true" />
            Cancel
          </button>
        </div>
      </div>
    </form>

    <template v-else>
      <div class="markdown-editor-toolbar">
        <button
          type="button"
          class="markdown-editor-action"
          :aria-label="editButtonLabel"
          @click="startEditing"
        >
          <PencilLine :size="15" aria-hidden="true" />
          Edit
        </button>
      </div>
      <div
        v-if="modelValue"
        class="markdown-rendered"
        data-testid="markdown-rendered"
        v-html="renderedMarkdown"
      />
      <p v-else class="markdown-empty">{{ emptyText }}</p>
    </template>
  </div>
</template>

<script setup>
import { computed, inject, nextTick, onUnmounted, ref, watch } from 'vue'
import { PencilLine, Save, X } from '@lucide/vue'
import { useDomId } from '../../composables/useDomId'
import { EDITOR_DRAFT_REGISTRY_KEY } from '../../composables/editorDraftRegistry'
import { renderMarkdown } from '../../utils/markdown.js'
import { getClipboardImageFiles, imageFilesToMarkdown } from '../../utils/markdownImagePaste'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  idPrefix: {
    type: String,
    default: '',
  },
  editorLabel: {
    type: String,
    default: 'Content in Markdown',
  },
  editButtonLabel: {
    type: String,
    default: 'Edit Markdown content',
  },
  saveButtonLabel: {
    type: String,
    default: 'Save Markdown content',
  },
  cancelButtonLabel: {
    type: String,
    default: 'Cancel Markdown editing',
  },
  placeholder: {
    type: String,
    default: 'Write with Markdown and LaTeX math…',
  },
  emptyText: {
    type: String,
    default: 'No content yet.',
  },
})

const emit = defineEmits(['update:modelValue'])

const generatedId = useDomId('markdown-editor')
const resolvedIdPrefix = computed(() => props.idPrefix || generatedId)
const editorId = computed(() => `${resolvedIdPrefix.value}-editor`)
const helpId = computed(() => `${resolvedIdPrefix.value}-editor-help`)
const isEditing = ref(false)
const draft = ref(props.modelValue)
const editor = ref(null)
const pasteError = ref('')
const isEmbeddingImage = ref(false)
const renderedMarkdown = computed(() => renderMarkdown(props.modelValue))
const draftRegistry = inject(EDITOR_DRAFT_REGISTRY_KEY, null)
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

    draft.value = [
      draft.value.slice(0, selectionStart),
      pastedMarkdown,
      draft.value.slice(selectionEnd),
    ].join('')
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

function saveMarkdown() {
  if (isEmbeddingImage.value) return
  emit('update:modelValue', draft.value)
  isEditing.value = false
}

function flushDraft() {
  if (!isEditing.value) return { valid: true }
  if (isEmbeddingImage.value) {
    return {
      busy: true,
      details: { reason: 'image-paste' },
    }
  }
  if (draft.value === props.modelValue) {
    isEditing.value = false
    return { valid: true }
  }

  return new Promise(resolve => {
    emit(
      'update:modelValue',
      draft.value,
      () => {
        isEditing.value = false
        resolve({ valid: true })
      },
      error => {
        resolve({
          valid: false,
          details: {
            message: error?.message || 'The Markdown draft could not be saved.',
          },
        })
        return true
      },
    )
  })
}

function cancelEditing() {
  draft.value = props.modelValue
  isEditing.value = false
  resetPasteState()
}

const unregisterDraft = draftRegistry?.register({
  id: `markdown:${resolvedIdPrefix.value}`,
  flush: flushDraft,
})

onUnmounted(() => unregisterDraft?.())
</script>

<style scoped>
.markdown-editor {
  color: var(--app-color-text);
}

.markdown-editor-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--app-space-1);
}

.markdown-editor-action {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  gap: var(--app-space-2);
  padding: var(--app-space-1) 10px;
}

.markdown-editor-action:focus-visible {
  outline: var(--app-focus-ring-width) solid var(--app-color-focus);
  outline-offset: var(--app-focus-ring-offset);
}

.primary-action {
  border-color: var(--app-color-primary);
  background: var(--app-color-primary);
  color: var(--app-color-on-primary);
}

.primary-action:hover {
  background: var(--app-color-primary-hover);
}

.markdown-editor-form {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.markdown-editor-textarea {
  width: 100%;
  min-height: 145px;
  resize: vertical;
  padding: 9px 10px;
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface);
  color: var(--app-color-text);
  font: 0.9rem/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.markdown-editor-textarea:focus {
  border-color: var(--app-color-primary);
  outline: var(--app-focus-ring-width) solid var(--app-color-primary-soft);
}

.markdown-editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.markdown-editor-help {
  margin: 0;
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
}

.markdown-paste-status,
.markdown-paste-error {
  margin: 0;
  font-size: 0.78rem;
}

.markdown-paste-status {
  color: var(--app-color-text-muted);
}

.markdown-paste-error {
  color: var(--app-color-danger);
}

.markdown-editor-actions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--app-space-2);
}

.markdown-empty {
  margin: var(--app-space-3) var(--app-space-1);
  color: var(--app-color-text-muted);
  font-style: italic;
}

.markdown-rendered {
  padding: 2px 7px var(--app-space-4);
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.markdown-rendered :deep(h1),
.markdown-rendered :deep(h2),
.markdown-rendered :deep(h3) {
  margin: 0.8em 0 0.35em;
  line-height: 1.25;
}

.markdown-rendered :deep(h1:first-child),
.markdown-rendered :deep(h2:first-child),
.markdown-rendered :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-rendered :deep(p),
.markdown-rendered :deep(ul),
.markdown-rendered :deep(ol),
.markdown-rendered :deep(blockquote),
.markdown-rendered :deep(pre) {
  margin: 0 0 0.75em;
}

.markdown-rendered :deep(ul),
.markdown-rendered :deep(ol) {
  padding-left: 1.6em;
}

.markdown-rendered :deep(blockquote) {
  padding-left: 0.8em;
  border-left: 3px solid var(--app-color-border);
  color: var(--app-color-text-muted);
}

.markdown-rendered :deep(code) {
  padding: 0.1em 0.3em;
  border-radius: 3px;
  background: var(--app-color-surface-hover);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.markdown-rendered :deep(pre) {
  overflow: auto;
  padding: var(--app-space-3) 10px;
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface-hover);
}

.markdown-rendered :deep(pre code) {
  padding: 0;
  background: transparent;
}

.markdown-rendered :deep(img) {
  max-width: 100%;
  height: auto;
}

.markdown-rendered :deep(.katex-display) {
  overflow-x: auto;
  overflow-y: hidden;
}

@media (max-width: 620px) {
  .markdown-editor-footer {
    align-items: flex-end;
    flex-direction: column;
  }
}
</style>

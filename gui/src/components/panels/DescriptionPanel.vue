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
        placeholder="Describe this simulation with Markdown and LaTeX math…"
      />
      <div class="description-editor-footer">
        <p id="description-editor-help" class="description-help">
          Markdown, $inline math$, $$display math$$, and data-image URLs are supported.
        </p>
        <div class="description-actions">
          <button type="submit" class="description-action primary-action" aria-label="Save project description">
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
import MarkdownIt from 'markdown-it'
import markdownItKatexModule from '@vscode/markdown-it-katex'
import { SAFE_KATEX_OPTIONS } from '../../utils/katexOptions'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue'])

const markdownItKatex = markdownItKatexModule.default ?? markdownItKatexModule
const markdown = new MarkdownIt({
  html: false,
  linkify: true
}).use(markdownItKatex, SAFE_KATEX_OPTIONS)

const isEditing = ref(false)
const draft = ref(props.modelValue)
const editor = ref(null)
const renderedDescription = computed(() => markdown.render(props.modelValue))

watch(() => props.modelValue, value => {
  draft.value = value
  isEditing.value = false
})

async function startEditing() {
  draft.value = props.modelValue
  isEditing.value = true
  await nextTick()
  editor.value?.focus()
}

function saveDescription() {
  emit('update:modelValue', draft.value)
  isEditing.value = false
}

function cancelEditing() {
  draft.value = props.modelValue
  isEditing.value = false
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

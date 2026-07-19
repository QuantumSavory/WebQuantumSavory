<template>
  <div
    class="markdown-content"
    v-html="renderedMarkdown"
  />
</template>

<script setup>
import { computed } from 'vue'
import { renderMarkdown } from '../../utils/markdown.js'

const props = defineProps({
  content: {
    type: String,
    default: '',
  },
})

const renderedMarkdown = computed(() => renderMarkdown(props.content))
</script>

<style scoped>
.markdown-content {
  padding: 2px 7px var(--app-space-4);
  overflow-wrap: anywhere;
  color: var(--app-color-text);
  line-height: 1.5;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3) {
  margin: 0.8em 0 0.35em;
  line-height: 1.25;
}

.markdown-content :deep(h1:first-child),
.markdown-content :deep(h2:first-child),
.markdown-content :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-content :deep(p),
.markdown-content :deep(ul),
.markdown-content :deep(ol),
.markdown-content :deep(blockquote),
.markdown-content :deep(pre) {
  margin: 0 0 0.75em;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 1.6em;
}

.markdown-content :deep(blockquote) {
  padding-left: 0.8em;
  border-left: 3px solid var(--app-color-border);
  color: var(--app-color-text-muted);
}

.markdown-content :deep(code) {
  padding: 0.1em 0.3em;
  border-radius: 3px;
  background: var(--app-color-surface-hover);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.markdown-content :deep(pre) {
  overflow: auto;
  padding: var(--app-space-3) 10px;
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface-hover);
}

.markdown-content :deep(pre code) {
  padding: 0;
  background: transparent;
}

.markdown-content :deep(img) {
  max-width: 100%;
  height: auto;
}

.markdown-content :deep(.katex-display) {
  overflow-x: auto;
  overflow-y: hidden;
}
</style>

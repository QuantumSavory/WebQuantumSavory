<template>
  <div class="description-panel" data-testid="description-panel">
    <MarkdownEditor
      id-prefix="project-description"
      :model-value="modelValue"
      editor-label="Project description in Markdown"
      edit-button-label="Edit project description"
      save-button-label="Save project description"
      cancel-button-label="Cancel description editing"
      placeholder="Describe this simulation with Markdown and LaTeX math…"
      empty-text="No description yet."
      @update:model-value="(...args) => emit('update:modelValue', ...args)"
    />
  </div>
</template>

<script setup>
import MarkdownEditor from '../ui/MarkdownEditor.vue'

defineProps({
  modelValue: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue'])
</script>

<style scoped>
.description-panel {
  min-height: 132px;
  padding: 0 var(--app-space-1) var(--app-space-1) 0;
  color: var(--app-color-text);
}
</style>

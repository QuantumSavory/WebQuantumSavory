<template>
  <button
    type="button"
    class="option-help-trigger"
    :aria-label="label"
    :title="text"
    v-tooltip.top="text"
  >
    <CircleHelp :size="16" aria-hidden="true" />
  </button>
</template>

<script setup>
import { CircleHelp } from '@lucide/vue'

defineProps({
  label: { type: String, required: true },
  text: { type: String, required: true }
})
</script>

<style scoped>
.option-help-trigger {
  display: inline-flex;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: var(--app-radius-control);
  background: transparent;
  color: var(--app-color-text-muted);
}

.option-help-trigger:hover,
.option-help-trigger:focus-visible {
  background: var(--app-color-surface-hover);
  color: var(--app-color-primary);
}
</style>

<template>
  <Button
    :type="type"
    :disabled="disabled"
    :class="[
      'app-button',
      `app-button--${variant}`,
      { 'app-button--icon-only': iconOnly }
    ]"
    @click="emit('click', $event)"
  >
    <span v-if="$slots.icon" class="app-button-icon" aria-hidden="true">
      <slot name="icon" />
    </span>
    <span v-if="$slots.default" class="app-button-label">
      <slot />
    </span>
  </Button>
</template>

<script setup>
import Button from 'primevue/button'

defineProps({
  type: {
    type: String,
    default: 'button',
    validator: value => ['button', 'submit', 'reset'].includes(value)
  },
  variant: {
    type: String,
    default: 'secondary',
    validator: value => ['primary', 'secondary', 'danger', 'warning', 'ghost'].includes(value)
  },
  disabled: {
    type: Boolean,
    default: false
  },
  iconOnly: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['click'])
</script>

<style scoped>
.app-button {
  display: inline-flex;
  height: var(--app-control-height);
  align-items: center;
  justify-content: center;
  gap: var(--app-space-2);
  padding: var(--app-control-padding-y) var(--app-control-padding-x);
  border: 1px solid var(--app-color-primary);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface);
  color: var(--app-color-primary);
  font: inherit;
  line-height: 1;
  box-shadow: none;
}

.app-button:hover:not(:disabled) {
  border-color: var(--app-color-primary-hover);
  background: var(--app-color-primary);
  color: var(--app-color-on-primary);
}

.app-button--primary {
  border-color: var(--app-color-primary);
  background: var(--app-color-primary);
  color: var(--app-color-on-primary);
}

.app-button--primary:hover:not(:disabled) {
  border-color: var(--app-color-primary-hover);
  background: var(--app-color-primary-hover);
}

.app-button--danger {
  border-color: var(--app-color-danger);
  color: var(--app-color-danger);
}

.app-button--danger:hover:not(:disabled) {
  border-color: var(--app-color-danger);
  background: var(--app-color-danger-soft);
  color: var(--app-color-danger);
}

.app-button--warning {
  border-color: var(--app-color-warning);
  background: var(--app-color-warning);
  color: var(--app-color-on-primary);
}

.app-button--warning:hover:not(:disabled) {
  border-color: var(--app-color-warning-hover);
  background: var(--app-color-warning-hover);
}

.app-button--ghost {
  border-color: transparent;
  background: transparent;
  color: var(--app-color-text-muted);
}

.app-button--ghost:hover:not(:disabled) {
  border-color: transparent;
  background: var(--app-color-surface-hover);
  color: var(--app-color-text);
}

.app-button--icon-only {
  width: var(--app-control-height);
  padding: 0;
}

.app-button-icon,
.app-button-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.app-button:focus-visible {
  outline: var(--app-focus-ring-width) solid var(--app-color-focus);
  outline-offset: var(--app-focus-ring-offset);
}

.app-button:disabled {
  border-color: var(--app-color-border);
  background: var(--app-color-disabled-surface);
  color: var(--app-color-disabled-text);
  cursor: not-allowed;
  opacity: 0.65;
}
</style>

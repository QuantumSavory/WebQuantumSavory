<template>
  <ResizeBounding
    id="right-sidebar-resizer"
    class="right-sidebar-resizer"
    :width="width"
    :min-width="minWidth"
    :max-width="maxWidth"
    directions="l"
    :disabled="disabled"
    :options="resizeOptions"
    @update:width="updateWidth"
    @drag:end="emit('resize-end')"
  >
    <slot />
    <div
      v-if="!disabled"
      class="right-sidebar-keyboard-resize-target"
      role="separator"
      tabindex="0"
      :aria-label="label"
      aria-orientation="vertical"
      :aria-valuemin="minWidth"
      :aria-valuemax="maxWidth"
      :aria-valuenow="Math.round(width)"
      aria-keyshortcuts="ArrowLeft ArrowRight Home End"
      data-testid="right-sidebar-width-resize-target"
      @keydown="handleResizeKeydown"
    />
  </ResizeBounding>
</template>

<script setup>
import ResizeBounding from 'vue3-resize-bounding'

const KEYBOARD_RESIZE_STEP = 16

const props = defineProps({
  width: {
    type: Number,
    required: true
  },
  minWidth: {
    type: Number,
    required: true
  },
  maxWidth: {
    type: Number,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  },
  label: {
    type: String,
    default: 'Resize simulation sidebar width'
  }
})

const emit = defineEmits(['update:width', 'resize-end'])

const resizeOptions = {
  activeAreaWidth: 12,
  splitterWidthNormal: 2,
  splitterWidthActive: 3,
  position: 'internal',
  touchActions: true,
  cursor: {
    horizontal: 'ew-resize'
  },
  knob: {
    show: false
  }
}

function clamp(width) {
  return Math.min(props.maxWidth, Math.max(props.minWidth, Math.round(width)))
}

function updateWidth(width) {
  if (Number.isFinite(width)) emit('update:width', clamp(width))
}

function handleResizeKeydown(event) {
  let width = props.width

  if (event.key === 'ArrowLeft') {
    width -= KEYBOARD_RESIZE_STEP
  } else if (event.key === 'ArrowRight') {
    width += KEYBOARD_RESIZE_STEP
  } else if (event.key === 'Home') {
    width = props.minWidth
  } else if (event.key === 'End') {
    width = props.maxWidth
  } else {
    return
  }

  event.preventDefault()
  updateWidth(width)
  emit('resize-end')
}
</script>

<style scoped>
.right-sidebar-resizer {
  height: 100%;
}

.right-sidebar-resizer :deep(.resize-bounding__splitter) {
  background: transparent;
}

.right-sidebar-keyboard-resize-target {
  position: absolute;
  z-index: 20;
  top: var(--app-space-5);
  bottom: var(--app-space-5);
  left: 0;
  width: var(--app-space-1);
  pointer-events: none;
  cursor: ew-resize;
}

.right-sidebar-keyboard-resize-target:focus-visible {
  outline: none;
  background: var(--app-color-focus);
  box-shadow:
    0 0 0 var(--app-focus-ring-width) var(--app-color-surface),
    0 0 0 calc(var(--app-focus-ring-width) * 2) var(--app-color-focus);
}
</style>

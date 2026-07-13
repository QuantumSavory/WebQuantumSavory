<template>
  <Dialog
    v-bind="$attrs"
    :visible="show"
    :header="title"
    :modal="true"
    :closable="closable"
    :dismissable-mask="dismissableMask"
    :close-on-escape="closeOnEscape"
    :block-scroll="blockScroll"
    :draggable="false"
    :base-z-index="baseZIndex"
    :style="{ width }"
    class="modal-dialog app-dialog"
    :pt="dialogPassThrough"
    @update:visible="handleVisibleUpdate"
  >
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>
    <template #closeicon="slotProps">
      <X :class="slotProps.class" :size="18" aria-hidden="true" />
    </template>

    <slot />

    <template v-if="$slots.footer" #footer>
      <div class="app-dialog-actions">
        <slot name="footer" />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { inject, nextTick, watch } from 'vue'
import Dialog from 'primevue/dialog'
import { X } from '@lucide/vue'
import { UI_SERVICES_KEY } from '../../composables/uiServices'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    required: true
  },
  closable: {
    type: Boolean,
    default: false
  },
  dismissableMask: {
    type: Boolean,
    default: false
  },
  closeOnEscape: {
    type: Boolean,
    default: true
  },
  blockScroll: {
    type: Boolean,
    default: true
  },
  baseZIndex: {
    type: Number,
    default: 1000
  },
  width: {
    type: String,
    default: 'min(500px, calc(100vw - 32px))'
  }
})

const emit = defineEmits(['close'])
const uiServices = inject(UI_SERVICES_KEY, null)
let returnFocusElement = null

watch(() => props.show, (show, wasShown) => {
  if (show && !wasShown) {
    returnFocusElement = document.activeElement
    return
  }
  if (!show && wasShown) {
    nextTick(() => {
      const candidateIsVisible = returnFocusElement
        && returnFocusElement !== document.body
        && returnFocusElement.isConnected
        && returnFocusElement.getClientRects().length > 0
      const target = candidateIsVisible
        ? returnFocusElement
        : uiServices?.getDialogFallbackFocus?.()
      target?.focus?.()
      returnFocusElement = null
    })
  }
})

const dialogPassThrough = {
  mask: { class: 'app-dialog-mask' },
  header: { class: 'app-dialog-header' },
  title: {
    class: 'app-dialog-title',
    role: 'heading',
    'aria-level': '2'
  },
  content: { class: 'app-dialog-content' },
  footer: { class: 'app-dialog-footer' },
  pcCloseButton: {
    root: {
      class: 'app-dialog-close-button',
      'aria-label': 'Close dialog'
    }
  }
}

function handleVisibleUpdate(visible) {
  if (!visible) emit('close')
}

</script>

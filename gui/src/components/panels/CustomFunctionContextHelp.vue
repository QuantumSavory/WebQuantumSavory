<template>
  <div class="custom-function-context-help">
    <button
      type="button"
      class="custom-function-context-trigger noborder"
      aria-haspopup="dialog"
      :aria-controls="popoverId"
      :aria-expanded="popoverVisible"
      @click="togglePopover"
    >
      <CircleHelp :size="15" aria-hidden="true" />
      Custom function context
    </button>

    <Popover
      ref="popover"
      :id="popoverId"
      @show="popoverVisible = true"
      @hide="popoverVisible = false"
    >
      <section
        class="custom-function-context-popup"
        role="dialog"
        aria-label="Custom function context"
        data-testid="custom-function-context-help"
      >
        <p class="custom-function-context-heading">Context available to custom functions</p>
        <dl>
          <template v-for="keyword in CUSTOM_FUNCTION_CONTEXT_KEYWORDS" :key="keyword.id">
            <dt><code>{{ keyword.syntax }}</code></dt>
            <dd>
              {{ keyword.description }}
              {{ keyword.availability }}
              <span v-if="keyword.recommendation">{{ keyword.recommendation }}</span>
            </dd>
          </template>
        </dl>
      </section>
    </Popover>
  </div>
</template>

<script setup>
import { ref, useId } from 'vue'
import { CircleHelp } from '@lucide/vue'
import Popover from 'primevue/popover'
import { CUSTOM_FUNCTION_CONTEXT_KEYWORDS } from '../../utils/customFunctionContext'

const popover = ref(null)
const popoverVisible = ref(false)
const popoverId = `custom-function-context-${useId()}`

function togglePopover(event) {
  popoverVisible.value = !popoverVisible.value
  popover.value.toggle(event)
}
</script>

<style scoped>
.custom-function-context-help {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--app-space-1);
}

.custom-function-context-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-1);
  padding: var(--app-space-1) var(--app-space-2);
  border-radius: var(--app-radius-control);
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
}

.custom-function-context-trigger:hover,
.custom-function-context-trigger:focus-visible {
  background: var(--app-color-surface-hover);
  color: var(--app-color-primary);
}

.custom-function-context-popup {
  width: min(38rem, calc(100vw - (2 * var(--app-space-4))));
  max-height: calc(100vh - (2 * var(--app-space-4)));
  overflow-y: auto;
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
}

.custom-function-context-heading {
  margin: 0 0 var(--app-space-1);
  color: var(--app-color-text);
  font-weight: 600;
}

dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--app-space-1) var(--app-space-2);
  margin: 0;
}

dt,
dd {
  margin: 0;
}

code {
  color: var(--app-color-text);
  font-size: inherit;
}
</style>

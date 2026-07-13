<template>
  <aside
    class="custom-function-context-help"
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
  </aside>
</template>

<script setup>
import { CUSTOM_FUNCTION_CONTEXT_KEYWORDS } from '../../utils/customFunctionContext'
</script>

<style scoped>
.custom-function-context-help {
  margin-bottom: var(--app-space-2);
  padding: var(--app-space-2) var(--app-space-3);
  border-left: 3px solid var(--app-color-primary);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface-subtle);
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

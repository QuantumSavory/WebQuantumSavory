<template>
  <div class="layout-tools">
    <section class="layout-tools-card docs-card" aria-labelledby="layout-tools-docs-title">
      <h3 id="layout-tools-docs-title" class="card-title">
        {{ showingHelperDocs ? 'Repeater Chain Generator' : 'Layout controls' }}
      </h3>

      <p v-if="showingHelperDocs" class="helper-description" aria-live="polite">
        Create an evenly spaced chain between two endpoints by cloning a configured
        repeater node and its template edge.
      </p>

      <ul v-else class="layout-instructions" aria-live="polite">
        <li><kbd>Alt</kbd>-click the map to add a node.</li>
        <li>Drag a node connector onto another node to create a physical edge.</li>
        <li>Hold <kbd>Shift</kbd> while connecting to create a virtual edge.</li>
        <li>Drag a node to position it.</li>
        <li>Press <kbd>Backspace</kbd> to delete the selected item.</li>
      </ul>
    </section>

    <section class="layout-tools-card helpers-card" aria-labelledby="layout-tools-helpers-title">
      <h3 id="layout-tools-helpers-title" class="card-title">Helpers</h3>
      <button
        type="button"
        class="helper-button"
        :disabled="disabled"
        :aria-describedby="disabled ? 'layout-tools-disabled-help' : undefined"
        @mouseenter="showHelperDocs"
        @mouseleave="showDefaultDocs"
        @focus="showHelperDocs"
        @blur="showDefaultDocs"
        @click="emit('open-repeater-chain-generator')"
      >
        <i class="pi pi-share-alt" aria-hidden="true"></i>
        Repeater Chain Generator
      </button>
      <p v-if="disabled" id="layout-tools-disabled-help" class="disabled-help">
        Layout helpers are unavailable after a simulation has started.
      </p>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['open-repeater-chain-generator'])

const showingHelperDocs = ref(false)

function showHelperDocs() {
  showingHelperDocs.value = true
}

function showDefaultDocs() {
  showingHelperDocs.value = false
}
</script>

<style scoped>
.layout-tools {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(14rem, 1fr);
  gap: 10px;
  height: 120px;
  color: #2b2b2b;
}

.layout-tools-card {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background: #fff;
}

.docs-card {
  background: #f8f9fa;
}

.card-title {
  margin: 0 0 7px;
  color: #333;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.layout-instructions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 18px;
  margin: 0;
  padding-left: 18px;
  font-size: 0.82rem;
  line-height: 1.35;
}

.layout-instructions li:last-child {
  grid-column: 1 / -1;
}

kbd {
  display: inline-block;
  min-width: 1.4em;
  padding: 0 4px;
  border: 1px solid #c9c9c9;
  border-bottom-width: 2px;
  border-radius: 3px;
  background: #fff;
  color: #333;
  font-family: inherit;
  font-size: 0.75rem;
  line-height: 1.35;
  text-align: center;
}

.helper-description {
  margin: 0;
  max-width: 55rem;
  font-size: 0.85rem;
  line-height: 1.45;
}

.helpers-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.helper-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  height: auto;
  min-height: 30px;
  padding: 5px 10px;
  text-align: left;
}

.helper-button:focus-visible {
  outline: 2px solid #4345ac;
  outline-offset: 2px;
}

.helper-button:disabled {
  border-color: #ccc;
  background: #f3f3f3;
  color: #888;
  cursor: not-allowed;
}

.disabled-help {
  margin: 7px 0 0;
  color: #777;
  font-size: 0.75rem;
  line-height: 1.3;
}

@media (max-width: 620px) {
  .layout-tools {
    grid-template-columns: 1fr;
    height: 230px;
  }

  .layout-instructions {
    grid-template-columns: 1fr;
  }

  .layout-instructions li:last-child {
    grid-column: auto;
  }
}
</style>

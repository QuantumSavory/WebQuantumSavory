<template>
  <div class="layout-tools">
    <section class="layout-tools-card docs-card" aria-labelledby="layout-tools-docs-title">
      <h3 id="layout-tools-docs-title" class="card-title">
        {{ activeHelper ? activeHelper.label : 'Layout controls' }}
      </h3>

      <p v-if="activeHelper" class="helper-description" aria-live="polite">
        {{ activeHelper.description }}
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
        v-for="helper in helpers"
        :key="helper.id"
        type="button"
        class="helper-button"
        :disabled="disabled"
        :aria-describedby="disabled ? 'layout-tools-disabled-help' : undefined"
        @mouseenter="activeHelper = helper"
        @mouseleave="showDefaultDocs"
        @focus="activeHelper = helper"
        @blur="showDefaultDocs"
        @click="emit(helper.event)"
      >
        <component :is="helper.icon" :size="16" aria-hidden="true" />
        {{ helper.label }}
      </button>
      <p v-if="disabled" id="layout-tools-disabled-help" class="disabled-help">
        Layout helpers are unavailable after a simulation has started.
      </p>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Network, Star, Waypoints } from '@lucide/vue'

defineProps({
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'open-repeater-chain-generator',
  'open-star-network-generator',
  'open-graph-network-generator'
])

const helpers = [
  {
    id: 'repeater-chain',
    label: 'Repeater Chain Generator',
    description: 'Create an evenly spaced chain between two endpoints by cloning a configured repeater node and its template edge.',
    icon: Waypoints,
    event: 'open-repeater-chain-generator'
  },
  {
    id: 'star-network',
    label: 'Star Network Generator',
    description: 'Arrange up to 12 configured peripheral nodes evenly around a selected center node.',
    icon: Star,
    event: 'open-star-network-generator'
  },
  {
    id: 'graph-network',
    label: 'Graph Network Generator',
    description: 'Replace isolated templates with a deterministic 2D grid or an all-to-all network.',
    icon: Network,
    event: 'open-graph-network-generator'
  }
]

const activeHelper = ref(null)

function showDefaultDocs() {
  activeHelper.value = null
}
</script>

<style scoped>
.layout-tools {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(14rem, 1fr);
  gap: 10px;
  min-height: 150px;
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
  gap: 5px;
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
    min-height: 300px;
  }

  .layout-instructions {
    grid-template-columns: 1fr;
  }

  .layout-instructions li:last-child {
    grid-column: auto;
  }
}
</style>

<template>
  <div class="layout-tools">
    <section class="layout-tools-card help-card" aria-labelledby="layout-tools-help-title">
      <h3 id="layout-tools-help-title" class="card-title">
        {{ activeHelper ? activeHelper.label : 'Help' }}
      </h3>
      <p v-if="activeHelper" class="helper-description" aria-live="polite">
        {{ activeHelper.description }}
      </p>
      <ul v-else class="layout-instructions" aria-live="polite">
        <li><kbd>Alt</kbd>-click the map to add a node.</li>
        <li>Drag a node connector onto another node to create a physical edge.</li>
        <li>Hold <kbd>Shift</kbd> while connecting to create a virtual edge.</li>
        <li>Drag a node or visible curve handle to position it.</li>
        <li>In curve mode, click a selected edge to add a smooth handle.</li>
        <li>Click a handle for smooth → sharp → delete.</li>
      </ul>
    </section>

    <section class="layout-tools-card defaults-card" aria-labelledby="physical-defaults-title">
      <h3 id="physical-defaults-title" class="card-title">Physical Defaults</h3>
      <label class="field-label" for="default-refractive-index">
        Refractive index
      </label>
      <input
        id="default-refractive-index"
        class="number-input"
        type="number"
        min="0"
        step="any"
        :value="physicalConfig.refractiveIndex"
        :disabled="disabled"
        @change="updateRefractiveIndex"
      >
      <p class="field-help">Used for automatic propagation-delay calculations.</p>
    </section>

    <section class="layout-tools-card drawing-card" aria-labelledby="drawing-tools-title">
      <h3 id="drawing-tools-title" class="card-title">Drawing Tools</h3>
      <label class="checkbox-field" for="curve-editing-enabled">
        <input
          id="curve-editing-enabled"
          type="checkbox"
          :checked="curveEditingEnabled"
          :disabled="disabled"
          @change="emit('update:curve-editing-enabled', $event.target.checked)"
        >
        <span>Curve mode</span>
      </label>
      <label class="checkbox-field" for="physical-badges-visible">
        <input
          id="physical-badges-visible"
          type="checkbox"
          :checked="showPhysicalBadges"
          @change="emit('update:show-physical-badges', $event.target.checked)"
        >
        <span>Distance and delay badges</span>
      </label>
      <p v-if="disabled" id="layout-tools-disabled-help" class="disabled-help">
        Drawing is unavailable after a simulation has started.
      </p>
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
        @mouseleave="showDefaultHelp"
        @focus="activeHelper = helper"
        @blur="showDefaultHelp"
        @click="emit(helper.event)"
      >
        <component :is="helper.icon" :size="16" aria-hidden="true" />
        {{ helper.label }}
      </button>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Network, Star, Waypoints } from '@lucide/vue'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  physicalConfig: {
    type: Object,
    default: () => ({ refractiveIndex: 1.468 }),
  },
  curveEditingEnabled: { type: Boolean, default: false },
  showPhysicalBadges: { type: Boolean, default: true },
})

const emit = defineEmits([
  'open-repeater-chain-generator',
  'open-star-network-generator',
  'open-graph-network-generator',
  'update:refractive-index',
  'update:curve-editing-enabled',
  'update:show-physical-badges',
])

const helpers = [
  {
    id: 'repeater-chain',
    label: 'Repeater Chain Generator',
    description: 'Create an evenly spaced chain between two endpoints by cloning a configured repeater node and its template edge.',
    icon: Waypoints,
    event: 'open-repeater-chain-generator',
  },
  {
    id: 'star-network',
    label: 'Star Network Generator',
    description: 'Arrange up to 12 configured peripheral nodes evenly around a selected center node.',
    icon: Star,
    event: 'open-star-network-generator',
  },
  {
    id: 'graph-network',
    label: 'Graph Network Generator',
    description: 'Replace isolated templates with a deterministic 2D grid or an all-to-all network.',
    icon: Network,
    event: 'open-graph-network-generator',
  },
]

const activeHelper = ref(null)

function showDefaultHelp() {
  activeHelper.value = null
}

function updateRefractiveIndex(event) {
  const value = Number(event.target.value)
  if (!Number.isFinite(value) || value <= 0) {
    event.target.value = props.physicalConfig.refractiveIndex
    return
  }
  emit('update:refractive-index', value)
}
</script>

<style scoped>
.layout-tools {
  display: grid;
  grid-template-columns: minmax(17rem, 2fr) minmax(11rem, 1fr) minmax(13rem, 1fr) minmax(15rem, 1fr);
  gap: 10px;
  min-height: 150px;
  color: var(--app-color-text);
}

.layout-tools-card {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--app-color-border);
  border-radius: 4px;
  background: var(--app-color-surface);
}

.help-card {
  background: var(--app-color-surface-subtle);
}

.card-title {
  margin: 0 0 7px;
  color: var(--app-color-text);
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

kbd {
  display: inline-block;
  min-width: 1.4em;
  padding: 0 4px;
  border: 1px solid var(--app-color-border);
  border-bottom-width: 2px;
  border-radius: 3px;
  background: var(--app-color-surface);
  color: var(--app-color-text);
  font-family: inherit;
  font-size: 0.75rem;
  line-height: 1.35;
  text-align: center;
}

.helper-description,
.field-help,
.disabled-help {
  margin: 5px 0 0;
  font-size: 0.78rem;
  line-height: 1.4;
}

.field-label {
  display: block;
  margin-bottom: 4px;
  font-size: 0.8rem;
  font-weight: 600;
}

.number-input {
  width: 100%;
  min-height: 30px;
  padding: 4px 7px;
}

.drawing-card,
.helpers-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.checkbox-field {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.8rem;
}

.helper-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-height: 30px;
  padding: 5px 10px;
  text-align: left;
}

.helper-button:focus-visible {
  outline: var(--app-focus-ring-width) solid var(--app-color-primary);
  outline-offset: var(--app-focus-ring-offset);
}

.helper-button:disabled,
.number-input:disabled {
  border-color: var(--app-color-border);
  background: var(--app-color-disabled-surface);
  color: var(--app-color-disabled-text);
  cursor: not-allowed;
}

.disabled-help {
  color: var(--app-color-text-muted);
}

@media (max-width: 900px) {
  .layout-tools {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

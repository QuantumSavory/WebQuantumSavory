<template>
  <div class="slots-editor">
    <div v-if="slots.length" class="slots-list">
      <div
        v-for="slot in slots"
        :key="slot.id"
        class="slot-row-container"
        :class="{ 'expanded-slot': expandedSlotIds.has(slot.id) }"
      >
        <div class="slot-row">
          <div v-if="selectionEnabled" class="slot-cell checkbox-cell">
            <input
              type="checkbox"
              class="slot-checkbox"
              :aria-label="`Select slot ${slot.id}`"
              :checked="selectedSlotIds.has(slot.id)"
              :disabled="disabled"
              @change="emit('toggle-selection', slot.id)"
            >
          </div>
          <div class="slot-cell type-cell">
            <SlotIcon
              :register-slot="slot"
              :node="node"
              :class="{ 'slot-type-icon--disabled': disabled }"
              :style="{ cursor: disabled ? 'not-allowed' : 'pointer' }"
              @click="switchSlotType(slot)"
            />
          </div>
          <div class="slot-cell bg-noise-cell">
            <select
              class="bg-noise-select"
              :aria-label="`Background noise for slot ${slot.id}`"
              :value="slot.backgroundNoise.type"
              :disabled="disabled"
              @change="updateSlotBackground(slot, $event)"
            >
              <option
                v-for="option in backgroundNoiseOptions"
                :key="option.type"
                :value="option.type"
              >
                {{ option.type === 'default' ? 'No background noise' : option.type }}
              </option>
            </select>
          </div>
          <div class="slot-cell slot-order-cell">
            <button
              type="button"
              class="noborder"
              :disabled="disabled || slots[0] === slot"
              :aria-label="`Move slot ${slot.id} up`"
              @click="moveSlot(slot, -1)"
            >
              <ChevronUp :size="14" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="noborder"
              :disabled="disabled || slots.at(-1) === slot"
              :aria-label="`Move slot ${slot.id} down`"
              @click="moveSlot(slot, 1)"
            >
              <ChevronDown :size="14" aria-hidden="true" />
            </button>
          </div>
          <SlotEditor
            :register-slot="slot"
            :node="node"
            :show-results="showResults"
            :editing-locked="disabled"
            @delete-slot="removeSlot(slot)"
            @toggle-details="toggleSlotExpanded(slot)"
          />
        </div>
        <div v-if="expandedSlotIds.has(slot.id)" class="slot-row-expanded">
          <b>Parameters</b>
          <div class="bg-noise-param-rows">
            <div
              v-for="parameter in slot.backgroundNoise.parameters"
              :key="parameter.field"
              class="bg-noise-param-row"
            >
              <div
                v-tooltip.top="backgroundParameterDoc(slot, parameter)"
              >
                {{ parameter.field }}
              </div>
              <input
                type="number"
                :aria-label="`${parameter.field} for slot ${slot.id}`"
                :value="parameter.value"
                :disabled="disabled"
                @change="updateSlotNoiseParameter(slot, parameter, $event)"
              >
            </div>
          </div>
        </div>
      </div>
    </div>
    <button
      type="button"
      class="add-slot-btn noborder"
      :disabled="disabled"
      @click="addSlot"
    >
      <Plus :size="14" aria-hidden="true" />
      Add Slot
    </button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ChevronDown, ChevronUp, Plus } from '@lucide/vue'
import SlotIcon from '../map/SlotIcon.vue'
import { api } from '../../utils/ApiConnector'
import { deepClone } from '../../utils/protocolConstructors'
import SlotEditor from './SlotEditor.vue'

const props = defineProps({
  slots: {
    type: Array,
    required: true,
  },
  node: {
    type: Object,
    default: null,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  showResults: {
    type: Boolean,
    default: true,
  },
  selectionEnabled: {
    type: Boolean,
    default: false,
  },
  selectedSlotIds: {
    type: Set,
    default: () => new Set(),
  },
})

const emit = defineEmits([
  'add-slot',
  'remove-slot',
  'reorder-slot',
  'toggle-selection',
  'update-slot',
])

const expandedSlotIds = ref(new Set())
const backgroundNoiseOptions = computed(() => (
  api.config.value.bgNoiseOptions?.length
    ? api.config.value.bgNoiseOptions
    : [api.getDefaultBgNoise()]
))
const slotTypes = computed(() => {
  const configured = (api.config.value.slotTypes || [])
    .map(type => typeof type === 'string' ? type : type?.type)
    .filter(Boolean)
  return configured.length ? configured : ['Qubit', 'Qumode']
})

function addSlot() {
  if (props.disabled) return
  emit('add-slot', {
    type: slotTypes.value[0],
    backgroundNoise: api.getDefaultBgNoise(),
  })
}

function removeSlot(slot) {
  if (!props.disabled) emit('remove-slot', slot)
}

function moveSlot(slot, offset) {
  if (props.disabled) return
  const index = props.slots.findIndex(candidate => candidate.id === slot.id)
  const toIndex = index + offset
  if (index < 0 || toIndex < 0 || toIndex >= props.slots.length) return
  emit('reorder-slot', { slot, toIndex })
}

function switchSlotType(slot) {
  if (props.disabled) return
  const index = slotTypes.value.indexOf(slot.type)
  const type = slotTypes.value[(index + 1) % slotTypes.value.length]
  emit('update-slot', { slot, value: { type } })
}

function updateSlotBackground(slot, event) {
  const definition = backgroundNoiseOptions.value.find(
    option => option.type === event.target.value,
  )
  if (!definition) return
  const backgroundNoise = deepClone(definition)
  backgroundNoise.parameters = (definition.parameters || []).map(parameter => ({
    ...deepClone(parameter),
    value: null,
  }))
  emit('update-slot', {
    slot,
    value: { backgroundNoise },
  })
}

function updateSlotNoiseParameter(slot, parameter, event) {
  const value = Number(event.target.value)
  if (!Number.isFinite(value)) {
    event.target.value = parameter.value ?? ''
    return
  }
  emit('update-slot', {
    slot,
    value: {
      backgroundNoise: {
        ...slot.backgroundNoise,
        parameters: slot.backgroundNoise.parameters.map(candidate => (
          candidate.field === parameter.field
            ? { ...candidate, value }
            : { ...candidate }
        )),
      },
    },
  })
}

function backgroundParameterDoc(slot, parameter) {
  const definition = backgroundNoiseOptions.value.find(
    option => option.type === slot.backgroundNoise.type,
  )
  return definition?.parameters?.find(
    candidate => candidate.field === parameter.field,
  )?.doc || parameter.doc || 'NO DOC'
}

function toggleSlotExpanded(slot) {
  const expanded = new Set(expandedSlotIds.value)
  if (expanded.has(slot.id)) expanded.delete(slot.id)
  else expanded.add(slot.id)
  expandedSlotIds.value = expanded
}
</script>

<style scoped>
.slots-editor {
  min-width: 0;
}

.slots-list {
  margin-bottom: var(--app-space-2);
  overflow-x: hidden;
}

.slot-row {
  display: flex;
  height: 26px;
  align-items: center;
  border-bottom: 1px solid var(--app-color-border);
  font-size: 1rem;
}

.slot-row:hover {
  background: var(--app-color-surface-hover);
}

.slot-row-container {
  border: 1px solid transparent;
}

.slot-cell {
  display: flex;
  min-height: 25px;
  align-items: center;
  padding: 2px 3px;
}

.checkbox-cell,
.type-cell {
  width: 20px;
  min-width: 20px;
  justify-content: center;
}

.bg-noise-cell {
  min-width: 0;
  flex: 1;
}

.bg-noise-select {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 0.15rem 0.25rem;
  font-size: 1rem;
}

.slot-order-cell {
  padding-right: 0;
  padding-left: 0;
}

.slot-type-icon--disabled {
  opacity: 0.4;
}

.slot-checkbox {
  width: 16px;
  height: 16px;
}

.add-slot-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-1);
}

.expanded-slot {
  margin-bottom: 10px;
  border-color: color-mix(in srgb, var(--app-color-primary) 20%, transparent);
  border-radius: var(--app-radius-control) var(--app-radius-control) 0 0;
}

.expanded-slot .slot-row {
  margin-bottom: 0;
  border-bottom: 0;
  background: var(--app-color-primary-soft);
}

.slot-row-expanded {
  padding: 10px;
}

.bg-noise-param-rows {
  display: flex;
  flex-direction: column;
}

.bg-noise-param-row {
  display: flex;
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 3px;
}

.bg-noise-param-row input {
  width: 70px;
  margin-left: 5px;
  padding: 0 5px;
  text-align: right;
}
</style>

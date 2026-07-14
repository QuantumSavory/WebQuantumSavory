<template>
  <fieldset class="tag-target-selector" :disabled="disabled">
    <legend class="visually-hidden">Tag target</legend>

    <label>
      <span>Target</span>
      <select
        :value="target.kind"
        aria-label="Tag target kind"
        @change="changeKind($event.target.value)"
      >
        <option value="register">Register</option>
        <option value="slot">Slot</option>
        <option v-if="allowMessages" value="message_buffer">Message buffer</option>
      </select>
    </label>

    <label>
      <span>Node</span>
      <select
        :value="target.node_id"
        aria-label="Target node"
        @change="changeNode($event.target.value)"
      >
        <option v-for="(node, index) in nodes" :key="node.id" :value="node.id">
          {{ index + 1 }} · {{ node.name }}
        </option>
      </select>
    </label>

    <label v-if="target.kind === 'slot'">
      <span>Slot</span>
      <select
        :value="target.slot_id"
        aria-label="Target slot"
        @change="changeSlot($event.target.value)"
      >
        <option v-for="(slot, index) in slots" :key="slot.id" :value="slot.id">
          {{ index + 1 }} · {{ slot.type || 'Slot' }}
        </option>
      </select>
    </label>

    <label v-else-if="target.kind === 'register' && requireDestination">
      <span>Destination slot</span>
      <select
        :value="target.destination_slot_id"
        aria-label="Destination slot for register tag"
        @change="changeDestination($event.target.value)"
      >
        <option v-for="(slot, index) in slots" :key="slot.id" :value="slot.id">
          {{ index + 1 }} · {{ slot.type || 'Slot' }}
        </option>
      </select>
    </label>
  </fieldset>
</template>

<script setup>
import { computed, watchEffect } from 'vue'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ kind: 'register', node_id: '' })
  },
  nodes: {
    type: Array,
    default: () => []
  },
  allowMessages: {
    type: Boolean,
    default: true
  },
  requireDestination: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const target = computed(() => props.modelValue || {})
const selectedNode = computed(() => (
  props.nodes.find(node => String(node.id) === String(target.value.node_id))
  || props.nodes[0]
  || null
))
const slots = computed(() => selectedNode.value?.data?.slots || [])

function emitTarget(patch) {
  emit('update:modelValue', { ...target.value, ...patch })
}

function normalizedTarget() {
  const kind = props.allowMessages || target.value.kind !== 'message_buffer'
    ? (target.value.kind || 'register')
    : 'register'
  const nodeId = selectedNode.value?.id ?? ''
  const slotIds = new Set(slots.value.map(slot => String(slot.id)))
  const selectedSlot = slotIds.has(String(target.value.slot_id))
    ? target.value.slot_id
    : (slots.value[0]?.id ?? '')
  const destinationSlot = slotIds.has(String(target.value.destination_slot_id))
    ? target.value.destination_slot_id
    : (slots.value[0]?.id ?? '')
  return {
    kind,
    node_id: nodeId,
    ...(kind === 'slot' ? { slot_id: selectedSlot } : {}),
    ...(kind === 'register' && props.requireDestination
      ? { destination_slot_id: destinationSlot }
      : {})
  }
}

watchEffect(() => {
  const normalized = normalizedTarget()
  if (JSON.stringify(normalized) !== JSON.stringify(target.value)) {
    emit('update:modelValue', normalized)
  }
})

function changeKind(kind) {
  emitTarget({
    kind,
    slot_id: kind === 'slot' ? (slots.value[0]?.id ?? '') : undefined,
    destination_slot_id: kind === 'register' && props.requireDestination
      ? (slots.value[0]?.id ?? '')
      : undefined
  })
}

function changeNode(nodeId) {
  const node = props.nodes.find(candidate => String(candidate.id) === String(nodeId))
  const firstSlotId = node?.data?.slots?.[0]?.id ?? ''
  emitTarget({
    node_id: nodeId,
    slot_id: target.value.kind === 'slot' ? firstSlotId : undefined,
    destination_slot_id: target.value.kind === 'register' && props.requireDestination
      ? firstSlotId
      : undefined
  })
}

function changeSlot(slotId) {
  emitTarget({ slot_id: slotId })
}

function changeDestination(slotId) {
  emitTarget({ destination_slot_id: slotId })
}
</script>

<style scoped>
.tag-target-selector {
  display: flex;
  min-width: 0;
  gap: var(--app-space-3);
  margin: 0;
  padding: 0;
  border: 0;
}

.tag-target-selector label {
  display: grid;
  min-width: 120px;
  gap: 2px;
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
  font-weight: 600;
}

.tag-target-selector select {
  min-width: 120px;
  color: var(--app-color-text);
  background: var(--app-color-surface);
}

@media (max-width: 720px) {
  .tag-target-selector {
    flex-wrap: wrap;
  }
}
</style>

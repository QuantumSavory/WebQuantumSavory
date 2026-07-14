<template>
  <div class="tag-results" :aria-busy="busy">
    <p v-if="busy && !entries.length" class="tag-results-empty" role="status">
      Loading tags…
    </p>
    <p v-else-if="!entries.length" class="tag-results-empty">
      {{ emptyText }}
    </p>

    <ul v-else class="tag-result-list" aria-label="Tag results">
      <li v-for="entry in entries" :key="entry.id" class="tag-result-item">
        <div class="tag-result-summary">
          <span class="tag-chip tag-chip-type">{{ entryLabel(entry) }}</span>
          <span
            v-for="field in entryFields(entry)"
            :key="field.key"
            class="tag-chip"
            :class="chipClass(field)"
            :title="field.type"
          >
            <strong v-if="field.name">{{ field.name }}:</strong>
            {{ field.label }}
          </span>

          <span v-if="entry.slotId" class="tag-result-context">Slot {{ entry.slotId }}</span>
          <span v-if="entry.time != null" class="tag-result-context">Time {{ entry.time }}</span>
          <span v-if="entry.source" class="tag-result-context">Source {{ entry.source }}</span>
          <span v-if="entry.depth != null" class="tag-result-context">Depth {{ entry.depth }}</span>

          <span class="tag-result-actions">
            <button
              type="button"
              class="tag-icon-button noborder"
              :aria-label="isExpanded(entry) ? 'Hide rendered tag details' : 'Show rendered tag details'"
              :aria-expanded="isExpanded(entry)"
              @click="toggle(entry)"
            >
              <ChevronDown v-if="isExpanded(entry)" :size="15" aria-hidden="true" />
              <ChevronRight v-else :size="15" aria-hidden="true" />
            </button>
            <button
              v-if="deletable"
              type="button"
              class="tag-icon-button tag-delete-button noborder"
              :aria-label="`Delete tag ${entry.id}`"
              :disabled="busy"
              @click="emit('delete', entry)"
            >
              <Trash2 :size="15" aria-hidden="true" />
            </button>
          </span>
        </div>

        <dl v-if="isExpanded(entry)" class="tag-result-details">
          <div>
            <dt>Rendered</dt>
            <dd><code>{{ entry.rendered || 'Unavailable' }}</code></dd>
          </div>
          <div>
            <dt>Tag ID</dt>
            <dd><code>{{ entry.id }}</code></dd>
          </div>
        </dl>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ChevronDown, ChevronRight, Trash2 } from '@lucide/vue'

defineProps({
  entries: {
    type: Array,
    default: () => []
  },
  deletable: {
    type: Boolean,
    default: false
  },
  busy: {
    type: Boolean,
    default: false
  },
  emptyText: {
    type: String,
    default: 'No tags found for this target.'
  }
})

const emit = defineEmits(['delete'])
const expandedIds = ref(new Set())

function entryLabel(entry) {
  if (entry.kind === 'named') return entry.display_name
  if (entry.kind === 'general') return String(entry.head.value).split('.').pop()
  return 'Tag'
}

function formattedValue(value) {
  return String(value)
}

function entryFields(entry) {
  return entry.fields.map(field => ({
    key: `${field.position}:${field.name}`,
    name: field.name,
    type: field.type,
    value: field.value,
    label: formattedValue(field.value)
  }))
}

function chipClass(field) {
  const type = field.type.toLowerCase()
  if (type.includes('symbol')) return 'tag-chip-symbol'
  if (type.includes('datatype') || type.includes('type{')) return 'tag-chip-datatype'
  if (type.includes('int')) return 'tag-chip-integer'
  if (type.includes('float') || type.includes('real') || type.includes('number')) return 'tag-chip-float'
  return 'tag-chip-value'
}

function isExpanded(entry) {
  return expandedIds.value.has(entry.id)
}

function toggle(entry) {
  const next = new Set(expandedIds.value)
  if (next.has(entry.id)) next.delete(entry.id)
  else next.add(entry.id)
  expandedIds.value = next
}
</script>

<style scoped>
.tag-results {
  min-height: 52px;
}

.tag-results-empty {
  padding: var(--app-space-4);
  border: 1px dashed var(--app-color-border);
  border-radius: var(--app-radius-control);
  color: var(--app-color-text-muted);
  text-align: center;
}

.tag-result-list {
  display: grid;
  gap: var(--app-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.tag-result-item {
  padding: var(--app-space-2) var(--app-space-3);
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface);
}

.tag-result-summary {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--app-space-1);
  flex-wrap: wrap;
}

.tag-chip {
  display: inline-flex;
  max-width: 260px;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--app-color-tag-value-soft);
  color: var(--app-color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-chip-type {
  background: var(--app-color-tag-named-soft);
  color: var(--app-color-tag-named);
  font-weight: 700;
}

.tag-chip-symbol {
  background: var(--app-color-tag-symbol-soft);
  color: var(--app-color-tag-symbol);
}

.tag-chip-datatype {
  background: var(--app-color-tag-datatype-soft);
  color: var(--app-color-tag-datatype);
}

.tag-chip-integer,
.tag-chip-float {
  background: var(--app-color-tag-number-soft);
  color: var(--app-color-tag-number);
}

.tag-result-context {
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
}

.tag-result-actions {
  display: inline-flex;
  margin-left: auto;
}

.tag-icon-button {
  width: 26px;
  height: 26px;
}

.tag-delete-button {
  color: var(--app-color-danger);
}

.tag-result-details {
  display: grid;
  gap: var(--app-space-1);
  margin-top: var(--app-space-2);
  padding-top: var(--app-space-2);
  border-top: 1px solid var(--app-color-border);
}

.tag-result-details div {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: var(--app-space-2);
}

.tag-result-details dt {
  color: var(--app-color-text-muted);
  font-weight: 600;
}

.tag-result-details dd,
.tag-result-details code {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>

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
          <TagBadgeSequence
            :identity="entryIdentity(entry)"
            :fields="entryFields(entry)"
          />

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
          <div v-if="entry.rendered">
            <dt>Rendered</dt>
            <dd><code>{{ entry.rendered }}</code></dd>
          </div>
          <div v-if="entry.id">
            <dt>Tag ID</dt>
            <dd><code>{{ entry.id }}</code></dd>
          </div>
          <div v-if="entry.slotId">
            <dt>Slot ID</dt>
            <dd><code>{{ entry.slotId }}</code></dd>
          </div>
          <div v-if="entry.time != null">
            <dt>Time</dt>
            <dd>{{ entry.time }}</dd>
          </div>
          <div v-if="entry.source">
            <dt>Message source</dt>
            <dd>{{ entry.source }}</dd>
          </div>
          <div v-if="entry.depth != null">
            <dt>Buffer depth</dt>
            <dd>{{ entry.depth }}</dd>
          </div>
        </dl>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ChevronDown, ChevronRight, Trash2 } from '@lucide/vue'
import { shortTypeName } from '../../utils/tagExplorer.js'
import TagBadgeSequence from './TagBadgeSequence.vue'

const props = defineProps({
  entries: {
    type: Array,
    default: () => []
  },
  catalog: {
    type: Object,
    default: () => ({ named: [], general: [], dataTypes: [] })
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

function namedDefinition(entry) {
  return props.catalog.named?.find(definition => definition.typeId === entry.type_id) || null
}

function generalDefinition(entry) {
  const types = entry.fields.map(field => field.type)
  return props.catalog.general?.find(definition => (
    definition.headKind === entry.head?.type
    && definition.fields.length === types.length
    && types.every((type, index) => definition.fields[index]?.type === type)
  )) || null
}

function entryIdentity(entry) {
  if (entry.kind === 'named') {
    const definition = namedDefinition(entry)
    return {
      key: 'identity',
      kind: 'named',
      name: 'Tag',
      type: 'Named',
      value: entry.display_name || shortTypeName(entry.type_id),
      doc: definition?.doc || ''
    }
  }
  if (entry.kind === 'general') {
    const headType = entry.head?.type || 'Value'
    const rawValue = entry.head?.value ?? 'Tag'
    return {
      key: 'identity',
      kind: 'general',
      badgeKind: headType === 'Symbol' ? 'symbol' : 'datatype',
      name: 'Head',
      type: headType,
      value: headType === 'DataType' ? shortTypeName(rawValue) : rawValue,
      doc: ''
    }
  }
  return {
    key: 'identity',
    kind: 'general',
    name: 'Tag',
    type: 'Unknown',
    value: 'Tag',
    doc: ''
  }
}

function entryFields(entry) {
  const definition = entry.kind === 'named'
    ? namedDefinition(entry)
    : generalDefinition(entry)
  return entry.fields.map((field, index) => ({
    ...field,
    key: `${field.position}:${field.name}`,
    value: field.type === 'DataType' ? shortTypeName(field.value) : String(field.value),
    doc: definition?.fields?.[index]?.doc || ''
  }))
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
  gap: var(--app-space-2);
}

.tag-result-summary :deep(.tag-badge-sequence) {
  min-width: 0;
  flex: 1 1 auto;
}

.tag-result-actions {
  display: inline-flex;
  flex: 0 0 auto;
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
  grid-template-columns: 112px minmax(0, 1fr);
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

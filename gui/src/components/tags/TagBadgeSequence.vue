<template>
  <div
    class="tag-badge-sequence"
    :class="{ 'tag-badge-sequence-editable': editable }"
    data-testid="tag-badge-sequence"
  >
    <div
      class="tag-badge tag-badge-identity"
      :class="badgeClasses(identity)"
      :data-badge-kind="badgeKind(identity)"
      v-tooltip.bottom="badgeTooltip(identity, true)"
    >
      <small class="tag-badge-label">{{ identity.name || 'Tag' }}</small>
      <div class="tag-badge-value">
        <slot name="identity" :identity="identity">
          {{ displayValue(identity) }}
        </slot>
      </div>
      <small class="tag-badge-type">{{ identity.type || 'Tag' }}</small>
    </div>

    <div
      v-for="(field, index) in fields"
      :key="field.key || `${field.position || index}:${field.name || field.type}`"
      class="tag-badge tag-field-badge"
      :class="badgeClasses(field)"
      :data-badge-kind="badgeKind(field)"
      v-tooltip.bottom="badgeTooltip(field)"
    >
      <small class="tag-badge-label">{{ field.name || `Field ${index + 1}` }}</small>
      <div class="tag-badge-value">
        <slot name="field" :field="field" :index="index">
          {{ displayValue(field) }}
        </slot>
      </div>
      <small class="tag-badge-type">{{ field.type || 'Value' }}</small>
    </div>

    <div
      v-if="trailing"
      class="tag-badge tag-badge-trailing"
      :class="badgeClasses(trailing)"
      :data-badge-kind="badgeKind(trailing)"
      v-tooltip.bottom="badgeTooltip(trailing)"
    >
      <small class="tag-badge-label">{{ trailing.name || 'Next field' }}</small>
      <div class="tag-badge-value">
        <slot name="trailing" :trailing="trailing">
          {{ displayValue(trailing) }}
        </slot>
      </div>
      <small class="tag-badge-type">{{ trailing.type || 'Type' }}</small>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  identity: {
    type: Object,
    required: true
  },
  fields: {
    type: Array,
    default: () => []
  },
  trailing: {
    type: Object,
    default: null
  },
  editable: {
    type: Boolean,
    default: false
  }
})

function normalizedType(type) {
  return String(type || '').toLowerCase()
}

function badgeKind(badge) {
  if (badge.badgeKind) return badge.badgeKind
  if (badge.kind === 'named') return 'named'
  if (badge.termKind === 'wildcard') return 'wildcard'
  if (badge.termKind === 'predicate') return 'predicate'
  const type = normalizedType(badge.type)
  if (type.includes('symbol')) return 'symbol'
  if (type.includes('datatype') || type.includes('type{')) return 'datatype'
  if (
    type.includes('int')
    || type.includes('float')
    || type === 'real'
    || type === 'number'
  ) return 'number'
  return badge.kind === 'general' ? 'general' : 'value'
}

function badgeClasses(badge) {
  return [
    `tag-badge-${badgeKind(badge)}`,
    { 'tag-badge-editable': props.editable }
  ]
}

function displayValue(badge) {
  if (badge.termKind === 'wildcard') return 'Any value'
  if (badge.termKind === 'predicate') {
    if (badge.predicateKind === 'custom') return 'Custom predicate'
    return `${badge.operator || '=='} ${badge.value ?? ''}`.trim()
  }
  return badge.value ?? ''
}

function badgeTooltip(badge, identity = false) {
  if (badge.doc) return badge.doc
  const name = badge.name || (identity ? 'Tag identity' : 'Field')
  const type = badge.type || (identity ? 'Tag' : 'Value')
  return `**${name}**\n\nType: \`${type}\``
}
</script>

<style scoped>
.tag-badge-sequence {
  display: flex;
  min-width: 0;
  align-items: stretch;
  gap: var(--app-space-1);
  flex-wrap: wrap;
}

.tag-badge {
  --tag-badge-color: var(--app-color-text-muted);
  --tag-badge-soft: var(--app-color-tag-value-soft);
  display: inline-flex;
  min-width: 82px;
  max-width: min(320px, 100%);
  min-height: 58px;
  flex-direction: column;
  justify-content: space-between;
  padding: 3px 7px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: var(--app-radius-control);
  background: var(--tag-badge-soft);
  color: var(--tag-badge-color);
}

.tag-badge-editable {
  border-color: var(--tag-badge-color);
  background: var(--app-color-surface);
}

.tag-badge-named {
  --tag-badge-color: var(--app-color-tag-named);
  --tag-badge-soft: var(--app-color-tag-named-soft);
}

.tag-badge-general {
  --tag-badge-color: var(--app-color-tag-general);
  --tag-badge-soft: var(--app-color-tag-general-soft);
}

.tag-badge-symbol {
  --tag-badge-color: var(--app-color-tag-symbol);
  --tag-badge-soft: var(--app-color-tag-symbol-soft);
}

.tag-badge-datatype {
  --tag-badge-color: var(--app-color-tag-datatype);
  --tag-badge-soft: var(--app-color-tag-datatype-soft);
}

.tag-badge-number {
  --tag-badge-color: var(--app-color-tag-number);
  --tag-badge-soft: var(--app-color-tag-number-soft);
}

.tag-badge-wildcard {
  --tag-badge-color: var(--app-color-tag-wildcard);
  --tag-badge-soft: var(--app-color-tag-wildcard-soft);
}

.tag-badge-predicate {
  --tag-badge-color: var(--app-color-tag-predicate);
  --tag-badge-soft: var(--app-color-tag-predicate-soft);
}

.tag-badge-label,
.tag-badge-type {
  display: block;
  overflow: hidden;
  color: var(--tag-badge-color);
  font-size: 0.66rem;
  font-weight: 600;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-badge-label {
  text-transform: uppercase;
}

.tag-badge-type {
  opacity: 0.82;
}

.tag-badge-value {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--app-space-1);
  overflow-wrap: anywhere;
  color: var(--app-color-text);
  font-weight: 600;
  line-height: 1.25;
}

.tag-badge-identity {
  min-width: 170px;
}

.tag-badge-trailing {
  min-width: 135px;
  border-style: dashed;
}
</style>

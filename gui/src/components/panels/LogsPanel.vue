<template>
  <section class="panel-section logs-panel-content">
    <div class="logs-container">
      <div class="logs-header">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Search logs..."
          aria-label="Search logs"
          class="search-input"
        />
        <div class="logs-controls">
          <details ref="filtersDisclosure" class="log-filters">
            <summary title="Filter logs">
              <ListFilter :size="14" aria-hidden="true" />
              <span>Filters</span>
              <span v-if="activeFilterCount" class="filter-count">{{ activeFilterCount }}</span>
            </summary>
            <div class="log-filter-popover" aria-label="Structured log filters">
              <fieldset
                v-for="category in filterCategories"
                :key="category.key"
                class="filter-fieldset"
              >
                <legend>{{ category.label }}</legend>
                <div class="filter-options">
                  <label v-for="option in category.options" :key="option.value">
                    <input
                      v-model="filters[category.key]"
                      type="checkbox"
                      :value="option.value"
                    />
                    <span>{{ option.label }}</span>
                  </label>
                  <span v-if="category.options.length === 0" class="filter-empty">
                    None discovered
                  </span>
                </div>
              </fieldset>
              <fieldset class="filter-fieldset filter-time-range">
                <legend>Simulated time (inclusive)</legend>
                <label>
                  <span>From</span>
                  <input
                    v-model="filters.timeFrom"
                    type="number"
                    step="any"
                    aria-label="Simulated time from"
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    v-model="filters.timeTo"
                    type="number"
                    step="any"
                    aria-label="Simulated time to"
                  />
                </label>
              </fieldset>
              <button
                type="button"
                class="clear-filter-button"
                :disabled="!hasActiveFilters"
                @click="clearStructuredFilters"
              >
                Clear structured filters
              </button>
            </div>
          </details>
          <details ref="guideDisclosure" class="log-guide">
            <summary title="Open the log guide">
              <CircleHelp :size="14" aria-hidden="true" />
              <span>Log guide</span>
            </summary>
            <div class="log-guide-content">
              <section aria-labelledby="log-guide-severities">
                <h3 id="log-guide-severities">Severities</h3>
                <dl>
                  <div><dt>Debug</dt><dd>Diagnostic details for troubleshooting.</dd></div>
                  <div><dt>Info</dt><dd>Routine progress or status.</dd></div>
                  <div><dt>Success</dt><dd>An operation completed successfully.</dd></div>
                  <div><dt>Warning</dt><dd>A condition may need attention.</dd></div>
                  <div><dt>Error</dt><dd>An operation failed but was reported normally.</dd></div>
                  <div><dt>Panic</dt><dd>An unexpected simulator exception stopped the run.</dd></div>
                </dl>
              </section>
              <section aria-labelledby="log-guide-sources">
                <h3 id="log-guide-sources">Sources</h3>
                <dl>
                  <div><dt>App</dt><dd>Browser, project, map, and layout actions, with subsystem context when available.</dd></div>
                  <div><dt>Web API</dt><dd>Requests and responses handled by the web service.</dd></div>
                  <div><dt>Simulator</dt><dd>QuantumSavory runtime events.</dd></div>
                </dl>
              </section>
            </div>
          </details>
          <button
            v-if="allowClear && hasLogs"
            type="button"
            class="clear-logs-btn"
            @click="clearLogs"
          >
            Clear
          </button>
        </div>
      </div>

      <div v-if="hasLogs" class="log-filter-status" aria-live="polite">
        <span class="log-match-count">
          {{ filteredLogs.length }} matching / {{ normalizedLogs.length }} total
        </span>
        <div v-if="activeFilterChips.length" class="active-filter-chips">
          <button
            v-for="chip in activeFilterChips"
            :key="chip.key"
            type="button"
            class="active-filter-chip"
            :aria-label="`Remove ${chip.label} filter`"
            @click="removeFilterChip(chip)"
          >
            <span>{{ chip.label }}</span>
            <X :size="12" aria-hidden="true" />
          </button>
        </div>
        <button
          v-if="hasActiveCriteria"
          type="button"
          class="clear-all-filters"
          @click="clearAllCriteria"
        >
          Clear all
        </button>
      </div>

      <div
        v-if="isDisplayLimited"
        class="log-display-limit-notice"
        role="status"
      >
        Showing the latest {{ displayLogs.length }} of {{ filteredLogs.length }} matching logs.
      </div>

      <div class="logs-content">
        <div v-if="!hasLogs" class="empty-logs">
          No logs available
        </div>

        <div v-else-if="displayLogs.length === 0" class="empty-logs">
          No logs match the active search and filters.
        </div>

        <article
          v-for="(log, index) in displayLogs"
          :key="log.stableId"
          :class="[
            'log-entry-container',
            `log-${log.level}`,
            `log-source-${sourceClass(log.source)}`,
            { 'is-backend-source': log.source !== 'App' }
          ]"
          :data-log-id="log.stableId"
          :aria-label="`${log.level} log from ${sourceLabel(log)}`"
        >
          <div class="log-entry">
            <span
              v-if="showTimestamps && log.isStructured && log.simTime !== null"
              class="log-timestamp log-sim-time"
              :title="`Captured ${formatTimestamp(log.timestamp)}`"
            >
              t={{ formatSimulationTime(log.simTimeValue) }}
            </span>
            <time
              v-else-if="showTimestamps"
              class="log-timestamp"
              :datetime="log.timestamp || undefined"
            >
              {{ formatTimestamp(log.timestamp, true) }}
            </time>

            <button
              v-if="log.source === 'Simulator'"
              type="button"
              class="log-message-container message-disclosure"
              :aria-label="messageDisclosureLabel(log)"
              :aria-expanded="isMessageExpanded(log.stableId)"
              :aria-controls="messageDetailsId(log.stableId)"
              :title="messageDisclosureLabel(log)"
              @click="toggleMessage(log, index)"
            >
              <ChevronDown
                v-if="isMessageExpanded(log.stableId)"
                class="message-disclosure-icon"
                :size="15"
                aria-hidden="true"
              />
              <ChevronRight
                v-else
                class="message-disclosure-icon"
                :size="15"
                aria-hidden="true"
              />
              <span class="log-message" :title="log.message">{{ log.message }}</span>
              <span v-if="log.count > 1" class="log-count-badge-inline" :aria-label="`${log.count} occurrences`">
                {{ log.count }}
              </span>
            </button>

            <span v-else class="log-message-container">
              <span class="log-message" :title="log.message">{{ log.message }}</span>
              <span v-if="log.count > 1" class="log-count-badge-inline" :aria-label="`${log.count} occurrences`">
                {{ log.count }}
              </span>
            </span>

            <div class="log-metadata-badges" aria-label="Log metadata">
              <span class="log-metadata-badge log-severity-badge">{{ log.level }}</span>
              <span v-if="groupEventLabel(log)" class="log-metadata-badge">
                {{ groupEventLabel(log) }}
              </span>
              <span v-if="log.protocol" class="log-metadata-badge">{{ log.protocol }}</span>
              <span
                v-for="node in relatedNodes(log)"
                :key="node.id"
                class="log-metadata-badge log-node-badge"
                :title="`Simulator node ${node.id}`"
              >
                {{ node.name }}
              </span>
            </div>
            <span class="log-source">[{{ sourceLabel(log) }}]</span>
            <button
              type="button"
              class="raw-json-button"
              :aria-label="rawDisclosureLabel(log)"
              :aria-expanded="isRawExpanded(log.stableId)"
              :aria-controls="rawDetailsId(log.stableId)"
              :title="rawDisclosureLabel(log)"
              @click="toggleRaw(log, index)"
            >
              <Braces :size="15" aria-hidden="true" />
            </button>
          </div>

          <section
            v-if="log.source === 'Simulator' && isMessageExpanded(log.stableId)"
            :id="messageDetailsId(log.stableId)"
            class="log-extended log-message-details"
            aria-label="Structured simulator details"
          >
            <div class="log-detail-group">
              <h3>Context</h3>
              <dl class="structured-details">
                <div v-for="row in contextRows(log)" :key="row.label">
                  <dt>{{ row.label }}</dt>
                  <dd>{{ row.value }}</dd>
                </div>
              </dl>
            </div>
            <div v-if="Object.keys(log.eventData).length" class="log-detail-group">
              <h3>Event data</h3>
              <dl class="structured-details event-data-details">
                <div v-for="(value, key) in log.eventData" :key="key">
                  <dt>{{ humanizeLogField(key) }}</dt>
                  <dd>
                    <pre v-if="isCompositeValue(value)" class="detail-value">{{ formatDetailValue(value) }}</pre>
                    <span v-else>{{ formatDetailValue(value) }}</span>
                  </dd>
                </div>
              </dl>
            </div>
            <div v-if="log.level === 'panic'" class="log-detail-group panic-details">
              <h3>Panic details</h3>
              <dl class="structured-details">
                <div>
                  <dt>Exception message</dt>
                  <dd><pre class="detail-value panic-exception-message">{{ log.fullMessage }}</pre></dd>
                </div>
                <div v-if="log.exceptionType">
                  <dt>Exception type</dt>
                  <dd><pre class="detail-value panic-exception-type">{{ log.exceptionType }}</pre></dd>
                </div>
                <div v-if="log.stacktrace">
                  <dt>Stacktrace</dt>
                  <dd><pre class="detail-value panic-stacktrace">{{ log.stacktrace }}</pre></dd>
                </div>
              </dl>
            </div>
          </section>

          <section
            v-if="isRawExpanded(log.stableId)"
            :id="rawDetailsId(log.stableId)"
            class="log-extended log-raw-details"
            aria-label="Raw log JSON"
          >
            <h3>Raw JSON</h3>
            <pre class="extended-content raw-json-content">{{ log.rawText }}</pre>
          </section>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import {
  Braces,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ListFilter,
  X
} from '@lucide/vue'
import {
  LOG_LEVELS,
  LOG_SOURCES,
  emptyStructuredLogFilters,
  hasStructuredLogFilters,
  humanizeLogField,
  logMatchesStructuredFilters,
  normalizeLogGroup,
  normalizeLogRecord,
  resolveLogNodeName,
  structuredLogFacets
} from '../../utils/logRecords.js'

const props = defineProps({
  logs: {
    type: Array,
    default: () => []
  },
  maxLogs: {
    type: Number,
    default: 100
  },
  showTimestamps: {
    type: Boolean,
    default: true
  },
  allowClear: {
    type: Boolean,
    default: true
  },
  simulationLogGroups: {
    type: Array,
    default: () => []
  },
  nodes: {
    type: Array,
    default: () => []
  },
  projectKey: {
    type: String,
    default: ''
  },
  resetKey: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['clear-logs', 'log-click'])

const searchQuery = ref('')
const filters = reactive(emptyStructuredLogFilters())
const messageExpansion = ref(new Set())
const rawExpansion = ref(new Set())
const filtersDisclosure = ref(null)
const guideDisclosure = ref(null)
const fallbackIds = new WeakMap()
let nextFallbackId = 1

function stableRecordId(log, index) {
  if (log?.id !== undefined && log?.id !== null && String(log.id).length > 0) {
    return String(log.id)
  }
  if (log && typeof log === 'object') {
    if (!fallbackIds.has(log)) fallbackIds.set(log, `local-log-${nextFallbackId++}`)
    return fallbackIds.get(log)
  }
  return `local-log-primitive-${index}`
}

const normalizedLogs = computed(() => props.logs.map((log, index) => {
  const normalized = normalizeLogRecord(log, { nodes: props.nodes })
  normalized.stableId = stableRecordId(log, index)
  return normalized
}))
const facets = computed(() => structuredLogFacets(normalizedLogs.value))
const filterCategories = computed(() => [
  {
    key: 'severity',
    label: 'Severity',
    options: LOG_LEVELS.map(value => ({ value, label: humanizeLogField(value) }))
  },
  {
    key: 'source',
    label: 'Source',
    options: [...new Set([...LOG_SOURCES, ...facets.value.source])]
      .map(value => ({ value, label: value }))
  },
  {
    key: 'group',
    label: 'Group',
    options: [...new Set([
      ...props.simulationLogGroups.map(normalizeLogGroup).filter(Boolean),
      ...facets.value.group
    ])].map(value => ({ value, label: value }))
  },
  ...['event', 'protocol'].map(key => ({
    key,
    label: humanizeLogField(key),
    options: facets.value[key].map(value => ({ value, label: value }))
  })),
  {
    key: 'node',
    label: 'Related node',
    options: facets.value.node.map(value => ({
      value,
      label: resolveLogNodeName(value, props.nodes)
    }))
  }
])
const hasActiveFilters = computed(() => hasStructuredLogFilters(filters))
const hasActiveCriteria = computed(() => (
  searchQuery.value.trim().length > 0 || hasActiveFilters.value
))
const activeFilterCount = computed(() => (
  filterCategories.value.reduce(
    (total, category) => total + filters[category.key].length,
    0
  ) + Number(filters.timeFrom !== '') + Number(filters.timeTo !== '')
))
const optionLabels = computed(() => new Map(
  filterCategories.value.flatMap(category => category.options.map(option => [
    `${category.key}:${option.value}`,
    option.label
  ]))
))
const activeFilterChips = computed(() => {
  const chips = filterCategories.value.flatMap(category => (
    filters[category.key].map(value => ({
      key: `${category.key}:${value}`,
      category: category.key,
      value,
      label: `${category.label}: ${optionLabels.value.get(`${category.key}:${value}`) || value}`
    }))
  ))
  if (filters.timeFrom !== '') {
    chips.push({
      key: 'timeFrom',
      category: 'timeFrom',
      label: `Sim time from: ${filters.timeFrom}`
    })
  }
  if (filters.timeTo !== '') {
    chips.push({
      key: 'timeTo',
      category: 'timeTo',
      label: `Sim time to: ${filters.timeTo}`
    })
  }
  return chips
})
const filteredLogs = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  return normalizedLogs.value.filter(log => (
    (!query || log.searchText.includes(query))
    && logMatchesStructuredFilters(log, filters)
  ))
})
const displayLimit = computed(() => Math.max(0, Math.floor(props.maxLogs)))
const displayLogs = computed(() => {
  if (displayLimit.value === 0) return []
  return filteredLogs.value.slice(-displayLimit.value).reverse()
})
const isDisplayLimited = computed(() => filteredLogs.value.length > displayLimit.value)
const hasLogs = computed(() => props.logs.length > 0)

watch(normalizedLogs, logs => {
  const currentIds = new Set(logs.map(log => log.stableId))
  messageExpansion.value = new Set(
    [...messageExpansion.value].filter(id => currentIds.has(id))
  )
  rawExpansion.value = new Set(
    [...rawExpansion.value].filter(id => currentIds.has(id))
  )
})
watch(
  () => props.projectKey,
  (projectKey, previousProjectKey) => {
    if (projectKey !== previousProjectKey) resetExplorer()
  }
)
watch(
  () => props.resetKey,
  (resetKey, previousResetKey) => {
    if (resetKey !== previousResetKey) resetExplorer()
  }
)
watch(
  () => props.logs.length,
  (length, previousLength) => {
    if (length === 0 && previousLength > 0) resetExplorer()
  }
)

function resetDisclosureState() {
  messageExpansion.value = new Set()
  rawExpansion.value = new Set()
  if (filtersDisclosure.value) filtersDisclosure.value.open = false
  if (guideDisclosure.value) guideDisclosure.value.open = false
}

function clearStructuredFilters() {
  Object.assign(filters, emptyStructuredLogFilters())
}

function clearAllCriteria() {
  searchQuery.value = ''
  clearStructuredFilters()
}

function resetExplorer() {
  clearAllCriteria()
  resetDisclosureState()
}

function clearLogs() {
  resetExplorer()
  emit('clear-logs')
}

function removeFilterChip(chip) {
  if (chip.category === 'timeFrom' || chip.category === 'timeTo') {
    filters[chip.category] = ''
    return
  }
  filters[chip.category] = filters[chip.category].filter(value => value !== chip.value)
}

function isMessageExpanded(id) {
  return messageExpansion.value.has(id)
}

function isRawExpanded(id) {
  return rawExpansion.value.has(id)
}

function toggleExpansion(state, id) {
  const next = new Set(state.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  state.value = next
}

function toggleMessage(log, index) {
  toggleExpansion(messageExpansion, log.stableId)
  emit('log-click', log.original, index)
}

function toggleRaw(log, index) {
  toggleExpansion(rawExpansion, log.stableId)
  emit('log-click', log.original, index)
}

function messageDisclosureLabel(log) {
  const action = isMessageExpanded(log.stableId) ? 'Hide' : 'Show'
  return log.level === 'panic'
    ? `${action} panic details: ${log.message}`
    : `${action} structured Simulator details: ${log.message}`
}

function rawDisclosureLabel(log) {
  const action = isRawExpanded(log.stableId) ? 'Hide' : 'Show'
  return `${action} raw JSON for ${sourceLabel(log)} log`
}

function sourceLabel(log) {
  if (log.source === 'App' && log.subsystem) return `${log.source} · ${log.subsystem}`
  if (log.source === 'Simulator' && log.group) {
    return `${log.source} · ${humanizeLogField(log.group)}`
  }
  return log.source
}

function safeDomId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '-')
}

function messageDetailsId(id) {
  return `log-message-details-${safeDomId(id)}`
}

function rawDetailsId(id) {
  return `log-raw-details-${safeDomId(id)}`
}

function sourceClass(source) {
  return source.toLowerCase().replace(/\s+/g, '-')
}

function formatTimestamp(timestamp, onlyTime = false) {
  if (!timestamp) return 'n/a'

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp

  if (onlyTime) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

function formatSimulationTime(value) {
  return value === undefined || value === null ? 'n/a' : String(value)
}

function groupEventLabel(log) {
  return [log.group, log.event].filter(Boolean).join(' / ')
}

function relatedNodes(log) {
  return log.relatedNodeIds.map(nodeId => ({
    id: nodeId,
    name: resolveLogNodeName(nodeId, props.nodes)
  }))
}

function loggerOrigin(log) {
  const location = [log.file, log.line].filter(value => value !== null).join(':')
  return [log.moduleName, location, log.loggingId].filter(Boolean).join(' · ')
}

function contextRows(log) {
  const rows = [
    { label: 'Wall time', value: formatTimestamp(log.timestamp) },
    log.simTimeValue !== undefined
      ? { label: 'Simulation time', value: formatSimulationTime(log.simTimeValue) }
      : null,
    log.simProcessId !== null
      ? { label: 'Process', value: String(log.simProcessId) }
      : null,
    log.group ? { label: 'Group', value: log.group } : null,
    log.event ? { label: 'Event', value: log.event } : null,
    log.protocol ? { label: 'Protocol', value: log.protocol } : null,
    log.relatedNodeIds.length
      ? {
          label: 'Nodes',
          value: relatedNodes(log)
            .map(node => `${node.name} (#${node.id})`)
            .join(', ')
        }
      : null,
    loggerOrigin(log) ? { label: 'Logger origin', value: loggerOrigin(log) } : null,
    !log.isStructured ? { label: 'Message', value: log.fullMessage } : null
  ]
  return rows.filter(Boolean)
}

function isCompositeValue(value) {
  return value !== null && typeof value === 'object'
}

function formatDetailValue(value) {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}
</script>

<style scoped>
.logs-panel-content {
  min-height: 0;
}

.logs-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.logs-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: stretch;
  flex-direction: column;
  gap: var(--app-space-2);
  padding: var(--app-space-2) var(--app-space-4);
  border-bottom: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control) var(--app-radius-control) 0 0;
  background: var(--app-color-surface-subtle);
}

.logs-toolbar,
.logs-filter-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--app-space-3);
}

.logs-toolbar {
  flex-wrap: wrap;
}

.logs-filter-row {
  flex-wrap: wrap;
  row-gap: var(--app-space-2);
}

.logs-controls {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--app-space-3);
  margin-left: auto;
}

.log-filter-group {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: var(--app-space-1);
}

.log-filter-label {
  margin-right: 2px;
  color: var(--app-color-text-muted);
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
}

.log-filter-toggle {
  min-width: 0;
  height: 22px;
  padding: 2px 7px;
  border: 1px solid var(--app-color-border);
  background: var(--app-color-surface);
  color: var(--app-color-text-muted);
  font-size: 0.72rem;
  line-height: 1;
  white-space: nowrap;
}

.log-filter-toggle[aria-pressed="true"] {
  border-color: var(--app-color-primary);
  background: var(--app-color-primary-soft);
  color: var(--app-color-primary);
}

.log-filter-toggle:hover {
  border-color: var(--app-color-primary);
  background: var(--app-color-surface-hover);
  color: var(--app-color-primary);
}

.log-filter-toggle:focus-visible {
  outline: var(--app-focus-ring-width) solid var(--app-color-focus);
  outline-offset: 1px;
}

.search-input {
  min-width: 150px;
  height: 24px;
  padding: var(--app-space-1) var(--app-space-3);
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface);
  color: var(--app-color-text);
  font-size: 0.8rem;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.search-input:focus {
  outline: none;
  border-color: var(--app-color-focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-color-focus) 25%, transparent);
}

.search-input::placeholder {
  color: var(--app-color-text-muted);
}

.clear-logs-btn {
  height: 24px;
  padding: 3px 9px;
  border-color: var(--app-color-border);
  background: var(--app-color-surface-hover);
  color: var(--app-color-text-muted);
  font-size: 0.8rem;
}

.log-guide,
.log-filters {
  position: relative;
  color: var(--app-color-text);
  font-size: 0.8rem;
}

.log-guide summary,
.log-filters summary {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-1);
  min-height: 24px;
  padding: 3px 7px;
  border: 1px solid transparent;
  border-radius: var(--app-radius-control);
  color: var(--app-color-primary);
  cursor: pointer;
  list-style: none;
}

.log-guide summary::-webkit-details-marker,
.log-filters summary::-webkit-details-marker {
  display: none;
}

.log-guide summary:hover,
.log-filters summary:hover {
  border-color: var(--app-color-border);
  background: var(--app-color-surface-hover);
}

.log-guide summary:focus-visible,
.log-filters summary:focus-visible {
  outline: var(--app-focus-ring-width) solid var(--app-color-focus);
  outline-offset: var(--app-focus-ring-offset);
}

.filter-count {
  display: inline-flex;
  min-width: 17px;
  height: 17px;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--app-color-primary);
  color: var(--app-color-on-primary);
  font-size: 0.7rem;
  font-weight: 700;
}

.log-filter-popover {
  position: absolute;
  right: 0;
  bottom: calc(100% + var(--app-space-1));
  z-index: 6;
  display: grid;
  grid-template-columns: repeat(3, minmax(140px, 1fr));
  gap: var(--app-space-4);
  width: min(680px, calc(100vw - 40px));
  max-height: 420px;
  padding: var(--app-space-4);
  overflow: auto;
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-surface);
  background: var(--app-color-surface);
  box-shadow: var(--app-shadow-dialog);
}

.filter-fieldset {
  min-width: 0;
  padding: 0;
  border: 0;
}

.filter-fieldset legend {
  margin-bottom: var(--app-space-2);
  font-size: 0.78rem;
  font-weight: 700;
}

.filter-options {
  display: grid;
  gap: var(--app-space-1);
  max-height: 110px;
  overflow: auto;
}

.filter-options label,
.filter-time-range label {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  min-width: 0;
  font-size: 0.78rem;
}

.filter-options label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-empty {
  color: var(--app-color-text-muted);
  font-size: 0.76rem;
  font-style: italic;
}

.filter-time-range {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--app-space-2);
}

.filter-time-range legend {
  grid-column: 1 / -1;
}

.filter-time-range label {
  display: grid;
  gap: var(--app-space-1);
}

.filter-time-range input {
  min-width: 0;
  width: 100%;
  padding: var(--app-space-1) var(--app-space-2);
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface);
  color: var(--app-color-text);
}

.clear-filter-button {
  align-self: end;
  min-height: 28px;
  border-color: var(--app-color-border);
  background: var(--app-color-surface-hover);
  color: var(--app-color-text);
  font-size: 0.78rem;
}

.log-filter-status {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  padding: var(--app-space-2) var(--app-space-4);
  border-bottom: 1px solid var(--app-color-border);
  background: var(--app-color-surface);
  color: var(--app-color-text-muted);
  font-size: 0.76rem;
}

.log-match-count {
  flex: 0 0 auto;
  font-weight: 600;
}

.active-filter-chips {
  display: flex;
  min-width: 0;
  flex: 1;
  gap: var(--app-space-1);
  overflow-x: auto;
}

.active-filter-chip {
  display: inline-flex;
  min-height: 22px;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--app-space-1);
  padding: 2px 6px;
  border: 1px solid var(--app-color-border);
  border-radius: 999px;
  background: var(--app-color-surface-subtle);
  color: var(--app-color-text);
  font-size: 0.72rem;
}

.clear-all-filters {
  flex: 0 0 auto;
  min-height: 24px;
  padding: 2px 7px;
  border-color: transparent;
  background: transparent;
  color: var(--app-color-primary);
  font-size: 0.75rem;
}

.log-display-limit-notice {
  padding: var(--app-space-2) var(--app-space-4);
  border-bottom: 1px solid var(--app-color-border);
  background: var(--app-color-surface-subtle);
  color: var(--app-color-text-muted);
  font-size: 0.76rem;
}

.log-guide-content {
  position: absolute;
  top: calc(100% + var(--app-space-1));
  right: 0;
  z-index: 5;
  display: grid;
  grid-template-columns: minmax(270px, 1fr) minmax(250px, 1fr);
  gap: var(--app-space-5);
  width: min(590px, calc(100vw - 40px));
  max-height: 320px;
  padding: var(--app-space-4);
  overflow: auto;
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-surface);
  background: var(--app-color-surface);
  box-shadow: var(--app-shadow-dialog);
}

.log-guide-content h3 {
  margin-bottom: var(--app-space-2);
  font-size: 0.85rem;
}

.log-guide-content dl {
  display: grid;
  gap: var(--app-space-1);
}

.log-guide-content dl > div {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: var(--app-space-2);
}

.log-guide-content dt {
  font-weight: 700;
}

.log-guide-content dd {
  color: var(--app-color-text-muted);
}

.logs-content {
  flex: 1;
  height: max-content;
  max-height: 400px;
  padding: var(--app-space-3);
  overflow-y: auto;
  border: 1px solid var(--app-color-border);
  border-top: none;
  border-radius: 0 0 var(--app-radius-control) var(--app-radius-control);
  background: var(--app-color-surface);
}

.log-entry-container {
  margin-bottom: 3px;
  overflow: hidden;
  border-left: 3px solid var(--app-color-border);
  border-radius: 3px;
}

.log-entry {
  display: flex;
  min-height: 30px;
  align-items: center;
  gap: var(--app-space-3);
  padding: var(--app-space-2) 9px;
  background: var(--app-color-surface-subtle);
  color: var(--app-color-text);
  font-size: 0.9rem;
}

.log-timestamp {
  min-width: 80px;
  flex-shrink: 0;
  font-size: 0.8rem;
  white-space: nowrap;
}

.log-sim-time {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.log-message-container {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: var(--app-space-2);
}

.log-message {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-weight: 400;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.is-backend-source .log-message,
.is-backend-source .extended-content,
.raw-json-content {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.message-disclosure {
  width: auto;
  height: auto;
  min-height: 24px;
  justify-content: flex-start;
  padding: 2px 3px;
  overflow: hidden;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  text-align: left;
}

.message-disclosure:hover {
  border-color: currentColor;
  background: color-mix(in srgb, currentColor 8%, transparent);
  color: inherit;
}

.message-disclosure:focus-visible,
.raw-json-button:focus-visible {
  outline: var(--app-focus-ring-width) solid var(--app-color-focus);
  outline-offset: 1px;
}

.message-disclosure-icon {
  flex: 0 0 auto;
}

.log-count-badge-inline {
  display: inline-flex;
  min-width: 20px;
  height: 18px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  border: 1px solid currentColor;
  border-radius: 9px;
  font-size: 0.75rem;
  font-weight: 700;
}

.log-source {
  flex-shrink: 0;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.log-metadata-badges {
  display: flex;
  max-width: 42%;
  flex: 0 1 auto;
  align-items: center;
  gap: var(--app-space-1);
  overflow: hidden;
}

.log-metadata-badge {
  min-width: 0;
  padding: 2px 6px;
  overflow: hidden;
  border: 1px solid var(--app-color-border);
  border-radius: 999px;
  background: var(--app-color-surface);
  color: var(--app-color-text-muted);
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-severity-badge {
  text-transform: capitalize;
}

.log-node-badge {
  color: var(--app-color-text);
}

.raw-json-button {
  display: inline-flex;
  width: 25px;
  height: 25px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-color: transparent;
  background: transparent;
  color: currentColor;
  opacity: 0.75;
}

.raw-json-button:hover {
  border-color: currentColor;
  background: color-mix(in srgb, currentColor 8%, transparent);
  color: inherit;
  opacity: 1;
}

.log-extended {
  display: grid;
  gap: var(--app-space-3);
  margin: 0;
  padding: var(--app-space-3);
  border-top: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  background: color-mix(in srgb, currentColor 4%, var(--app-color-surface));
}

.log-extended h3 {
  margin-bottom: var(--app-space-1);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.structured-details {
  display: grid;
  gap: 1px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: var(--app-radius-control);
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.structured-details > div {
  display: grid;
  grid-template-columns: minmax(110px, 0.25fr) minmax(0, 1fr);
  gap: var(--app-space-3);
  padding: var(--app-space-2) var(--app-space-3);
  background: var(--app-color-surface);
}

.structured-details dt {
  font-size: 0.78rem;
  font-weight: 700;
}

.structured-details dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 0.82rem;
}

.detail-value {
  max-height: 240px;
  margin: 0;
  overflow: auto;
  color: inherit;
  font: inherit;
  white-space: pre-wrap;
}

.extended-content {
  max-height: 240px;
  margin: 0;
  padding: var(--app-space-3);
  overflow: auto;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: var(--app-radius-control);
  background: color-mix(in srgb, currentColor 3%, var(--app-color-surface));
  color: inherit;
  font-size: 0.85rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.panic-stacktrace {
  max-height: 360px;
}

.empty-logs {
  padding: var(--app-space-6);
  color: var(--app-color-text-muted);
  font-style: italic;
  text-align: center;
}

.log-info {
  border-left-color: #2196f3;
}

.log-info .log-entry {
  background: #f3f8ff;
  color: #1b2977;
}

.log-warning {
  border-left-color: #ff9800;
}

.log-warning .log-entry {
  background: #fff6e8;
  color: #663d00;
}

.log-error {
  border-left-color: var(--app-color-danger);
}

.log-error .log-entry {
  background: var(--app-color-danger-soft);
  color: #a90d02;
}

.log-debug {
  border-left-color: #9c27b0;
}

.log-debug .log-entry {
  background: #f6ecff;
  color: #4a0157;
}

.log-success {
  border-left-color: #4caf50;
}

.log-success .log-entry {
  background: #f5fff5;
  color: #056305;
}

.log-panic {
  border-left-width: 5px;
  border-left-color: var(--app-color-panic);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-color-panic) 25%, transparent);
}

.log-panic .log-entry {
  background: var(--app-color-panic-soft);
  color: var(--app-color-panic);
  font-weight: 600;
}

.log-panic .log-extended {
  background: color-mix(in srgb, var(--app-color-panic-soft) 70%, var(--app-color-surface));
  color: var(--app-color-panic);
}

@media (max-width: 720px) {
  .logs-toolbar,
  .logs-filter-row {
    align-items: stretch;
    flex-direction: column;
  }

  .log-filter-group {
    flex-wrap: wrap;
  }

  .logs-controls {
    width: 100%;
    justify-content: space-between;
    margin-left: 0;
  }

  .log-filter-popover {
    top: auto;
    right: auto;
    bottom: calc(100% + var(--app-space-1));
    left: 0;
    grid-template-columns: repeat(2, minmax(130px, 1fr));
  }

  .log-filter-status {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .active-filter-chips {
    order: 3;
    width: 100%;
    flex-basis: 100%;
  }

  .log-metadata-badges {
    display: none;
  }

  .log-guide-content {
    right: auto;
    left: 0;
    grid-template-columns: 1fr;
    width: min(430px, calc(100vw - 40px));
  }
}
</style>

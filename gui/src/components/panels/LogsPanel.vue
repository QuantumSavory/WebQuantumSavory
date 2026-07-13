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
          <details class="log-guide">
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
                  <div><dt>App</dt><dd>Browser, project, map, and layout actions.</dd></div>
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

      <div class="logs-content">
        <div v-if="!hasLogs" class="empty-logs">
          No logs available
        </div>

        <div v-else-if="searchQuery && displayLogs.length === 0" class="empty-logs">
          No logs match your search: "{{ searchQuery }}"
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
          :aria-label="`${log.level} log from ${log.source}`"
        >
          <div class="log-entry">
            <time
              v-if="showTimestamps"
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

            <span class="log-source">[{{ log.source }}]</span>
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
            aria-label="Complete simulator message"
          >
            <div class="log-detail-group">
              <h3>Complete message</h3>
              <pre class="extended-content">{{ log.fullMessage }}</pre>
            </div>
            <div v-if="log.level === 'panic' && log.exceptionType" class="log-detail-group">
              <h3>Exception type</h3>
              <pre class="extended-content panic-exception-type">{{ log.exceptionType }}</pre>
            </div>
            <div v-if="log.level === 'panic' && log.stacktrace" class="log-detail-group">
              <h3>Stacktrace</h3>
              <pre class="extended-content panic-stacktrace">{{ log.stacktrace }}</pre>
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
import { computed, ref, watch } from 'vue'
import { Braces, ChevronDown, ChevronRight, CircleHelp } from '@lucide/vue'
import { normalizeLogRecord } from '../../utils/logRecords.js'

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
  }
})

const emit = defineEmits(['clear-logs', 'log-click'])

const searchQuery = ref('')
const messageExpansion = ref(new Set())
const rawExpansion = ref(new Set())
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

const normalizedLogs = computed(() => props.logs.map((log, index) => ({
  ...normalizeLogRecord(log),
  stableId: stableRecordId(log, index)
})))

const filteredLogs = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return normalizedLogs.value
  return normalizedLogs.value.filter(log => log.searchText.includes(query))
})

const displayLogs = computed(() => {
  const limit = Math.max(0, Math.floor(props.maxLogs))
  if (limit === 0) return []
  return filteredLogs.value.slice(-limit).reverse()
})

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

function clearLogs() {
  emit('clear-logs')
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
    : `${action} complete Simulator message: ${log.message}`
}

function rawDisclosureLabel(log) {
  const action = isRawExpanded(log.stableId) ? 'Hide' : 'Show'
  return `${action} raw JSON for ${log.source} log`
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
  if (!timestamp) return ''

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
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
  padding: var(--app-space-3) var(--app-space-4);
  border-bottom: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control) var(--app-radius-control) 0 0;
  background: var(--app-color-surface-subtle);
}

.logs-controls {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
}

.search-input {
  min-width: 150px;
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

.log-guide {
  position: relative;
  color: var(--app-color-text);
  font-size: 0.8rem;
}

.log-guide summary {
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

.log-guide summary::-webkit-details-marker {
  display: none;
}

.log-guide summary:hover {
  border-color: var(--app-color-border);
  background: var(--app-color-surface-hover);
}

.log-guide summary:focus-visible {
  outline: var(--app-focus-ring-width) solid var(--app-color-focus);
  outline-offset: var(--app-focus-ring-offset);
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
  .logs-header {
    align-items: stretch;
    flex-direction: column;
  }

  .logs-controls {
    justify-content: space-between;
  }

  .log-guide-content {
    right: auto;
    left: 0;
    grid-template-columns: 1fr;
    width: min(430px, calc(100vw - 40px));
  }
}
</style>

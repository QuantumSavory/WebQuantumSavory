<template>
  <div class="mcp-panel">
    <div class="mcp-controls" aria-label="MCP controls">
      <AppButton
        v-if="serverState !== 'running'"
        :disabled="busy || nonOwningBinding"
        @click="initialize"
      >
        <template #icon><Play :size="15" /></template>
        Initialize MCP
      </AppButton>
      <AppButton
        v-else
        :disabled="busy || nonOwningBinding"
        @click="stop"
      >
        <template #icon><Square :size="15" /></template>
        Stop MCP
      </AppButton>
      <AppButton
        :disabled="busy || serverState !== 'running' || bridgeState.bound || nonOwningBinding"
        @click="bind"
      >
        <template #icon><Link :size="15" /></template>
        Bind current project
      </AppButton>
      <AppButton
        :disabled="busy || !bridgeState.bound"
        @click="unbind"
      >
        <template #icon><Unlink :size="15" /></template>
        Unbind
      </AppButton>
      <AppButton
        variant="secondary"
        :disabled="busy"
        @click="refresh"
      >
        <template #icon><RefreshCw :size="15" /></template>
        Refresh
      </AppButton>
      <AppButton
        variant="secondary"
        :disabled="busy || activity.length === 0"
        @click="clearActivity"
      >
        <template #icon><Trash2 :size="15" /></template>
        Clear history
      </AppButton>
    </div>

    <div v-if="error" class="mcp-error" role="alert">{{ error }}</div>

    <dl class="mcp-status-grid">
      <div>
        <dt>Listener</dt>
        <dd>{{ serverState }}</dd>
      </div>
      <div>
        <dt>Endpoint</dt>
        <dd class="mcp-endpoint">
          <code>{{ endpoint || 'Not running' }}</code>
          <button
            v-if="endpoint"
            type="button"
            class="icon-button"
            aria-label="Copy MCP endpoint"
            title="Copy MCP endpoint"
            @click="copyEndpoint"
          >
            <Copy :size="15" aria-hidden="true" />
          </button>
        </dd>
      </div>
      <div>
        <dt>Project</dt>
        <dd>{{ binding?.project_name || 'No project bound' }}</dd>
      </div>
      <div>
        <dt>Revision</dt>
        <dd>{{ collaboration.revision ?? bridgeState.revision ?? 0 }}</dd>
      </div>
      <div>
        <dt>Editor lease</dt>
        <dd>{{ leaseLabel }}</dd>
      </div>
      <div>
        <dt>Synchronization</dt>
        <dd>{{ synchronizationLabel }}</dd>
      </div>
      <div>
        <dt>Project state</dt>
        <dd>{{ bridgeState.dirty ? 'Unsaved changes' : 'Saved' }}</dd>
      </div>
      <div>
        <dt>Heartbeat</dt>
        <dd>{{ bridgeState.heartbeat || (binding ? 'Waiting' : 'Inactive') }}</dd>
      </div>
      <div>
        <dt>Agent</dt>
        <dd>{{ agentLabel }}</dd>
      </div>
    </dl>

    <p class="mcp-session-note">
      HTTP session initialization records client activity; it does not imply a permanently
      connected agent process.
    </p>

    <div class="mcp-activity-header">
      <h3>Protocol activity</h3>
      <label>
        Category
        <select v-model="categoryFilter">
          <option value="">All</option>
          <option v-for="category in categories" :key="category" :value="category">
            {{ category }}
          </option>
        </select>
      </label>
      <label>
        Status
        <select v-model="statusFilter">
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>
      </label>
    </div>

    <div class="mcp-activity" aria-live="polite">
      <p v-if="filteredActivity.length === 0" class="mcp-empty-activity">
        No matching MCP activity.
      </p>
      <details v-for="entry in filteredActivity" :key="entry.sequence">
        <summary>
          <time>{{ formatTime(entry.timestamp) }}</time>
          <span>{{ entry.category }} · {{ entry.phase }}</span>
          <span :class="['mcp-activity-status', `status-${entry.status || 'unknown'}`]">
            {{ entry.status || 'event' }}
          </span>
          <span>{{ entry.summary }}</span>
        </summary>
        <pre>{{ formattedEntry(entry) }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { Copy, Link, Play, RefreshCw, Square, Trash2, Unlink } from '@lucide/vue'
import AppButton from '../../components/ui/AppButton.vue'

const props = defineProps({
  active: {
    type: Boolean,
    default: false,
  },
  client: {
    type: Object,
    required: true,
  },
  bridge: {
    type: Object,
    required: true,
  },
  bridgeState: {
    type: Object,
    default: () => ({}),
  },
})

const status = ref({})
const activity = ref([])
const cursor = ref(0)
const busy = ref(false)
const error = ref('')
const categoryFilter = ref('')
const statusFilter = ref('')
let refreshTimer = null
let refreshAbortController = null

const server = computed(() => status.value.server || {})
const collaboration = computed(() => status.value.collaboration || {})
const binding = computed(() => collaboration.value.binding || props.bridgeState.binding || null)
const serverState = computed(() => server.value.state || 'stopped')
const endpoint = computed(() => server.value.endpoint || '')
const nonOwningBinding = computed(() => (
  binding.value
  && binding.value.editor_id
  && binding.value.editor_id !== props.bridgeState.editorId
))
const leaseLabel = computed(() => {
  if (!binding.value) return 'No live editor'
  const remaining = binding.value.lease_remaining_seconds
  if (!Number.isFinite(remaining)) return props.bridgeState.heartbeat === 'failed' ? 'Heartbeat failed' : 'Active'
  return `${remaining.toFixed(1)}s remaining`
})
const synchronizationLabel = computed(() => {
  if (!binding.value) return 'No project bound'
  if (binding.value.desynchronized || props.bridgeState.synchronized === false) {
    return 'Rebind required'
  }
  return 'Synchronized'
})
const agentLabel = computed(() => {
  if (serverState.value !== 'running') return 'Waiting for agent'
  if (server.value.last_request_at) {
    return `Last request ${formatTime(server.value.last_request_at)}`
  }
  if (server.value.session_initialized) return 'Session initialized'
  return 'Waiting for agent'
})
const categories = computed(() => (
  [...new Set(activity.value.map(entry => entry.category))].sort()
))
const filteredActivity = computed(() => activity.value.filter(entry => (
  (!categoryFilter.value || entry.category === categoryFilter.value)
  && (!statusFilter.value || entry.status === statusFilter.value)
)))

async function perform(action) {
  busy.value = true
  error.value = ''
  try {
    await action()
    await refresh()
  } catch (caught) {
    error.value = caught?.message || 'MCP operation failed.'
  } finally {
    busy.value = false
  }
}

const initialize = () => perform(() => props.bridge.initialize())
const stop = () => perform(() => props.bridge.stop())
const bind = () => perform(() => props.bridge.bindCurrentProject())
const unbind = () => perform(() => props.bridge.unbind())

async function refresh() {
  refreshAbortController?.abort()
  refreshAbortController = new AbortController()
  const [nextStatus, nextActivity] = await Promise.all([
    props.client.status({ signal: refreshAbortController.signal }),
    props.client.activity({
      cursor: cursor.value,
      limit: 500,
      signal: refreshAbortController.signal,
    }),
  ])
  status.value = nextStatus
  const incoming = nextActivity.activity || []
  if (incoming.length > 0) {
    const bySequence = new Map(
      [...activity.value, ...incoming].map(entry => [entry.sequence, entry]),
    )
    activity.value = [...bySequence.values()]
      .sort((left, right) => left.sequence - right.sequence)
      .slice(-500)
  }
  cursor.value = nextActivity.cursor ?? cursor.value
}

async function clearActivity() {
  await perform(async () => {
    await props.client.clearActivity()
    activity.value = []
    cursor.value = 0
  })
}

async function copyEndpoint() {
  await navigator.clipboard.writeText(endpoint.value)
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString()
}

function formattedEntry(entry) {
  return JSON.stringify(entry, null, 2)
}

function stopRefreshTimer() {
  clearInterval(refreshTimer)
  refreshTimer = null
  refreshAbortController?.abort()
  refreshAbortController = null
}

watch(
  () => props.active,
  active => {
    stopRefreshTimer()
    if (!active) return
    refresh().catch(caught => {
      if (caught?.name !== 'AbortError') error.value = caught?.message || 'Status refresh failed.'
    })
    refreshTimer = setInterval(() => {
      refresh().catch(caught => {
        if (caught?.name !== 'AbortError') error.value = caught?.message || 'Status refresh failed.'
      })
    }, 2_000)
  },
  { immediate: true },
)

onUnmounted(stopRefreshTimer)
</script>

<style scoped>
.mcp-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  padding: 0 8px 8px;
}

.mcp-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mcp-error {
  padding: 6px 8px;
  border: 1px solid var(--app-color-danger);
  border-radius: var(--app-radius-sm, 4px);
  color: var(--app-color-danger);
}

.mcp-status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, 1fr));
  gap: 6px 16px;
  margin: 0;
}

.mcp-status-grid div {
  min-width: 0;
}

.mcp-status-grid dt {
  color: var(--app-color-text-muted);
  font-size: 0.76rem;
  font-weight: 700;
}

.mcp-status-grid dd {
  margin: 1px 0 0;
  overflow-wrap: anywhere;
}

.mcp-endpoint {
  display: flex;
  align-items: center;
  gap: 5px;
}

.icon-button {
  display: inline-flex;
  padding: 3px;
  border: 0;
  background: transparent;
  color: var(--app-color-primary);
}

.mcp-session-note {
  margin: 0;
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
}

.mcp-activity-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mcp-activity-header h3 {
  margin: 0 auto 0 0;
  font-size: 0.9rem;
}

.mcp-activity-header label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.78rem;
}

.mcp-activity {
  min-height: 70px;
  overflow: auto;
}

.mcp-activity details {
  border-top: 1px solid var(--app-color-border);
}

.mcp-activity summary {
  display: grid;
  grid-template-columns: 80px 140px 72px 1fr;
  gap: 8px;
  padding: 5px 2px;
  cursor: pointer;
  font-size: 0.78rem;
}

.mcp-activity pre {
  max-height: 240px;
  margin: 0 0 6px;
  padding: 8px;
  overflow: auto;
  border-radius: 4px;
  background: var(--app-color-surface-subtle);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.mcp-activity-status {
  font-weight: 700;
}

.status-success {
  color: var(--app-color-primary);
}

.status-error {
  color: var(--app-color-danger);
}

.status-pending {
  color: var(--app-color-warning);
}

.mcp-empty-activity {
  color: var(--app-color-text-muted);
  font-size: 0.82rem;
}

@media (max-width: 800px) {
  .mcp-status-grid {
    grid-template-columns: 1fr;
  }
}
</style>

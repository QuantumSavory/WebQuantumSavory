<template>
  <BasePanel
    id="logsPanel"
    class="bottom-panel"
    :panel_id="panelId"
    title="Tools"
    :collapsable="collapsable"
    @collapsed-changed="emit('collapsed-changed', $event)"
  >
    <template #content>
      <div class="bottom-panel-body">
        <div class="bottom-tabs" role="tablist" aria-label="Bottom panel">
          <button
            id="bottom-panel-logs-tab"
            type="button"
            role="tab"
            class="bottom-tab"
            :class="{ active: activeTab === 'logs' }"
            :aria-selected="activeTab === 'logs'"
            aria-controls="bottom-panel-logs-content"
            :tabindex="activeTab === 'logs' ? 0 : -1"
            @click="activeTab = 'logs'"
            @keydown="handleTabKeydown($event, 0)"
          >
            <span>Logs</span>
            <span v-if="visibleLogBadges.length" class="log-tab-badges">
              <span
                v-for="badge in visibleLogBadges"
                :key="badge.level"
                :class="['log-count-badge', `badge-${badge.level}`]"
                :aria-label="`${badge.count} ${badge.level} logs`"
                :title="`${badge.count} ${badge.level} logs`"
              >
                {{ badge.count }}
              </span>
            </span>
          </button>
          <button
            id="bottom-panel-variables-tab"
            type="button"
            role="tab"
            class="bottom-tab"
            :class="{ active: activeTab === 'variables' }"
            :aria-selected="activeTab === 'variables'"
            aria-controls="bottom-panel-variables-content"
            :tabindex="activeTab === 'variables' ? 0 : -1"
            @click="activeTab = 'variables'"
            @keydown="handleTabKeydown($event, 1)"
          >
            Variables
          </button>
          <button
            id="bottom-panel-states-zoo-tab"
            type="button"
            role="tab"
            class="bottom-tab"
            :class="{ active: activeTab === 'states-zoo' }"
            :aria-selected="activeTab === 'states-zoo'"
            aria-controls="bottom-panel-states-zoo-content"
            :tabindex="activeTab === 'states-zoo' ? 0 : -1"
            @click="activeTab = 'states-zoo'"
            @keydown="handleTabKeydown($event, 2)"
          >
            States Zoo
          </button>
          <button
            id="bottom-panel-layout-tools-tab"
            type="button"
            role="tab"
            class="bottom-tab"
            :class="{ active: activeTab === 'layout-tools' }"
            :aria-selected="activeTab === 'layout-tools'"
            aria-controls="bottom-panel-layout-tools-content"
            :tabindex="activeTab === 'layout-tools' ? 0 : -1"
            @click="activeTab = 'layout-tools'"
            @keydown="handleTabKeydown($event, 3)"
          >
            Layout Tools
          </button>
          <button
            id="bottom-panel-export-script-tab"
            type="button"
            role="tab"
            class="bottom-tab"
            :class="{ active: activeTab === 'export-script' }"
            :aria-selected="activeTab === 'export-script'"
            aria-controls="bottom-panel-export-script-content"
            :tabindex="activeTab === 'export-script' ? 0 : -1"
            @click="activeTab = 'export-script'"
            @keydown="handleTabKeydown($event, 4)"
          >
            Export Script
          </button>
        </div>

        <section
          v-show="activeTab === 'logs'"
          id="bottom-panel-logs-content"
          class="bottom-tab-panel"
          role="tabpanel"
          aria-labelledby="bottom-panel-logs-tab"
          tabindex="0"
        >
          <LogsPanel
            :logs="logs"
            :max-logs="maxLogs"
            :show-timestamps="showTimestamps"
            :allow-clear="allowClear"
            @clear-logs="emit('clear-logs')"
            @log-click="forwardLogClick"
          />
        </section>

        <section
          v-show="activeTab === 'variables'"
          id="bottom-panel-variables-content"
          class="bottom-tab-panel variables-tab-panel"
          role="tabpanel"
          aria-labelledby="bottom-panel-variables-tab"
          tabindex="0"
        >
          <VariablesPanel
            :variables="variables"
            :project-data="projectData"
            :disabled="variablesDisabled"
          />
        </section>

        <section
          v-show="activeTab === 'states-zoo'"
          id="bottom-panel-states-zoo-content"
          class="bottom-tab-panel states-zoo-tab-panel"
          role="tabpanel"
          aria-labelledby="bottom-panel-states-zoo-tab"
          tabindex="0"
        >
          <StatesZooPanel
            :variables="variables"
            :project-data="projectData"
            :disabled="variablesDisabled"
          />
        </section>

        <section
          v-show="activeTab === 'layout-tools'"
          id="bottom-panel-layout-tools-content"
          class="bottom-tab-panel layout-tools-tab-panel"
          role="tabpanel"
          aria-labelledby="bottom-panel-layout-tools-tab"
          tabindex="0"
        >
          <LayoutToolsPanel
            :disabled="helpersDisabled"
            @open-repeater-chain-generator="emit('open-repeater-chain-generator')"
          />
        </section>

        <section
          v-show="activeTab === 'export-script'"
          id="bottom-panel-export-script-content"
          class="bottom-tab-panel export-script-tab-panel"
          role="tabpanel"
          aria-labelledby="bottom-panel-export-script-tab"
          tabindex="0"
        >
          <ExportScriptPanel
            :active="activeTab === 'export-script'"
            :payload="exportScriptPayload"
          />
        </section>
      </div>
    </template>
  </BasePanel>
</template>

<script setup>
import { computed, ref } from 'vue'
import BasePanel from './BasePanel.vue'
import ExportScriptPanel from './ExportScriptPanel.vue'
import LayoutToolsPanel from './LayoutToolsPanel.vue'
import LogsPanel from './LogsPanel.vue'
import StatesZooPanel from './StatesZooPanel.vue'
import VariablesPanel from './VariablesPanel.vue'

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
  helpersDisabled: {
    type: Boolean,
    default: false
  },
  variables: {
    type: Array,
    default: () => []
  },
  projectData: {
    type: Object,
    required: true
  },
  exportScriptPayload: {
    type: Object,
    required: true
  },
  variablesDisabled: {
    type: Boolean,
    default: false
  },
  collapsable: {
    type: Boolean,
    default: true
  },
  panelId: {
    type: String,
    default: 'logs_panel'
  }
})

const emit = defineEmits([
  'clear-logs',
  'log-click',
  'open-repeater-chain-generator',
  'collapsed-changed'
])

const activeTab = ref('logs')
const tabNames = ['logs', 'variables', 'states-zoo', 'layout-tools', 'export-script']

const logCounts = computed(() => {
  const counts = {
    info: 0,
    warning: 0,
    error: 0,
    success: 0,
    debug: 0
  }

  props.logs.forEach(log => {
    const level = log.level ? String(log.level).toLowerCase() : 'info'

    if (level === 'warning' || level === 'warn') {
      counts.warning += 1
    } else if (Object.hasOwn(counts, level)) {
      counts[level] += 1
    } else {
      counts.info += 1
    }
  })

  return counts
})

const visibleLogBadges = computed(() => (
  Object.entries(logCounts.value)
    .filter(([, count]) => count > 0)
    .map(([level, count]) => ({ level, count }))
))

function forwardLogClick(log, index) {
  emit('log-click', log, index)
}

function handleTabKeydown(event, currentIndex) {
  let nextIndex = currentIndex

  if (event.key === 'ArrowRight') {
    nextIndex = (currentIndex + 1) % tabNames.length
  } else if (event.key === 'ArrowLeft') {
    nextIndex = (currentIndex - 1 + tabNames.length) % tabNames.length
  } else if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = tabNames.length - 1
  } else {
    return
  }

  event.preventDefault()
  activeTab.value = tabNames[nextIndex]
  const tabs = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')
  tabs?.[nextIndex]?.focus()
}
</script>

<style scoped>
.bottom-panel {
  max-height: min(46vh, 430px);
}

.bottom-panel :deep(.panel-content) {
  min-height: 0;
  overflow: hidden;
}

.bottom-panel-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: min(40vh, 370px);
}

.bottom-tabs {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
  padding: 0 4px;
  border-bottom: 1px solid #d8d8d8;
}

.bottom-tab {
  position: relative;
  height: 30px;
  margin-bottom: -1px;
  padding: 4px 13px;
  border-color: transparent;
  border-bottom-color: #d8d8d8;
  border-radius: 4px 4px 0 0;
  background: transparent;
  color: #666;
  font-weight: 600;
}

.bottom-tab:hover {
  border-color: #d8d8d8;
  background: #f2f2f8;
  color: #333;
}

.bottom-tab.active {
  border-color: #d8d8d8;
  border-bottom-color: #fff;
  background: #fff;
  color: #4345ac;
}

.bottom-tab:focus-visible {
  z-index: 1;
  outline: 2px solid #4345ac;
  outline-offset: -3px;
}

.bottom-tab-panel {
  min-height: 0;
  padding-top: 8px;
  overflow: auto;
  outline: none;
}

.layout-tools-tab-panel {
  padding-right: 4px;
  padding-bottom: 4px;
}

.export-script-tab-panel {
  padding-right: 4px;
}

.variables-tab-panel,
.states-zoo-tab-panel {
  padding-right: 4px;
}

.log-tab-badges {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
}

.log-count-badge {
  display: inline-block;
  min-width: 16px;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
}

.badge-info {
  background: #2196f320;
  color: #1674bd;
}

.badge-warning {
  background: #ff980020;
  color: #a76000;
}

.badge-error {
  background: #f4433620;
  color: #c62318;
}

.badge-success {
  background: #4caf5020;
  color: #27812b;
}

.badge-debug {
  background: #9c27b020;
  color: #762086;
}
</style>

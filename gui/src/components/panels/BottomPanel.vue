<template>
  <ResizeBounding
    id="bottom-panel-resizer"
    class="bottom-panel-resizer"
    :width="panelWidth"
    :height="displayedHeight"
    :min-width="effectiveMinPanelWidth"
    :max-width="maxPanelWidth"
    :min-height="isCollapsed ? COLLAPSED_PANEL_HEIGHT : effectiveMinPanelHeight"
    :max-height="isCollapsed ? COLLAPSED_PANEL_HEIGHT : maxPanelHeight"
    directions="tr"
    :disabled="isCollapsed"
    :options="resizeOptions"
    @update:width="updatePanelWidth"
    @update:height="updatePanelHeight"
    @drag:end="persistPanelSize"
  >
    <BasePanel
      id="logsPanel"
      class="bottom-panel"
      :panel_id="panelId"
      title="Tools"
      :collapsable="collapsable"
      @collapsed-changed="handleCollapsedChanged"
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
              id="bottom-panel-description-tab"
              type="button"
              role="tab"
              class="bottom-tab"
              :class="{ active: activeTab === 'description' }"
              :aria-selected="activeTab === 'description'"
              aria-controls="bottom-panel-description-content"
              :tabindex="activeTab === 'description' ? 0 : -1"
              @click="activeTab = 'description'"
              @keydown="handleTabKeydown($event, 1)"
            >
              Description
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
              @keydown="handleTabKeydown($event, 2)"
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
              @keydown="handleTabKeydown($event, 3)"
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
              @keydown="handleTabKeydown($event, 4)"
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
              @keydown="handleTabKeydown($event, 5)"
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
            v-show="activeTab === 'description'"
            id="bottom-panel-description-content"
            class="bottom-tab-panel description-tab-panel"
            role="tabpanel"
            aria-labelledby="bottom-panel-description-tab"
            tabindex="0"
          >
            <DescriptionPanel
              :key="projectData.name"
              :model-value="projectData.description"
              @update:model-value="emit('update-description', $event)"
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
              @open-star-network-generator="emit('open-star-network-generator')"
              @open-graph-network-generator="emit('open-graph-network-generator')"
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

    <div
      v-if="!isCollapsed"
      class="keyboard-resize-target height-resize-target"
      role="separator"
      tabindex="0"
      aria-label="Resize Tools panel height"
      aria-orientation="horizontal"
      :aria-valuemin="effectiveMinPanelHeight"
      :aria-valuemax="maxPanelHeight"
      :aria-valuenow="panelHeight"
      aria-keyshortcuts="ArrowUp ArrowDown Home End"
      data-testid="bottom-panel-height-resize-target"
      @keydown="handleResizeKeydown('height', $event)"
    />
    <div
      v-if="!isCollapsed"
      class="keyboard-resize-target width-resize-target"
      role="separator"
      tabindex="0"
      aria-label="Resize Tools panel width"
      aria-orientation="vertical"
      :aria-valuemin="effectiveMinPanelWidth"
      :aria-valuemax="maxPanelWidth"
      :aria-valuenow="panelWidth"
      aria-keyshortcuts="ArrowLeft ArrowRight Home End"
      data-testid="bottom-panel-width-resize-target"
      @keydown="handleResizeKeydown('width', $event)"
    />

    <template #knob>
      <Grip class="resize-knob" :size="15" aria-hidden="true" />
    </template>
  </ResizeBounding>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Grip } from '@lucide/vue'
import ResizeBounding from 'vue3-resize-bounding'
import BasePanel from './BasePanel.vue'
import DescriptionPanel from './DescriptionPanel.vue'
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
  },
  rightSidebarVisible: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits([
  'clear-logs',
  'log-click',
  'update-description',
  'open-repeater-chain-generator',
  'open-star-network-generator',
  'open-graph-network-generator',
  'collapsed-changed'
])

const activeTab = ref('logs')
const tabNames = ['logs', 'description', 'variables', 'states-zoo', 'layout-tools', 'export-script']

const PANEL_SIZE_STORAGE_KEY = 'bottomPanel_size'
const DEFAULT_PANEL_WIDTH = 800
const DEFAULT_PANEL_HEIGHT = 180
const MIN_PANEL_WIDTH = 480
const MIN_PANEL_HEIGHT = 180
const COLLAPSED_PANEL_HEIGHT = 36
const PANEL_LEFT_OFFSET = 50
const VIEWPORT_EDGE_GAP = 10
const RIGHT_SIDEBAR_WIDTH = 320
const RIGHT_SIDEBAR_OFFSET = 10
const RIGHT_SIDEBAR_GAP = 10
const PANEL_TOP_LIMIT = 50
const KEYBOARD_RESIZE_STEP = 16

const viewportWidth = ref(window.innerWidth)
const viewportHeight = ref(window.innerHeight)
const isCollapsed = ref(
  props.collapsable && localStorage.getItem(`panelCollapsed_${props.panelId}`) === 'true'
)

const maxPanelWidth = computed(() => {
  const viewportLimit = Math.max(
    1,
    viewportWidth.value - PANEL_LEFT_OFFSET - VIEWPORT_EDGE_GAP
  )
  if (!props.rightSidebarVisible) return viewportLimit

  const sidebarLimit = viewportWidth.value
    - PANEL_LEFT_OFFSET
    - RIGHT_SIDEBAR_WIDTH
    - RIGHT_SIDEBAR_OFFSET
    - RIGHT_SIDEBAR_GAP
  return Math.max(1, sidebarLimit)
})

const maxPanelHeight = computed(() => (
  Math.max(1, viewportHeight.value - PANEL_TOP_LIMIT)
))
const effectiveMinPanelWidth = computed(() => Math.min(MIN_PANEL_WIDTH, maxPanelWidth.value))
const effectiveMinPanelHeight = computed(() => Math.min(MIN_PANEL_HEIGHT, maxPanelHeight.value))

const storedPanelSize = loadPanelSize()
const panelWidth = ref(clamp(
  storedPanelSize?.width ?? DEFAULT_PANEL_WIDTH,
  effectiveMinPanelWidth.value,
  maxPanelWidth.value
))
const panelHeight = ref(clamp(
  storedPanelSize?.height ?? DEFAULT_PANEL_HEIGHT,
  effectiveMinPanelHeight.value,
  maxPanelHeight.value
))
const displayedHeight = computed(() => (
  isCollapsed.value ? COLLAPSED_PANEL_HEIGHT : panelHeight.value
))

const resizeOptions = {
  activeAreaWidth: 12,
  splitterWidthNormal: 2,
  splitterWidthActive: 3,
  position: 'internal',
  touchActions: true,
  cursor: {
    horizontal: 'ew-resize',
    vertical: 'ns-resize'
  },
  knob: {
    show: true,
    normalHidden: false
  }
}

watch([maxPanelWidth, maxPanelHeight], () => {
  const nextWidth = clamp(panelWidth.value, effectiveMinPanelWidth.value, maxPanelWidth.value)
  const nextHeight = clamp(panelHeight.value, effectiveMinPanelHeight.value, maxPanelHeight.value)
  const dimensionsChanged = nextWidth !== panelWidth.value || nextHeight !== panelHeight.value

  panelWidth.value = nextWidth
  panelHeight.value = nextHeight
  if (dimensionsChanged) persistPanelSize()
})

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

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function loadPanelSize() {
  const savedSize = localStorage.getItem(PANEL_SIZE_STORAGE_KEY)
  if (!savedSize) return null

  try {
    const parsedSize = JSON.parse(savedSize)
    const hasValidWidth = Number.isFinite(parsedSize?.width) && parsedSize.width >= MIN_PANEL_WIDTH
    const hasValidHeight = Number.isFinite(parsedSize?.height) && parsedSize.height >= MIN_PANEL_HEIGHT
    if (!hasValidWidth || !hasValidHeight) throw new Error('Invalid panel dimensions')

    return {
      width: Math.round(parsedSize.width),
      height: Math.round(parsedSize.height)
    }
  } catch (error) {
    console.warn('Ignoring invalid saved Tools panel dimensions')
    localStorage.removeItem(PANEL_SIZE_STORAGE_KEY)
    return null
  }
}

function persistPanelSize() {
  localStorage.setItem(PANEL_SIZE_STORAGE_KEY, JSON.stringify({
    width: panelWidth.value,
    height: panelHeight.value
  }))
}

function updatePanelWidth(width) {
  panelWidth.value = clamp(Math.round(width), effectiveMinPanelWidth.value, maxPanelWidth.value)
}

function updatePanelHeight(height) {
  panelHeight.value = clamp(Math.round(height), effectiveMinPanelHeight.value, maxPanelHeight.value)
}

function handleCollapsedChanged(collapsed) {
  isCollapsed.value = collapsed
  emit('collapsed-changed', collapsed)
}

function handleResizeKeydown(dimension, event) {
  const isWidth = dimension === 'width'
  const currentValue = isWidth ? panelWidth.value : panelHeight.value
  const minimum = isWidth ? effectiveMinPanelWidth.value : effectiveMinPanelHeight.value
  const maximum = isWidth ? maxPanelWidth.value : maxPanelHeight.value
  const decreaseKey = isWidth ? 'ArrowLeft' : 'ArrowDown'
  const increaseKey = isWidth ? 'ArrowRight' : 'ArrowUp'
  let nextValue = currentValue

  if (event.key === decreaseKey) {
    nextValue -= KEYBOARD_RESIZE_STEP
  } else if (event.key === increaseKey) {
    nextValue += KEYBOARD_RESIZE_STEP
  } else if (event.key === 'Home') {
    nextValue = minimum
  } else if (event.key === 'End') {
    nextValue = maximum
  } else {
    return
  }

  event.preventDefault()
  if (isWidth) {
    updatePanelWidth(nextValue)
  } else {
    updatePanelHeight(nextValue)
  }
  persistPanelSize()
}

function updateViewportSize() {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
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

onMounted(() => {
  window.addEventListener('resize', updateViewportSize)
  persistPanelSize()
})

onUnmounted(() => {
  window.removeEventListener('resize', updateViewportSize)
})
</script>

<style scoped>
.bottom-panel-resizer {
  position: relative;
}

.bottom-panel {
  width: 100%;
  height: 100%;
  max-height: none;
}

.bottom-panel :deep(.panel-content) {
  min-height: 0;
  overflow: hidden;
}

.bottom-panel-body {
  display: flex;
  height: 100%;
  flex-direction: column;
  min-height: 0;
  max-height: none;
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
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  padding-top: 8px;
  overflow: auto;
  outline: none;
}

.bottom-tab-panel > * {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
}

.bottom-tab-panel :deep(.logs-content) {
  height: auto;
  max-height: none;
}

.description-tab-panel :deep(.description-editor) {
  height: 100%;
}

.description-tab-panel :deep(.description-textarea) {
  flex: 1 1 auto;
}

.keyboard-resize-target {
  position: absolute;
  z-index: 20;
  pointer-events: none;
}

.keyboard-resize-target:focus-visible {
  outline: none;
  background: #4345ac;
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px #4345ac;
}

.height-resize-target {
  top: 0;
  right: 18px;
  left: 18px;
  height: 4px;
  cursor: ns-resize;
}

.width-resize-target {
  top: 18px;
  right: 0;
  bottom: 18px;
  width: 4px;
  cursor: ew-resize;
}

.resize-knob {
  color: #4345ac;
}

.layout-tools-tab-panel {
  padding-right: 4px;
  padding-bottom: 4px;
}

.export-script-tab-panel {
  padding-right: 4px;
}

.variables-tab-panel,
.states-zoo-tab-panel,
.description-tab-panel {
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

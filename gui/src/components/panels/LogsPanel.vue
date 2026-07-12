<template>
  <section class="panel-section logs-panel-content">
    <div class="logs-container">
        <div class="logs-header">
          <input 
            v-model="searchQuery"
            type="text"
            placeholder="Search logs..."
            class="search-input"
          />
          <div class="logs-controls">
            <button 
              v-if="allowClear && hasLogs" 
              class="clear-logs-btn" 
              @click="clearLogs"
            >
              Clear
            </button>
          </div>
        </div>
        
        <div class="logs-content">
          <!-- Empty state -->
          <div v-if="!hasLogs" class="empty-logs">
            No logs available
          </div>
          
          <!-- No search results -->
          <div v-else-if="searchQuery && displayLogs.length === 0" class="empty-logs">
            No logs match your search: "{{ searchQuery }}"
          </div>
          
          <!-- Real log entries -->
          <div 
            v-for="(log, index) in displayLogs" 
            :key="log.id || index"
            :class="['log-entry-container', getLogClass(log.level)]"
          >
            <!-- Main log row -->
            <div 
              :class="['log-entry', { 'has-extended': log.extendedInfo || log.collapsedLogs?.length > 0, 'expanded': log.expanded }]"
              @click="handleLogClick(log, index)"
            >
              <span v-if="showTimestamps" class="log-timestamp">
                {{ formatTimestamp(log.timestamp, true) }}
              </span>
              <span class="log-message-container" :title="log.message">
                <span class="log-message">
                  {{ log.message }}
                </span>
                <span v-if="log.count && log.count > 1" class="log-count-badge-inline">
                  ( {{ log.count }} )
                </span>
                <span v-if="log.extendedInfo || log.collapsedLogs?.length > 0" class="expand-indicator">
                  <ChevronDown v-if="log.expanded" :size="13" aria-hidden="true" />
                  <ChevronRight v-else :size="13" aria-hidden="true" />
                </span>
              </span>
              <span v-if="log.source" class="log-source">[{{ log.source }}]</span>
            </div>
            
            <!-- Extended info (shown when expanded) -->
            <div v-if="log.extendedInfo && log.expanded" class="log-extended">
              <pre class="extended-content">{{ formatExtendedInfo(log.extendedInfo) }}</pre>
            </div>
          </div>
        </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { ChevronDown, ChevronRight } from '@lucide/vue'

// Props
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

// Emits
const emit = defineEmits(['clear-logs', 'log-click'])

// Reactive state
const searchQuery = ref('')

// Computed properties
const filteredLogs = computed(() => {
  let logs = props.logs
  
  // Filter by search query if provided
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    logs = logs.filter(log => 
      log.message && log.message.toLowerCase().includes(query)
    )
  }
  
  return logs
})

const displayLogs = computed(() => {
  // Show most recent logs first, limited by maxLogs
  return filteredLogs.value.slice(-props.maxLogs).reverse()
})

const hasLogs = computed(() => {
  return props.logs.length > 0
})

// Methods
function clearLogs() {
  emit('clear-logs')
}

async function handleLogClick(log, index) {
  console.log('🔍 LogsPanel handleLogClick called:', { 
    message: log.message, 
    hasExtendedInfo: !!log.extendedInfo, 
    collapsedLogsCount: log.collapsedLogs?.length,
    currentExpanded: log.expanded,
    logId: log.id
  })
  
  // Toggle expansion for logs with extended info or collapsed logs
  if (log.extendedInfo || (log.collapsedLogs && log.collapsedLogs.length > 0)) {
    log.expanded = !log.expanded
    console.log('✅ Toggled expanded to:', log.expanded)
    
    // Force reactivity update
    await nextTick()
    console.log('🔄 After nextTick, expanded state:', log.expanded)
  } else {
    console.log('❌ No extended info or collapsed logs, not toggling')
  }
  
  emit('log-click', log, index)
}

// Helper function to format timestamp
function formatTimestamp(timestamp, onlyTime = false) {
  if (!timestamp) return ''
  
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return timestamp
  
  if( onlyTime ){
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
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

// Log level styling helper
function getLogClass(level) {
  // Ensure level is a string before calling toLowerCase
  const levelStr = level ? String(level).toLowerCase() : 'info'
  switch (levelStr) {
    case 'error': return 'log-error'
    case 'warning': 
    case 'warn': return 'log-warning'
    case 'info': return 'log-info'
    case 'debug': return 'log-debug'
    case 'success': return 'log-success'
    default: return 'log-info'
  }
}

// Format extended info to convert escape sequences in strings
function formatExtendedInfo(extendedInfo) {
  if (!extendedInfo) return extendedInfo
  
  try {
    // Parse the JSON
    const parsed = JSON.parse(extendedInfo)
    
    // Convert escape sequences in all string values
    const processed = processObject(parsed)
    
    // Format with custom stringifier that handles newlines/tabs in strings
    return stringifyWithMultilineStrings(processed, 2)
  } catch (e) {
    // If not valid JSON, just unescape any escape sequences in the string
    return extendedInfo
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
  }
}

// Helper to recursively process objects and unescape string values
function processObject(obj) {
  if (typeof obj === 'string') {
    // Unescape escape sequences in strings
    return obj
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\\\/g, '\\')
  } else if (Array.isArray(obj)) {
    return obj.map(item => processObject(item))
  } else if (obj && typeof obj === 'object') {
    const processed = {}
    for (const key in obj) {
      processed[key] = processObject(obj[key])
    }
    return processed
  }
  return obj
}

// Custom JSON stringify that handles multiline strings
function stringifyWithMultilineStrings(obj, indent) {
  return stringifyValue(obj, '', indent)
}

function stringifyValue(value, prefix, indent) {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  
  const type = typeof value
  
  if (type === 'string') {
    // Check if string contains actual newlines or tabs
    const hasNewlines = value.includes('\n')
    const hasTabs = value.includes('\t')
    
    if (!hasNewlines && !hasTabs) {
      // Normal string
      return JSON.stringify(value)
    }
    
    // String with newlines - format specially for display
    // Output content with actual newlines for display (not valid JSON)
    const lines = value.split('\n')
    let result = '"'
    
    // Render each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Escape quotes and backslashes for display
      result += line.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      if (i < lines.length - 1) {
        // Add newline and indentation for continuation lines
        // Use prefix + 4 additional spaces for alignment
        result += '\n' + prefix + '    '
      }
    }
    
    result += '"'
    return result
  }
  
  if (type === 'number' || type === 'boolean') {
    return String(value)
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    let result = '[\n'
    for (let i = 0; i < value.length; i++) {
      result += prefix + '  '.repeat(indent)
      result += stringifyValue(value[i], prefix + '  '.repeat(indent), indent)
      if (i < value.length - 1) result += ','
      result += '\n'
    }
    return result + prefix + ']'
  }
  
  if (type === 'object' && value !== null) {
    const keys = Object.keys(value)
    if (keys.length === 0) return '{}'
    let result = '{\n'
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      result += prefix + '  '.repeat(indent) + JSON.stringify(key) + ': '
      result += stringifyValue(value[key], prefix + '  '.repeat(indent), indent)
      if (i < keys.length - 1) result += ','
      result += '\n'
    }
    return result + prefix + '}'
  }
  
  return JSON.stringify(value)
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #e0e0e0;
  background: #f8f9fa;
  border-radius: 4px 4px 0 0;
}

.logs-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logs-title {
  font-weight: 600;
  color: #333;
  font-size: 0.9rem;
}

.clear-logs-btn {
  background: #f5f5f5;
  border: 1px solid #ddd;
  color: #666;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background-color 0.15s;
}

.clear-logs-btn:hover {
  background: #eeeeee;
  border-color: #ccc;
}

.search-input {
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 0.8rem;
  background: white;
  color: #333;
  min-width: 120px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.search-input:focus {
  outline: none;
  border-color: #2196f3;
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.search-input::placeholder {
  color: #999;
}

.logs-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-top: none;
  border-radius: 0 0 4px 4px;
  /* height: 100px; */
  height: max-content;
  max-height: 400px;
}

.log-entry-container {
  margin-bottom: 3px;
  border-radius: 3px;
  border-left: 3px solid #ccc;
  overflow: hidden;
}

.log-entry {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 6px 10px;
  background: #fafafa;
  color: #000;;
  font-size: 0.9rem;
  gap: 10px;
  min-height: 28px;
  transition: background-color 0.15s ease;
}

.log-entry.has-extended {
  cursor: pointer;
}

.log-entry.has-extended:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

/* ------ INFO LOG STYLES ------ */
.log-entry-container.log-info {
  border-left-color: #2196f3;
}

.log-entry-container.log-info .log-entry {
  background: #f3f8ff;
  color: #1b2977;
}

.log-entry-container.log-info .extended-content {
  background: #f3f8ff90;
  color: #1b2977;
}

/* ------ WARNING LOG STYLES ------ */
.log-entry-container.log-warning {
  border-left-color: #ff9800;
}

.log-entry-container.log-warning .log-entry {
  background: #ff980020;
  color: #663d00;
}

.log-entry-container.log-warning .extended-content {
  background: #fffdfa;
  color: #784901;
}

/* ------ ERROR LOG STYLES ------ */
.log-entry-container.log-error {
  border-left-color: #f44336;
}

.log-entry-container.log-error .log-entry {
  background: #fff5f5;
  color: #a90d02;
}

.log-entry-container.log-error .extended-content {
  background: #fff5f590;
  color: rgb(184, 3, 3);
}

/* ------ DEBUG LOG STYLES ------ */
.log-entry-container.log-debug {
  border-left-color: #9c27b0;
}

.log-entry-container.log-debug .log-entry {
  background: #f6ecff;
  color: #4a0157;
}

.log-entry-container.log-debug .extended-content {
  background: #fdf0ff;
  color: #4a0157;
}

/* ------ SUCCESS LOG STYLES ------ */
.log-entry-container.log-success {
  border-left-color: #4caf50;
}

.log-entry-container.log-success .log-entry {
  background: #f5fff5;
  color: rgb(5, 99, 5);
}

.log-entry-container.log-success .extended-content {
  background: #f5fff590;
  color: #045304;
}

.log-entry:hover {
  cursor: pointer;
  transform: translateX(2px);
  transition: all 0.15s ease;
}

.log-timestamp {
  font-size: 0.8rem;
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 80px;
}

.log-message-container {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 6px;
}

.log-message {
  line-height: 1.3;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 400;
}

.log-source {
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  opacity: 1;
}

.expand-indicator {
  font-size: 0.7rem;
  opacity:0.7;
  font-weight: bold;
  flex-shrink: 0;
  user-select: none;
  transition: transform 0.15s ease;
  margin-left: 5px;
}

.log-extended {
  background: rgba(0, 0, 0, 0.03);
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  margin: 0;
}

.extended-content {
  font-size: 0.9rem;
  color: #333;
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  line-height: 1.2;
  max-height: 200px;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.5);
  padding: 6px 8px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.empty-logs {
  padding: 20px;
  text-align: center;
  color: #999;
  font-style: italic;
}

/* Log count badges in title bar */
.log-count-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 0.75rem;
  min-width: 16px;
  font-weight: 600;
  text-align: center;
  transition: all 0.15s;
}

.log-count-badge-inline {
  font-weight: bold;
}

.badge-info {
  background: #2196f320;
  color: #2196f3;
}

.badge-warning {
  background: #ff980020;
  color: #ff9800;
}

.badge-error {
  background: #f4433620;
  color: #f44336;
}

.badge-success {
  background: #4caf5020;
  color: #4caf50;
}

.badge-debug {
  background: #9c27b020;
  color: #9c27b0;
}

.log-collapsed {
  background: rgba(0, 0, 0, 0.02);
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
}

.collapsed-log-entry {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 4px 10px 4px 20px;
  background: rgba(0, 0, 0, 0.02);
  color: #666;
  font-size: 0.85rem;
  gap: 10px;
  min-height: 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.collapsed-log-entry:last-child {
  border-bottom: none;
}

.collapsed-log-entry .log-timestamp {
  font-size: 0.75rem;
  opacity: 0.8;
}

.collapsed-log-entry .log-source {
  font-size: 0.75rem;
  opacity: 0.8;
}
</style>

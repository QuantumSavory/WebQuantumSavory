<template>
  <div 
    class="floating-window" 
    :style="windowStyle"
    @mousedown="handleWindowClick"
  >
    <!-- Window Header (draggable) -->
    <div 
      class="window-header" 
      @mousedown="startDrag"
    >
      <h3>{{ windowTitle }}</h3>
      <div class="header-controls">
        <button 
          v-if="hasHtmlContent" 
          @click="toggleView" 
          class="view-toggle-button" 
          :title="currentView === 'png' ? 'Switch to HTML view' : 'Switch to PNG view'"
        >
          {{ currentView === 'png' ? 'HTML' : 'PNG' }}
        </button>
        <button class="close-button" @click="handleClose" title="Close (Esc)" aria-label="Close results">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- Window Content -->
    <div class="window-content">
      <!-- Loading State -->
      <div v-if="loading" class="loading-container">
        <LoaderCircle class="spinner" :size="40" aria-hidden="true" />
        <div class="loading-message">Waiting for the plot to be generated</div>
      </div>
      
      <!-- PNG View -->
      <div v-else-if="currentView === 'png'" class="image-container">
        <img v-if="imgSrc" :src="'data:image/png;base64,'+imgSrc" :alt="imageAlt" />
        <div v-else class="no-content">There is no valid plot currently</div> 
      </div>
      
      <!-- HTML View -->
      <div v-else-if="currentView === 'html'" class="html-container">
        <div v-if="htmlContent" v-html="htmlContent"></div>
        <div v-else class="no-content">There is no valid content currently</div>
      </div>
    </div>

    <!-- Resize Handles -->
    <div class="resize-handle resize-n" @mousedown="startResize('n', $event)"></div>
    <div class="resize-handle resize-s" @mousedown="startResize('s', $event)"></div>
    <div class="resize-handle resize-e" @mousedown="startResize('e', $event)"></div>
    <div class="resize-handle resize-w" @mousedown="startResize('w', $event)"></div>
    <div class="resize-handle resize-ne" @mousedown="startResize('ne', $event)"></div>
    <div class="resize-handle resize-nw" @mousedown="startResize('nw', $event)"></div>
    <div class="resize-handle resize-se" @mousedown="startResize('se', $event)"></div>
    <div class="resize-handle resize-sw" @mousedown="startResize('sw', $event)"></div>
  </div>
</template>

<script setup>
import { watch, onUnmounted, ref, onMounted, computed } from 'vue'
import { LoaderCircle, X } from '@lucide/vue'
import { api } from '../../utils/ApiConnector'

const props = defineProps({
  windowId: {
    type: String,
    required: true
  },
  itemDetails: {
    type: Object,
    required: true
  },
  position: {
    type: Object,
    required: true
  },
  size: {
    type: Object,
    required: true
  },
  zIndex: {
    type: Number,
    required: true
  },
  projectData: {
    type: Object,
    required: false,
    default: null
  }
})

const emit = defineEmits(['close', 'bring-to-front', 'update-position', 'update-size'])

const imgSrc = ref(null)
const htmlContent = ref(null)
const loading = ref(true)
const currentView = ref('png') // 'png' or 'html'
const imageAlt = computed(() => `${props.itemDetails.type} results`)
let fetchGeneration = 0
let fetchAbortController = null

// Check if HTML content is available
const hasHtmlContent = computed(() => !!htmlContent.value)

// Generate descriptive window title
const windowTitle = computed(() => {
  const type = props.itemDetails.type
  const context = props.itemDetails.context || {}
  
  if (type === 'slot') {
    // Regular slot
    const nodeName = context.nodeName || 'Unknown Node'
    const slotIndex = context.slotIndex !== undefined ? context.slotIndex : '?'
    let title = `'${nodeName}' / Slot ${slotIndex+1}`

    // Check if this is an entangled state (has stateId and slotCount in context)
    if (context.stateId && context.slotCount) {
      return `Entangled State (${context.slotCount} slots) - ${title}`
    }
      return 'Node ' + title;
    
  } else if (type === 'protocol') {
    const protocolType = context.protocolType || 'Protocol'
    
    // Edge protocol
    if (context.sourceNodeName && context.targetNodeName) {
      return `Edge '${context.sourceNodeName} to ${context.targetNodeName}' / ${protocolType}`
    }
    // Node protocol
    else if (context.nodeName) {
      return `Node '${context.nodeName}' / ${protocolType}`
    }
    // Floating protocol
    else {
      return `Floating / ${protocolType}`
    }
  }
  
  // Fallback
  return `${type} Details`
})

// Local position and size (for smooth dragging/resizing)
const localPosition = ref({ ...props.position })
const localSize = ref({ ...props.size })

// Minimum window size constraints
const MIN_WIDTH = 400
const MIN_HEIGHT = 300

// Computed style for window positioning
const windowStyle = computed(() => ({
  left: `${localPosition.value.x}px`,
  top: `${localPosition.value.y}px`,
  width: `${localSize.value.width}px`,
  height: `${localSize.value.height}px`,
  zIndex: props.zIndex
}))

// Get the slot object for this window (if it's a slot type)
function getSlot() {
  if (props.itemDetails.type !== 'slot' || !props.projectData || !props.projectData.net) {
    return null
  }
  const slotId = props.itemDetails.item?.id || props.itemDetails.item
  if (!slotId) {
    return null
  }
  // projectData is already the value, not a ref, so we access it directly
  const node = props.projectData.net.nodes.find(node => 
    node.data.slots.find(slot => slot.id === slotId)
  )
  if (!node) {
    return null
  }
  return node.data.slots.find(slot => slot.id === slotId) || null
}

// Check if slot is assigned
function isSlotAssigned() {
  const slot = getSlot()
  return slot ? slot.assignment === true : false
}

// Clear plot content
function clearPlot() {
  imgSrc.value = null
  htmlContent.value = null
  loading.value = false
}

// Fetch results on mount
async function fetchResults() {
  // For slot types, check if slot is assigned before fetching
  if (props.itemDetails.type === 'slot') {
    if (!isSlotAssigned()) {
      console.log('Slot is not assigned, clearing plot')
      clearPlot()
      return
    }
  }
  
  const projectName = props.projectData?.name
  if (!projectName) {
    clearPlot()
    return
  }

  const generation = ++fetchGeneration
  fetchAbortController?.abort()
  fetchAbortController = new AbortController()
  loading.value = true
  console.log('fetchResults', props.itemDetails.type, props.itemDetails.item)
  
  try {
    let response = null
    if (props.itemDetails.type === 'protocol') {
      response = await api.getProtocolResults(projectName, props.itemDetails.item, { signal: fetchAbortController.signal })
    } else if (props.itemDetails.type === 'slot') {
      response = await api.getSlotResults(projectName, props.itemDetails.item, { signal: fetchAbortController.signal })
      
      // After fetching, check again if slot is still assigned
      // If not, clear the plot
      if (!isSlotAssigned()) {
        console.log('Slot became unassigned during fetch, clearing plot')
        clearPlot()
        return
      }
    }
    
    if (generation !== fetchGeneration || projectName !== props.projectData?.name) return

    // Set PNG content
    imgSrc.value = response?.png_base64
    
    // Set HTML content if available
    if (response?.html_base64) {
      try {
        // Decode base64 HTML content
        const htmlString = atob(response.html_base64)
        htmlContent.value = htmlString
        console.log('HTML content loaded successfully')
      } catch (error) {
        console.error('Error decoding HTML content:', error)
        htmlContent.value = null
      }
    } else {
      htmlContent.value = null
    }
  } catch (error) {
    if (error?.name === 'AbortError' || generation !== fetchGeneration) return
    console.error('Error fetching results:', error)
    imgSrc.value = null
    htmlContent.value = null
  } finally {
    if (generation === fetchGeneration) loading.value = false
  }
}

// Bring window to front when clicked
function handleWindowClick() {
  emit('bring-to-front')
}

// Close window
function handleClose() {
  emit('close')
}

// Toggle between PNG and HTML views
function toggleView() {
  if (hasHtmlContent.value) {
    currentView.value = currentView.value === 'png' ? 'html' : 'png'
    console.log('Switched to view:', currentView.value)
  }
}

// ==================== DRAG FUNCTIONALITY ====================
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })

function startDrag(event) {
  if (event.target.closest('.close-button')) return // Don't drag when clicking close button
  
  isDragging.value = true
  dragStart.value = {
    x: event.clientX - localPosition.value.x,
    y: event.clientY - localPosition.value.y
  }
  
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  event.preventDefault()
}

function onDrag(event) {
  if (!isDragging.value) return
  
  const newX = event.clientX - dragStart.value.x
  const newY = event.clientY - dragStart.value.y
  
  localPosition.value = { x: newX, y: newY }
}

function stopDrag() {
  if (isDragging.value) {
    isDragging.value = false
    emit('update-position', { ...localPosition.value })
    document.removeEventListener('mousemove', onDrag)
    document.removeEventListener('mouseup', stopDrag)
  }
}

// ==================== RESIZE FUNCTIONALITY ====================
const isResizing = ref(false)
const resizeDirection = ref('')
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 })

function startResize(direction, event) {
  isResizing.value = true
  resizeDirection.value = direction
  resizeStart.value = {
    x: event.clientX,
    y: event.clientY,
    width: localSize.value.width,
    height: localSize.value.height,
    posX: localPosition.value.x,
    posY: localPosition.value.y
  }
  
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  event.preventDefault()
  event.stopPropagation()
}

function onResize(event) {
  if (!isResizing.value) return
  
  const deltaX = event.clientX - resizeStart.value.x
  const deltaY = event.clientY - resizeStart.value.y
  const dir = resizeDirection.value
  
  let newWidth = resizeStart.value.width
  let newHeight = resizeStart.value.height
  let newX = resizeStart.value.posX
  let newY = resizeStart.value.posY
  
  // Handle horizontal resizing
  if (dir.includes('e')) {
    newWidth = Math.max(MIN_WIDTH, resizeStart.value.width + deltaX)
  } else if (dir.includes('w')) {
    const candidateWidth = resizeStart.value.width - deltaX
    if (candidateWidth >= MIN_WIDTH) {
      newWidth = candidateWidth
      newX = resizeStart.value.posX + deltaX
    }
  }
  
  // Handle vertical resizing
  if (dir.includes('s')) {
    newHeight = Math.max(MIN_HEIGHT, resizeStart.value.height + deltaY)
  } else if (dir.includes('n')) {
    const candidateHeight = resizeStart.value.height - deltaY
    if (candidateHeight >= MIN_HEIGHT) {
      newHeight = candidateHeight
      newY = resizeStart.value.posY + deltaY
    }
  }
  
  localSize.value = { width: newWidth, height: newHeight }
  localPosition.value = { x: newX, y: newY }
}

function stopResize() {
  if (isResizing.value) {
    isResizing.value = false
    emit('update-size', { ...localSize.value })
    emit('update-position', { ...localPosition.value })
    document.removeEventListener('mousemove', onResize)
    document.removeEventListener('mouseup', stopResize)
  }
}

// ==================== KEYBOARD HANDLING ====================
function handleGlobalKeydown(event) {
  if (event.key === 'Escape') {
    handleClose()
  }
}

// Watch for prop changes
watch(() => props.position, (newPos) => {
  localPosition.value = { ...newPos }
}, { deep: true })

watch(() => props.size, (newSize) => {
  localSize.value = { ...newSize }
}, { deep: true })

// Watch for slot assignment changes (for slot type windows)
watch(() => {
  if (props.itemDetails.type === 'slot' && props.projectData && props.projectData.net) {
    const slot = getSlot()
    return slot ? slot.assignment : false
  }
  return null
}, (isAssigned, wasAssigned) => {
  // If slot becomes unassigned, clear the plot
  if (props.itemDetails.type === 'slot' && wasAssigned === true && isAssigned === false) {
    console.log('Slot assignment changed to false, clearing plot')
    clearPlot()
  }
}, { immediate: false })

// Watch projectData deeply to catch slot assignment changes
// This ensures we detect changes even when the slot object reference doesn't change
watch(() => props.projectData, () => {
  if (props.itemDetails.type === 'slot' && props.projectData && props.projectData.net) {
    const slot = getSlot()
    if (slot && !slot.assignment && (imgSrc.value || htmlContent.value)) {
      console.log('Detected slot is unassigned, clearing plot')
      clearPlot()
    }
  }
}, { deep: true })

onMounted(() => {
  fetchResults()
  document.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  fetchGeneration += 1
  fetchAbortController?.abort()
  fetchAbortController = null
  document.removeEventListener('keydown', handleGlobalKeydown)
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
})

// Expose methods so parent can call them
defineExpose({
  fetchResults,
  clearPlot
})
</script>

<style scoped>
.floating-window {
  position: fixed;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #ccc;
}

.window-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0px 0px 10px;
  background: linear-gradient(to bottom, #f8f8f8, #e8e8e8);
  border-bottom: 1px solid #ccc;
  cursor: move;
  user-select: none;
  text-transform: capitalize;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 2px;
}

.window-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #333;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s, color 0.2s;
}

.close-button:hover {
  background-color: #ff4444;
  color: #fff;
}

.view-toggle-button {
  background: #007bff;
  color: white;
  border: none;
  padding: 4px 8px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;
  min-width: 40px;
}

.view-toggle-button:hover {
  background-color: #0056b3;
}

.window-content {
  flex: 1;
  overflow: auto;
  background: #fff;
}

.image-container {
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
}

.image-container img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

.html-container {
  padding: 20px;
  min-height: 100%;
  overflow: auto;
}

.html-container > div {
  width: 100%;
  height: 100%;
}

.no-content {
  padding: 40px;
  color: #999;
  font-style: italic;
  text-align: center;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  min-height: 100%;
}

.spinner {
  color: #007bff;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-message {
  color: #666;
  font-size: 0.9rem;
  text-align: center;
}

/* ==================== RESIZE HANDLES ==================== */
.resize-handle {
  position: absolute;
  background: transparent;
  z-index: 10;
}

/* Edge handles */
.resize-n {
  top: 0;
  left: 8px;
  right: 8px;
  height: 3px;
  cursor: ns-resize;
}

.resize-s {
  bottom: 0;
  left: 8px;
  right: 8px;
  height: 8px;
  cursor: ns-resize;
}

.resize-e {
  right: 0;
  top: 8px;
  bottom: 8px;
  width: 4px;
  cursor: ew-resize;
}

.resize-w {
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 8px;
  cursor: ew-resize;
}

/* Corner handles */
.resize-ne {
  top: 0;
  right: 0;
  width: 4px;
  height: 4px;
  cursor: nesw-resize;
}

.resize-nw {
  top: 0;
  left: 0;
  width: 6px;
  height: 6px;
  cursor: nwse-resize;
}

.resize-se {
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
}

.resize-sw {
  bottom: 0;
  left: 0;
  width: 16px;
  height: 16px;
  cursor: nesw-resize;
}
</style>

<template>
  <div v-if="show" class="modal-overlay">
    <div class="modal-dialog">
      <div class="dialog-header">
        <h3>Open Project</h3>
        <div class="search-container">
          <input 
            v-model="searchQuery"
            type="text"
            placeholder="Search projects..."
            class="search-input"
            ref="searchInputRef"
          />
        </div>
      </div>
      <div v-if="filteredProjects.length === 0 && searchQuery" class="no-projects">No projects match your search.</div>
      <div v-else-if="projects.length === 0" class="no-projects">No saved projects.</div>
      <div v-else class="projects-table-container">
        <DataTable 
          :value="filteredProjects" 
          :scrollable="true" 
          scrollHeight="400px"
          :resizableColumns="true"
          columnResizeMode="expand"
          @row-click="handleRowClick"
          class="projects-table"
          :sortOrder="sortOrder"
          :sortField="sortField"
          @sort="onSort"
        >
          <Column field="name" header="Project Name" :sortable="true" class="name-column">
            <template #body="slotProps">
              <div class="project-name">{{ slotProps.data.name }}</div>
            </template>
          </Column>
          
          <Column field="metadata.nodeCount" header="Nodes" :sortable="true" class="count-column">
            <template #body="slotProps">
              <span :class="['count-badge', getCountBadgeClass(slotProps.data.metadata.nodeCount || 0)]">
                {{ slotProps.data.metadata.nodeCount || 0 }}
              </span>
            </template>
          </Column>
          
          <Column field="metadata.edgeCount" header="Edges" :sortable="true" class="count-column">
            <template #body="slotProps">
              <span :class="['count-badge', getCountBadgeClass(slotProps.data.metadata.edgeCount || 0)]">
                {{ slotProps.data.metadata.edgeCount || 0 }}
              </span>
            </template>
          </Column>
          
          <Column field="metadata.slotCount" header="Slots" :sortable="true" class="count-column">
            <template #body="slotProps">
              <span :class="['count-badge', getCountBadgeClass(slotProps.data.metadata.slotCount || 0)]">
                {{ slotProps.data.metadata.slotCount || 0 }}
              </span>
            </template>
          </Column>
          
          <Column field="metadata.protocolCount" header="Protocols" :sortable="true" class="count-column">
            <template #body="slotProps">
              <span :class="['count-badge', getCountBadgeClass(slotProps.data.metadata.protocolCount || 0)]">
                {{ slotProps.data.metadata.protocolCount || 0 }}
              </span>
            </template>
          </Column>
          
          <Column field="metadata.openedAt" header="Last Opened" :sortable="true" class="date-column">
            <template #body="slotProps">
              <span 
                class="date-text" 
                v-tooltip.top="formatFullDate(slotProps.data.metadata.openedAt)"
              >
                {{ formatRelativeTime(slotProps.data.metadata.openedAt) }}
              </span>
            </template>
          </Column>
          
          <Column field="metadata.updatedAt" header="Last Modified" :sortable="true" class="date-column">
            <template #body="slotProps">
              <span 
                class="date-text"
                v-tooltip.top="formatFullDate(slotProps.data.metadata.updatedAt)"
              >
                {{ formatRelativeTime(slotProps.data.metadata.updatedAt) }}
              </span>
            </template>
          </Column>
          
          <Column header="" :sortable="false" class="action-column">
            <template #body="slotProps">
              <button 
                class="delete-project-btn"
                @click.stop="handleDeleteProject(slotProps.data.name)"
                v-tooltip.top="'Delete project'"
                aria-label="Delete project"
              >
                <i class="pi pi-trash"></i>
              </button>
            </template>
          </Column>
        </DataTable>
      </div>
      <div class="modal-actions">
        <div class="left-actions">
          <button @click="handleNewProject" class="btn-primary">
            <i class="pi pi-plus"></i>
            Create New
          </button>
          <button @click="handleImportProject" class="btn-secondary">
            <i class="pi pi-upload"></i>
            Import from File
          </button>
        </div>
        <div class="right-actions">
          <button @click="handleClose">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { watch, onUnmounted, ref, onMounted, computed, nextTick } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  projects: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['select-project', 'close', 'delete-project', 'new-project', 'import-project'])

// Search functionality
const searchQuery = ref('')
const searchInputRef = ref(null)

// Computed filtered projects based on search query
const filteredProjects = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.projects
  }
  
  const query = searchQuery.value.toLowerCase().trim()
  return props.projects.filter(project => 
    project.name.toLowerCase().includes(query)
  )
})

// Sorting state with localStorage persistence
const STORAGE_KEY = 'openProjectDialog_sortSettings'
const sortField = ref('metadata.openedAt') // Default sort by last opened
const sortOrder = ref(-1) // -1 for desc, 1 for asc

// Load sort settings from localStorage
onMounted(() => {
  const savedSettings = localStorage.getItem(STORAGE_KEY)
  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings)
      sortField.value = settings.field || 'metadata.openedAt'
      sortOrder.value = settings.order || -1
    } catch (e) {
      console.warn('Failed to parse sort settings from localStorage')
    }
  }
})

// Save sort settings to localStorage
function saveSortSettings() {
  const settings = {
    field: sortField.value,
    order: sortOrder.value
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

// Global keydown handler for dialog
function handleGlobalKeydown(event) {
  if (event.key === 'Escape' && props.show) {
    handleClose()
  }
}

// Watch for show prop changes to add/remove global listener
watch(() => props.show, async (newShow) => {
  if (newShow) {
    // Add global keydown listener when dialog opens
    document.addEventListener('keydown', handleGlobalKeydown)
    // Focus search input after dialog is rendered
    await nextTick()
    if (searchInputRef.value) {
      searchInputRef.value.focus()
    }
  } else {
    // Remove global keydown listener when dialog closes
    document.removeEventListener('keydown', handleGlobalKeydown)
    // Clear search when dialog closes
    searchQuery.value = ''
  }
})

function handleRowClick(event) {
  emit('select-project', event.data.name)
}

function handleClose() {
  emit('close')
}

function handleDeleteProject(projectName) {
  // Emit delete event with project name
  emit('delete-project', projectName)
}

function handleNewProject() {
  emit('new-project')
}

function handleImportProject() {
  emit('import-project')
}

function onSort(event) {
  sortField.value = event.sortField
  sortOrder.value = event.sortOrder
  saveSortSettings()
}

function formatRelativeTime(dateString) {
  if (!dateString) return ''
  
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)
    const diffWeeks = Math.floor(diffDays / 7)
    const diffMonths = Math.floor(diffDays / 30)
    const diffYears = Math.floor(diffDays / 365)

    // Handle future dates (shouldn't happen but just in case)
    if (diffMs < 0) return 'just now'
    
    // Less than 1 minute
    if (diffSeconds < 60) return 'just now'
    
    // Less than 1 hour
    if (diffMinutes < 60) {
      return diffMinutes === 1 ? '1 min ago' : `${diffMinutes} mins ago`
    }
    
    // Less than 1 day
    if (diffHours < 24) {
      return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
    }
    
    // Yesterday
    if (diffDays === 1) return 'yesterday'
    
    // Less than 1 week
    if (diffDays < 7) {
      return `${diffDays} days ago`
    }
    
    // Less than 1 month
    if (diffWeeks < 4) {
      return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`
    }
    
    // Less than 1 year
    if (diffMonths < 12) {
      return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`
    }
    
    // 1 year or more
    return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`
    
  } catch (e) {
    return dateString
  }
}

function formatFullDate(dateString) {
  if (!dateString) return ''
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    })
  } catch (e) {
    return dateString
  }
}

function getCountBadgeClass(value) {
  // Define color buckets based on value ranges
  // This function can be extended later to accept column-specific ranges
  if (value === 0) return 'count-badge-zero'
  if (value >= 1 && value <= 5) return 'count-badge-light-blue'
  if (value >= 6 && value <= 9) return 'count-badge-green'
  if (value >= 10 && value <= 29) return 'count-badge-orange'
  if (value >= 30) return 'count-badge-red'
  return 'count-badge-zero' // fallback
}

// Cleanup on component unmount
onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.18);
  z-index: 2001;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-dialog {
  background: #fff;
  border-radius: 8px;
  padding: 24px 20px 18px;
  min-width: 900px;
  max-width: 1200px;
  max-height: 80vh;
  box-shadow: 0 2px 16px rgba(0,0,0,0.13);
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.dialog-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.search-container {
  display: flex;
  align-items: center;
}

.search-input {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
  width: 200px;
  transition: border-color 0.15s;
}

.search-input:focus {
  outline: none;
  border-color: #0066cc;
}

.search-input::placeholder {
  color: #999;
}

.no-projects {
  text-align: center;
  color: #666;
  padding: 40px 20px;
  font-style: italic;
}

.projects-table-container {
  margin-bottom: 20px;
}

.projects-table {
}

.project-name {
  font-weight: 500;
  color: #333;
}

/* Base count badge styling */
.count-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.9rem;
  min-width: 20px;
  font-weight: 600;
  text-align: center;
  transition: all 0.15s;
}

/* Color bucket classes */
.count-badge-zero {
  background: rgba(156, 163, 175, 0.2); /* light grey bg */
  color: #6b7280; /* darker grey text */
}

.count-badge-light-blue {
  background: rgba(147, 197, 253, 0.25); /* light blue bg */
  color: #1e40af; /* darker blue text */
}

.count-badge-green {
  background: rgba(62, 245, 108, 0.3); /* darker blue bg */
  color: #146d1d; /* dark blue text */
}

.count-badge-orange {
  background: rgba(251, 191, 36, 0.3); /* light orange bg */
  color: #b45309; /* dark orange text */
}

.count-badge-red {
  background: rgba(248, 113, 113, 0.3); /* light red bg */
  color: #b91c1c; /* dark red text */
}

.date-text {
  font-size: 0.85rem;
  color: #666;
  border-bottom: 1px dotted transparent;
  transition: border-bottom-color 0.15s;
}


.modal-actions {
  margin-top: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.left-actions {
  display: flex;
  gap: 12px;
}

.right-actions {
  display: flex;
  gap: 12px;
}

.btn-primary {
  background: #4345ac;
  color: white;
  border: 1px solid #4345ac;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}

.btn-primary:hover {
  background: #5f61f1;
  border-color: #5f61f1;
}

.btn-secondary {
  background: white;
  color: #4345ac;
  border: 1px solid #4345ac;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}

.btn-secondary:hover {
  background: #f8f9fa;
  border-color: #5f61f1;
  color: #5f61f1;
}




/* DataTable row hover effect */
:deep(.p-datatable-tbody > tr:hover) {
  background: #f8f9fa !important;
  cursor: pointer;
}

/* DataTable header styling */
:deep(.p-datatable-thead > tr > th) {
  background: #f8f9fa;
  border-bottom: 2px solid #e0e0e0;
  font-weight: 600;
  color: #333;
}

/* Hide sort icons on all columns by default */
:deep(.p-datatable-thead > tr > th .p-datatable-sort-icon) {
  opacity: 0;
}

/* Show sort icon only on the currently sorted column */
:deep( .p-datatable-thead > tr > th[data-p-sorted="true"] .p-datatable-sort-icon ) {
  opacity: 1;
}

/* Column width adjustments */
:deep(.name-column) {
  min-width: 200px;
}

:deep(.count-column) {
  width: 80px;
  text-align: center;
}

:deep(.date-column) {
  width: 140px;
}

:deep(.action-column) {
  width: 50px;
  text-align: center;
}

.delete-project-btn {
  background: none;
  border: none;
  color: #dc3545;
  cursor: pointer;
  padding: 4px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  opacity: 0.6;
}

.delete-project-btn:hover {
  background: rgba(220, 53, 69, 0.1);
  opacity: 1;
  transform: scale(1.1);
}

.delete-project-btn i {
  font-size: 0.9rem;
}
</style>
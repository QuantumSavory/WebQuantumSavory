<template>
  <AppDialog
    :show="show"
    title="Open Project"
    width="min(1200px, calc(100vw - 32px))"
    class="open-project-dialog"
    @close="handleClose"
  >
      <div class="search-container">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Search projects..."
          class="search-input"
          autofocus
        />
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
            <template #sorticon="slotProps">
              <LucideSortIcon v-bind="slotProps" :icon-class="slotProps.class" />
            </template>
            <template #body="slotProps">
              <div class="project-name">{{ slotProps.data.name }}</div>
            </template>
          </Column>
          
          <Column field="metadata.nodeCount" header="Nodes" :sortable="true" class="count-column">
            <template #sorticon="slotProps">
              <LucideSortIcon v-bind="slotProps" :icon-class="slotProps.class" />
            </template>
            <template #body="slotProps">
              <span :class="['count-badge', getCountBadgeClass(slotProps.data.metadata.nodeCount || 0)]">
                {{ slotProps.data.metadata.nodeCount || 0 }}
              </span>
            </template>
          </Column>
          
          <Column field="metadata.edgeCount" header="Edges" :sortable="true" class="count-column">
            <template #sorticon="slotProps">
              <LucideSortIcon v-bind="slotProps" :icon-class="slotProps.class" />
            </template>
            <template #body="slotProps">
              <span :class="['count-badge', getCountBadgeClass(slotProps.data.metadata.edgeCount || 0)]">
                {{ slotProps.data.metadata.edgeCount || 0 }}
              </span>
            </template>
          </Column>
          
          <Column field="metadata.slotCount" header="Slots" :sortable="true" class="count-column">
            <template #sorticon="slotProps">
              <LucideSortIcon v-bind="slotProps" :icon-class="slotProps.class" />
            </template>
            <template #body="slotProps">
              <span :class="['count-badge', getCountBadgeClass(slotProps.data.metadata.slotCount || 0)]">
                {{ slotProps.data.metadata.slotCount || 0 }}
              </span>
            </template>
          </Column>
          
          <Column field="metadata.protocolCount" header="Protocols" :sortable="true" class="count-column">
            <template #sorticon="slotProps">
              <LucideSortIcon v-bind="slotProps" :icon-class="slotProps.class" />
            </template>
            <template #body="slotProps">
              <span :class="['count-badge', getCountBadgeClass(slotProps.data.metadata.protocolCount || 0)]">
                {{ slotProps.data.metadata.protocolCount || 0 }}
              </span>
            </template>
          </Column>
          
          <Column field="metadata.openedAt" header="Last Opened" :sortable="true" class="date-column">
            <template #sorticon="slotProps">
              <LucideSortIcon v-bind="slotProps" :icon-class="slotProps.class" />
            </template>
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
            <template #sorticon="slotProps">
              <LucideSortIcon v-bind="slotProps" :icon-class="slotProps.class" />
            </template>
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
                <Trash2 :size="15" aria-hidden="true" />
              </button>
            </template>
          </Column>
        </DataTable>
      </div>
      <template #footer>
      <div class="open-project-actions">
        <div class="left-actions">
          <AppButton variant="primary" @click="handleNewProject">
            <template #icon><FilePlus2 :size="16" /></template>
            Create New
          </AppButton>
          <AppButton @click="handleImportProject">
            <template #icon><FileUp :size="16" /></template>
            Import from File
          </AppButton>
        </div>
        <AppButton @click="handleClose">Close</AppButton>
      </div>
      </template>
  </AppDialog>
</template>

<script setup>
import { watch, ref, onMounted, computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { FilePlus2, FileUp, Trash2 } from '@lucide/vue'
import AppButton from './ui/AppButton.vue'
import AppDialog from './ui/AppDialog.vue'
import LucideSortIcon from './LucideSortIcon.vue'

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

watch(() => props.show, newShow => {
  if (!newShow) searchQuery.value = ''
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

</script>

<style scoped>
.search-container {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: var(--app-space-5);
}

.search-input {
  padding: 6px 12px;
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  font-size: 0.9rem;
  width: 200px;
  transition: border-color 0.15s;
}

.search-input:focus {
  outline: none;
  border-color: var(--app-color-focus);
}

.search-input::placeholder {
  color: var(--app-color-disabled-text);
}

.no-projects {
  text-align: center;
  color: var(--app-color-text-muted);
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
  color: var(--app-color-text);
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
  color: var(--app-color-text-muted);
  border-bottom: 1px dotted transparent;
  transition: border-bottom-color 0.15s;
}


.open-project-actions {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.left-actions {
  display: flex;
  gap: 12px;
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

</style>

<template>
  <div v-if="show" class="modal-overlay">
    <div class="modal-dialog">
      <h3>{{ title }}</h3>
      <input 
        v-model="projectName" 
        :placeholder="placeholder" 
        @keydown.enter="handleEnterKey"
        ref="inputRef"
      />
      <div v-if="projectName.trim() && !isValid" class="validation-error">
        {{ errorMessage }}
      </div>
      <div class="modal-actions">
        <button @click="handleCancel">Cancel</button>
        <button @click="handleConfirm" class="primary" :disabled="!isValid">{{ confirmButtonText }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import ProjectStore from '../models/ProjectStore.js'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'Project Name'
  },
  placeholder: {
    type: String,
    default: 'Project name'
  },
  confirmButtonText: {
    type: String,
    default: 'Confirm'
  },
  initialValue: {
    type: String,
    default: ''
  },
  mode: {
    type: String,
    default: 'new', // 'new' or 'saveas'
    validator: (value) => ['new', 'saveas', 'save'].includes(value)
  }
})

const emit = defineEmits(['confirm', 'cancel'])

const projectName = ref('')
const inputRef = ref(null)

// Validation logic
const isValid = computed(() => {
  const name = projectName.value?.trim()
  if (!name) return false // Empty name is invalid
  
  const existingProjects = ProjectStore.listProjects()
  
  if (props.mode === 'new') {
    // For new projects, name cannot exist at all
    return !existingProjects.includes(name)
  } else if (props.mode === 'saveas') {
    // For save as, name cannot exist (same as new)
    return !existingProjects.includes(name)
  } else if (props.mode === 'save') {
    // For save, name cannot exist (same as new)
    return !existingProjects.includes(name)
  }
  
  return false
})

const errorMessage = computed(() => {
  const name = projectName.value?.trim()
  if (!name) return ''
  
  const existingProjects = ProjectStore.listProjects()
  if (existingProjects.includes(name)) {
    return 'A project with this name already exists.'
  }
  
  return ''
})

// Global keydown handler for dialog
function handleGlobalKeydown(event) {
  if (event.key === 'Escape' && props.show) {
    handleCancel()
  }
}

// Watch for show prop changes to set initial value and focus
watch(() => props.show, (newShow) => {
  if (newShow) {
    projectName.value = props.initialValue
    // Add global keydown listener when dialog opens
    document.addEventListener('keydown', handleGlobalKeydown)
    nextTick(() => {
      if (inputRef.value) {
        inputRef.value.focus()
        // Select all text if there's an initial value
        if (props.initialValue) {
          inputRef.value.select()
        }
      }
    })
  } else {
    // Remove global keydown listener when dialog closes
    document.removeEventListener('keydown', handleGlobalKeydown)
  }
})

function handleEnterKey() {
  if (isValid.value) {
    handleConfirm()
  }
  // Do nothing if validation fails
}

function handleConfirm() {
  if (isValid.value) {
    emit('confirm', projectName.value.trim())
  }
}

function handleCancel() {
  projectName.value = ''
  emit('cancel')
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
  min-width: 320px;
  box-shadow: 0 2px 16px rgba(0,0,0,0.13);
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.modal-dialog h3 {
  margin-top: 0;
  margin-bottom: 18px;
  font-size: 1.1rem;
  font-weight: 600;
}

.modal-dialog input {
  font-size: 1rem;
  padding: 8px 10px;
  margin-bottom: 0px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.modal-actions {
  margin-top: 20px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.validation-error {
  color: #d32f2f;
  font-size: 0.9rem;
  margin-top: 3px;
  margin-bottom: 3px;
}

button:disabled {
  cursor: not-allowed !important;
  opacity: 0.6;
  border: solid 1px transparent;
}
</style>
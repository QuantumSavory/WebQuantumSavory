<template>
  <AppDialog :show="show" :title="title" @close="handleCancel">
    <form id="project-name-form" @submit.prevent="handleConfirm">
      <input
        v-model="projectName"
        :placeholder="placeholder"
        autofocus
      />
      <div v-if="projectName.trim() && !isValid" class="validation-error">
        {{ errorMessage }}
      </div>
    </form>
    <template #footer>
      <AppButton @click="handleCancel">Cancel</AppButton>
      <AppButton
        class="primary"
        variant="primary"
        type="submit"
        form="project-name-form"
        :disabled="!isValid"
      >{{ confirmButtonText }}</AppButton>
    </template>
  </AppDialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import ProjectStore from '../models/ProjectStore.js'
import AppButton from './ui/AppButton.vue'
import AppDialog from './ui/AppDialog.vue'

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

// Reset the draft every time the dialog opens.
watch(() => props.show, (newShow) => {
  if (newShow) {
    projectName.value = props.initialValue
  }
})

function handleConfirm() {
  if (isValid.value) {
    emit('confirm', projectName.value.trim())
  }
}

function handleCancel() {
  projectName.value = ''
  emit('cancel')
}
</script>

<style scoped>
input {
  width: 100%;
  font-size: 1rem;
  padding: 8px 10px;
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
}

.validation-error {
  color: var(--app-color-danger);
  font-size: 0.9rem;
  margin-top: 3px;
  margin-bottom: 3px;
}
</style>

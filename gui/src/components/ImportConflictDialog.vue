<template>
  <div v-if="show" class="modal-overlay">
    <div class="modal-dialog">
      <h3>Project Name Conflict</h3>
      <p>A project named "{{ projectName }}" already exists.</p>
      <p>What would you like to do?</p>
      <div class="modal-actions">
        <button @click="handleCancel">Cancel</button>
        <button @click="handleOverwrite" class="btn-warning">Overwrite</button>
        <button @click="handleNewName" class="btn-primary">Rename</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { watch, onUnmounted } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  projectName: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['overwrite', 'new-name', 'cancel'])

// Global keydown handler for dialog
function handleGlobalKeydown(event) {
  if (event.key === 'Escape' && props.show) {
    handleCancel()
  }
}

// Watch for show prop changes to add/remove global listener
watch(() => props.show, (newShow) => {
  if (newShow) {
    // Add global keydown listener when dialog opens
    document.addEventListener('keydown', handleGlobalKeydown)
  } else {
    // Remove global keydown listener when dialog closes
    document.removeEventListener('keydown', handleGlobalKeydown)
  }
})

function handleOverwrite() {
  emit('overwrite')
}

function handleNewName() {
  emit('new-name')
}

function handleCancel() {
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

.modal-dialog p {
  margin-bottom: 12px;
  line-height: 1.4;
}

.modal-actions {
  margin-top: 20px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
</style>
<template>
  <div v-if="show" class="modal-overlay">
    <div class="modal-dialog">
      <h3>Unsaved Changes</h3>
      <p>You have unsaved changes. What would you like to do?</p>
      <div class="modal-actions">
        <button @click="handleCancel">Cancel</button>
        <button @click="handleDiscard" class="secondary">Discard Changes</button>
        <button @click="handleSave" class="primary">Save Changes</button>
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
  }
})

const emit = defineEmits(['save', 'discard', 'cancel'])

// Global keydown handler for dialog
function handleGlobalKeydown(event) {
  if (event.key === 'Escape' && props.show) {
    handleCancel()
  }
}

// Watch for show prop changes to add/remove event listener
watch(() => props.show, (newShow) => {
  if (newShow) {
    document.addEventListener('keydown', handleGlobalKeydown)
  } else {
    document.removeEventListener('keydown', handleGlobalKeydown)
  }
})

function handleSave() {
  emit('save')
}

function handleDiscard() {
  emit('discard')
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
  max-width: 500px;
  box-shadow: 0 2px 16px rgba(0,0,0,0.13);
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.modal-dialog h3 {
  margin-top: 0;
  margin-bottom: 12px;
  font-size: 1.1rem;
  font-weight: 600;
}

.modal-dialog p {
  margin: 0 0 20px 0;
  color: #555;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.modal-actions button {
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 0.95rem;
  transition: background-color 0.2s;
}

.modal-actions button:hover {
  background: #f5f5f5;
}

.modal-actions button.primary {
  background: #4345ac;
  color: #fff;
  border-color: #4345ac;
}

.modal-actions button.primary:hover {
  background: #3637a0;
}

.modal-actions button.secondary {
  background: #fff;
  color: #d32f2f;
  border-color: #d32f2f;
}

.modal-actions button.secondary:hover {
  background: #ffebee;
}
</style>


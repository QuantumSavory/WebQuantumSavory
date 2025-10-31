<template>
  <div v-if="show" class="modal-overlay" @click="handleOverlayClick">
    <div class="modal-dialog about-modal" @click.stop>
      <div class="modal-header">
        <h3>About CQN Simulation Builder</h3>
        <button class="close-btn" @click="$emit('close')" aria-label="Close">
          <i class="pi pi-times"></i>
        </button>
      </div>
      
      <div class="modal-content">
        <div class="about-section">
          <h4>Application Information</h4>
          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor 
            incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud 
            exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
          </p>
        </div>
        
        <div class="about-section">
          <h4>Features</h4>
          <p>
            Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu 
            fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in 
            culpa qui officia deserunt mollit anim id est laborum.
          </p>
        </div>
        
        <div class="about-section">
          <h4>Technical Details</h4>
          <p>
            Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium 
            doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore 
            veritatis et quasi architecto beatae vitae dicta sunt explicabo.
          </p>
        </div>
        
        <div class="about-section">
          <h4>Version Information</h4>
          <p>
            Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, 
            sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.
          </p>
        </div>
      </div>
      
      <div class="modal-actions">
        <button class="btn-primary" @click="$emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

function handleOverlayClick() {
  emit('close')
}
</script>

<style scoped>
.about-modal {
  max-width: 600px;
  width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 600;
  color: #222;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: #666;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: #f5f5f5;
  color: #333;
}

.modal-content {
  margin-bottom: 20px;
}

.about-section {
  margin-bottom: 25px;
}

.about-section h4 {
  margin: 0 0 10px 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #4345ac;
}

.about-section p {
  margin: 0;
  line-height: 1.6;
  color: #555;
  text-align: justify;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 15px;
  border-top: 1px solid #eee;
}

.btn-primary {
}

.btn-primary:hover {
}
</style>

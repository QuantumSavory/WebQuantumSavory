<template>
  <AppDialog :show="show" title="Unsaved Changes" @close="handleCancel">
    <p>You have unsaved changes. What would you like to do?</p>
    <template #footer>
      <AppButton autofocus @click="handleCancel">Cancel</AppButton>
      <AppButton class="secondary" variant="danger" @click="handleDiscard">Discard Changes</AppButton>
      <AppButton class="primary" variant="primary" @click="handleSave">Save Changes</AppButton>
    </template>
  </AppDialog>
</template>

<script setup>
import AppButton from './ui/AppButton.vue'
import AppDialog from './ui/AppDialog.vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['save', 'discard', 'cancel'])

function handleSave() {
  emit('save')
}

function handleDiscard() {
  emit('discard')
}

function handleCancel() {
  emit('cancel')
}
</script>

<style scoped>
p {
  margin: 0;
  color: var(--app-color-text-muted);
  line-height: 1.5;
}
</style>

<template>
  <AppDialog :show="show" title="Project Name Conflict" @close="handleCancel">
    <p>A project named "{{ projectName }}" already exists.</p>
    <p>What would you like to do?</p>
    <template #footer>
      <AppButton autofocus @click="handleCancel">Cancel</AppButton>
      <AppButton variant="warning" @click="handleOverwrite">Overwrite</AppButton>
      <AppButton variant="primary" @click="handleNewName">Rename</AppButton>
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
  },
  projectName: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['overwrite', 'new-name', 'cancel'])

function handleOverwrite() {
  emit('overwrite')
}

function handleNewName() {
  emit('new-name')
}

function handleCancel() {
  emit('cancel')
}
</script>

<style scoped>
p {
  margin: 0;
  line-height: 1.4;
}

p + p {
  margin-top: var(--app-space-4);
}
</style>

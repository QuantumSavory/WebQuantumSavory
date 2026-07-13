<template>
  <AppDialog
    :show="show"
    :title="title"
    dismissable-mask
    @close="handleClose"
  >
    <p>{{ message }}</p>
    <template #footer>
      <AppButton class="primary" variant="primary" autofocus @click="handleClose">OK</AppButton>
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
  title: {
    type: String,
    default: 'Alert'
  },
  message: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close'])

function handleClose() {
  emit('close')
}
</script>

<style scoped>
p {
  margin: 0;
  color: var(--app-color-text-muted);
  line-height: 1.5;
}
</style>

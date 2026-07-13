<template>
  <AppDialog
    :show="show"
    :title="title"
    :dismissable-mask="false"
    @close="emit('cancel')"
  >
    <form id="confirmation-form" @submit.prevent="emit('confirm')">
      <p>{{ message }}</p>
    </form>
    <template #footer>
      <AppButton variant="secondary" :autofocus="dangerous" @click="emit('cancel')">Cancel</AppButton>
      <AppButton
        :variant="dangerous ? 'danger' : 'primary'"
        :autofocus="!dangerous"
        type="submit"
        form="confirmation-form"
      >
        {{ confirmButtonText }}
      </AppButton>
    </template>
  </AppDialog>
</template>

<script setup>
import AppButton from './ui/AppButton.vue'
import AppDialog from './ui/AppDialog.vue'

defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, required: true },
  message: { type: String, required: true },
  confirmButtonText: { type: String, default: 'Confirm' },
  dangerous: { type: Boolean, default: false }
})

const emit = defineEmits(['confirm', 'cancel'])
</script>

<style scoped>
p {
  margin: 0;
  color: var(--app-color-text-muted);
  line-height: 1.5;
  white-space: pre-line;
}
</style>

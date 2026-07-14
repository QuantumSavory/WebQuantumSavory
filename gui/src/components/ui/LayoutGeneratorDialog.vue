<template>
  <AppDialog
    v-bind="$attrs"
    :show="show"
    :title="title"
    :width="width"
    class="layout-generator-dialog"
    dismissable-mask
    @close="handleCancel"
  >
    <form
      :id="formId"
      class="layout-generator-form"
      @submit.prevent="handleSubmit"
    >
      <p class="dialog-description" data-layout-section="description">
        {{ description }}
      </p>

      <div class="layout-generator-content" data-layout-section="fields">
        <slot />
      </div>

      <div
        v-if="validationMessage"
        class="validation-error"
        data-layout-section="validation"
        role="alert"
      >
        {{ validationMessage }}
      </div>

      <div v-if="$slots.help" class="layout-generator-help-slot" data-layout-section="help">
        <slot name="help" />
      </div>
    </form>

    <template #footer>
      <AppButton type="button" @click="handleCancel">Cancel</AppButton>
      <AppButton
        variant="primary"
        type="submit"
        :form="formId"
        :disabled="!valid"
      >
        {{ submitLabel }}
      </AppButton>
    </template>
  </AppDialog>
</template>

<script setup>
import AppButton from './AppButton.vue'
import AppDialog from './AppDialog.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, required: true },
  formId: { type: String, required: true },
  description: { type: String, required: true },
  valid: { type: Boolean, default: false },
  validationMessage: { type: String, default: '' },
  submitLabel: { type: String, required: true },
  width: { type: String, default: 'min(640px, calc(100vw - 32px))' }
})

const emit = defineEmits(['submit', 'cancel'])

function handleSubmit() {
  if (props.valid) emit('submit')
}

function handleCancel() {
  emit('cancel')
}
</script>

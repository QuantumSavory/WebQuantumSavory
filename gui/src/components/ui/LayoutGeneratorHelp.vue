<template>
  <section
    class="layout-generator-help"
    role="note"
    :aria-labelledby="headingId"
  >
    <div class="layout-generator-help-heading">
      <CircleHelp :size="17" aria-hidden="true" />
      <h3 :id="headingId">{{ title }}</h3>
    </div>
    <div class="layout-generator-help-content">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { useId } from 'vue'
import { CircleHelp } from '@lucide/vue'

defineProps({
  title: { type: String, default: 'Generator guidance' }
})

const headingId = `layout-generator-help-${useId()}`
</script>

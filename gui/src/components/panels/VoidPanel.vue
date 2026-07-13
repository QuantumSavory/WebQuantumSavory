<script setup>
import BasePanel from './BasePanel.vue'

defineProps({
  collapsed: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:collapsed'])
</script>

<template>
  <BasePanel 
    panel_id="void_panel" 
    title="Selected Element" 
    :collapsable="true"
    :collapsed="collapsed"
    @update:collapsed="emit('update:collapsed', $event)"
  >
    <template #content>
      <div style="padding: 10px 0px; text-align: center; height: 100%;">
        <div style="height: 90%; display: flex; align-items: center; justify-content: center; color: #999;">
          <slot>Nothing selected</slot>
        </div>
      </div>
    </template>
  </BasePanel>
</template>

<style scoped>
</style>

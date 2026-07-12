<template>
  <component
    :is="item.lucideIcon"
    v-if="item.lucideIcon"
    class="lucide-menu-icon"
    :size="16"
    :stroke-width="2"
    aria-hidden="true"
  />
</template>

<script setup>
defineProps({
  item: {
    type: Object,
    required: true
  }
})
</script>

<style scoped>
.lucide-menu-icon {
  flex: 0 0 auto;
}
</style>

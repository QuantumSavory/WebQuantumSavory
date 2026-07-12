<template>
  <span
    class="node-index"
    :aria-label="`Node ID ${displayIndex}`"
    v-tooltip.top="'Node ID (the 1-based index used by the simulator)'"
  ><span class="node-index-prefix" aria-hidden="true">#</span>{{ displayIndex }}</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  index: {
    type: Number,
    required: true
  }
})

const displayIndex = computed(() => props.index + 1)
</script>

<style scoped>
.node-index {
  color: #999;
  cursor: help;
  flex-shrink: 0;
  font-weight: 400;
  white-space: nowrap;
}

.node-index-prefix {
  margin-right: 2px;
}
</style>

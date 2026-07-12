<template>
  <ArrowUpNarrowWide
    v-if="sorted && sortOrder === 1"
    class="lucide-sort-icon"
    :class="iconClass"
    :size="14"
    aria-hidden="true"
  />
  <ArrowDownWideNarrow
    v-else-if="sorted && sortOrder === -1"
    class="lucide-sort-icon"
    :class="iconClass"
    :size="14"
    aria-hidden="true"
  />
  <ArrowUpDown
    v-else
    class="lucide-sort-icon"
    :class="iconClass"
    :size="14"
    aria-hidden="true"
  />
</template>

<script setup>
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide } from '@lucide/vue'

defineProps({
  sorted: {
    type: Boolean,
    default: false
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  iconClass: {
    type: [String, Array, Object],
    default: null
  }
})
</script>

<template>
    <div class="slot-actions">
        <button
            type="button"
            class="slot-action noborder"
            aria-label="Toggle details"
            v-tooltip.top="'Toggle details'"
            @click.stop="toggleDetails"
        >
            <SlidersHorizontal :size="15" aria-hidden="true" />
        </button>
        <button
            type="button"
            class="slot-action noborder"
            aria-label="Show results"
            v-tooltip.top="'Show results'"
            @click.stop="showResults"
        >
            <ChartNoAxesCombined :size="15" aria-hidden="true" />
        </button>
        <button
            type="button"
            class="slot-action noborder"
            aria-label="Delete slot"
            v-tooltip.top="'Delete slot'"
            @click.stop="deleteSlot"
        >
            <Trash2 :size="15" aria-hidden="true" />
        </button>
    </div>
</template>

<script setup>
import { ChartNoAxesCombined, SlidersHorizontal, Trash2 } from '@lucide/vue'

const props = defineProps({
    registerSlot: {
        type: Object,
        required: true
    },
    node: {
        type: Object,
        required: false
    }
})

const emit = defineEmits(['deleteSlot', 'toggleDetails'])

function toggleDetails(){
  emit('toggleDetails', props.registerSlot)
}

function showResults(){
  const slotIndex = props.node?.data?.slots?.findIndex(s => s.id === props.registerSlot.id) ?? -1
  const context = {
    nodeName: props.node?.name || 'Unknown Node',
    slotIndex: slotIndex >= 0 ? slotIndex : 'Unknown'
  }
  window.showResultsView( 'slot', props.registerSlot, context )
}

function deleteSlot(){
  emit('deleteSlot', props.registerSlot)
}
</script>

<style scoped>
.slot-actions{
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
  margin-left: 4px;
}

button.slot-action{
  width: 24px;
  min-width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 4px;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
}

button.slot-action:hover{
  background: #eeeeee;
  color: #4345ac;
}
</style>

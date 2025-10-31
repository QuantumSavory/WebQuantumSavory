<template>
    <div class="" >
        <button class="options-btn noborder" @mouseover="showOptionsMenu" aria-label="Menu" style="font-weight: bold; color: #000;    padding: 0px 5px;">
        ⋮
        </button>
        <Menu @mouseleave="hideOptionsMenu" ref="optionsMenuElement"  :model="optionsMenuItems" :popup="true" style="transform: translate(10px, -30px);"/>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import Menu from 'primevue/menu';

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

const slot = ref(props.registerSlot);
const optionsMenuElement = ref(null);
const optionsMenuItems = computed(() => {
  let result = [
    { label: 'Toggle Details', icon: 'pi pi-pencil', command: () => handleOptionsMenu('editDetails') },
    { label: 'Show Results', icon: 'pi pi-chart-line', command: () => handleOptionsMenu('getResults') },
    { label: 'Delete', icon: 'pi pi-trash', command: () => handleOptionsMenu('delete') },
  ];
  return result;
}) 


const slotOptionsMenuItems = ref([
  {
    label: 'Delete Slot',
    icon: 'pi pi-trash',
    command: () => { deleteSlot(slot) }
  }
])

function handleOptionsMenu(action){
  if( action === 'delete' ){
    emit('deleteSlot', slot.value)
  }else if( action === 'editDetails' ){
    emit('toggleDetails', slot.value)
  }else if( action === 'getResults' ){
    // Find slot index in node's slots array
    const slotIndex = props.node?.data?.slots?.findIndex(s => s.id === slot.value.id) ?? -1
    const context = {
      nodeName: props.node?.name || 'Unknown Node',
      slotIndex: slotIndex >= 0 ? slotIndex : 'Unknown'
    }
    window.showResultsView( 'slot', slot.value, context )
  }
}

function showOptionsMenu(event){
  optionsMenuElement.value.show(event)
}

function hideOptionsMenu(event){
  optionsMenuElement.value.hide(event)
}
</script>

<style scoped>
</style>
<template>
<div 
    @click="handleClick"
    class="slot-icon"
    :data-slot-id="registerSlot.id"
    >
    <svg style="pointer-events: none;" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Assigned state -->
        <template v-if="registerSlot.assignment">
            <!-- Locked state -->
            <path v-if="registerSlot.isLocked" d="M10.8897 2.52456C12.5594 4.86775 12.3448 8.14051 10.2427 10.2427C8.14053 12.3448 4.86776 12.5594 2.52458 10.8897L10.8897 2.52456ZM1.75739 1.75738C3.85954 -0.344768 7.13231 -0.559372 9.47549 1.11035L1.11036 9.47548C-0.559356 7.13229 -0.344752 3.85952 1.75739 1.75738Z" :fill="getSlotColor()" />
            <!-- Unlocked state -->
            <circle v-else cx="6" cy="6" r="5.5" :fill="getSlotColor()"  />
        </template>
        <!-- Unassigned state -->
        <template v-else>
            <!-- Locked state -->
            <path v-if="registerSlot.isLocked" d="M6 0C7.47658 0 8.82778 0.534338 9.87305 1.41895L9.88867 1.4043L10.5967 2.11133L10.5801 2.12695C11.4649 3.17228 12 4.52319 12 6C12 9.31371 9.31371 12 6 12C4.52319 12 3.17228 11.4649 2.12695 10.5801L2.11133 10.5967L1.4043 9.88965L1.41992 9.87305C0.535071 8.82772 0 7.47681 0 6C0 2.68629 2.68629 0 6 0ZM2.83594 9.87109C3.69787 10.5764 4.79936 11 6 11C8.76142 11 11 8.76142 11 6C11 4.79936 10.5764 3.69787 9.87109 2.83594L2.83594 9.87109ZM6 1C3.23858 1 1 3.23858 1 6C1 7.20064 1.42356 8.30213 2.12891 9.16406L9.16406 2.12793C8.3022 1.42282 7.20041 1 6 1Z" :fill="getSlotColor()" />
            <!-- Unlocked state -->
            <circle v-else cx="6" cy="6" r="5.5"  :stroke="getSlotColor()" stroke-width="2" />
        </template>
    </svg>
</div>
   
</template>

<script setup>
import { ref, computed } from 'vue';
import { api } from '../../utils/ApiConnector';
import Tooltip from 'primevue/tooltip';

const props = defineProps({
  registerSlot: { type: Object, required: true },
  node: { type: Object, required: true }
});

const tooltipContent = ref();
const resultFromShowEndpoint = ref(`placeholder`);


async function fetchResults(){
  const response = await api.getSlotResults( props.registerSlot );
  resultFromShowEndpoint.value = response;
}

async function getSlotResults( slotObject ){
  const content = await api.getSlotResults( slotObject  );
    tooltipContent.value = content;
}

function getSlotColor(){
  if(props.registerSlot.type == "Qubit"){
    return "#48ca82"
  }
  if(props.registerSlot.type == "Qumode"){
    return "#ffac2d"
  }
}

function getSlotStyle(){
  const slot = props.registerSlot;
  let color = getSlotColor(slot);
  let isLocked = slot.isLocked;
  let isAssigned = slot.assignment;
  let result = {};
  if( isAssigned ){
    result.backgroundColor = color;
  }else{
    result.border = "1px solid " + color;
    result.backgroundColor = "#ffffff00";
  }

  if( isLocked ){
    result.borderRadius = "0px";
  }else{
    result.borderRadius = "50%";
  }
  
  return result;
}
</script>

<style scoped>
.slot-icon {
  position: relative;
}

svg {
  margin: 0px 0px 0px;
  margin-bottom: -1.5px;
  transform: scale(0.8);
}
</style>

<template>
  <div class="panel" :class="{ collapsed: collapsed }">
    <div class="panel-title collapsable" v-if="collapsable" @click="toggleCollapsedPanel">
        <div class="panel-title-text">
          <div class="panel-title-text-title" v-html="title"></div>
          <div class="panel-title-text-indicator" v-if="$slots.indicator || indicator">
            <slot name="indicator">
              <span v-html="indicator"></span>
            </slot>
          </div>
        </div>
        <div class="panel-title-badges">
          <slot name="title-badges"></slot>
        </div>
        <div class="panel-title-icon" >
          <ChevronDown v-if="collapsed" :size="15" aria-hidden="true" />
          <ChevronUp v-else :size="15" aria-hidden="true" />
        </div>
    </div>
    <div class="panel-title" v-else>
        <div class="panel-title-text">
          <div class="panel-title-text-title" v-html="title"></div>
          <div class="panel-title-text-indicator" v-if="$slots.indicator || indicator">
            <slot name="indicator">
              <span v-html="indicator"></span>
            </slot>
          </div>
        </div>
        <div class="panel-title-badges">
          <slot name="title-badges"></slot>
        </div>
    </div>

    <div v-if="!collapsed" class="panel-content">
        <slot name="content"></slot>
      </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ChevronDown, ChevronUp } from '@lucide/vue'

const props = defineProps({
  panel_id:     { type: String,   required: true  }, 
  title:        { type: String,   required: true  }, 
  indicator:    { type: String,   default: null  },
  collapsable:  { type: Boolean,  default: false  }
})

const emit = defineEmits(['collapsed-changed'])

const collapsed = ref( false )
const initCollapsedState = props.collapsable;
if( initCollapsedState ) {
  const savedState = localStorage.getItem('panelCollapsed_' + props.panel_id);
  collapsed.value = savedState === 'true';
}


function toggleCollapsedPanel() {
  console.log( 'toggleCollapsedPanel' );
  collapsed.value = !collapsed.value
  localStorage.setItem('panelCollapsed_' + props.panel_id, collapsed.value)
  
  // Emit the collapsed state change
  emit('collapsed-changed', collapsed.value)
}

</script>

<style scoped>
.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-title-text {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.panel-title-text-indicator {
  color: #999;
}

.panel-title-badges {
  display: flex;
  align-items: center;
  gap: 4px;
}

.panel-title-icon {
  top: 1px;
  position: relative;
  flex-shrink: 0;
  padding-right :6px;
}
</style>

<template>
  <div class="panel" :class="{ collapsed: collapsed }">
    <div
      v-if="collapsable"
      class="panel-title collapsable"
      role="button"
      tabindex="0"
      :aria-expanded="!collapsed"
      :aria-controls="`${panel_id}-content`"
      @click="toggleCollapsedPanel"
      @keydown.enter.prevent="toggleCollapsedPanel"
      @keydown.space.prevent="toggleCollapsedPanel"
    >
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

    <div v-if="!collapsed" :id="`${panel_id}-content`" class="panel-content">
        <slot name="content"></slot>
      </div>
  </div>
</template>

<script setup>
import { ChevronDown, ChevronUp } from '@lucide/vue'

const props = defineProps({
  panel_id:     { type: String,   required: true  }, 
  title:        { type: String,   required: true  }, 
  indicator:    { type: String,   default: null  },
  collapsable:  { type: Boolean,  default: false  },
  collapsed:    { type: Boolean,  default: false  }
})

const emit = defineEmits(['update:collapsed'])

function toggleCollapsedPanel() {
  if (!props.collapsable) return
  emit('update:collapsed', !props.collapsed)
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

.panel-title.collapsable:focus-visible {
  border-radius: 3px;
  outline: 2px solid #4345ac;
  outline-offset: 2px;
}
</style>

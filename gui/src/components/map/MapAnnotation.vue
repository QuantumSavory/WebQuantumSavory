<template>
  <div class="map-annotation-owner">
    <MapRectangleLayer
      v-if="areaFeature"
      :map="map"
      :layer-key="`${annotation.id}-area`"
      :feature="areaFeature"
      :fill-color="annotation.backgroundColor"
      :border-color="annotation.borderColor"
      :fill-opacity="0"
      :line-width="2"
      :line-dasharray="[3, 3]"
    />
    <MapRectangleLayer
      :map="map"
      :layer-key="annotation.id"
      :feature="annotationFeature"
      :fill-color="annotation.backgroundColor"
      :border-color="annotation.borderColor"
      :line-width="isSelected ? 3 : 2"
    />
    <AnnotationOverlay
      :map="map"
      :annotation="annotation"
      :is-selected="isSelected"
      @select="(...args) => emit('select', ...args)"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  annotationAreaToGeoJSON,
  annotationToGeoJSON,
} from '../../utils/annotationGeometry'
import AnnotationOverlay from './AnnotationOverlay.vue'
import MapRectangleLayer from './MapRectangleLayer.vue'

const props = defineProps({
  map: { type: Object, required: true },
  annotation: { type: Object, required: true },
  isSelected: { type: Boolean, default: false },
})

const emit = defineEmits(['select'])
const annotationFeature = computed(() => annotationToGeoJSON(props.annotation))
const areaFeature = computed(() => annotationAreaToGeoJSON(props.annotation))
</script>

<style scoped>
.map-annotation-owner {
  display: none;
}
</style>

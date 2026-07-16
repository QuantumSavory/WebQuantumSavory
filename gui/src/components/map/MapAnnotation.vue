<template>
  <div class="map-annotation-owner">
    <MapRectangleLayer
      v-if="areaFeature"
      :map="map"
      :layer-key="`${annotation.id}-area`"
      :before-layer-id="annotationFillLayerId(annotation.id)"
      :feature="areaFeature"
      :fill-color="annotation.backgroundColor"
      :border-color="annotation.borderColor"
      :fill-opacity="0"
      :line-width="2"
      :line-dasharray="[3, 3]"
    />
    <MapRectangleLayer
      v-if="annotationFeature"
      :map="map"
      :layer-key="annotation.id"
      :before-layer-id="nextAnnotationLayerId"
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
import { annotationFillLayerId } from '../../utils/mapLayers'
import AnnotationOverlay from './AnnotationOverlay.vue'
import MapRectangleLayer from './MapRectangleLayer.vue'

const props = defineProps({
  map: { type: Object, required: true },
  annotation: { type: Object, required: true },
  isSelected: { type: Boolean, default: false },
  nextAnnotationId: { type: String, default: '' },
})

const emit = defineEmits(['select'])
const annotationFeature = computed(() => annotationToGeoJSON(props.annotation))
const areaFeature = computed(() => annotationAreaToGeoJSON(props.annotation))
const nextAnnotationLayerId = computed(() => (
  props.nextAnnotationId ? annotationFillLayerId(props.nextAnnotationId) : ''
))
</script>

<style scoped>
.map-annotation-owner {
  display: none;
}
</style>

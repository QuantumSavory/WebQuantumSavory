<template>
  <div class="annotation-overlay-owner">
    <div
      ref="element"
      class="annotation-overlay"
      :class="{ 'is-selected': isSelected }"
      :data-annotation-id="annotation.id"
      role="note"
      tabindex="0"
      :aria-label="`Map annotation ${annotation.id}`"
      @click.stop="selectAnnotation"
      @keydown.enter.prevent="selectAnnotation"
      @keydown.space.prevent="selectAnnotation"
    >
      <div class="annotation-markdown" v-html="renderedMarkdown" />
    </div>

    <AnnotationResizeHandle
      v-for="handle in annotationHandles"
      :key="handle.corner"
      :map="map"
      :position="handle.position"
      :corner="handle.corner"
      :label="`Resize annotation from ${handle.corner} corner`"
      @activate="selectAnnotation"
      @move="position => resizeFromCorner(handle.corner, position)"
    />

    <AnnotationResizeHandle
      v-if="areaHandlePosition"
      key="area-free-corner"
      :map="map"
      :position="areaHandlePosition"
      kind="area"
      label="Resize attached annotation area from its free corner"
      @activate="selectAnnotation"
      @move="moveAreaFreeCorner"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useMaplibreMarker } from '../../composables/useMaplibreMarker'
import {
  ANNOTATION_CORNERS,
  moveAnnotationToNorthwest,
  resizeAnnotation,
  setAnnotationAreaFreeCorner,
} from '../../utils/annotationGeometry'
import { renderMarkdown } from '../../utils/markdown'
import AnnotationResizeHandle from './AnnotationResizeHandle.vue'

const props = defineProps({
  map: { type: Object, required: true },
  annotation: { type: Object, required: true },
  isSelected: { type: Boolean, default: false },
})

const emit = defineEmits(['select'])
const element = ref(null)
const renderedMarkdown = computed(() => renderMarkdown(props.annotation.markdown))
const annotationHandles = computed(() => {
  if (!props.isSelected) return []
  const bounds = props.annotation.bounds
  return ANNOTATION_CORNERS.map(corner => ({
    corner,
    position: [
      corner.endsWith('west') ? bounds.west : bounds.east,
      corner.startsWith('north') ? bounds.north : bounds.south,
    ],
  }))
})
const areaHandlePosition = computed(() => (
  props.isSelected && props.annotation.area
    ? [...props.annotation.area.freeCorner]
    : null
))

let dragStartBounds = null
const mapGeometryEvents = ['move', 'zoom', 'rotate', 'pitch', 'resize']

function selectAnnotation() {
  emit('select', props.annotation, 'annotation')
}

function annotationNorthwest() {
  return [props.annotation.bounds.west, props.annotation.bounds.north]
}

function projectedLength(start, end) {
  const projectedStart = props.map.project(start)
  const projectedEnd = props.map.project(end)
  return Math.hypot(
    projectedEnd.x - projectedStart.x,
    projectedEnd.y - projectedStart.y,
  )
}

function updateOverlayGeometry() {
  if (!element.value) return
  const bounds = props.annotation.bounds
  markerController.setPosition(annotationNorthwest())
  element.value.style.width = `${projectedLength(
    [bounds.west, bounds.north],
    [bounds.east, bounds.north],
  )}px`
  element.value.style.height = `${projectedLength(
    [bounds.west, bounds.north],
    [bounds.west, bounds.south],
  )}px`
}

function updateDrag() {
  if (!dragStartBounds) return
  const position = markerController.getPosition()
  if (!position) return
  const updated = moveAnnotationToNorthwest(
    { ...props.annotation, bounds: dragStartBounds },
    position,
  )
  Object.assign(props.annotation, updated)
  markerController.setPosition(annotationNorthwest())
}

function resizeFromCorner(corner, position) {
  const updated = resizeAnnotation(props.annotation, corner, position, props.map)
  Object.assign(props.annotation, updated)
}

function moveAreaFreeCorner(position) {
  const updated = setAnnotationAreaFreeCorner(props.annotation, position)
  Object.assign(props.annotation, updated)
}

const markerController = useMaplibreMarker({
  map: () => props.map,
  element,
  position: annotationNorthwest,
  options: {
    draggable: true,
    anchor: 'top-left',
    rotationAlignment: 'map',
    pitchAlignment: 'map',
  },
  ariaLabel: () => `Map annotation ${props.annotation.id}`,
  events: {
    dragstart: () => {
      dragStartBounds = { ...props.annotation.bounds }
      selectAnnotation()
    },
    drag: updateDrag,
    dragend: () => {
      updateDrag()
      dragStartBounds = null
    },
  },
  watchPosition: false,
})

onMounted(() => {
  mapGeometryEvents.forEach(event => props.map.on(event, updateOverlayGeometry))
  updateOverlayGeometry()
})

watch(() => props.annotation.bounds, updateOverlayGeometry, { deep: true })

onUnmounted(() => {
  mapGeometryEvents.forEach(event => props.map.off(event, updateOverlayGeometry))
})
</script>

<style scoped>
.annotation-overlay-owner {
  display: none;
}

.annotation-overlay {
  min-width: 1px;
  min-height: 1px;
  overflow: hidden;
  padding: var(--app-space-3);
  border: 1px solid transparent;
  background: transparent;
  color: var(--app-color-text);
  cursor: grab;
  z-index: var(--app-z-map-annotation);
}

.annotation-overlay:active {
  cursor: grabbing;
}

.annotation-overlay.is-selected {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--app-color-primary) 60%, transparent);
}

.annotation-overlay:focus-visible {
  outline: var(--app-focus-ring-width) solid var(--app-color-focus);
  outline-offset: var(--app-focus-ring-offset);
}

.annotation-markdown {
  width: 100%;
  height: 100%;
  overflow: auto;
  overflow-wrap: anywhere;
  line-height: 1.4;
}

.annotation-markdown :deep(p),
.annotation-markdown :deep(ul),
.annotation-markdown :deep(ol),
.annotation-markdown :deep(blockquote),
.annotation-markdown :deep(pre) {
  margin: 0 0 0.65em;
}

.annotation-markdown :deep(ul),
.annotation-markdown :deep(ol) {
  padding-left: 1.5em;
}

.annotation-markdown :deep(img) {
  max-width: 100%;
  height: auto;
}

.annotation-markdown :deep(.katex-display) {
  overflow-x: auto;
  overflow-y: hidden;
}
</style>

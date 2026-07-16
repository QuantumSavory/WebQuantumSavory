export const EDGE_LINE_LAYER_PREFIX = 'edge-layer-'
export const EDGE_CLICK_LAYER_PREFIX = 'edge-click-layer-'
export const ANNOTATION_FILL_LAYER_PREFIX = 'annotation-fill-'
export const ANNOTATION_LINE_LAYER_PREFIX = 'annotation-line-'
export const ANNOTATION_SOURCE_PREFIX = 'annotation-source-'

export function edgeLineLayerId(edgeId) {
  return `${EDGE_LINE_LAYER_PREFIX}${edgeId}`
}

export function edgeClickLayerId(edgeId) {
  return `${EDGE_CLICK_LAYER_PREFIX}${edgeId}`
}

export function isEdgeLayerId(layerId) {
  return typeof layerId === 'string'
    && (layerId.startsWith(EDGE_LINE_LAYER_PREFIX)
      || layerId.startsWith(EDGE_CLICK_LAYER_PREFIX))
}

export function firstEdgeLayerId(map) {
  return map.getStyle?.().layers?.find(layer => isEdgeLayerId(layer.id))?.id ?? null
}

export function annotationFillLayerId(layerKey) {
  return `${ANNOTATION_FILL_LAYER_PREFIX}${layerKey}`
}

export function annotationLineLayerId(layerKey) {
  return `${ANNOTATION_LINE_LAYER_PREFIX}${layerKey}`
}

export function annotationSourceId(layerKey) {
  return `${ANNOTATION_SOURCE_PREFIX}${layerKey}`
}

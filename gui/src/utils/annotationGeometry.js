import { generateUUid } from './Utils'

export const DEFAULT_ANNOTATION_WIDTH_PIXELS = 240
export const DEFAULT_ANNOTATION_HEIGHT_PIXELS = 140
export const MIN_ANNOTATION_WIDTH_PIXELS = 80
export const MIN_ANNOTATION_HEIGHT_PIXELS = 60
export const DEFAULT_ANNOTATION_BACKGROUND_COLOR = '#ffffff'
export const DEFAULT_ANNOTATION_BORDER_COLOR = '#334155'
export const ANNOTATION_CORNERS = Object.freeze([
  'northwest',
  'northeast',
  'southeast',
  'southwest',
])

const CORNER_ALIASES = Object.freeze({
  nw: 'northwest',
  ne: 'northeast',
  se: 'southeast',
  sw: 'southwest',
})
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function geographicPosition(value) {
  return Array.isArray(value)
    && value.length === 2
    && value.every(Number.isFinite)
    && value[0] >= -180
    && value[0] <= 180
    && value[1] >= -90
    && value[1] <= 90
}

function clonePosition(value) {
  return [value[0], value[1]]
}

function normalizeCorner(value) {
  const corner = CORNER_ALIASES[value] || value
  if (!ANNOTATION_CORNERS.includes(corner)) {
    throw new Error(`Annotation resize corner must be one of: ${ANNOTATION_CORNERS.join(', ')}`)
  }
  return corner
}

function finiteScreenDimension(value, fallback, name) {
  const resolved = value ?? fallback
  if (typeof resolved !== 'number' || !Number.isFinite(resolved) || resolved <= 0) {
    throw new Error(`${name} must be a finite positive number`)
  }
  return resolved
}

function projectedPoint(value, name) {
  const point = Array.isArray(value) ? value : [value?.x, value?.y]
  if (point.length !== 2 || !point.every(Number.isFinite)) {
    throw new Error(`${name} must produce a finite screen position`)
  }
  return point
}

function unprojectedPosition(value) {
  const position = Array.isArray(value)
    ? value
    : [value?.lng ?? value?.longitude, value?.lat ?? value?.latitude]
  if (!geographicPosition(position)) {
    throw new Error('Annotation screen geometry must unproject to valid map coordinates')
  }
  return position
}

function projectionAdapter(projection) {
  if (typeof projection?.project !== 'function' || typeof projection?.unproject !== 'function') {
    throw new Error('Annotation screen geometry requires project and unproject functions')
  }
  return {
    project(position) {
      return projectedPoint(projection.project(position), 'Annotation projection')
    },
    unproject(point) {
      return unprojectedPosition(projection.unproject(point))
    },
  }
}

function rectangleFeature(bounds, properties) {
  return {
    type: 'Feature',
    properties: { ...properties },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [bounds.west, bounds.south],
        [bounds.east, bounds.south],
        [bounds.east, bounds.north],
        [bounds.west, bounds.north],
        [bounds.west, bounds.south],
      ]],
    },
  }
}

/** Return a cloned, canonical annotation bounds object. */
export function normalizeAnnotationBounds(value, label = 'Annotation bounds') {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  const bounds = {
    west: value.west,
    south: value.south,
    east: value.east,
    north: value.north,
  }
  if (!Object.values(bounds).every(Number.isFinite)) {
    throw new Error(`${label} must contain finite west, south, east, and north values`)
  }
  if (bounds.west < -180 || bounds.east > 180
    || bounds.south < -90 || bounds.north > 90) {
    throw new Error(`${label} must be within valid longitude and latitude ranges`)
  }
  if (bounds.west >= bounds.east || bounds.south >= bounds.north) {
    throw new Error(`${label} must be canonical and non-empty`)
  }
  return bounds
}

/** Validate and clone one persisted annotation. */
export function normalizeAnnotation(value, label = 'Project annotation') {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  if (typeof value.id !== 'string' || !value.id.trim()) {
    throw new Error(`${label} requires a durable ID`)
  }
  if (typeof value.markdown !== 'string') {
    throw new Error(`${label} markdown must be a string`)
  }
  if (!HEX_COLOR.test(value.backgroundColor)) {
    throw new Error(`${label} backgroundColor must be a six-digit hex color`)
  }
  if (!HEX_COLOR.test(value.borderColor)) {
    throw new Error(`${label} borderColor must be a six-digit hex color`)
  }

  let area = null
  if (value.area != null) {
    if (!isRecord(value.area) || !geographicPosition(value.area.freeCorner)) {
      throw new Error(`${label} area must contain a valid freeCorner map position`)
    }
    area = { freeCorner: clonePosition(value.area.freeCorner) }
  }

  return {
    id: value.id,
    markdown: value.markdown,
    bounds: normalizeAnnotationBounds(value.bounds, `${label} bounds`),
    backgroundColor: value.backgroundColor.toLowerCase(),
    borderColor: value.borderColor.toLowerCase(),
    area,
  }
}

/** Validate and clone the persisted annotation collection. Missing legacy data becomes empty. */
export function normalizeAnnotations(value) {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error('Project annotations must be an array')

  const ids = new Set()
  return value.map((annotation, index) => {
    const normalized = normalizeAnnotation(annotation, `Project annotation ${index + 1}`)
    if (ids.has(normalized.id)) {
      throw new Error(`Project contains duplicate annotation ID: ${normalized.id}`)
    }
    ids.add(normalized.id)
    return normalized
  })
}

/** Allocate an annotation ID which does not collide with the current project collection. */
export function generateAnnotationId(annotations = []) {
  const usedIds = new Set(
    Array.isArray(annotations)
      ? annotations.map(annotation => annotation?.id).filter(id => typeof id === 'string')
      : [],
  )
  const generatedId = generateUUid('annotation')
  let candidate = generatedId
  let suffix = 2
  while (usedIds.has(candidate)) {
    candidate = `${generatedId}_${suffix}`
    suffix += 1
  }
  return candidate
}

/** Construct one canonical annotation without retaining caller-owned nested objects. */
export function createAnnotation({
  id,
  markdown = '',
  bounds,
  backgroundColor = DEFAULT_ANNOTATION_BACKGROUND_COLOR,
  borderColor = DEFAULT_ANNOTATION_BORDER_COLOR,
  area = null,
  existingAnnotations = [],
} = {}) {
  return normalizeAnnotation({
    id: id || generateAnnotationId(existingAnnotations),
    markdown,
    bounds,
    backgroundColor,
    borderColor,
    area,
  })
}

export function annotationCenter(bounds) {
  const normalized = normalizeAnnotationBounds(bounds)
  return [
    (normalized.west + normalized.east) / 2,
    (normalized.south + normalized.north) / 2,
  ]
}

/** Derive the attached area's annotation corner from the free corner's current quadrant. */
export function sharedCornerForFreeCorner(bounds, freeCorner) {
  const normalized = normalizeAnnotationBounds(bounds)
  if (!geographicPosition(freeCorner)) {
    throw new Error('Annotation area freeCorner must be a valid map position')
  }
  const center = annotationCenter(normalized)
  return [
    freeCorner[0] < center[0] ? normalized.west : normalized.east,
    freeCorner[1] < center[1] ? normalized.south : normalized.north,
  ]
}

export function annotationAreaBounds(annotation) {
  const normalized = normalizeAnnotation(annotation)
  if (normalized.area == null) return null
  const freeCorner = normalized.area.freeCorner
  const sharedCorner = sharedCornerForFreeCorner(normalized.bounds, freeCorner)
  return {
    west: Math.min(sharedCorner[0], freeCorner[0]),
    south: Math.min(sharedCorner[1], freeCorner[1]),
    east: Math.max(sharedCorner[0], freeCorner[0]),
    north: Math.max(sharedCorner[1], freeCorner[1]),
  }
}

/** Choose a non-degenerate free corner, preferring an area outside the annotation. */
export function defaultAnnotationAreaFreeCorner(bounds) {
  const normalized = normalizeAnnotationBounds(bounds)
  const center = annotationCenter(normalized)
  const width = normalized.east - normalized.west
  const height = normalized.north - normalized.south
  const longitude = normalized.east < 180
    ? Math.min(180, normalized.east + width)
    : normalized.west > -180
      ? Math.max(-180, normalized.west - width)
      : center[0]
  const latitude = normalized.north < 90
    ? Math.min(90, normalized.north + height)
    : normalized.south > -90
      ? Math.max(-90, normalized.south - height)
      : center[1]
  return [longitude, latitude]
}

/** Attach an area with an independently persisted free corner. */
export function attachAnnotationArea(annotation, freeCorner = null) {
  const normalized = normalizeAnnotation(annotation)
  const resolvedFreeCorner = freeCorner ?? defaultAnnotationAreaFreeCorner(normalized.bounds)
  if (!geographicPosition(resolvedFreeCorner)) {
    throw new Error('Annotation area freeCorner must be a valid map position')
  }
  return {
    ...normalized,
    area: { freeCorner: clonePosition(resolvedFreeCorner) },
  }
}

/** Update only the attached area's free corner. */
export function setAnnotationAreaFreeCorner(annotation, freeCorner) {
  const normalized = normalizeAnnotation(annotation)
  if (normalized.area == null) {
    throw new Error('Annotation must have an attached area before its freeCorner can be updated')
  }
  return attachAnnotationArea(normalized, freeCorner)
}

/** Remove an attached area while retaining the annotation rectangle and content. */
export function detachAnnotationArea(annotation) {
  const normalized = normalizeAnnotation(annotation)
  return { ...normalized, area: null }
}

/** Convert the annotation rectangle to a GeoJSON feature. */
export function annotationToGeoJSON(annotation) {
  const normalized = normalizeAnnotation(annotation)
  return rectangleFeature(normalized.bounds, {
    annotationId: normalized.id,
    kind: 'annotation',
  })
}

/** Convert an attached area to a GeoJSON feature, or null when none is attached. */
export function annotationAreaToGeoJSON(annotation) {
  const normalized = normalizeAnnotation(annotation)
  if (normalized.area == null) return null
  const freeCorner = normalized.area.freeCorner
  const sharedCorner = sharedCornerForFreeCorner(normalized.bounds, freeCorner)
  const bounds = {
    west: Math.min(sharedCorner[0], freeCorner[0]),
    south: Math.min(sharedCorner[1], freeCorner[1]),
    east: Math.max(sharedCorner[0], freeCorner[0]),
    north: Math.max(sharedCorner[1], freeCorner[1]),
  }
  if (bounds.west === bounds.east || bounds.south === bounds.north) {
    return null
  }
  return rectangleFeature(bounds, {
    annotationId: normalized.id,
    kind: 'annotation-area',
  })
}

/** Translate geographic bounds while preserving size and clamping to the world extent. */
export function moveAnnotationBounds(bounds, delta) {
  const normalized = normalizeAnnotationBounds(bounds)
  if (!Array.isArray(delta) || delta.length !== 2 || !delta.every(Number.isFinite)) {
    throw new Error('Annotation movement requires a finite longitude/latitude delta')
  }
  const longitudeDelta = Math.max(
    -180 - normalized.west,
    Math.min(180 - normalized.east, delta[0]),
  )
  const latitudeDelta = Math.max(
    -90 - normalized.south,
    Math.min(90 - normalized.north, delta[1]),
  )
  return {
    west: normalized.west + longitudeDelta,
    south: normalized.south + latitudeDelta,
    east: normalized.east + longitudeDelta,
    north: normalized.north + latitudeDelta,
  }
}

/** Move an annotation while intentionally retaining an attached area's independent free corner. */
export function moveAnnotation(annotation, delta) {
  const normalized = normalizeAnnotation(annotation)
  return {
    ...normalized,
    bounds: moveAnnotationBounds(normalized.bounds, delta),
  }
}

/**
 * Resize one corner in screen space and enforce the shared minimum visible size.
 * The projection object may be a MapLibre map or a focused project/unproject adapter.
 */
export function resizeAnnotationBounds(bounds, cornerValue, requestedPosition, projection, options = {}) {
  const normalized = normalizeAnnotationBounds(bounds)
  if (!geographicPosition(requestedPosition)) {
    throw new Error('Annotation resize position must be a valid map position')
  }
  const corner = normalizeCorner(cornerValue)
  const adapter = projectionAdapter(projection)
  const minimumWidth = finiteScreenDimension(
    options.minimumWidthPixels,
    MIN_ANNOTATION_WIDTH_PIXELS,
    'Minimum annotation width',
  )
  const minimumHeight = finiteScreenDimension(
    options.minimumHeightPixels,
    MIN_ANNOTATION_HEIGHT_PIXELS,
    'Minimum annotation height',
  )
  const isWest = corner.endsWith('west')
  const isNorth = corner.startsWith('north')
  const fixedPosition = [
    isWest ? normalized.east : normalized.west,
    isNorth ? normalized.south : normalized.north,
  ]
  const fixed = adapter.project(fixedPosition)
  const requested = adapter.project(requestedPosition)
  const moving = [
    isWest
      ? Math.min(requested[0], fixed[0] - minimumWidth)
      : Math.max(requested[0], fixed[0] + minimumWidth),
    isNorth
      ? Math.min(requested[1], fixed[1] - minimumHeight)
      : Math.max(requested[1], fixed[1] + minimumHeight),
  ]
  const resizedPosition = adapter.unproject(moving)
  return normalizeAnnotationBounds({
    west: isWest ? resizedPosition[0] : fixedPosition[0],
    south: isNorth ? fixedPosition[1] : resizedPosition[1],
    east: isWest ? fixedPosition[0] : resizedPosition[0],
    north: isNorth ? resizedPosition[1] : fixedPosition[1],
  })
}

/** Resize an annotation while retaining all persisted content and its area's free corner. */
export function resizeAnnotation(annotation, corner, requestedPosition, projection, options = {}) {
  const normalized = normalizeAnnotation(annotation)
  return {
    ...normalized,
    bounds: resizeAnnotationBounds(
      normalized.bounds,
      corner,
      requestedPosition,
      projection,
      options,
    ),
  }
}

/** Build geographic bounds for the standard screen-pixel annotation centered at a map point. */
export function annotationBoundsFromScreenCenter(centerPosition, projection, options = {}) {
  if (!geographicPosition(centerPosition)) {
    throw new Error('Annotation center must be a valid map position')
  }
  const adapter = projectionAdapter(projection)
  const width = finiteScreenDimension(
    options.widthPixels,
    DEFAULT_ANNOTATION_WIDTH_PIXELS,
    'Annotation width',
  )
  const height = finiteScreenDimension(
    options.heightPixels,
    DEFAULT_ANNOTATION_HEIGHT_PIXELS,
    'Annotation height',
  )
  const center = adapter.project(centerPosition)
  const northwest = adapter.unproject([center[0] - width / 2, center[1] - height / 2])
  const southeast = adapter.unproject([center[0] + width / 2, center[1] + height / 2])
  return normalizeAnnotationBounds({
    west: northwest[0],
    south: southeast[1],
    east: southeast[0],
    north: northwest[1],
  })
}

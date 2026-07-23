import along from '@turf/along'
import length from '@turf/length'
import { Bezier } from 'bezier-js'

import {
  projectMapPosition,
  unprojectMapPosition,
} from './layoutTemplates'
import {
  MAX_WEB_MERCATOR_LATITUDE,
  MIN_WEB_MERCATOR_LATITUDE,
  isMapPosition,
} from './mapCoordinates'
import { resolvePhysicalParameters } from './physicalParameters'

export {
  DEFAULT_LOSS_DB_PER_KM,
  DEFAULT_REFRACTIVE_INDEX,
  SPEED_OF_LIGHT_METERS_PER_SECOND,
  formatPhysicalValue,
} from './physicalParameters'
export const CURVE_POINT_TYPES = Object.freeze(['smooth', 'sharp'])
export const INVALID_EDGE_GEOMETRY_REASON = 'INVALID_EDGE_GEOMETRY'

const MIN_CURVE_SAMPLES = 8
const MAX_CURVE_SAMPLES = 4096
const MAX_GEODESIC_LEG_KILOMETERS = 100
const MIN_PROJECTED_X = 0
const MAX_PROJECTED_X = 1
const MIN_PROJECTED_Y = -1
const MAX_PROJECTED_Y = 0

export class EdgeGeometryError extends Error {
  constructor(edge, cause) {
    super(
      'The change was not applied because it would make an edge impossible '
      + 'to draw or measure. Keep nodes and curve points within one supported map world.',
      { cause },
    )
    this.name = 'EdgeGeometryError'
    this.edgeId = edge?.id ?? null
  }
}

function coordinatePair(point) {
  return [point.x, point.y]
}

function vectorBetween(start, end) {
  return [end[0] - start[0], end[1] - start[1]]
}

function scaleVector(vector, scale) {
  return [vector[0] * scale, vector[1] * scale]
}

function addVector(point, vector) {
  return [point[0] + vector[0], point[1] + vector[1]]
}

function subtractVector(point, vector) {
  return [point[0] - vector[0], point[1] - vector[1]]
}

function sharedTangent(points, index) {
  if (index === 0) return vectorBetween(points[0], points[1])
  if (index === points.length - 1) {
    return vectorBetween(points[index - 1], points[index])
  }
  return scaleVector(vectorBetween(points[index - 1], points[index + 1]), 0.5)
}

function outgoingTangent(points, types, index) {
  if (index > 0 && index < points.length - 1 && types[index] === 'sharp') {
    return vectorBetween(points[index], points[index + 1])
  }
  return sharedTangent(points, index)
}

function incomingTangent(points, types, index) {
  if (index > 0 && index < points.length - 1 && types[index] === 'sharp') {
    return vectorBetween(points[index - 1], points[index])
  }
  return sharedTangent(points, index)
}

function routeDefinition(sourcePosition, targetPosition, curvePoints = []) {
  if (!isMapPosition(sourcePosition) || !isMapPosition(targetPosition)) {
    throw new Error('An edge route requires valid source and target map positions.')
  }
  if (!Array.isArray(curvePoints)) {
    throw new Error('Edge curve points must be an array.')
  }

  const anchors = curvePoints.map((curvePoint, index) => {
    if (!curvePoint || typeof curvePoint !== 'object') {
      throw new Error(`Curve point ${index + 1} must be an object.`)
    }
    if (typeof curvePoint.id !== 'string' || !curvePoint.id) {
      throw new Error(`Curve point ${index + 1} requires a durable ID.`)
    }
    if (!isMapPosition(curvePoint.position)) {
      throw new Error(`Curve point ${index + 1} has an invalid map position.`)
    }
    if (!CURVE_POINT_TYPES.includes(curvePoint.type)) {
      throw new Error(`Curve point ${index + 1} must be smooth or sharp.`)
    }
    return curvePoint
  })

  return {
    positions: [sourcePosition, ...anchors.map(point => point.position), targetPosition],
    types: ['sharp', ...anchors.map(point => point.type), 'sharp'],
  }
}

/**
 * Convert ordered typed anchors to plain cubic control-point segments.
 * Library-specific Bezier instances remain private to this module.
 */
export function cubicControlSegments(sourcePosition, targetPosition, curvePoints = []) {
  const route = routeDefinition(sourcePosition, targetPosition, curvePoints)
  const points = route.positions.map(projectMapPosition)

  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1]
    const control1 = addVector(
      start,
      scaleVector(outgoingTangent(points, route.types, index), 1 / 3),
    )
    const control2 = subtractVector(
      end,
      scaleVector(incomingTangent(points, route.types, index + 1), 1 / 3),
    )
    return [start, control1, control2, end]
  })
}

function bezierSegments(sourcePosition, targetPosition, curvePoints) {
  return cubicControlSegments(sourcePosition, targetPosition, curvePoints).map(points => (
    new Bezier(...points.flat())
  ))
}

function lineFeature(coordinates) {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  }
}

function routeDistanceKilometers(line) {
  return length(line, { units: 'kilometers' })
}

function routePointAlong(line, distanceKilometers) {
  return along(line, distanceKilometers, { units: 'kilometers' })
    .geometry.coordinates
}

function densifyPhysicalRoute(coordinates) {
  const densified = [[...coordinates[0]]]
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index]
    const end = coordinates[index + 1]
    const leg = lineFeature([start, end])
    const distanceKilometers = routeDistanceKilometers(leg)
    const segmentCount = Math.max(
      1,
      Math.ceil(distanceKilometers / MAX_GEODESIC_LEG_KILOMETERS),
    )
    for (let segmentIndex = 1; segmentIndex < segmentCount; segmentIndex += 1) {
      densified.push(routePointAlong(
        leg,
        distanceKilometers * segmentIndex / segmentCount,
      ))
    }
    densified.push([...end])
  }
  return densified
}

/**
 * MapLibre represents a short antimeridian crossing with a longitude outside
 * the canonical world. Keep that adjustment local to transient route GeoJSON.
 */
function unwrapRouteLongitudes(coordinates) {
  const unwrapped = [[...coordinates[0]]]
  coordinates.slice(1).forEach(([rawLongitude, latitude]) => {
    const previousLongitude = unwrapped.at(-1)[0]
    let longitude = rawLongitude
    while (longitude - previousLongitude > 180) longitude -= 360
    while (longitude - previousLongitude < -180) longitude += 360
    unwrapped.push([longitude, latitude])
  })
  return unwrapped
}

function sameCoordinate(first, second) {
  return Math.abs(first[0] - second[0]) <= 1e-12
    && Math.abs(first[1] - second[1]) <= 1e-12
}

function midpointInsertionIndex(line, halfDistanceKilometers) {
  const coordinates = line.geometry.coordinates
  let travelled = 0
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    travelled += routeDistanceKilometers(lineFeature([
      coordinates[index],
      coordinates[index + 1],
    ]))
    if (travelled >= halfDistanceKilometers) return index + 1
  }
  return coordinates.length - 1
}

/**
 * Finish the route used by every downstream consumer. Physical routes follow
 * a geodesic between every sampled guide point and expose the half-length
 * point as one of their render coordinates.
 */
function finalizeRoute(coordinates, physical) {
  let finalizedCoordinates = coordinates.map(position => [...position])
  if (physical) {
    finalizedCoordinates = unwrapRouteLongitudes(
      densifyPhysicalRoute(finalizedCoordinates),
    )
  }

  let line = lineFeature(finalizedCoordinates)
  const distanceKilometers = routeDistanceKilometers(line)
  let midpoint = routePointAlong(line, distanceKilometers / 2)

  if (physical) {
    const insertionIndex = midpointInsertionIndex(line, distanceKilometers / 2)
    const before = finalizedCoordinates[insertionIndex - 1]
    const after = finalizedCoordinates[insertionIndex]
    if (sameCoordinate(midpoint, before)) {
      midpoint = before
    } else if (sameCoordinate(midpoint, after)) {
      midpoint = after
    } else {
      finalizedCoordinates.splice(insertionIndex, 0, midpoint)
      line = lineFeature(finalizedCoordinates)
    }
  }

  return {
    line,
    distanceMeters: routeDistanceKilometers(line) * 1000,
    midpoint,
  }
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

/**
 * Bézier control points can legitimately overshoot their anchors. Keep that
 * finite overshoot renderable without weakening strict persisted-position and
 * layout-generator validation.
 */
function unprojectCurvePosition(position) {
  if (!Array.isArray(position)
    || position.length !== 2
    || !position.every(Number.isFinite)) {
    throw new Error('The edge curve produced an invalid projected map position.')
  }
  return unprojectMapPosition([
    clamp(position[0], MIN_PROJECTED_X, MAX_PROJECTED_X),
    clamp(position[1], MIN_PROJECTED_Y, MAX_PROJECTED_Y),
  ])
}

function sampleSegments(segments, sampleCount) {
  const projectedPoints = []
  segments.forEach((segment, segmentIndex) => {
    const lookup = segment.getLUT(sampleCount)
    lookup.forEach((point, pointIndex) => {
      if (segmentIndex > 0 && pointIndex === 0) return
      projectedPoints.push(coordinatePair(point))
    })
  })
  return projectedPoints.map(unprojectCurvePosition)
}

function threeSignificantDigitKey(value) {
  return Number(value.toPrecision(3)).toString()
}

function endpointPosition(endpoint, positionOverrides) {
  const override = endpoint?.id == null
    ? null
    : positionOverrides?.get?.(endpoint.id)
  return override
    ?? endpoint?.getPosition?.()
    ?? endpoint?.position
}

/**
 * Return the one sampled GeoJSON route shared by drawing, hit testing, length,
 * midpoint, and physical-delay resolution.
 */
export function sampleEdgeRoute(edge, options = {}) {
  const sourcePosition = endpointPosition(edge?.source, options.positionOverrides)
  const targetPosition = endpointPosition(edge?.target, options.positionOverrides)
  const physical = edge?.isLogic !== true
  const curvePoints = physical ? (edge?.data?.curvePoints ?? []) : []
  const { positions } = routeDefinition(sourcePosition, targetPosition, curvePoints)

  if (curvePoints.length === 0) {
    return {
      ...finalizeRoute(positions, physical),
      converged: true,
      sampleCount: 1,
    }
  }

  const segments = bezierSegments(sourcePosition, targetPosition, curvePoints)
  const minimumSamples = options.minimumSamples ?? MIN_CURVE_SAMPLES
  const maximumSamples = options.maximumSamples ?? MAX_CURVE_SAMPLES
  let sampleCount = minimumSamples
  let previousDistance = null
  let stableIterations = 0
  let current

  while (sampleCount <= maximumSamples) {
    current = finalizeRoute(
      sampleSegments(segments, sampleCount),
      physical,
    )

    if (previousDistance !== null
      && threeSignificantDigitKey(previousDistance)
        === threeSignificantDigitKey(current.distanceMeters)) {
      stableIterations += 1
      if (stableIterations >= 2) break
    } else {
      stableIterations = 0
    }

    previousDistance = current.distanceMeters
    sampleCount *= 2
  }

  return {
    ...current,
    converged: stableIterations >= 2,
    sampleCount: Math.min(sampleCount, maximumSamples),
  }
}

/** Project a map click onto the closest cubic segment of an edge route. */
export function projectPointOntoEdge(edge, mapPosition, options = {}) {
  if (!isMapPosition(mapPosition)) {
    throw new Error('The curve insertion point must be a valid map position.')
  }
  const sourcePosition = endpointPosition(edge?.source, options.positionOverrides)
  const targetPosition = endpointPosition(edge?.target, options.positionOverrides)
  const curvePoints = edge?.data?.curvePoints ?? []
  const projectedClick = projectMapPosition(mapPosition)
  const segments = bezierSegments(sourcePosition, targetPosition, curvePoints)

  let closest = null
  segments.forEach((segment, segmentIndex) => {
    const projection = segment.project({ x: projectedClick[0], y: projectedClick[1] })
    if (!closest || projection.d < closest.distance) {
      closest = {
        segmentIndex,
        t: projection.t,
        distance: projection.d,
        position: unprojectCurvePosition([projection.x, projection.y]),
      }
    }
  })
  return closest
}

/**
 * Assert the render/length invariant shared by map previews and design commits.
 * Returning the sample lets callers avoid immediately calculating it again.
 */
export function assertEdgeGeometry(edge, options = {}) {
  try {
    const sampled = sampleEdgeRoute(edge, options)
    const coordinates = sampled.line?.geometry?.coordinates
    const isRenderedPosition = position => (
      Array.isArray(position)
      && position.length === 2
      && position.every(Number.isFinite)
      && position[1] >= MIN_WEB_MERCATOR_LATITUDE
      && position[1] <= MAX_WEB_MERCATOR_LATITUDE
    )
    if (
      !Array.isArray(coordinates)
      || coordinates.length < 2
      || !coordinates.every(isRenderedPosition)
      || !isRenderedPosition(sampled.midpoint)
      || !Number.isFinite(sampled.distanceMeters)
      || sampled.distanceMeters < 0
      || sampled.converged !== true
    ) {
      throw new Error('The sampled edge route is not finite and converged.')
    }
    return sampled
  } catch (error) {
    if (error instanceof EdgeGeometryError) throw error
    throw new EdgeGeometryError(edge, error)
  }
}

export function assertEdgeGeometries(edges, options = {}) {
  for (const edge of edges || []) assertEdgeGeometry(edge, options)
}

/** Validate only the routes whose endpoint would move, without mutating a node. */
export function assertNodeMoveGeometry(node, position, edges) {
  if (!isMapPosition(position)) {
    throw new EdgeGeometryError(null, new Error('The node position is outside map bounds.'))
  }
  const positionOverrides = new Map([[node.id, [...position]]])
  const connectedEdges = (edges || []).filter(edge => (
    edge?.source?.id === node.id || edge?.target?.id === node.id
  ))
  assertEdgeGeometries(connectedEdges, { positionOverrides })
  return position
}

/** Resolve persisted overrides to the physical values used by badges and payloads. */
export function resolveEdgePhysicalProperties(edge, physicalConfig = {}, options = {}) {
  if (edge?.isLogic === true) return null

  const sampled = sampleEdgeRoute(edge, options)
  return {
    ...sampled,
    ...resolvePhysicalParameters(
      sampled.distanceMeters,
      physicalConfig,
      edge?.data?.physicalOverrides,
    ),
  }
}

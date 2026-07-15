import along from '@turf/along'
import length from '@turf/length'
import { Bezier } from 'bezier-js'

import {
  isMapPosition,
  projectMapPosition,
  unprojectMapPosition,
} from './layoutTemplates'

export const SPEED_OF_LIGHT_METERS_PER_SECOND = 299_792_458
export const DEFAULT_REFRACTIVE_INDEX = 1.468
export const CURVE_POINT_TYPES = Object.freeze(['smooth', 'sharp'])

const MIN_CURVE_SAMPLES = 8
const MAX_CURVE_SAMPLES = 4096

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

function sampleSegments(segments, sampleCount) {
  const projectedPoints = []
  segments.forEach((segment, segmentIndex) => {
    const lookup = segment.getLUT(sampleCount)
    lookup.forEach((point, pointIndex) => {
      if (segmentIndex > 0 && pointIndex === 0) return
      projectedPoints.push(coordinatePair(point))
    })
  })
  return projectedPoints.map(unprojectMapPosition)
}

function threeSignificantDigitKey(value) {
  return Number(value.toPrecision(3)).toString()
}

/**
 * Return the one sampled GeoJSON route shared by drawing, hit testing, length,
 * midpoint, and physical-delay resolution.
 */
export function sampleEdgeRoute(edge, options = {}) {
  const sourcePosition = edge?.source?.getPosition?.() ?? edge?.source?.position
  const targetPosition = edge?.target?.getPosition?.() ?? edge?.target?.position
  const curvePoints = edge?.isLogic === true ? [] : (edge?.data?.curvePoints ?? [])
  const { positions } = routeDefinition(sourcePosition, targetPosition, curvePoints)

  if (curvePoints.length === 0) {
    const line = lineFeature(positions.map(position => [...position]))
    const distanceMeters = length(line, { units: 'kilometers' }) * 1000
    const midpoint = along(line, distanceMeters / 2000, { units: 'kilometers' })
      .geometry.coordinates
    return {
      line,
      distanceMeters,
      midpoint,
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
    const line = lineFeature(sampleSegments(segments, sampleCount))
    const distanceMeters = length(line, { units: 'kilometers' }) * 1000
    current = { line, distanceMeters }

    if (previousDistance !== null
      && threeSignificantDigitKey(previousDistance) === threeSignificantDigitKey(distanceMeters)) {
      stableIterations += 1
      if (stableIterations >= 2) break
    } else {
      stableIterations = 0
    }

    previousDistance = distanceMeters
    sampleCount *= 2
  }

  const midpoint = along(
    current.line,
    current.distanceMeters / 2000,
    { units: 'kilometers' },
  ).geometry.coordinates
  return {
    ...current,
    midpoint,
    converged: stableIterations >= 2,
    sampleCount: Math.min(sampleCount, maximumSamples),
  }
}

/** Project a map click onto the closest cubic segment of an edge route. */
export function projectPointOntoEdge(edge, mapPosition) {
  if (!isMapPosition(mapPosition)) {
    throw new Error('The curve insertion point must be a valid map position.')
  }
  const sourcePosition = edge?.source?.getPosition?.() ?? edge?.source?.position
  const targetPosition = edge?.target?.getPosition?.() ?? edge?.target?.position
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
        position: unprojectMapPosition([projection.x, projection.y]),
      }
    }
  })
  return closest
}

function finiteNonnegative(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite nonnegative number.`)
  }
  return value
}

function finitePositive(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`)
  }
  return value
}

/** Resolve persisted overrides to the physical values used by badges and payloads. */
export function resolveEdgePhysicalProperties(edge, physicalConfig = {}) {
  if (edge?.isLogic === true) return null

  const sampled = sampleEdgeRoute(edge)
  const overrides = edge?.data?.physicalOverrides
  const manualDelay = overrides?.delaySeconds != null
  const propagationDelaySeconds = manualDelay
    ? finiteNonnegative(overrides.delaySeconds, 'Propagation delay')
    : (() => {
        const distanceMeters = overrides?.distanceMeters == null
          ? sampled.distanceMeters
          : finiteNonnegative(overrides.distanceMeters, 'Physical distance')
        const refractiveIndex = overrides?.refractiveIndex == null
          ? finitePositive(
              physicalConfig?.refractiveIndex ?? DEFAULT_REFRACTIVE_INDEX,
              'Refractive index',
            )
          : finitePositive(overrides.refractiveIndex, 'Refractive index')
        return distanceMeters * refractiveIndex / SPEED_OF_LIGHT_METERS_PER_SECOND
      })()

  return {
    ...sampled,
    manualDelay,
    distanceMeters: manualDelay
      ? null
      : (overrides?.distanceMeters ?? sampled.distanceMeters),
    refractiveIndex: manualDelay
      ? null
      : (overrides?.refractiveIndex
        ?? physicalConfig?.refractiveIndex
        ?? DEFAULT_REFRACTIVE_INDEX),
    propagationDelaySeconds,
  }
}

const SI_PREFIXES = new Map([
  [-12, 'p'],
  [-9, 'n'],
  [-6, 'µ'],
  [-3, 'm'],
  [0, ''],
  [3, 'k'],
  [6, 'M'],
  [9, 'G'],
  [12, 'T'],
])

/** Format a finite value with three significant digits and an adaptive SI prefix. */
export function formatPhysicalValue(value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a'
  if (value === 0) return `0.00 ${unit}`

  const rawExponent = Math.floor(Math.log10(Math.abs(value)) / 3) * 3
  let exponent = Math.max(-12, Math.min(12, rawExponent))
  let scaled = value / (10 ** exponent)
  if (Math.abs(Number(scaled.toPrecision(3))) >= 1000 && exponent < 12) {
    exponent += 3
    scaled /= 1000
  }
  const roundedMagnitude = Math.abs(Number(scaled.toPrecision(3)))
  const decimalPlaces = Math.max(0, 2 - Math.floor(Math.log10(roundedMagnitude)))
  return `${scaled.toFixed(decimalPlaces)} ${SI_PREFIXES.get(exponent)}${unit}`
}

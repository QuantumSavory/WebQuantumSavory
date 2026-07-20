// @vitest-environment node

import { describe, expect, it } from 'vitest'

import Edge from '../../src/models/Edge'
import Node from '../../src/models/Node'
import {
  SPEED_OF_LIGHT_METERS_PER_SECOND,
  cubicControlSegments,
  formatPhysicalValue,
  projectPointOntoEdge,
  resolveEdgePhysicalProperties,
  sampleEdgeRoute,
} from '../../src/utils/edgeGeometry'
import { projectMapPosition } from '../../src/utils/layoutTemplates'

function makeEdge({
  sourcePosition = [-72, 42],
  targetPosition = [-70, 42],
  curvePoints = [],
  physicalOverrides = null,
  isLogic = false,
} = {}) {
  const source = new Node({ id: 'source', position: sourcePosition })
  const target = new Node({ id: 'target', position: targetPosition })
  return new Edge({
    id: 'edge',
    source,
    target,
    isLogic,
    data: { type: 'connection', protocols: [], curvePoints, physicalOverrides },
  })
}

describe('edge geometry adapter', () => {
  it('uses one geodesic LineString for a straight edge and its midpoint', () => {
    const edge = makeEdge()
    const sampled = sampleEdgeRoute(edge)

    expect(sampled.line.geometry.coordinates).toEqual([[-72, 42], [-70, 42]])
    expect(sampled.distanceMeters).toBeGreaterThan(160_000)
    expect(sampled.distanceMeters).toBeLessThan(170_000)
    expect(sampled.midpoint[0]).toBeCloseTo(-71, 3)
    expect(sampled.midpoint[1]).toBeGreaterThan(42)
  })

  it('gives smooth anchors one shared tangent and sharp anchors a corner', () => {
    const smooth = cubicControlSegments([-72, 42], [-70, 42], [{
      id: 'anchor', position: [-71, 43], type: 'smooth',
    }])
    const sharp = cubicControlSegments([-72, 42], [-70, 42], [{
      id: 'anchor', position: [-71, 43], type: 'sharp',
    }])

    const smoothIncoming = [
      smooth[0][3][0] - smooth[0][2][0],
      smooth[0][3][1] - smooth[0][2][1],
    ]
    const smoothOutgoing = [
      smooth[1][1][0] - smooth[1][0][0],
      smooth[1][1][1] - smooth[1][0][1],
    ]
    expect(smoothIncoming[0]).toBeCloseTo(smoothOutgoing[0], 12)
    expect(smoothIncoming[1]).toBeCloseTo(smoothOutgoing[1], 12)

    const sharpIncoming = [
      sharp[0][3][0] - sharp[0][2][0],
      sharp[0][3][1] - sharp[0][2][1],
    ]
    const sharpOutgoing = [
      sharp[1][1][0] - sharp[1][0][0],
      sharp[1][1][1] - sharp[1][0][1],
    ]
    expect(Math.sign(sharpIncoming[1])).not.toBe(Math.sign(sharpOutgoing[1]))
  })

  it('samples cubic routes until their three-significant-digit length stabilizes', () => {
    const edge = makeEdge({
      curvePoints: [{ id: 'anchor', position: [-71, 44], type: 'smooth' }],
    })
    const sampled = sampleEdgeRoute(edge)

    expect(sampled.converged).toBe(true)
    expect(sampled.sampleCount).toBeGreaterThan(8)
    expect(sampled.line.geometry.coordinates.length).toBeGreaterThan(2)
    expect(sampled.distanceMeters).toBeGreaterThan(sampleEdgeRoute(makeEdge()).distanceMeters)
  })

  it('projects a click onto the closest segment for ordered insertion', () => {
    const edge = makeEdge({
      curvePoints: [{ id: 'anchor', position: [-71, 43], type: 'sharp' }],
    })
    const projection = projectPointOntoEdge(edge, [-71.6, 42.5])

    expect(projection.segmentIndex).toBe(0)
    expect(projection.t).toBeGreaterThan(0)
    expect(projection.t).toBeLessThan(1)
    expect(projectMapPosition(projection.position).every(Number.isFinite)).toBe(true)
  })

  it('clamps finite Bézier overshoot at Web Mercator boundaries', () => {
    const edge = makeEdge({
      sourcePosition: [179, 84],
      targetPosition: [-170, -80],
      curvePoints: [{ id: 'boundary', position: [179.9, 85], type: 'smooth' }],
    })

    const sampled = sampleEdgeRoute(edge)
    expect(sampled.line.geometry.coordinates.every(([longitude, latitude]) => (
      longitude >= -180
      && longitude <= 180
      && latitude >= -90
      && latitude <= 90
    ))).toBe(true)
    expect(sampled.line.geometry.coordinates.some(([longitude]) => longitude === 180))
      .toBe(true)

    const projection = projectPointOntoEdge(edge, [180, 85])
    expect(projection.position[0]).toBeGreaterThanOrEqual(-180)
    expect(projection.position[0]).toBeLessThanOrEqual(180)
    expect(projection.position[1]).toBeGreaterThanOrEqual(-90)
    expect(projection.position[1]).toBeLessThanOrEqual(90)
  })

  it('resolves automatic and manual propagation while retaining dormant overrides', () => {
    const automatic = makeEdge({
      physicalOverrides: {
        distanceMeters: 1000,
        refractiveIndex: 1.5,
        delaySeconds: null,
      },
    })
    const automaticValues = resolveEdgePhysicalProperties(automatic)
    expect(automaticValues.distanceMeters).toBe(1000)
    expect(automaticValues.refractiveIndex).toBe(1.5)
    expect(automaticValues.propagationDelaySeconds)
      .toBeCloseTo(1500 / SPEED_OF_LIGHT_METERS_PER_SECOND, 15)

    automatic.data.physicalOverrides.delaySeconds = 0.25
    const manualValues = resolveEdgePhysicalProperties(automatic)
    expect(manualValues.distanceMeters).toBe(1000)
    expect(manualValues.refractiveIndex).toBe(1.5)
    expect(manualValues.propagationDelaySeconds).toBe(0.25)
    expect(automatic.data.physicalOverrides.distanceMeters).toBe(1000)
    expect(automatic.data.physicalOverrides.refractiveIndex).toBe(1.5)
  })

  it('keeps virtual edges straight and formats adaptive SI badges', () => {
    const edge = makeEdge({
      isLogic: true,
      curvePoints: [{ id: 'ignored', position: [-71, 44], type: 'smooth' }],
    })
    expect(sampleEdgeRoute(edge).line.geometry.coordinates).toEqual([[-72, 42], [-70, 42]])
    expect(resolveEdgePhysicalProperties(edge)).toBeNull()
    expect(formatPhysicalValue(1234, 'm')).toBe('1.23 km')
    expect(formatPhysicalValue(999_999, 'm')).toBe('1.00 Mm')
    expect(formatPhysicalValue(0.000001234, 's')).toBe('1.23 µs')
    expect(formatPhysicalValue(null, 'm')).toBe('n/a')
  })

  it('rejects malformed route and override data', () => {
    expect(() => sampleEdgeRoute(makeEdge({ curvePoints: [{
      id: 'bad', position: [-71, 43], type: 'round',
    }] }))).toThrow(/smooth or sharp/)
    expect(() => resolveEdgePhysicalProperties(makeEdge({
      physicalOverrides: { delaySeconds: -1 },
    }))).toThrow(/nonnegative/)
  })
})

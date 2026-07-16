// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_ANNOTATION_HEIGHT_PIXELS,
  DEFAULT_ANNOTATION_WIDTH_PIXELS,
  MIN_ANNOTATION_HEIGHT_PIXELS,
  MIN_ANNOTATION_WIDTH_PIXELS,
  annotationAreaBounds,
  annotationAreaToGeoJSON,
  annotationBoundsFromScreenCenter,
  annotationToGeoJSON,
  attachAnnotationArea,
  createAnnotation,
  defaultAnnotationAreaFreeCorner,
  detachAnnotationArea,
  generateAnnotationId,
  moveAnnotation,
  normalizeAnnotation,
  normalizeAnnotations,
  resizeAnnotation,
  setAnnotationAreaFreeCorner,
  sharedCornerForFreeCorner,
} from '../../src/utils/annotationGeometry'

const projection = {
  project: ([longitude, latitude]) => [longitude * 10, -latitude * 10],
  unproject: ([x, y]) => [x / 10, -y / 10],
}

function annotation(overrides = {}) {
  return {
    id: 'annotation_1',
    markdown: '**Network note**',
    bounds: { west: -2, south: -1, east: 2, north: 1 },
    backgroundColor: '#FFFFFF',
    borderColor: '#123AbC',
    area: null,
    ...overrides,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('annotation persistence contract', () => {
  it('normalizes a strict cloned schema without mutating its input', () => {
    const raw = annotation({
      area: { freeCorner: [4, 3] },
      transient: true,
    })
    const original = structuredClone(raw)

    const normalized = normalizeAnnotation(raw)

    expect(normalized).toEqual({
      id: 'annotation_1',
      markdown: '**Network note**',
      bounds: { west: -2, south: -1, east: 2, north: 1 },
      backgroundColor: '#ffffff',
      borderColor: '#123abc',
      area: { freeCorner: [4, 3] },
    })
    expect(normalized.bounds).not.toBe(raw.bounds)
    expect(normalized.area).not.toBe(raw.area)
    expect(raw).toEqual(original)
  })

  it('defaults missing legacy collections and rejects duplicate durable IDs', () => {
    expect(normalizeAnnotations()).toEqual([])
    expect(normalizeAnnotations(null)).toEqual([])
    expect(() => normalizeAnnotations({})).toThrow(/must be an array/)
    expect(() => normalizeAnnotations([annotation(), annotation()]))
      .toThrow(/duplicate annotation ID/)
  })

  it.each([
    [{ id: '' }, /durable ID/],
    [{ markdown: null }, /markdown must be a string/],
    [{ bounds: { west: 2, south: -1, east: -2, north: 1 } }, /canonical and non-empty/],
    [{ bounds: { west: -181, south: -1, east: 2, north: 1 } }, /longitude and latitude/],
    [{ backgroundColor: '#fff' }, /six-digit hex color/],
    [{ borderColor: '123abc' }, /six-digit hex color/],
    [{ area: {} }, /valid freeCorner/],
    [{ area: { freeCorner: [181, 0] } }, /valid freeCorner/],
  ])('rejects malformed annotation data %#', (override, message) => {
    expect(() => normalizeAnnotation(annotation(override))).toThrow(message)
  })

  it('constructs independent annotations and allocates collision-free IDs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(generateAnnotationId([{ id: 'annotation_000000' }])).toBe('annotation_000000_2')

    const bounds = { west: -1, south: -1, east: 1, north: 1 }
    const created = createAnnotation({ bounds })
    expect(created).toMatchObject({
      id: 'annotation_000000',
      markdown: '',
      backgroundColor: '#ffffff',
      borderColor: '#334155',
      area: null,
    })
    expect(created.bounds).not.toBe(bounds)
  })
})

describe('annotation geometry', () => {
  it('converts annotation and attached-area rectangles to GeoJSON', () => {
    const value = annotation({ area: { freeCorner: [4, 3] } })

    expect(annotationToGeoJSON(value)).toMatchObject({
      type: 'Feature',
      properties: { annotationId: 'annotation_1', kind: 'annotation' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-2, -1],
          [2, -1],
          [2, 1],
          [-2, 1],
          [-2, -1],
        ]],
      },
    })
    expect(annotationAreaBounds(value)).toEqual({ west: 2, south: 1, east: 4, north: 3 })
    expect(annotationAreaToGeoJSON(value)?.properties.kind).toBe('annotation-area')
    expect(annotationAreaToGeoJSON(annotation())).toBeNull()
  })

  it('flips the shared corner whenever the free corner crosses a center axis', () => {
    const bounds = annotation().bounds
    expect(sharedCornerForFreeCorner(bounds, [-4, 3])).toEqual([-2, 1])
    expect(sharedCornerForFreeCorner(bounds, [4, 3])).toEqual([2, 1])
    expect(sharedCornerForFreeCorner(bounds, [4, -3])).toEqual([2, -1])
    expect(sharedCornerForFreeCorner(bounds, [-4, -3])).toEqual([-2, -1])
  })

  it('owns area attachment, free-corner updates, and detachment', () => {
    const value = annotation()
    const freeCorner = [4, 3]
    const attached = attachAnnotationArea(value, freeCorner)
    expect(attached.area).toEqual({ freeCorner: [4, 3] })
    expect(attached.area.freeCorner).not.toBe(freeCorner)

    const movedCorner = setAnnotationAreaFreeCorner(attached, [-4, 3])
    expect(movedCorner.area).toEqual({ freeCorner: [-4, 3] })
    expect(sharedCornerForFreeCorner(movedCorner.bounds, movedCorner.area.freeCorner))
      .toEqual([-2, 1])
    expect(detachAnnotationArea(movedCorner).area).toBeNull()
    expect(() => setAnnotationAreaFreeCorner(value, [4, 3])).toThrow(/attached area/)

    expect(defaultAnnotationAreaFreeCorner(value.bounds)).toEqual([6, 3])
    expect(attachAnnotationArea(value).area).toEqual({ freeCorner: [6, 3] })
    expect(annotationAreaToGeoJSON(attachAnnotationArea(value))).not.toBeNull()
  })

  it('moves within geographic limits while retaining the independent free corner', () => {
    const value = annotation({
      bounds: { west: 160, south: 70, east: 170, north: 80 },
      area: { freeCorner: [150, 60] },
    })

    const moved = moveAnnotation(value, [50, 50])
    expect(moved.bounds).toEqual({ west: 170, south: 80, east: 180, north: 90 })
    expect(moved.area).toEqual({ freeCorner: [150, 60] })
    expect(moved.area).not.toBe(value.area)
  })

  it('enforces the centralized minimum visible size while resizing', () => {
    const value = annotation({
      bounds: { west: 0, south: 0, east: 20, north: 10 },
      area: { freeCorner: [30, 20] },
    })
    const resized = resizeAnnotation(value, 'northwest', [19, 1], projection)

    expect(MIN_ANNOTATION_WIDTH_PIXELS).toBe(80)
    expect(MIN_ANNOTATION_HEIGHT_PIXELS).toBe(60)
    expect(resized.bounds).toEqual({ west: 12, south: 0, east: 20, north: 6 })
    expect(resized.area).toEqual({ freeCorner: [30, 20] })
  })

  it('builds the standard 240 by 140 screen-pixel creation bounds', () => {
    expect(DEFAULT_ANNOTATION_WIDTH_PIXELS).toBe(240)
    expect(DEFAULT_ANNOTATION_HEIGHT_PIXELS).toBe(140)
    expect(annotationBoundsFromScreenCenter([0, 0], projection)).toEqual({
      west: -12,
      south: -7,
      east: 12,
      north: 7,
    })
  })
})

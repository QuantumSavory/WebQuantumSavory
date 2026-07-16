import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const markerInstances = vi.hoisted(() => [])

vi.mock('maplibre-gl', () => {
  class Marker {
    constructor(options) {
      this.options = options
      this.handlers = new Map()
      markerInstances.push(this)
    }

    setLngLat(position) {
      this.position = Array.isArray(position)
        ? { lng: position[0], lat: position[1] }
        : position
      return this
    }

    getLngLat() { return this.position }
    addTo(map) {
      this.map = map
      this.options.element.setAttribute('aria-label', 'Map marker')
      return this
    }
    on(event, handler) { this.handlers.set(event, handler); return this }
    remove() { this.removed = true }
  }

  return { default: { Marker } }
})

import AnnotationOverlay from '../../src/components/map/AnnotationOverlay.vue'

function makeAnnotation() {
  return {
    id: 'annotation-1',
    markdown: '**Note**',
    bounds: { west: 0, south: 0, east: 24, north: 14 },
    backgroundColor: '#ffffff',
    borderColor: '#334155',
    area: { freeCorner: [30, 20] },
  }
}

function makeMap() {
  const handlers = new Map()
  return {
    handlers,
    project: vi.fn(position => ({ x: position[0] * 10, y: position[1] * -10 })),
    unproject: vi.fn(point => {
      const [x, y] = Array.isArray(point) ? point : [point.x, point.y]
      return { lng: x / 10, lat: y / -10 }
    }),
    on: vi.fn((event, handler) => handlers.set(event, handler)),
    off: vi.fn((event, handler) => {
      if (handlers.get(event) === handler) handlers.delete(event)
    }),
  }
}

beforeEach(() => markerInstances.splice(0))

describe('AnnotationOverlay', () => {
  it('moves and resizes in place, retains the independent area corner, and cleans up', async () => {
    const annotation = makeAnnotation()
    const originalIdentity = annotation
    const map = makeMap()
    const wrapper = mount(AnnotationOverlay, {
      props: { map, annotation, isSelected: true },
    })

    const bodyMarker = markerInstances.find(instance => (
      instance.options.element.classList.contains('annotation-overlay')
    ))
    expect(bodyMarker).toBeDefined()
    expect(bodyMarker.options.element.style.width).toBe('240px')
    expect(bodyMarker.options.element.style.height).toBe('140px')
    expect(bodyMarker.options.element.getAttribute('aria-label')).toBe('Map annotation annotation-1')
    expect(wrapper.get('.annotation-markdown strong').text()).toBe('Note')

    bodyMarker.handlers.get('dragstart')()
    bodyMarker.position = { lng: 362, lat: 15 }
    bodyMarker.handlers.get('drag')()

    expect(annotation).toBe(originalIdentity)
    expect(annotation.bounds).toEqual({ west: 2, south: 1, east: 26, north: 15 })
    expect(annotation.area.freeCorner).toEqual([30, 20])
    expect(wrapper.emitted('select')).toEqual([[annotation, 'annotation']])

    const northeastMarker = markerInstances.find(instance => (
      instance.options.element.dataset.annotationCorner === 'northeast'
    ))
    expect(northeastMarker.options.element.getAttribute('aria-label'))
      .toBe('Resize annotation from northeast corner')
    northeastMarker.position = { lng: 365, lat: 5 }
    northeastMarker.handlers.get('drag')()
    expect(annotation.bounds).toEqual({ west: 2, south: 1, east: 10, north: 7 })

    const areaMarker = markerInstances.find(instance => (
      instance.options.element.classList.contains('annotation-resize-handle-area')
    ))
    areaMarker.position = { lng: 360, lat: -5 }
    areaMarker.handlers.get('drag')()
    expect(annotation.area.freeCorner).toEqual([0, -5])

    const mountedMarkers = [...markerInstances]
    wrapper.unmount()
    expect(map.off).toHaveBeenCalledTimes(5)
    expect(mountedMarkers.every(marker => marker.removed)).toBe(true)
    expect(map.handlers.size).toBe(0)
  })

  it('keeps resize handles hidden until selected', () => {
    const wrapper = mount(AnnotationOverlay, {
      props: { map: makeMap(), annotation: makeAnnotation(), isSelected: false },
    })

    expect(wrapper.findAll('.annotation-resize-handle')).toHaveLength(0)
    expect(markerInstances).toHaveLength(1)
    wrapper.unmount()
  })
})

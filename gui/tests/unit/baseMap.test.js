import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BaseMap from '../../src/components/map/BaseMap.vue'

const mapConstructor = vi.hoisted(() => vi.fn())

vi.mock('maplibre-gl', () => ({
  default: {
    Map: mapConstructor,
    NavigationControl: vi.fn()
  }
}))

let wrapper

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  mapConstructor.mockReset()
})

describe('BaseMap initialization', () => {
  it('reports a synchronous MapLibre construction failure', () => {
    const error = new Error('WebGL is unavailable')
    mapConstructor.mockImplementation(() => { throw error })

    wrapper = mount(BaseMap)

    expect(wrapper.emitted('map-initialization-error')).toEqual([[error]])
  })

  it('registers error handling before controls and reports a synchronous setup failure', () => {
    const error = new Error('Navigation controls are unavailable')
    const map = {
      on: vi.fn(),
      addControl: vi.fn(() => { throw error }),
      remove: vi.fn()
    }
    mapConstructor.mockImplementation(() => map)

    wrapper = mount(BaseMap)

    expect(map.on).toHaveBeenCalledWith('error', expect.any(Function))
    expect(map.on.mock.invocationCallOrder[0]).toBeLessThan(map.addControl.mock.invocationCallOrder[0])
    expect(wrapper.emitted('map-initialization-error')).toEqual([[error]])
    expect(map.remove).toHaveBeenCalledOnce()
  })

  it('removes its initialization listener after load so MapLibre reports later errors', () => {
    const handlers = new Map()
    const map = {
      on: vi.fn((event, handler) => handlers.set(event, handler)),
      off: vi.fn(),
      addControl: vi.fn(),
      getCenter: vi.fn(() => ({ lng: -74.5, lat: 40 })),
      getZoom: vi.fn(() => 9),
      remove: vi.fn()
    }
    mapConstructor.mockImplementation(() => map)

    wrapper = mount(BaseMap)
    const initializationErrorHandler = handlers.get('error')
    handlers.get('load')()

    expect(wrapper.emitted('map-ready')).toHaveLength(1)
    expect(map.off).toHaveBeenCalledWith('error', initializationErrorHandler)
  })

  function makeInteractiveMap() {
    const handlers = new Map()
    const map = {
      handlers,
      on: vi.fn((event, handler) => handlers.set(event, handler)),
      off: vi.fn((event, handler) => {
        if (handlers.get(event) === handler) handlers.delete(event)
      }),
      addControl: vi.fn(),
      getCenter: vi.fn(() => ({ lng: -74.5, lat: 40 })),
      getZoom: vi.fn(() => 9),
      queryRenderedFeatures: vi.fn(() => []),
      project: vi.fn(position => ({ x: position[0] * 10, y: position[1] * -10 })),
      unproject: vi.fn(point => {
        const [x, y] = Array.isArray(point) ? point : [point.x, point.y]
        return { lng: x / 10, lat: y / -10 }
      }),
      remove: vi.fn(),
    }
    return map
  }

  it('creates one canonical 240 by 140 pixel annotation without background deselection', async () => {
    const map = makeInteractiveMap()
    mapConstructor.mockImplementation(() => map)
    wrapper = mount(BaseMap, {
      props: {
        annotations: [],
        annotationCreationEnabled: true,
      },
    })
    map.handlers.get('load')()
    await nextTick()

    const canvas = document.createElement('canvas')
    map.handlers.get('mousedown')({
      lngLat: { lng: -70, lat: 40 },
      point: { x: 0, y: 0 },
      originalEvent: { target: canvas },
    })

    const annotation = wrapper.emitted('annotation-created')[0][0]
    expect(annotation.id).toMatch(/^annotation_/)
    expect(annotation.bounds).toEqual({ west: -82, south: 33, east: -58, north: 47 })
    expect(annotation.markdown).toBe('')
    expect(wrapper.emitted('map-click')).toBeUndefined()
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('does not treat annotation markers as map-background clicks', async () => {
    const map = makeInteractiveMap()
    mapConstructor.mockImplementation(() => map)
    wrapper = mount(BaseMap)
    map.handlers.get('load')()
    await nextTick()

    const overlay = document.createElement('div')
    overlay.className = 'annotation-overlay'
    map.handlers.get('mousedown')({
      point: { x: 0, y: 0 },
      originalEvent: { target: overlay },
    })

    expect(wrapper.emitted('map-click')).toBeUndefined()
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it.each(['Delete', 'Backspace'])('deletes the selected annotation with %s', async key => {
    const map = makeInteractiveMap()
    const annotation = { id: 'annotation-1' }
    mapConstructor.mockImplementation(() => map)
    wrapper = mount(BaseMap, {
      attachTo: document.body,
      props: {
        selectedItem: annotation,
        selectedType: 'annotation',
      },
    })

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    expect(wrapper.emitted('delete')).toEqual([[annotation, 'annotation']])
  })

  it('deletes from a focused annotation overlay but not from an editor', () => {
    const map = makeInteractiveMap()
    const annotation = { id: 'annotation-1' }
    mapConstructor.mockImplementation(() => map)
    wrapper = mount(BaseMap, {
      attachTo: document.body,
      props: {
        selectedItem: annotation,
        selectedType: 'annotation',
      },
    })

    const overlay = document.createElement('div')
    overlay.className = 'annotation-overlay'
    document.body.appendChild(overlay)
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))

    const editor = document.createElement('textarea')
    document.body.appendChild(editor)
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))

    expect(wrapper.emitted('delete')).toEqual([[annotation, 'annotation']])
    overlay.remove()
    editor.remove()
  })
})

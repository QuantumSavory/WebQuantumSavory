import { mount } from '@vue/test-utils'
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
})

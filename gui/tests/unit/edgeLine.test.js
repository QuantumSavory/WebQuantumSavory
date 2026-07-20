import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const markerInstances = vi.hoisted(() => [])

vi.mock('maplibre-gl', async importOriginal => {
  const actual = await importOriginal()
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
    addTo(map) { this.map = map; return this }
    on(event, handler) { this.handlers.set(event, handler); return this }
    remove() { this.removed = true }
  }
  return {
    ...actual,
    MercatorCoordinate: actual.MercatorCoordinate ?? actual.default.MercatorCoordinate,
    default: { ...actual.default, Marker },
  }
})

import CurvePointHandle from '../../src/components/map/CurvePointHandle.vue'
import EdgeLine from '../../src/components/map/EdgeLine.vue'
import Edge from '../../src/models/Edge'
import Node from '../../src/models/Node'

const CurveHandleStub = {
  name: 'CurvePointHandle',
  props: ['point'],
  emits: ['move', 'cycle'],
  template: '<button class="curve-handle-stub" @click="$emit(\'cycle\', point)" />',
}

function makeEdge({ isLogic = false } = {}) {
  const source = new Node({ id: 'a', name: 'A', position: [-72, 42] })
  const target = new Node({ id: 'b', name: 'B', position: [-70, 42] })
  return new Edge({ id: 'edge', source, target, isLogic })
}

function makeMap() {
  const handlers = new Map()
  const sources = new Map()
  const layers = new Set()
  return {
    handlers,
    sources,
    addSource: vi.fn((id, source) => sources.set(id, {
      ...source,
      setData: vi.fn(),
    })),
    getSource: vi.fn(id => sources.get(id)),
    removeSource: vi.fn(id => sources.delete(id)),
    addLayer: vi.fn(layer => layers.add(layer.id)),
    getLayer: vi.fn(id => layers.has(id)),
    removeLayer: vi.fn(id => layers.delete(id)),
    setPaintProperty: vi.fn(),
    on: vi.fn((event, layer, handler) => handlers.set(`${event}:${layer}`, handler)),
    off: vi.fn((event, layer) => handlers.delete(`${event}:${layer}`)),
  }
}

beforeEach(() => markerInstances.splice(0))

describe('edge curve editing', () => {
  async function applyLatestCommand(wrapper, edge) {
    const operations = wrapper.emitted('designOperations').at(-1)[0]
    Object.assign(edge.data, operations[0].value.data)
    const currentEdge = wrapper.props('edge')
    await wrapper.setProps({
      edge: {
        ...currentEdge,
        data: { ...currentEdge.data, ...operations[0].value.data },
      },
    })
    return operations
  }

  it('inserts smooth points on the projected segment and cycles them to deletion', async () => {
    const edge = makeEdge()
    const map = makeMap()
    const wrapper = mount(EdgeLine, {
      props: {
        edge,
        map,
        isSelected: true,
        curveEditingEnabled: true,
        showPhysicalBadges: false,
      },
      global: {
        stubs: { CurvePointHandle: CurveHandleStub, EdgeBadgeStack: true },
      },
    })

    map.handlers.get('click:edge-click-layer-edge')({ lngLat: { lng: -71, lat: 43 } })
    await applyLatestCommand(wrapper, edge)
    expect(edge.data.curvePoints).toHaveLength(1)
    expect(edge.data.curvePoints[0]).toMatchObject({ type: 'smooth' })
    expect(edge.data.curvePoints[0].id).toMatch(/^curve_/)

    await wrapper.get('.curve-handle-stub').trigger('click')
    await applyLatestCommand(wrapper, edge)
    expect(edge.data.curvePoints[0].type).toBe('sharp')
    await wrapper.get('.curve-handle-stub').trigger('click')
    await applyLatestCommand(wrapper, edge)
    expect(edge.data.curvePoints).toEqual([])

    wrapper.unmount()
    expect(map.off).toHaveBeenCalledTimes(3)
  })

  it('keeps virtual edges straight and non-editable', () => {
    const edge = makeEdge({ isLogic: true })
    const map = makeMap()
    mount(EdgeLine, {
      props: {
        edge,
        map,
        isSelected: true,
        curveEditingEnabled: true,
      },
      global: {
        stubs: { CurvePointHandle: CurveHandleStub, EdgeBadgeStack: true },
      },
    })

    map.handlers.get('click:edge-click-layer-edge')({ lngLat: { lng: -71, lat: 43 } })
    expect(edge.data.curvePoints).toBeUndefined()
    expect(map.sources.get('edge-edge').data.geometry.coordinates).toEqual([[-72, 42], [-70, 42]])
  })

  it('renders node-drag overrides without mutating durable endpoints', () => {
    const edge = makeEdge()
    const map = makeMap()
    const positionOverrides = new Map([[edge.target.id, [170, 42]]])
    mount(EdgeLine, {
      props: {
        edge,
        map,
        showPhysicalBadges: false,
        positionOverrides,
      },
      global: {
        stubs: { CurvePointHandle: CurveHandleStub, EdgeBadgeStack: true },
      },
    })

    expect(map.sources.get('edge-edge').data.geometry.coordinates)
      .toEqual([[-72, 42], [170, 42]])
    expect(edge.target.position).toEqual([-70, 42])
  })

  it('emits drag positions and suppresses the click that follows a drag', async () => {
    const point = { id: 'point', position: [-71, 43], type: 'smooth' }
    const wrapper = mount(CurvePointHandle, { props: { map: makeMap(), point } })
    const marker = markerInstances.at(-1)
    marker.position = { lng: 289, lat: 43 }
    await wrapper.get('button').trigger('pointerdown')
    marker.handlers.get('dragstart')()
    marker.position = { lng: 289.5, lat: 43.5 }
    marker.handlers.get('dragend')()

    const [movedPoint, position, finish] = wrapper.emitted('move')[0]
    expect(movedPoint).toEqual(point)
    expect(position).toEqual([-70.5, 43.5])
    expect(finish).toEqual(expect.any(Function))
    finish()
    expect(marker.position).toEqual({ lng: -71, lat: 43 })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('cycle')).toBeUndefined()
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('cycle')).toEqual([[point]])
  })
})

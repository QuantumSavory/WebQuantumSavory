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
    addTo(map) { this.map = map; return this }
    on(event, handler) { this.handlers.set(event, handler); return this }
    setDraggable(value) { this.draggable = value; return this }
    remove() { this.removed = true }
  }

  return { default: { Marker } }
})

import NodeMarker from '../../src/components/map/NodeMarker.vue'
import { UI_SERVICES_KEY } from '../../src/composables/uiServices'
import Node from '../../src/models/Node'

beforeEach(() => markerInstances.splice(0))

describe('NodeMarker dragging', () => {
  it('previews without mutating project state and restores an invalid wrapped move', async () => {
    const node = new Node({
      id: 'node-a',
      name: 'A',
      position: [-71, 42],
      data: { slots: [], protocols: [] },
    })
    const wrapper = mount(NodeMarker, {
      props: { node, map: {} },
      global: {
        provide: {
          [UI_SERVICES_KEY]: { showEntangledSlots: vi.fn() },
        },
      },
    })
    const marker = markerInstances.at(-1)

    // MapLibre may display the canonical -71° marker in the +360° world.
    marker.position = { lng: 289, lat: 42 }
    await wrapper.get('.node-marker').trigger('pointerdown')
    marker.handlers.get('dragstart')()
    marker.position = { lng: 290, lat: 43 }
    marker.handlers.get('drag')()

    expect(wrapper.emitted('nodePositionPreview').at(-1)[0]).toMatchObject({
      node,
      position: [-70, 43],
      previousPosition: [-71, 42],
    })
    expect(node.position).toEqual([-71, 42])

    marker.position = { lng: 541, lat: 43 }
    marker.handlers.get('dragend')()
    const change = wrapper.emitted('nodePositionChanged').at(-1)[0]
    expect(change).toMatchObject({
      node,
      position: [181, 43],
      previousPosition: [-71, 42],
    })
    expect(node.position).toEqual([-71, 42])

    change.finish()
    expect(marker.position).toEqual({ lng: -71, lat: 42 })
    expect(wrapper.emitted('interactionBusy')).toEqual([[true], [false]])
  })
})

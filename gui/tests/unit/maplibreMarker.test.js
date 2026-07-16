import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
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
    off(event, handler) {
      if (this.handlers.get(event) === handler) this.handlers.delete(event)
      return this
    }
    remove() { this.removed = true }
  }

  return { default: { Marker } }
})

import { useMaplibreMarker } from '../../src/composables/useMaplibreMarker'

const MarkerHost = defineComponent({
  props: {
    map: { type: Object, required: true },
    position: { type: Array, required: true },
    label: { type: String, required: true },
  },
  emits: ['drag'],
  setup(props, { emit }) {
    const element = ref(null)
    const controller = useMaplibreMarker({
      map: () => props.map,
      element,
      position: () => props.position,
      ariaLabel: () => props.label,
      options: { draggable: true },
      events: {
        drag: () => emit('drag', controller.getPosition()),
      },
    })
    return { element }
  },
  template: '<button ref="element" type="button" />',
})

beforeEach(() => markerInstances.splice(0))

describe('useMaplibreMarker', () => {
  it('owns position, domain labels, drag positions, and cleanup', async () => {
    const wrapper = mount(MarkerHost, {
      props: {
        map: { id: 'map' },
        position: [-70, 40],
        label: 'Annotation handle',
      },
    })
    const marker = markerInstances[0]

    expect(marker.position).toEqual({ lng: -70, lat: 40 })
    expect(wrapper.get('button').attributes('aria-label')).toBe('Annotation handle')

    await wrapper.setProps({
      position: [-69, 41],
      label: 'Updated handle',
    })
    expect(marker.position).toEqual({ lng: -69, lat: 41 })
    expect(wrapper.get('button').attributes('aria-label')).toBe('Updated handle')

    marker.position = { lng: -68, lat: 42 }
    marker.handlers.get('drag')()
    expect(wrapper.emitted('drag')).toEqual([[[-68, 42]]])

    wrapper.unmount()
    expect(marker.handlers.size).toBe(0)
    expect(marker.removed).toBe(true)
  })
})

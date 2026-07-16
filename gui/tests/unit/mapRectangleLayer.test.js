import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import MapRectangleLayer from '../../src/components/map/MapRectangleLayer.vue'

function feature(east = 1) {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [east, 0], [east, 1], [0, 1], [0, 0]]],
    },
  }
}

function makeMap() {
  const sources = new Map()
  const layers = new Set(['background', 'edge-click-layer-edge', 'edge-layer-edge'])
  return {
    sources,
    addSource: vi.fn((id, source) => sources.set(id, {
      ...source,
      setData: vi.fn(),
    })),
    getSource: vi.fn(id => sources.get(id)),
    removeSource: vi.fn(id => sources.delete(id)),
    getStyle: vi.fn(() => ({
      layers: [...layers].map(id => ({ id })),
    })),
    addLayer: vi.fn((layer) => layers.add(layer.id)),
    getLayer: vi.fn(id => layers.has(id)),
    removeLayer: vi.fn(id => layers.delete(id)),
    setPaintProperty: vi.fn(),
  }
}

describe('MapRectangleLayer', () => {
  it('inserts fill and border before every edge and cleans layers before the source', async () => {
    const map = makeMap()
    const wrapper = mount(MapRectangleLayer, {
      props: {
        map,
        layerKey: 'annotation-1',
        feature: feature(),
        fillColor: '#ffffff',
        borderColor: '#334155',
      },
    })

    expect(map.addLayer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'annotation-fill-annotation-1' }),
      'edge-click-layer-edge',
    )
    expect(map.addLayer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'annotation-line-annotation-1' }),
      'edge-click-layer-edge',
    )

    const updatedFeature = feature(2)
    await wrapper.setProps({
      feature: updatedFeature,
      fillColor: '#abcdef',
      lineWidth: 3,
    })
    await nextTick()

    expect(map.sources.get('annotation-source-annotation-1').setData)
      .toHaveBeenCalledWith(updatedFeature)
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'annotation-fill-annotation-1',
      'fill-color',
      '#abcdef',
    )
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'annotation-line-annotation-1',
      'line-width',
      3,
    )

    wrapper.unmount()
    expect(map.removeLayer.mock.invocationCallOrder[0])
      .toBeLessThan(map.removeSource.mock.invocationCallOrder[0])
    expect(map.removeLayer).toHaveBeenCalledWith('annotation-line-annotation-1')
    expect(map.removeLayer).toHaveBeenCalledWith('annotation-fill-annotation-1')
    expect(map.removeSource).toHaveBeenCalledWith('annotation-source-annotation-1')
  })

  it('appends rectangles when no edge layer exists yet', () => {
    const map = makeMap()
    map.getStyle.mockReturnValue({ layers: [{ id: 'background' }] })

    mount(MapRectangleLayer, {
      props: {
        map,
        layerKey: 'early',
        feature: feature(),
        fillColor: '#ffffff',
        borderColor: '#334155',
        fillOpacity: 0,
        lineDasharray: [3, 3],
      },
    })

    expect(map.addLayer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'annotation-fill-early',
        paint: expect.objectContaining({ 'fill-opacity': 0 }),
      }),
    )
    expect(map.addLayer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'annotation-line-early',
        paint: expect.objectContaining({ 'line-dasharray': [3, 3] }),
      }),
    )
  })
})

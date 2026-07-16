import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MapAnnotation from '../../src/components/map/MapAnnotation.vue'
import { annotationFillLayerId } from '../../src/utils/mapLayers'

const RectangleStub = {
  name: 'MapRectangleLayer',
  props: [
    'map',
    'layerKey',
    'beforeLayerId',
    'feature',
    'fillColor',
    'borderColor',
    'fillOpacity',
    'lineWidth',
    'lineDasharray',
  ],
  template: '<div class="rectangle-stub" />',
}

function annotation() {
  return {
    id: 'annotation-1',
    markdown: '',
    bounds: { west: -2, south: -1, east: 2, north: 1 },
    backgroundColor: '#ffffff',
    borderColor: '#334155',
    area: { freeCorner: [4, 3] },
  }
}

describe('MapAnnotation layer order', () => {
  it('places the area below its annotation and the annotation before the next one', () => {
    const wrapper = mount(MapAnnotation, {
      props: {
        map: {},
        annotation: annotation(),
        nextAnnotationId: 'annotation-2',
      },
      global: {
        stubs: {
          MapRectangleLayer: RectangleStub,
          AnnotationOverlay: true,
        },
      },
    })

    const rectangles = wrapper.findAllComponents(RectangleStub)
    expect(rectangles).toHaveLength(2)
    expect(rectangles[0].props()).toMatchObject({
      layerKey: 'annotation-1-area',
      beforeLayerId: annotationFillLayerId('annotation-1'),
    })
    expect(rectangles[1].props()).toMatchObject({
      layerKey: 'annotation-1',
      beforeLayerId: annotationFillLayerId('annotation-2'),
    })
  })
})

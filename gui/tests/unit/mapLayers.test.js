import { describe, expect, it } from 'vitest'

import {
  annotationFillLayerId,
  annotationLineLayerId,
  annotationSourceId,
  edgeClickLayerId,
  edgeLineLayerId,
  firstEdgeLayerId,
  isEdgeLayerId,
} from '../../src/utils/mapLayers'

describe('map layer identifiers', () => {
  it('keeps edge IDs, edge detection, and annotation IDs on one shared contract', () => {
    expect(edgeLineLayerId('edge-1')).toBe('edge-layer-edge-1')
    expect(edgeClickLayerId('edge-1')).toBe('edge-click-layer-edge-1')
    expect(isEdgeLayerId(edgeLineLayerId('edge-1'))).toBe(true)
    expect(isEdgeLayerId(edgeClickLayerId('edge-1'))).toBe(true)
    expect(isEdgeLayerId('annotation-line-note')).toBe(false)

    expect(annotationSourceId('note')).toBe('annotation-source-note')
    expect(annotationFillLayerId('note')).toBe('annotation-fill-note')
    expect(annotationLineLayerId('note')).toBe('annotation-line-note')
  })

  it('finds the first edge layer in the live style order', () => {
    const map = {
      getStyle: () => ({
        layers: [
          { id: 'background' },
          { id: annotationFillLayerId('note') },
          { id: edgeClickLayerId('edge-1') },
          { id: edgeLineLayerId('edge-1') },
        ],
      }),
    }

    expect(firstEdgeLayerId(map)).toBe(edgeClickLayerId('edge-1'))
  })
})

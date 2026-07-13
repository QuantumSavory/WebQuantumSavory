import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useNodeEdgeOperations } from '../../src/composables/useNodeEdgeOperations'
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../../src/utils/projectCodec'

describe('node and edge operation map state', () => {
  it('initializes reactive map state from copied codec defaults', () => {
    const operations = useNodeEdgeOperations(
      ref({ net: { nodes: [], edges: [] } }),
      ref(false),
      vi.fn()
    )

    expect(operations.mapCenter.value).toEqual(DEFAULT_MAP_CENTER)
    expect(operations.mapCenter.value).not.toBe(DEFAULT_MAP_CENTER)
    expect(operations.mapZoom.value).toBe(DEFAULT_MAP_ZOOM)

    operations.mapCenter.value[0] = 0
    expect(DEFAULT_MAP_CENTER[0]).toBe(-98.5795)
  })
})

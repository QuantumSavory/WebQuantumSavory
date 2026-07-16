import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useNodeEdgeOperations } from '../../src/composables/useNodeEdgeOperations'
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../../src/utils/projectCodec'
import Edge from '../../src/models/Edge'
import Node from '../../src/models/Node'

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

  it('rejects duplicate physical endpoint pairs but permits virtual pairs', () => {
    const nodeA = new Node({ id: 'a', name: 'A', position: [-72, 42] })
    const nodeB = new Node({ id: 'b', name: 'B', position: [-71, 42] })
    const physical = new Edge({ id: 'physical', source: nodeA, target: nodeB })
    const projectData = ref({ net: { nodes: [nodeA, nodeB], edges: [physical] } })
    const alert = vi.fn()
    const operations = useNodeEdgeOperations(projectData, ref(false), vi.fn(), {
      showAlert: alert,
    })

    operations.handleEdgeCreated(new Edge({
      id: 'duplicate',
      source: nodeB,
      target: nodeA,
    }))
    expect(projectData.value.net.edges).toHaveLength(1)
    expect(alert).toHaveBeenCalledWith(
      'Duplicate physical edge',
      'Only one physical edge may connect a pair of nodes.',
    )

    operations.handleEdgeCreated(new Edge({
      id: 'virtual',
      source: nodeB,
      target: nodeA,
      isLogic: true,
    }))
    expect(projectData.value.net.edges).toHaveLength(2)
  })
})

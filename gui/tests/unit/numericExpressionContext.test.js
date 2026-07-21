import { describe, expect, it, vi } from 'vitest'

vi.mock('maplibre-gl', () => ({
  MercatorCoordinate: class MercatorCoordinate {},
}))

import Edge from '../../src/models/Edge.js'
import Node from '../../src/models/Node.js'
import { buildNumericExpressionContext } from '../../src/utils/numericExpressionContext.js'

function projectFixture({ virtual = false } = {}) {
  const alice = new Node({
    id: 'alice',
    name: 'Alice',
    position: [-72, 42],
  })
  const bob = new Node({
    id: 'bob',
    name: 'Bob',
    position: [-71, 42],
  })
  const edge = new Edge({
    id: 'edge_ab',
    source: bob,
    target: alice,
    isLogic: virtual,
  })
  return {
    alice,
    bob,
    edge,
    project: {
      net: {
        nodes: [alice, bob],
        edges: [edge],
        physicalConfig: { refractiveIndex: 1.5, lossDbPerKm: 0.2 },
      },
    },
  }
}

describe('numeric expression assignment context', () => {
  it('uses canonical node order for floating and node contexts', () => {
    const { alice, project } = projectFixture()

    expect(buildNumericExpressionContext(project, 'floating')).toEqual({
      node_names: ['Alice', 'Bob'],
    })
    expect(buildNumericExpressionContext(project, 'node', alice)).toEqual({
      node_names: ['Alice', 'Bob'],
      self: 1,
    })
  })

  it('uses actual endpoint IDs and resolved physical values for edge contexts', () => {
    const { edge, project } = projectFixture()

    expect(buildNumericExpressionContext(project, 'edge', edge)).toEqual({
      node_names: ['Alice', 'Bob'],
      length: expect.any(Number),
      delay: expect.any(Number),
      refractive_index: 1.5,
      loss: 0.2,
      transmissivity: expect.any(Number),
      node_a: 2,
      node_b: 1,
    })
  })

  it('uses null physical values for virtual edges', () => {
    const { edge, project } = projectFixture({ virtual: true })

    expect(buildNumericExpressionContext(project, 'edge', edge)).toEqual({
      node_names: ['Alice', 'Bob'],
      length: null,
      delay: null,
      refractive_index: null,
      loss: null,
      transmissivity: null,
      node_a: 2,
      node_b: 1,
    })
  })
})

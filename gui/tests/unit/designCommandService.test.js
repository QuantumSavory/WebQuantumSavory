import { describe, expect, it, vi } from 'vitest'

import Edge from '../../src/models/Edge'
import FloatingProtocol from '../../src/models/FloatingProtocol'
import Node from '../../src/models/Node'
import Variable from '../../src/models/Variable'
import {
  DUPLICATE_PHYSICAL_EDGE_REASON,
  DesignCommandError,
  DesignCommandService,
  operationsForTool,
} from '../../src/domain/design/DesignCommandService'
import { createEmptyProject, encodeDesignDocument } from '../../src/utils/projectCodec'

function serviceFor(project, options = {}) {
  let nextId = 0
  return new DesignCommandService({
    getProject: () => project,
    idGenerator: prefix => `${prefix}_${++nextId}`,
    defaultBackgroundNoise: () => ({ type: 'NoNoise', parameters: [] }),
    ...options,
  })
}

describe('DesignCommandService', () => {
  it('compiles specialist and transaction calls to the same operations', () => {
    const operations = [{
      kind: 'topology.create_node',
      client_ref: 'alice',
      value: { name: 'Alice', position: [1, 2] },
    }]
    expect(operationsForTool('design_transaction', { operations })).toBe(operations)
    expect(operationsForTool('topology_edit', {
      actions: [{
        action: 'create_node',
        client_ref: 'alice',
        value: { name: 'Alice', position: [1, 2] },
      }],
    })).toEqual(operations)
  })

  it('resolves transaction-local references and preserves retained identities', async () => {
    const project = createEmptyProject('Transaction')
    const retainedNode = new Node({
      id: 'node_existing',
      name: 'Existing',
      position: [0, 0],
      data: {
        type: 'City',
        slots: [{
          id: 'slot_existing',
          type: 'Qubit',
          backgroundNoise: { type: 'NoNoise', parameters: [] },
          isLocked: true,
          assignment: 'runtime-assignment',
          lastOperationTime: 12,
        }],
        protocols: [],
      },
    })
    project.net.nodes.push(retainedNode)
    const retainedSlot = retainedNode.data.slots[0]
    retainedSlot.ui_expanded = true
    const service = serviceFor(project)

    const result = await service.execute({
      origin: 'mcp',
      operationId: 'create-alice',
      operations: [
        {
          kind: 'topology.create_node',
          client_ref: 'alice',
          value: { name: 'Alice', position: [1, 2] },
        },
        {
          kind: 'topology.create_edge',
          client_ref: 'link',
          value: {
            source: { client_ref: 'alice' },
            target: 'node_existing',
          },
        },
        {
          kind: 'slots.create',
          client_ref: 'memory',
          node_id: { client_ref: 'alice' },
          value: { type: 'Qubit' },
        },
      ],
    })

    const alice = project.net.nodes.find(node => node.id === result.created_ids.alice)
    const edge = project.net.edges.find(item => item.id === result.created_ids.link)
    expect(alice.data.slots[0].id).toBe(result.created_ids.memory)
    expect(new Set([edge.source, edge.target])).toEqual(new Set([alice, retainedNode]))
    expect(project.net.nodes[0]).toBe(retainedNode)
    expect(project.net.nodes[0].data.slots[0]).toBe(retainedSlot)
    expect(retainedSlot).toMatchObject({
      isLocked: true,
      assignment: 'runtime-assignment',
      lastOperationTime: 12,
      ui_expanded: true,
    })
  })

  it('edits a slot-only node template and gives new nodes independent slot copies', async () => {
    const project = createEmptyProject('Template defaults')
    const service = serviceFor(project)

    await service.execute({
      operations: [
        {
          kind: 'slots.create',
          template: true,
          value: {
            type: 'Qubit',
            backgroundNoise: { type: 'NoNoise', parameters: [] },
          },
        },
        {
          kind: 'slots.create',
          template: true,
          value: {
            type: 'Qumode',
            backgroundNoise: { type: 'ThermalNoise', parameters: [] },
          },
        },
      ],
    })
    const [qubitTemplate, qumodeTemplate] = project.net.physicalConfig.nodeTemplate.slots

    await service.execute({
      operations: [
        {
          kind: 'slots.reorder',
          template: true,
          slot_id: qumodeTemplate.id,
          to_index: 0,
        },
        {
          kind: 'slots.update',
          template: true,
          slot_id: qubitTemplate.id,
          value: {
            backgroundNoise: { type: 'UpdatedNoise', parameters: [] },
          },
        },
        {
          kind: 'topology.create_node',
          id: 'node_a',
          value: { name: 'A', position: [1, 2] },
        },
        {
          kind: 'topology.create_node',
          id: 'node_b',
          value: { name: 'B', position: [3, 4] },
        },
      ],
    })

    const template = project.net.physicalConfig.nodeTemplate
    expect(template).not.toHaveProperty('name')
    expect(template).not.toHaveProperty('protocols')
    expect(template.slots.map(slot => slot.type)).toEqual(['Qumode', 'Qubit'])
    expect(template.slots[1].backgroundNoise.type).toBe('UpdatedNoise')

    const [nodeA, nodeB] = project.net.nodes
    expect(nodeA.data.protocols).toEqual([])
    expect(nodeA.data.slots.map(slot => slot.type)).toEqual(['Qumode', 'Qubit'])
    expect(nodeB.data.slots.map(slot => slot.type)).toEqual(['Qumode', 'Qubit'])
    expect(nodeA.data.slots.map(slot => slot.id)).not.toEqual(
      template.slots.map(slot => slot.id),
    )
    expect(nodeA.data.slots.map(slot => slot.id)).not.toEqual(
      nodeB.data.slots.map(slot => slot.id),
    )
    expect(nodeA.data.slots[0].backgroundNoise).not.toBe(
      nodeB.data.slots[0].backgroundNoise,
    )
  })

  it('rolls back every candidate change when one operation fails', async () => {
    const project = createEmptyProject('Rollback')
    const before = encodeDesignDocument(project)
    const markDirty = vi.fn()
    const service = serviceFor(project, { markDirty })

    await expect(service.execute({
      operations: [
        {
          kind: 'topology.create_node',
          value: { id: 'node_a', name: 'A', position: [0, 0] },
        },
        {
          kind: 'topology.create_edge',
          value: { source: 'node_a', target: 'missing' },
        },
      ],
    })).rejects.toMatchObject({
      code: 'RESULT_NOT_FOUND',
    })

    expect(encodeDesignDocument(project)).toEqual(before)
    expect(markDirty).not.toHaveBeenCalled()
  })

  it('retains every durable entity identity across candidate reconciliation', async () => {
    const project = createEmptyProject('Identity')
    const nodeProtocol = new FloatingProtocol({
      id: 'node_protocol',
      type: 'NodeProtocol',
    })
    const nodeA = new Node({
      id: 'node_a',
      name: 'A',
      position: [0, 0],
      data: {
        type: 'City',
        slots: [{
          id: 'slot_a',
          type: 'Qubit',
          backgroundNoise: { type: 'NoNoise', parameters: [] },
          renderedResult: '<runtime>',
        }],
        protocols: [nodeProtocol],
      },
    })
    const nodeB = new Node({
      id: 'node_b',
      name: 'B',
      position: [1, 1],
      data: { type: 'City', slots: [], protocols: [] },
    })
    const edgeProtocol = new FloatingProtocol({
      id: 'edge_protocol',
      type: 'EdgeProtocol',
    })
    const edge = new Edge({
      id: 'edge_a',
      source: nodeA,
      target: nodeB,
      data: {
        type: 'connection',
        protocols: [edgeProtocol],
        curvePoints: [],
        physicalOverrides: null,
      },
    })
    const floatingProtocol = new FloatingProtocol({
      id: 'floating_protocol',
      type: 'FloatingProtocol',
    })
    const variable = new Variable({
      id: 'variable_a',
      name: 'rate',
      type: 'Float64',
      value: 0.5,
    })
    const annotation = {
      id: 'annotation_a',
      markdown: 'Retained',
      bounds: { west: -1, south: -1, east: 1, north: 1 },
      backgroundColor: '#ffffff',
      borderColor: '#000000',
      area: null,
    }
    project.net.nodes.push(nodeA, nodeB)
    project.net.edges.push(edge)
    project.net.protocols.push(floatingProtocol)
    project.variables.push(variable)
    project.annotations.push(annotation)
    const slot = nodeA.data.slots[0]

    await serviceFor(project).execute({
      operations: [{
        kind: 'design.update',
        value: { description: 'Reconciled' },
      }],
    })

    expect(project.net.nodes).toEqual([nodeA, nodeB])
    expect(project.net.nodes[0].data.slots[0]).toBe(slot)
    expect(slot.renderedResult).toBe('<runtime>')
    expect(project.net.nodes[0].data.protocols[0]).toBe(nodeProtocol)
    expect(project.net.edges[0]).toBe(edge)
    expect(edge.source).toBe(nodeA)
    expect(edge.target).toBe(nodeB)
    expect(edge.data.protocols[0]).toBe(edgeProtocol)
    expect(project.net.protocols[0]).toBe(floatingProtocol)
    expect(project.variables[0]).toBe(variable)
    expect(project.annotations[0]).toBe(annotation)
  })

  it('does not expose candidate changes when asynchronous validation fails late', async () => {
    const project = createEmptyProject('Async rollback')
    const retainedNode = new Node({
      id: 'node_a',
      name: 'A',
      position: [0, 0],
    })
    project.net.nodes.push(retainedNode)
    const before = encodeDesignDocument(project)
    const markDirty = vi.fn()
    const clearDeletedSelection = vi.fn()
    const onCommitted = vi.fn()
    const service = serviceFor(project, {
      statesCatalog: () => [{ id: 'WeightedBell', weighted: true }],
      previewState: vi.fn(async () => {
        throw new Error('Preview unavailable')
      }),
      markDirty,
      clearDeletedSelection,
      onCommitted,
    })

    await expect(service.execute({
      operations: [
        {
          kind: 'design.update',
          value: { description: 'Candidate-only change' },
        },
        {
          kind: 'states.create',
          id: 'state_a',
          value: { name: 'rho', state_type: 'WeightedBell', parameters: {} },
        },
      ],
    })).rejects.toThrow('Preview unavailable')

    expect(encodeDesignDocument(project)).toEqual(before)
    expect(project.net.nodes[0]).toBe(retainedNode)
    expect(markDirty).not.toHaveBeenCalled()
    expect(clearDeletedSelection).not.toHaveBeenCalled()
    expect(onCommitted).not.toHaveBeenCalled()
  })

  it('returns a structured reason for duplicate physical endpoint pairs', async () => {
    const project = createEmptyProject('Duplicate edges')
    const nodeA = new Node({ id: 'node_a', name: 'A', position: [0, 0] })
    const nodeB = new Node({ id: 'node_b', name: 'B', position: [1, 1] })
    const nodeC = new Node({ id: 'node_c', name: 'C', position: [2, 2] })
    project.net.nodes.push(nodeA, nodeB, nodeC)
    project.net.edges.push(
      new Edge({ id: 'edge_ab', source: nodeA, target: nodeB }),
      new Edge({ id: 'edge_ac', source: nodeA, target: nodeC }),
    )
    const service = serviceFor(project)

    await expect(service.execute({
      operations: [{
        kind: 'topology.update_edge',
        id: 'edge_ac',
        value: { target: 'node_b' },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { reason: DUPLICATE_PHYSICAL_EDGE_REASON },
    })
    expect(project.net.edges[1].target).toBe(nodeC)
  })

  it('allocates MCP-created IDs in the browser and exposes client_ref aliases', async () => {
    const project = createEmptyProject('Agent IDs')
    const service = serviceFor(project)

    const result = await service.execute({
      origin: 'mcp',
      operations: [{
        kind: 'topology.create_node',
        client_ref: 'alice',
        value: { name: 'Alice', position: [-72, 42] },
      }],
    })

    expect(result.created_ids).toEqual({ alice: 'node_1' })
    expect(project.net.nodes[0].id).toBe('node_1')
    await expect(service.execute({
      origin: 'mcp',
      operations: [{
        kind: 'topology.create_node',
        id: 'agent-selected-id',
        value: { name: 'Bob', position: [-71, 42] },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining('use client_ref'),
    })
  })

  it('keeps caller-owned revision work in the same queue as GUI commands', async () => {
    const project = createEmptyProject('Queue')
    const service = serviceFor(project)
    const events = []
    let release
    const gate = new Promise(resolve => {
      release = resolve
    })

    const revisionWork = service.runExclusive(async () => {
      events.push('revision-start')
      await gate
      events.push('revision-acknowledged')
    })
    const guiWork = service.execute({
      operations: [{ kind: 'design.update', value: { description: 'queued' } }],
    }).then(() => events.push('gui-committed'))

    await Promise.resolve()
    expect(events).toEqual(['revision-start'])
    expect(project.description).toBe('')
    release()
    await Promise.all([revisionWork, guiWork])
    expect(events).toEqual([
      'revision-start',
      'revision-acknowledged',
      'gui-committed',
    ])
    expect(project.description).toBe('queued')
  })

  it('uses one editability decision for mixed transactions', async () => {
    const project = createEmptyProject('Locked')
    const service = serviceFor(project, { editingDisabled: () => true })

    await expect(service.execute({
      operations: [
        { kind: 'design.update', value: { description: 'allowed alone' } },
        {
          kind: 'topology.create_node',
          value: { name: 'Blocked', position: [0, 0] },
        },
      ],
    })).rejects.toBeInstanceOf(DesignCommandError)
    expect(project.description).toBe('')

    await service.execute({
      operations: [{ kind: 'design.update', value: { description: 'allowed' } }],
    })
    expect(project.description).toBe('allowed')
  })

  it('round-trips sub-default simulation settings without codec clamping', async () => {
    const project = createEmptyProject('Precise')
    project.simulationConfig.time = 0.25
    project.simulationConfig.timeStep = 0.01
    const service = serviceFor(project)

    await service.execute({
      operations: [{
        kind: 'design.update',
        value: { description: 'Keep precise settings' },
      }],
    })

    expect(project.simulationConfig).toMatchObject({
      time: 0.25,
      timeStep: 0.01,
    })
  })

  it('treats dollar-prefixed content as literal text, not an implicit client reference', async () => {
    const project = createEmptyProject('Literal aliases')
    const service = serviceFor(project)

    await service.execute({
      operations: [{
        kind: 'design.update',
        value: { description: '$E = mc^2$ and $unknown stay Markdown.' },
      }],
    })

    expect(project.description).toBe('$E = mc^2$ and $unknown stay Markdown.')
  })

  it('validates catalog-backed noise, protocol, and ordinary variable values', async () => {
    const project = createEmptyProject('Typed values')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'A',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const service = serviceFor(project, {
      backgroundCatalog: () => [{
        type: 'ThermalNoise',
        parameters: [{ field: 'rate', type: 'Float64', min: 0, max: 1 }],
      }],
      protocolCatalog: () => ({
        node: [{
          type: 'Example.Protocol',
          parameters: [
            { field: 'enabled', type: 'Bool', defaultValue: false },
            { field: 'rounds', type: 'Int64' },
            {
              field: 'tag',
              type: 'Union{Nothing, Type{<:QuantumSavory.AbstractTag}}',
              kind: 'named_tag_type',
              nullable: true,
            },
          ],
        }],
        edge: [],
        floating: [],
      }),
    })

    await service.execute({
      operations: [{
        kind: 'slots.create',
        node_id: 'node_a',
        value: {
          type: 'Qubit',
          backgroundNoise: {
            type: 'ThermalNoise',
            parameters: [{ field: 'rate', type: 'Float64', value: null }],
          },
        },
      }],
    })
    expect(project.net.nodes[0].data.slots[0].backgroundNoise.parameters[0].value)
      .toBeNull()

    await expect(service.execute({
      operations: [{
        kind: 'slots.update',
        node_id: 'node_a',
        slot_id: project.net.nodes[0].data.slots[0].id,
        value: {
          backgroundNoise: {
            type: 'ThermalNoise',
            parameters: [{ field: 'rate', type: 'Float64', value: 2 }],
          },
        },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

    await service.execute({
      operations: [{
        kind: 'protocols.create',
        placement: 'node',
        owner_id: 'node_a',
        value: {
          type: 'Example.Protocol',
          parameters: [
            { name: 'enabled', type: 'Bool', value: false },
            { name: 'rounds', type: 'Int64', value: null },
          ],
        },
      }],
    })
    expect(project.net.nodes[0].data.protocols[0].parameters)
      .toContainEqual(expect.objectContaining({ name: 'rounds', value: null }))
    project.net.nodes[0].data.protocols[0].parameters
      .find(parameter => parameter.name === 'tag').type = 'Any'

    await service.execute({
      operations: [{
        kind: 'protocols.update',
        placement: 'node',
        owner_id: 'node_a',
        protocol_id: project.net.nodes[0].data.protocols[0].id,
        value: {
          parameters: [
            { name: 'enabled', type: 'String', value: true },
            { name: 'rounds', type: 'Int64', value: 3 },
            {
              name: 'tag',
              type: 'DataType',
              selectedType: 'DataType',
              value: 'nothing',
            },
          ],
        },
      }],
    })
    expect(project.net.nodes[0].data.protocols[0].parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'enabled', type: 'Bool', value: true }),
        expect.objectContaining({ name: 'rounds', type: 'Int64', value: 3 }),
        expect.objectContaining({ name: 'tag', type: 'Any', value: 'nothing' }),
      ]),
    )

    await expect(service.execute({
      operations: [{
        kind: 'protocols.update',
        placement: 'node',
        owner_id: 'node_a',
        protocol_id: project.net.nodes[0].data.protocols[0].id,
        value: {
          parameters: [{ name: 'enabled', type: 'String', value: 'yes' }],
        },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(project.net.nodes[0].data.protocols[0].parameters)
      .toContainEqual(expect.objectContaining({ name: 'enabled', type: 'Bool', value: true }))

    await expect(service.execute({
      operations: [{
        kind: 'protocols.create',
        placement: 'node',
        owner_id: 'node_a',
        value: {
          type: 'Example.Protocol',
          parameters: [
            { name: 'enabled', type: 'Bool', value: false },
            { name: 'rounds', type: 'Int64', value: 1.5 },
          ],
        },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

    await service.execute({
      operations: [{
        kind: 'variables.create',
        value: { name: 'optional_rate', type: 'Float64', value: null },
      }],
    })
    expect(project.variables[0]).toMatchObject({ name: 'optional_rate', value: null })

    await expect(service.execute({
      operations: [{
        kind: 'variables.create',
        value: { name: 'rounds', type: 'Int64', value: 1.5 },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(project.net.nodes[0].data.slots).toHaveLength(1)
    expect(project.net.nodes[0].data.protocols).toHaveLength(1)
    expect(project.variables).toHaveLength(1)
  })

  it('validates and updates the global quantum representations', async () => {
    const project = createEmptyProject('Representations')
    const service = serviceFor(project)

    await service.execute({
      operations: [{
        kind: 'design.update',
        value: {
          simulationConfig: {
            qubitRepresentation: 'CliffordRepr',
            qumodeRepresentation: 'GabsRepr',
          },
        },
      }],
    })

    expect(project.simulationConfig).toMatchObject({
      qubitRepresentation: 'CliffordRepr',
      qumodeRepresentation: 'GabsRepr',
    })
    await expect(service.execute({
      operations: [{
        kind: 'design.update',
        value: { simulationConfig: { qubitRepresentation: 'GabsRepr' } },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('validates Lambda variables with deferred node-and-edge context', async () => {
    const project = createEmptyProject('Contextual variables')
    const validateCodeValue = vi.fn(async () => ({ valid: true }))
    const service = serviceFor(project, { validateCodeValue })

    await service.execute({
      operations: [{
        kind: 'variables.create',
        id: 'variable_context',
        value: {
          name: 'contextual',
          type: 'Lambda',
          value: 'values -> self + node_a + node_b + length + Base.length(values)',
        },
      }],
    })
    expect(validateCodeValue).toHaveBeenLastCalledWith(
      'Lambda',
      'values -> self + node_a + node_b + length + Base.length(values)',
      { placement: 'variable' },
    )

    await service.execute({
      operations: [{
        kind: 'variables.update',
        variable_id: 'variable_context',
        value: { value: 'values -> delay + refractive_index + Base.length(values)' },
      }],
    })
    expect(validateCodeValue).toHaveBeenLastCalledWith(
      'Lambda',
      'values -> delay + refractive_index + Base.length(values)',
      { placement: 'variable' },
    )
  })

  it('synchronizes weighted States Zoo trace companions atomically', async () => {
    const project = createEmptyProject('States')
    const previewState = vi.fn(async () => ({ trace: -0.25 }))
    const service = serviceFor(project, {
      statesCatalog: () => [{ id: 'WeightedBell', weighted: true }],
      previewState,
    })

    await service.execute({
      operations: [{
        kind: 'states.create',
        id: 'variable_state',
        value: {
          name: 'rho',
          state_type: 'WeightedBell',
          parameters: { visibility: 0.5 },
        },
      }],
    })

    expect(previewState).toHaveBeenCalledWith('WeightedBell', { visibility: 0.5 })
    expect(project.variables).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'variable_state', name: 'rho' }),
      expect.objectContaining({
        id: 'variable_state_tr',
        name: 'rho_tr',
        value: 0.25,
        statesZooTraceSourceId: 'variable_state',
      }),
    ]))
  })
})

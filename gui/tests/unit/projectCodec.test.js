import { describe, expect, it, vi } from 'vitest'

import Edge from '../../src/models/Edge'
import FloatingProtocol from '../../src/models/FloatingProtocol'
import Node from '../../src/models/Node'
import Variable from '../../src/models/Variable'
import {
  PROJECT_SCHEMA_VERSION,
  createEmptyProject,
  decodeStoredProject,
  encodeStoredProject,
  normalizeProjectName,
  summarizeProject,
  toScriptExportPayload,
  toSimulationPayload,
} from '../../src/utils/projectCodec'

const DEFAULT_NOISE = {
  type: 'QuantumSavory.NoBackground',
  doc: 'No background noise',
  parameters: [],
}

function legacyProject() {
  return {
    name: 'Embedded Name',
    description: '# Project notes',
    futureProjectField: { enabled: true },
    variables: [
      {
        id: 'variable_state',
        name: 'state',
        type: 'Symbolic',
        value: {
          kind: 'states_zoo',
          state_type: 'DepolarizedBellPair',
          parameters: { fidelity: 0.9 },
        },
        futureVariableField: 'preserve me',
      },
    ],
    simulationConfig: { time: 0.5, timeStep: 0.01, futureConfigField: 7 },
    platformInfo: { versions: { app: '1.0.0' } },
    uiGlobal: {
      map: { position: [-72.5, 42.3], zoom: 8, bearing: 10 },
      futureUiField: true,
    },
    net: {
      futureNetField: 'preserve me',
      nodes: [
        {
          id: 'node_b',
          name: 'B',
          position: [-71, 42],
          futureNodeField: 2,
          data: {
            type: 'City',
            slots: [{ id: 'slot_b', type: 'Qubit', backgroundNoise: null }],
            protocols: [{
              id: 'node_protocol',
              type: 'NodeProtocol',
              parameters: [],
              futureProtocolField: true,
            }],
          },
        },
        {
          id: 'node_a',
          name: 'A',
          position: [-73, 42],
          data: {
            type: 'City',
            slots: [{ id: 'slot_a', type: 'Qubit', backgroundNoise: 'default' }],
            protocols: [],
          },
        },
      ],
      edges: [{
        id: 'edge_ab',
        source: 'node_a',
        target: 'node_b',
        isLogic: false,
        futureEdgeField: 'preserve me',
        data: {
          type: 'connection',
          protocols: [{ id: 'edge_protocol', type: 'EdgeProtocol', parameters: [] }],
        },
      }],
      protocols: [{ id: 'floating_protocol', type: 'FloatingProtocol', parameters: [] }],
    },
  }
}

describe('createEmptyProject', () => {
  it('creates an independent canonical empty project', () => {
    const first = createEmptyProject('First')
    const second = createEmptyProject('Second')

    expect(first).toEqual({
      name: 'First',
      description: '',
      variables: [],
      simulationConfig: { time: 1, timeStep: 0.1 },
      net: { nodes: [], edges: [], protocols: [] },
    })
    expect(second.name).toBe('Second')
    expect(first.net).not.toBe(second.net)
    expect(first.simulationConfig).not.toBe(second.simulationConfig)
  })

  it('uses one trimmed project-name representation', () => {
    expect(normalizeProjectName('  Project A  ')).toBe('Project A')
    expect(createEmptyProject('  Project A  ').name).toBe('Project A')
  })
})

describe('decodeStoredProject', () => {
  it('hydrates legacy storage into model identities and makes the storage name authoritative', () => {
    const getDefaultNoise = vi.fn(() => DEFAULT_NOISE)
    const decoded = decodeStoredProject(legacyProject(), {
      storageName: 'Storage Name',
      defaultBackgroundNoise: getDefaultNoise,
      minimumTime: 1,
      minimumTimeStep: 0.1,
    })

    expect(decoded.schemaVersion).toBe(0)
    expect(decoded.project.name).toBe('Storage Name')
    expect(decoded.project.description).toBe('# Project notes')
    expect(decoded.project.futureProjectField).toEqual({ enabled: true })
    expect(decoded.project.simulationConfig).toEqual({
      time: 1,
      timeStep: 0.1,
      futureConfigField: 7,
    })

    const [nodeB, nodeA] = decoded.project.net.nodes
    expect(nodeB).toBeInstanceOf(Node)
    expect(nodeA).toBeInstanceOf(Node)
    expect(nodeB.futureNodeField).toBe(2)
    expect(nodeB.data.protocols[0]).toBeInstanceOf(FloatingProtocol)
    expect(nodeB.data.protocols[0].futureProtocolField).toBe(true)

    const [edge] = decoded.project.net.edges
    expect(edge).toBeInstanceOf(Edge)
    expect(edge.source).toBe(nodeB)
    expect(edge.target).toBe(nodeA)
    expect(edge.futureEdgeField).toBe('preserve me')
    expect(edge.data.protocols[0]).toBeInstanceOf(FloatingProtocol)
    expect(decoded.project.net.protocols[0]).toBeInstanceOf(FloatingProtocol)

    expect(decoded.project.variables[0]).toBeInstanceOf(Variable)
    expect(decoded.project.variables[0].value).toEqual({
      kind: 'states_zoo',
      state_type: 'DepolarizedBellPair',
      parameters: { fidelity: 0.9 },
    })
    expect(decoded.project.variables[0].futureVariableField).toBe('preserve me')

    const firstNoise = nodeB.data.slots[0].backgroundNoise
    const secondNoise = nodeA.data.slots[0].backgroundNoise
    expect(firstNoise).toEqual(DEFAULT_NOISE)
    expect(secondNoise).toEqual(DEFAULT_NOISE)
    expect(firstNoise).not.toBe(secondNoise)
    expect(firstNoise).not.toBe(DEFAULT_NOISE)
    expect(getDefaultNoise).toHaveBeenCalledTimes(2)

    expect(decoded.map).toEqual({ position: [-72.5, 42.3], zoom: 8, bearing: 10 })
    expect(decoded.uiGlobal.futureUiField).toBe(true)
    expect(decoded.platformInfo).toEqual({ versions: { app: '1.0.0' } })
  })

  it('accepts missing storage fields and partial network envelopes', () => {
    const decoded = decodeStoredProject({ name: 'Partial', net: {} }, {
      defaultMapCenter: [1, 2],
      defaultMapZoom: 3,
    })

    expect(decoded.project).toMatchObject({
      name: 'Partial',
      description: '',
      variables: [],
      simulationConfig: { time: 1, timeStep: 0.1 },
      net: { nodes: [], edges: [], protocols: [] },
    })
    expect(decoded.map).toEqual({ position: [1, 2], zoom: 3 })
  })

  it('normalizes non-default legacy noise strings into editable objects', () => {
    const raw = legacyProject()
    raw.net.nodes[0].data.slots[0].backgroundNoise = 'CustomNoise'

    const { project } = decodeStoredProject(raw)

    expect(project.net.nodes[0].data.slots[0].backgroundNoise).toEqual({
      type: 'CustomNoise',
      parameters: [],
    })
  })

  it('rejects unsupported future schemas before hydration', () => {
    expect(() => decodeStoredProject({
      ...createEmptyProject('Future'),
      schemaVersion: PROJECT_SCHEMA_VERSION + 1,
    })).toThrow(/newer than supported/)
  })

  it('rejects duplicate node IDs and dangling edge references', () => {
    const project = legacyProject()
    project.net.nodes[1].id = project.net.nodes[0].id
    expect(() => decodeStoredProject(project)).toThrow(/duplicate node ID/)

    const dangling = legacyProject()
    dangling.net.edges[0].target = 'missing_node'
    expect(() => decodeStoredProject(dangling)).toThrow(/references a missing node/)
  })
})

describe('encodeStoredProject', () => {
  it('writes the v1 plain-storage shape without mutating the live model graph', () => {
    const decoded = decodeStoredProject(legacyProject(), {
      storageName: 'Storage Name',
      defaultBackgroundNoise: DEFAULT_NOISE,
    })
    const liveSlot = decoded.project.net.nodes[0].data.slots[0]
    liveSlot.isLocked = true
    liveSlot.assignment = { node: 1 }

    const encoded = encodeStoredProject(decoded.project, {
      name: 'Saved As',
      platformInfo: { versions: { app: '2.0.0' } },
      uiGlobal: decoded.uiGlobal,
      map: { position: [10, 20], zoom: 6 },
    })

    expect(encoded.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
    expect(encoded.name).toBe('Saved As')
    expect(encoded.description).toBe('# Project notes')
    expect(encoded.platformInfo).toEqual({ versions: { app: '2.0.0' } })
    expect(encoded.uiGlobal).toEqual({
      futureUiField: true,
      map: { position: [10, 20], zoom: 6 },
    })
    expect(encoded.futureProjectField).toEqual({ enabled: true })
    expect(encoded.net.futureNetField).toBe('preserve me')
    expect(encoded.net.nodes[0].futureNodeField).toBe(2)
    expect(encoded.net.nodes[0].data.slots[0]).toMatchObject({
      isLocked: false,
      assignment: false,
    })
    expect(encoded.net.edges[0]).toMatchObject({
      source: 'node_b',
      target: 'node_a',
      futureEdgeField: 'preserve me',
    })
    expect(encoded.variables[0].value.kind).toBe('states_zoo')
    expect(encoded.net.nodes[0]).not.toBeInstanceOf(Node)
    expect(encoded.net.edges[0]).not.toBeInstanceOf(Edge)

    expect(liveSlot.isLocked).toBe(true)
    expect(liveSlot.assignment).toEqual({ node: 1 })
  })

  it('round-trips identities, references, description, tagged data, and map state', () => {
    const first = decodeStoredProject(legacyProject(), {
      storageName: 'Round Trip',
      defaultBackgroundNoise: DEFAULT_NOISE,
    })
    const stored = encodeStoredProject(first.project, {
      name: first.project.name,
      map: first.map,
      uiGlobal: first.uiGlobal,
      platformInfo: first.platformInfo,
    })
    const second = decodeStoredProject(stored, {
      storageName: 'Round Trip',
      defaultBackgroundNoise: DEFAULT_NOISE,
    })

    expect(second.schemaVersion).toBe(1)
    expect(second.project.net.nodes.every(node => node instanceof Node)).toBe(true)
    expect(second.project.net.edges[0].source).toBe(second.project.net.nodes[0])
    expect(second.project.net.edges[0].target).toBe(second.project.net.nodes[1])
    expect(second.project.description).toBe(first.project.description)
    expect(second.project.variables[0].value).toEqual(first.project.variables[0].value)
    expect(second.map).toEqual(first.map)
  })
})

describe('backend payload codecs', () => {
  it('removes UI/storage state and normalizes slots and placed protocols without mutation', () => {
    const { project } = decodeStoredProject(legacyProject(), {
      storageName: 'Payload Project',
      defaultBackgroundNoise: DEFAULT_NOISE,
    })
    project.schemaVersion = 99
    project.uiGlobal = { map: { position: [0, 0], zoom: 1 } }
    project.platformInfo = { versions: {} }
    const slot = project.net.nodes[0].data.slots[0]
    slot.ui_expanded = true
    slot.isLocked = true
    slot.assignment = { node: 1 }
    slot.lastOperationTime = 5
    slot.representationType = 'density'
    slot.backgroundNoise = {
      type: 'NoiseType',
      doc: 'Editor documentation',
      futureNoiseField: true,
      parameters: [
        { field: 'rate', value: 0.25, doc: 'Rate' },
        { field: 'unused', value: '' },
      ],
    }
    project.net.nodes[0].data.protocols[0].parameters = [
      { name: 'sim', type: 'ConcurrentSim.Simulation' },
      { name: 'node', type: 'Int64', value: 1 },
      { name: 'kept', type: 'Union', selectedType: 'Float64', value: 0.5 },
      { name: 'unset', type: 'Float64', value: null },
    ]
    project.net.edges[0].data.protocols[0].parameters = [
      { name: 'nodeA', type: 'Int64', value: 1 },
      { name: 'value', type: 'Symbolic', value: { kind: 'variable', id: 'variable_state' } },
    ]

    const payload = toSimulationPayload(project)

    expect(payload.name).toBe('Payload Project')
    expect(payload.futureProjectField).toEqual({ enabled: true })
    expect(payload).not.toHaveProperty('schemaVersion')
    expect(payload).not.toHaveProperty('description')
    expect(payload).not.toHaveProperty('simulationConfig')
    expect(payload).not.toHaveProperty('platformInfo')
    expect(payload).not.toHaveProperty('uiGlobal')
    expect(payload.variables).toEqual([{
      id: 'variable_state',
      name: 'state',
      type: 'Symbolic',
      value: {
        kind: 'states_zoo',
        state_type: 'DepolarizedBellPair',
        parameters: { fidelity: 0.9 },
      },
    }])
    expect(payload.net.nodes[0].data.slots[0]).toMatchObject({
      id: 'slot_b',
      backgroundNoise: {
        type: 'NoiseType',
        futureNoiseField: true,
        parameters: [{ name: 'rate', value: 0.25 }],
      },
    })
    expect(payload.net.nodes[0].data.slots[0]).not.toHaveProperty('ui_expanded')
    expect(payload.net.nodes[0].data.slots[0]).not.toHaveProperty('isLocked')
    expect(payload.net.nodes[0].data.slots[0].backgroundNoise).not.toHaveProperty('doc')
    expect(payload.net.nodes[0].data.protocols[0].parameters).toEqual([
      { name: 'kept', type: 'Float64', value: 0.5 },
    ])
    expect(payload.net.edges[0].data.protocols[0].parameters).toEqual([
      {
        name: 'value',
        type: 'Symbolic',
        value: { kind: 'variable', id: 'variable_state' },
      },
    ])
    expect(payload.net.edges[0]).toMatchObject({ source: 'node_b', target: 'node_a' })

    expect(slot.isLocked).toBe(true)
    expect(slot.backgroundNoise.doc).toBe('Editor documentation')
    expect(project.net.nodes[0].data.protocols[0].parameters[2].selectedType).toBe('Float64')
  })

  it('adds only the requested simulation configuration for script export', () => {
    const project = createEmptyProject('Script')
    project.description = 'Not simulator input'

    const payload = toScriptExportPayload(project, { time: 2.5, timeStep: 0.25, ui: true })

    expect(payload.simulationConfig).toEqual({ time: 2.5, timeStep: 0.25 })
    expect(payload).not.toHaveProperty('description')
    expect(payload).not.toHaveProperty('schemaVersion')
  })
})

describe('summarizeProject', () => {
  it('calculates topology and protocol metadata without persistence access', () => {
    const { project } = decodeStoredProject(legacyProject(), {
      defaultBackgroundNoise: DEFAULT_NOISE,
    })

    expect(summarizeProject(project)).toEqual({
      nodeCount: 2,
      edgeCount: 1,
      slotCount: 2,
      protocolCount: 3,
    })
    expect(summarizeProject(null)).toEqual({
      nodeCount: 0,
      edgeCount: 0,
      slotCount: 0,
      protocolCount: 0,
    })
  })
})

import Edge from '../models/Edge'
import Node from '../models/Node'
import { generateUUid, setEdgeCorrectNodeOrder } from './Utils'

const MIN_REPEATER_COUNT = 1
const MAX_REPEATER_COUNT = 100

function endpointId(endpoint) {
  return endpoint?.id ?? endpoint
}

function edgeHasNode(edge, nodeId) {
  return endpointId(edge.source) === nodeId || endpointId(edge.target) === nodeId
}

function resolveSelection(net, options) {
  if (!net || !Array.isArray(net.nodes) || !Array.isArray(net.edges)) {
    return {
      valid: false,
      error: 'A network with node and edge arrays is required.'
    }
  }

  const {
    startNodeId,
    endNodeId,
    templateNodeId,
    templateEdgeId,
    repeaterCount,
    createVirtualEdge = true
  } = options || {}

  const startNode = net.nodes.find(node => node.id === startNodeId)
  if (!startNode) {
    return { valid: false, error: 'Select a valid start node.' }
  }

  const endNode = net.nodes.find(node => node.id === endNodeId)
  if (!endNode) {
    return { valid: false, error: 'Select a valid end node.' }
  }

  const templateNode = net.nodes.find(node => node.id === templateNodeId)
  if (!templateNode) {
    return { valid: false, error: 'Select a valid repeater template node.' }
  }

  const templateEdge = net.edges.find(edge => edge.id === templateEdgeId)
  if (!templateEdge) {
    return { valid: false, error: 'Select a valid repeater template edge.' }
  }

  if (new Set([startNodeId, endNodeId, templateNodeId]).size !== 3) {
    return {
      valid: false,
      error: 'Start, end, and repeater template nodes must be distinct.'
    }
  }

  if (!Number.isInteger(repeaterCount)
    || repeaterCount < MIN_REPEATER_COUNT
    || repeaterCount > MAX_REPEATER_COUNT) {
    return {
      valid: false,
      error: `Number of repeaters must be an integer between ${MIN_REPEATER_COUNT} and ${MAX_REPEATER_COUNT}.`
    }
  }

  if (typeof createVirtualEdge !== 'boolean') {
    return {
      valid: false,
      error: 'The end-to-end virtual edge option must be enabled or disabled.'
    }
  }

  if (!edgeHasNode(templateEdge, templateNodeId)) {
    return {
      valid: false,
      error: 'The repeater template edge must be connected to the repeater template node.'
    }
  }

  const incidentEdges = net.edges.filter(edge => edgeHasNode(edge, templateNodeId))
  if (incidentEdges.length !== 1 || incidentEdges[0] !== templateEdge) {
    return {
      valid: false,
      error: 'The repeater template node must have exactly one incident edge, and it must be the selected template edge.'
    }
  }

  if (!isPosition(startNode.position) || !isPosition(endNode.position)) {
    return {
      valid: false,
      error: 'The start and end nodes must have valid map positions.'
    }
  }

  return {
    valid: true,
    error: null,
    selection: {
      startNode,
      endNode,
      templateNode,
      templateEdge,
      repeaterCount,
      createVirtualEdge
    }
  }
}

function isPosition(position) {
  return Array.isArray(position)
    && position.length === 2
    && position.every(coordinate => Number.isFinite(coordinate))
}

/**
 * Validate the selections for a repeater-chain transformation.
 *
 * @param {Object} net Network object containing `nodes` and `edges` arrays.
 * @param {Object} options Selected entity IDs, `repeaterCount`, and optional `createVirtualEdge`.
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateRepeaterChain(net, options) {
  const { valid, error } = resolveSelection(net, options)
  return { valid, error }
}

function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)

  if (value instanceof Date) return new Date(value.getTime())
  if (value instanceof RegExp) return new RegExp(value.source, value.flags)

  if (value instanceof Map) {
    const clone = new Map()
    seen.set(value, clone)
    value.forEach((item, key) => clone.set(deepClone(key, seen), deepClone(item, seen)))
    return clone
  }

  if (value instanceof Set) {
    const clone = new Set()
    seen.set(value, clone)
    value.forEach(item => clone.add(deepClone(item, seen)))
    return clone
  }

  const clone = Array.isArray(value)
    ? []
    : Object.create(Object.getPrototypeOf(value))
  seen.set(value, clone)

  Reflect.ownKeys(value).forEach(key => {
    if (Array.isArray(value) && key === 'length') return

    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if ('value' in descriptor) {
      descriptor.value = deepClone(descriptor.value, seen)
    }
    Object.defineProperty(clone, key, descriptor)
  })

  return clone
}

function collectUsedIds(net) {
  const ids = new Set()
  const addId = item => {
    if (item?.id != null) ids.add(item.id)
  }

  net.nodes.forEach(node => {
    addId(node)
    node.data?.slots?.forEach(addId)
    node.data?.protocols?.forEach(addId)
  })
  net.edges.forEach(edge => {
    addId(edge)
    edge.data?.protocols?.forEach(addId)
  })
  net.protocols?.forEach(addId)

  return ids
}

function createIdGenerator(net) {
  const usedIds = collectUsedIds(net)

  return prefix => {
    const generatedId = generateUUid(prefix)
    let candidate = generatedId
    let suffix = 2

    while (usedIds.has(candidate)) {
      candidate = `${generatedId}_${suffix}`
      suffix += 1
    }

    usedIds.add(candidate)
    return candidate
  }
}

function cloneNodeData(templateData, nextId) {
  const data = deepClone(templateData || {})

  if (Array.isArray(data.slots)) {
    data.slots.forEach(slot => {
      if (slot && typeof slot === 'object') slot.id = nextId('slot')
    })
  }

  if (Array.isArray(data.protocols)) {
    data.protocols.forEach(protocol => {
      if (protocol && typeof protocol === 'object') protocol.id = nextId('protocol')
    })
  }

  return data
}

function cloneEdgeData(templateData, nextId) {
  const data = deepClone(templateData || {})

  if (Array.isArray(data.protocols)) {
    data.protocols.forEach(protocol => {
      if (protocol && typeof protocol === 'object') protocol.id = nextId('protocol')
    })
  }

  return data
}

/**
 * Replace a repeater template node and its sole edge with an evenly spaced chain.
 * The replacement arrays are completely built before the network is mutated.
 *
 * @param {Object} net Network object containing `nodes` and `edges` arrays.
 * @param {Object} options Selected entity IDs, `repeaterCount`, and optional `createVirtualEdge`.
 * @returns {Object} Generated and removed entities plus a logging summary.
 * @throws {Error} When the selections are no longer valid.
 */
export function generateRepeaterChain(net, options) {
  const validation = resolveSelection(net, options)
  if (!validation.valid) throw new Error(validation.error)

  const {
    startNode,
    endNode,
    templateNode,
    templateEdge,
    repeaterCount,
    createVirtualEdge
  } = validation.selection
  const nextId = createIdGenerator(net)
  const generatedNodes = []

  for (let index = 1; index <= repeaterCount; index += 1) {
    const fraction = index / (repeaterCount + 1)
    const position = [
      startNode.position[0] + ((endNode.position[0] - startNode.position[0]) * fraction),
      startNode.position[1] + ((endNode.position[1] - startNode.position[1]) * fraction)
    ]

    generatedNodes.push(new Node({
      id: nextId('node'),
      name: `${templateNode.name}-${index}`,
      position,
      data: cloneNodeData(templateNode.data, nextId)
    }))
  }

  const chainNodes = [startNode, ...generatedNodes, endNode]
  const chainEdges = []
  for (let index = 0; index < chainNodes.length - 1; index += 1) {
    chainEdges.push(new Edge({
      id: nextId('edge'),
      source: chainNodes[index],
      target: chainNodes[index + 1],
      data: cloneEdgeData(templateEdge.data, nextId),
      isLogic: templateEdge.isLogic
    }))
  }

  const virtualEdge = createVirtualEdge
    ? new Edge({
        id: nextId('edge'),
        source: startNode,
        target: endNode,
        data: { type: 'connection', protocols: [] },
        isLogic: true
      })
    : null
  const generatedEdges = virtualEdge
    ? [...chainEdges, virtualEdge]
    : chainEdges

  const templateNodeIndex = net.nodes.indexOf(templateNode)
  const templateEdgeIndex = net.edges.indexOf(templateEdge)
  const nodes = [
    ...net.nodes.slice(0, templateNodeIndex),
    ...generatedNodes,
    ...net.nodes.slice(templateNodeIndex + 1)
  ]

  generatedEdges.forEach(edge => setEdgeCorrectNodeOrder(edge, nodes))

  const edges = [
    ...net.edges.slice(0, templateEdgeIndex),
    ...generatedEdges,
    ...net.edges.slice(templateEdgeIndex + 1)
  ]

  Object.assign(net, { nodes, edges })

  return {
    generatedNodes,
    generatedEdges,
    chainEdges,
    virtualEdge,
    removedNode: templateNode,
    removedEdge: templateEdge,
    summary: {
      startNodeId: startNode.id,
      endNodeId: endNode.id,
      templateNodeId: templateNode.id,
      templateEdgeId: templateEdge.id,
      repeaterCount,
      createVirtualEdge,
      virtualEdgeId: virtualEdge?.id ?? null,
      generatedNodeIds: generatedNodes.map(node => node.id),
      generatedEdgeIds: generatedEdges.map(edge => edge.id)
    }
  }
}

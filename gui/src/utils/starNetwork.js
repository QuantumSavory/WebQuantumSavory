import Edge from '../models/Edge'
import Node from '../models/Node'
import {
  assertGeneratedMapPosition,
  cloneEdgeData,
  cloneNodeData,
  createIdGenerator,
  edgeHasNode,
  endpointId,
  isMapPosition,
  normalizeEdges,
  projectMapPosition,
  unprojectMapPosition
} from './layoutTemplates'

const MIN_PERIPHERAL_COUNT = 1
const MAX_PERIPHERAL_COUNT = 12

function resolveSelection(net, options) {
  if (!net || !Array.isArray(net.nodes) || !Array.isArray(net.edges)) {
    return { valid: false, error: 'A network with node and edge arrays is required.' }
  }

  const {
    centerNodeId,
    peripheralNodeId,
    templateEdgeId,
    peripheralCount
  } = options || {}

  const centerNode = net.nodes.find(node => node.id === centerNodeId)
  if (!centerNode) return { valid: false, error: 'Select a valid center node.' }

  const peripheralNode = net.nodes.find(node => node.id === peripheralNodeId)
  if (!peripheralNode) return { valid: false, error: 'Select a valid peripheral template node.' }

  if (centerNode === peripheralNode) {
    return { valid: false, error: 'The center and peripheral template nodes must be distinct.' }
  }

  const templateEdge = net.edges.find(edge => edge.id === templateEdgeId)
  if (!templateEdge) return { valid: false, error: 'Select a valid edge template.' }

  const templateEndpoints = new Set([
    endpointId(templateEdge.source),
    endpointId(templateEdge.target)
  ])
  if (!templateEndpoints.has(centerNodeId) || !templateEndpoints.has(peripheralNodeId)) {
    return {
      valid: false,
      error: 'The edge template must connect the selected center and peripheral nodes.'
    }
  }

  if (!Number.isInteger(peripheralCount)
    || peripheralCount < MIN_PERIPHERAL_COUNT
    || peripheralCount > MAX_PERIPHERAL_COUNT) {
    return {
      valid: false,
      error: `Number of peripheral nodes must be an integer between ${MIN_PERIPHERAL_COUNT} and ${MAX_PERIPHERAL_COUNT}.`
    }
  }

  const incidentEdges = net.edges.filter(edge => edgeHasNode(edge, peripheralNodeId))
  if (incidentEdges.length !== 1 || incidentEdges[0] !== templateEdge) {
    return {
      valid: false,
      error: 'The peripheral template node must have only the selected edge template.'
    }
  }

  if (!isMapPosition(centerNode.position) || !isMapPosition(peripheralNode.position)) {
    return { valid: false, error: 'Both template nodes must have valid map positions.' }
  }

  let centerLayoutPosition
  let peripheralLayoutPosition
  try {
    centerLayoutPosition = projectMapPosition(centerNode.position)
    peripheralLayoutPosition = projectMapPosition(peripheralNode.position)
  } catch (error) {
    return { valid: false, error: error.message }
  }
  const offset = [
    peripheralLayoutPosition[0] - centerLayoutPosition[0],
    peripheralLayoutPosition[1] - centerLayoutPosition[1]
  ]
  if (Math.hypot(...offset) === 0) {
    return { valid: false, error: 'The peripheral template must not overlap the center node.' }
  }

  return {
    valid: true,
    error: null,
    selection: {
      centerNode,
      peripheralNode,
      templateEdge,
      peripheralCount,
      centerLayoutPosition,
      offset
    }
  }
}

export function validateStarNetwork(net, options) {
  const { valid, error } = resolveSelection(net, options)
  return { valid, error }
}

/**
 * Replace one isolated peripheral template with equally spaced clones around a center node.
 * The first generated peripheral keeps the template position and subsequent nodes rotate
 * counterclockwise. Replacement arrays are complete before the network is mutated.
 */
export function generateStarNetwork(net, options) {
  const validation = resolveSelection(net, options)
  if (!validation.valid) throw new Error(validation.error)

  const {
    centerNode,
    peripheralNode,
    templateEdge,
    peripheralCount,
    centerLayoutPosition,
    offset
  } = validation.selection
  const nextId = createIdGenerator(net)
  const generatedNodes = []

  for (let index = 0; index < peripheralCount; index += 1) {
    const angle = (2 * Math.PI * index) / peripheralCount
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const layoutPosition = [
      centerLayoutPosition[0] + (offset[0] * cos) - (offset[1] * sin),
      centerLayoutPosition[1] + (offset[0] * sin) + (offset[1] * cos)
    ]
    const position = index === 0
      ? [...peripheralNode.position]
      : unprojectMapPosition(layoutPosition)

    assertGeneratedMapPosition(position)

    generatedNodes.push(new Node({
      id: nextId('node'),
      name: `${peripheralNode.name}-${index + 1}`,
      position,
      data: cloneNodeData(peripheralNode.data, nextId)
    }))
  }

  const peripheralIndex = net.nodes.indexOf(peripheralNode)
  const finalNodes = [
    ...net.nodes.slice(0, peripheralIndex),
    ...generatedNodes,
    ...net.nodes.slice(peripheralIndex + 1)
  ]
  const generatedEdges = generatedNodes.map(node => new Edge({
    id: nextId('edge'),
    source: centerNode,
    target: node,
    data: cloneEdgeData(templateEdge.data, nextId),
    isLogic: templateEdge.isLogic
  }))
  normalizeEdges(generatedEdges, finalNodes)

  const edgeIndex = net.edges.indexOf(templateEdge)
  const finalEdges = [
    ...net.edges.slice(0, edgeIndex),
    ...generatedEdges,
    ...net.edges.slice(edgeIndex + 1)
  ]

  Object.assign(net, { nodes: finalNodes, edges: finalEdges })

  return {
    generatedNodes,
    generatedEdges,
    centerNode,
    removedNode: peripheralNode,
    removedEdge: templateEdge,
    summary: {
      centerNodeId: centerNode.id,
      templateNodeId: peripheralNode.id,
      templateEdgeId: templateEdge.id,
      peripheralCount,
      generatedNodeIds: generatedNodes.map(node => node.id),
      generatedEdgeIds: generatedEdges.map(edge => edge.id)
    }
  }
}

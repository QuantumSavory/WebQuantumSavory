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

export const GRAPH_TOPOLOGIES = Object.freeze({
  GRID: 'grid',
  ALL_TO_ALL: 'all-to-all'
})

const MIN_GRID_COUNT = 1
const MAX_GRID_COUNT = 6
const MIN_COMPLETE_COUNT = 2
const MAX_COMPLETE_COUNT = 12

function resolveSelection(net, options) {
  if (!net || !Array.isArray(net.nodes) || !Array.isArray(net.edges)) {
    return { valid: false, error: 'A network with node and edge arrays is required.' }
  }

  const {
    templateNodeId,
    templateEdgeId,
    topology,
    xCount,
    yCount,
    nodeCount
  } = options || {}

  const templateNode = net.nodes.find(node => node.id === templateNodeId)
  if (!templateNode) return { valid: false, error: 'Select a valid node template.' }

  const templateEdge = net.edges.find(edge => edge.id === templateEdgeId)
  if (!templateEdge) return { valid: false, error: 'Select a valid edge template.' }
  if (!edgeHasNode(templateEdge, templateNodeId)) {
    return { valid: false, error: 'The edge template must be connected to the node template.' }
  }

  const sourceId = endpointId(templateEdge.source)
  const targetId = endpointId(templateEdge.target)
  if (sourceId === targetId) {
    return { valid: false, error: 'The edge template must connect two distinct nodes.' }
  }

  const sourceNode = net.nodes.find(node => node.id === sourceId)
  const targetNode = net.nodes.find(node => node.id === targetId)
  if (!sourceNode || !targetNode) {
    return { valid: false, error: 'Both edge-template endpoints must be valid nodes.' }
  }

  const endpointEdges = net.edges.filter(edge => (
    edgeHasNode(edge, sourceId) || edgeHasNode(edge, targetId)
  ))
  if (endpointEdges.length !== 1 || endpointEdges[0] !== templateEdge) {
    return {
      valid: false,
      error: 'The two edge-template endpoints must be an isolated pair.'
    }
  }

  if (!isMapPosition(sourceNode.position) || !isMapPosition(targetNode.position)) {
    return { valid: false, error: 'Both edge-template endpoints need valid map positions.' }
  }
  let sourceLayoutPosition
  let targetLayoutPosition
  try {
    sourceLayoutPosition = projectMapPosition(sourceNode.position)
    targetLayoutPosition = projectMapPosition(targetNode.position)
  } catch (error) {
    return { valid: false, error: error.message }
  }
  const vector = [
    targetLayoutPosition[0] - sourceLayoutPosition[0],
    targetLayoutPosition[1] - sourceLayoutPosition[1]
  ]
  if (Math.hypot(...vector) === 0) {
    return { valid: false, error: 'The edge-template endpoints must not overlap.' }
  }

  if (topology === GRAPH_TOPOLOGIES.GRID) {
    const invalidGridCount = value => (
      !Number.isInteger(value) || value < MIN_GRID_COUNT || value > MAX_GRID_COUNT
    )
    if (invalidGridCount(xCount) || invalidGridCount(yCount)) {
      return {
        valid: false,
        error: `Grid dimensions must be integers between ${MIN_GRID_COUNT} and ${MAX_GRID_COUNT}.`
      }
    }
    if (xCount * yCount < 2) {
      return { valid: false, error: 'The grid must contain at least two nodes.' }
    }
  } else if (topology === GRAPH_TOPOLOGIES.ALL_TO_ALL) {
    if (!Number.isInteger(nodeCount)
      || nodeCount < MIN_COMPLETE_COUNT
      || nodeCount > MAX_COMPLETE_COUNT) {
      return {
        valid: false,
        error: `Number of nodes must be an integer between ${MIN_COMPLETE_COUNT} and ${MAX_COMPLETE_COUNT}.`
      }
    }
  } else {
    return { valid: false, error: 'Select a valid graph topology.' }
  }

  return {
    valid: true,
    error: null,
    selection: {
      templateNode,
      templateEdge,
      sourceNode,
      targetNode,
      sourceLayoutPosition,
      vector,
      topology,
      xCount,
      yCount,
      nodeCount
    }
  }
}

export function validateGraphNetwork(net, options) {
  const { valid, error } = resolveSelection(net, options)
  return { valid, error }
}

function createGridNodes(selection, nextId) {
  const {
    templateNode,
    sourceNode,
    targetNode,
    sourceLayoutPosition,
    vector,
    xCount,
    yCount
  } = selection
  const xStep = xCount > 1 ? vector : [-vector[1], vector[0]]
  const yStep = xCount > 1 ? [-vector[1], vector[0]] : vector
  const nodes = []

  for (let y = 1; y <= yCount; y += 1) {
    for (let x = 1; x <= xCount; x += 1) {
      const layoutPosition = [
        sourceLayoutPosition[0] + ((x - 1) * xStep[0]) + ((y - 1) * yStep[0]),
        sourceLayoutPosition[1] + ((x - 1) * xStep[1]) + ((y - 1) * yStep[1])
      ]
      let position = unprojectMapPosition(layoutPosition)
      if (x === 1 && y === 1) position = [...sourceNode.position]
      if ((xCount > 1 && x === 2 && y === 1)
        || (xCount === 1 && x === 1 && y === 2)) {
        position = [...targetNode.position]
      }

      assertGeneratedMapPosition(position)

      nodes.push(new Node({
        id: nextId('node'),
        name: `${templateNode.name}-${x}-${y}`,
        position,
        data: cloneNodeData(templateNode.data, nextId)
      }))
    }
  }

  return nodes
}

function createGridEdges(nodes, selection, nextId) {
  const { templateEdge, xCount, yCount } = selection
  const edges = []
  const nodeAt = (x, y) => nodes[((y - 1) * xCount) + (x - 1)]

  for (let y = 1; y <= yCount; y += 1) {
    for (let x = 1; x <= xCount; x += 1) {
      if (x < xCount) {
        edges.push(new Edge({
          id: nextId('edge'),
          source: nodeAt(x, y),
          target: nodeAt(x + 1, y),
          data: cloneEdgeData(templateEdge.data, nextId),
          isLogic: templateEdge.isLogic
        }))
      }
      if (y < yCount) {
        edges.push(new Edge({
          id: nextId('edge'),
          source: nodeAt(x, y),
          target: nodeAt(x, y + 1),
          data: cloneEdgeData(templateEdge.data, nextId),
          isLogic: templateEdge.isLogic
        }))
      }
    }
  }

  return edges
}

function createCompleteNodes(selection, nextId) {
  const {
    templateNode,
    sourceNode,
    targetNode,
    sourceLayoutPosition,
    vector,
    nodeCount
  } = selection
  const chordLength = Math.hypot(...vector)
  const targetLayoutPosition = [
    sourceLayoutPosition[0] + vector[0],
    sourceLayoutPosition[1] + vector[1]
  ]
  const midpoint = [
    (sourceLayoutPosition[0] + targetLayoutPosition[0]) / 2,
    (sourceLayoutPosition[1] + targetLayoutPosition[1]) / 2
  ]
  const centerDistance = chordLength / (2 * Math.tan(Math.PI / nodeCount))
  const leftNormal = [-vector[1] / chordLength, vector[0] / chordLength]
  const center = [
    midpoint[0] + (leftNormal[0] * centerDistance),
    midpoint[1] + (leftNormal[1] * centerDistance)
  ]
  const startVector = [
    sourceLayoutPosition[0] - center[0],
    sourceLayoutPosition[1] - center[1]
  ]

  return Array.from({ length: nodeCount }, (_, index) => {
    const angle = (2 * Math.PI * index) / nodeCount
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const layoutPosition = [
      center[0] + (startVector[0] * cos) - (startVector[1] * sin),
      center[1] + (startVector[0] * sin) + (startVector[1] * cos)
    ]
    let position = unprojectMapPosition(layoutPosition)
    if (index === 0) position = [...sourceNode.position]
    if (index === 1) position = [...targetNode.position]

    assertGeneratedMapPosition(position)

    return new Node({
      id: nextId('node'),
      name: `${templateNode.name}-${index + 1}`,
      position,
      data: cloneNodeData(templateNode.data, nextId)
    })
  })
}

function createCompleteEdges(nodes, templateEdge, nextId) {
  const edges = []
  for (let sourceIndex = 0; sourceIndex < nodes.length; sourceIndex += 1) {
    for (let targetIndex = sourceIndex + 1; targetIndex < nodes.length; targetIndex += 1) {
      edges.push(new Edge({
        id: nextId('edge'),
        source: nodes[sourceIndex],
        target: nodes[targetIndex],
        data: cloneEdgeData(templateEdge.data, nextId),
        isLogic: templateEdge.isLogic
      }))
    }
  }
  return edges
}

/**
 * Replace an isolated edge and both endpoints with a deterministic grid or complete graph.
 * The selected node supplies every generated node's configuration; the edge source/target
 * locations become generated nodes 1 and 2 (or grid coordinates 1,1 and 2,1 / 1,2).
 */
export function generateGraphNetwork(net, options) {
  const validation = resolveSelection(net, options)
  if (!validation.valid) throw new Error(validation.error)

  const selection = validation.selection
  const nextId = createIdGenerator(net)
  const generatedNodes = selection.topology === GRAPH_TOPOLOGIES.GRID
    ? createGridNodes(selection, nextId)
    : createCompleteNodes(selection, nextId)
  const generatedEdges = selection.topology === GRAPH_TOPOLOGIES.GRID
    ? createGridEdges(generatedNodes, selection, nextId)
    : createCompleteEdges(generatedNodes, selection.templateEdge, nextId)

  const removedNodes = [selection.sourceNode, selection.targetNode]
  const removedSet = new Set(removedNodes)
  const insertionIndex = Math.min(
    net.nodes.indexOf(selection.sourceNode),
    net.nodes.indexOf(selection.targetNode)
  )
  const retainedNodes = net.nodes.filter(node => !removedSet.has(node))
  const finalNodes = [
    ...retainedNodes.slice(0, insertionIndex),
    ...generatedNodes,
    ...retainedNodes.slice(insertionIndex)
  ]
  normalizeEdges(generatedEdges, finalNodes)

  const edgeIndex = net.edges.indexOf(selection.templateEdge)
  const finalEdges = [
    ...net.edges.slice(0, edgeIndex),
    ...generatedEdges,
    ...net.edges.slice(edgeIndex + 1)
  ]

  Object.assign(net, { nodes: finalNodes, edges: finalEdges })

  return {
    topology: selection.topology,
    generatedNodes,
    generatedEdges,
    removedNodes,
    removedEdge: selection.templateEdge,
    summary: {
      topology: selection.topology,
      templateNodeId: selection.templateNode.id,
      templateEdgeId: selection.templateEdge.id,
      xCount: selection.topology === GRAPH_TOPOLOGIES.GRID ? selection.xCount : null,
      yCount: selection.topology === GRAPH_TOPOLOGIES.GRID ? selection.yCount : null,
      nodeCount: generatedNodes.length,
      generatedNodeIds: generatedNodes.map(node => node.id),
      generatedEdgeIds: generatedEdges.map(edge => edge.id)
    }
  }
}

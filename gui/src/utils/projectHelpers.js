import Node from '../models/Node'
import Edge from '../models/Edge'
import { setEdgeCorrectNodeOrder } from './Utils'

/**
 * Project helper functions
 */

// US bounds roughly (longitude, latitude)
const US_BOUNDS = {
  west: -125.0,
  east: -65.0,
  south: 25.0,
  north: 49.0
}

export function generateRandomNodes(count) {
  const nodes = []
  for (let i = 0; i < count; i++) {
    const longitude = US_BOUNDS.west + (Math.random() * (US_BOUNDS.east - US_BOUNDS.west))
    const latitude = US_BOUNDS.south + (Math.random() * (US_BOUNDS.north - US_BOUNDS.south))
    const newNode = new Node({
      id: `node_${i + 1}`,
      name: `Node ${i + 1}`,
      position: [longitude, latitude],
      data: { type: 'city', slots: [] }
    })
    const numSlots = Math.floor(Math.random() * 15) + 1
    for (let j = 0; j < numSlots; j++) {
      newNode.createNewSlot()
    }
    nodes.push(newNode)
  }
  return nodes
}

export function generateRandomEdges(nodes, count) {
  const edges = []
  const maxAttempts = count * 2

  for (let i = 0, attempts = 0; i < count && attempts < maxAttempts; attempts++) {
    const sourceIndex = Math.floor(Math.random() * nodes.length)
    const targetIndex = Math.floor(Math.random() * nodes.length)
    
    if (sourceIndex === targetIndex || 
        edges.some(e => 
          (e.source === nodes[sourceIndex] && e.target === nodes[targetIndex]) ||
          (e.source === nodes[targetIndex] && e.target === nodes[sourceIndex])
        )) {
      continue
    }
    edges.push(
      new Edge({
        id: `edge_${i + 1}`,
        source: nodes[sourceIndex],
        target: nodes[targetIndex],
        data: { type: 'connection' }
      })
    )
    i++
  }
  return edges
}

export function validatePayload(data) {
  // Ensure at least 2 nodes and 1 edge are present
  if (data.net.nodes.length < 2) {
    return { success: false, error: 'At least 2 nodes are required' }
  }
  if (data.net.edges.length < 1) {
    return { success: false, error: 'At least 1 edge is required' }
  }
  
  // Ensure all nodes have at least one slot
  const nodesWithoutSlots = []
  data.net.nodes.forEach(node => {
    if (node.data.slots.length < 1) {
      const nodeRef = data.net.nodes.find(n => n.id === node.id)
      nodesWithoutSlots.push(nodeRef)
    }
  })
  
  if (nodesWithoutSlots.length > 0) {
    let message = 'All nodes must have at least one slot. \nPlease add a slot to the following nodes: '
    nodesWithoutSlots.forEach(node => {
      message += `\n- ${node.name}`
    })
    return { success: false, error: message }
  }
  
  return { success: true, error: null }
}

export function getNodeById(projectData, id) {
  return projectData.value.net.nodes.find(node => node.id === id)
}

export function getNodeBySlotId(projectData, slotId) {
  return projectData.value.net.nodes.find(node => 
    node.data.slots.find(slot => slot.id === slotId)
  )
}


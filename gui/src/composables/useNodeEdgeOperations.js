import { ref } from 'vue'
import Node from '../models/Node'
import { generateUUid, setEdgeCorrectNodeOrder } from '../utils/Utils'
import { SIMULATION_EDITING_LOCK_MESSAGE } from './uiServices'

/**
 * useNodeEdgeOperations - Composable for node and edge operations
 */
export function useNodeEdgeOperations(projectData, hasSimulationRun, addLog, {
  hideSlotState = () => {},
  showAlert = (_title, message) => window.alert(message)
} = {}) {
  const mapCenter = ref([-98.5795, 39.8283])
  const mapZoom = ref(4)
  
  const selectedItem = ref(null)
  const selectedType = ref(null)
  const justCreatedNode = ref(false)

  function handleSelectLocal(item, type) {
    selectedItem.value = item
    selectedType.value = type
    if (!item && !type) {
      hideSlotState()
    }
    if (type === 'node' && item) {
      item.expanded = true
    }
  }

  function addNewNode(name, type, position){
    if (hasSimulationRun.value) {
      showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
      return
    }

    const nodeId = generateUUid('node')
    const nodeName = `Node ${projectData.value.net.nodes.length + 1}`

    const newNode = new Node({
      id: nodeId,
      name: nodeName,
      position,
      data: { type }
    })
    projectData.value.net.nodes.push(newNode)
    
    addLog('info', `Created new node: ${nodeName}`, 'Map')
    
    setTimeout(() => {
      handleSelectLocal(newNode, 'node')
    }, 100)
    justCreatedNode.value = true
  }

  function handleMapClick( event ) {
    let coords = [event.lngLat.lng, event.lngLat.lat]
    if( event.originalEvent.altKey ){
      addNewNode( null, "City", coords)
    }
  }

  function deleteSelected(item, type) {
    console.log( 'deleteSelected', item )
    if (!item) return

    if (hasSimulationRun.value) {
      showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
      return
    }

    if (type === 'node') {
      const nodeName = item.name
      const connectedEdges = projectData.value.net.edges.filter(edge => 
        edge.source === item || edge.target === item
      )
      projectData.value.net.edges = projectData.value.net.edges.filter(edge => 
        edge.source !== item && edge.target !== item
      )
      projectData.value.net.nodes = projectData.value.net.nodes.filter(node => node !== item)
      
      addLog('warning', `Deleted node: ${nodeName} (${connectedEdges.length} edges removed)`, 'Map')
    } else if (type === 'edge') {
      const edgeName = `${item.source.name} to ${item.target.name}`
      projectData.value.net.edges = projectData.value.net.edges.filter(edge => edge !== item)
      addLog('warning', `Deleted edge: ${edgeName}`, 'Map')
    }

    // Clear the current selection so the UI reflects that nothing is selected anymore
    handleSelectLocal(null, null)
  }

  function handleEdgeCreated(edge) {
    if (hasSimulationRun.value) {
      showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
      return
    }

    projectData.value.net.edges.push(edge)
    addLog('info', `Created new edge: ${edge.source.name} to ${edge.target.name}`, 'Map')
  }

  function moveNode(fromIndex, toIndex) {
    if (hasSimulationRun.value) return false

    const nodes = projectData.value.net.nodes
    if (
      !Number.isInteger(fromIndex)
      || !Number.isInteger(toIndex)
      || fromIndex < 0
      || toIndex < 0
      || fromIndex >= nodes.length
      || toIndex >= nodes.length
      || fromIndex === toIndex
    ) {
      return false
    }

    const [node] = nodes.splice(fromIndex, 1)
    nodes.splice(toIndex, 0, node)

    // Edge protocol nodeA/nodeB follows list order. Re-normalizing only swaps
    // endpoint references; the edge and both durable Node objects stay intact.
    projectData.value.net.edges.forEach(edge => setEdgeCorrectNodeOrder(edge, nodes))
    addLog('info', `Changed ${node.name} to node ID ${toIndex + 1}`, 'Map')
    return true
  }

  function handleMapStateChange(mapState) {
    mapCenter.value = [...mapState.center]
    mapZoom.value = mapState.zoom
  }

  return {
    // State
    mapCenter,
    mapZoom,
    selectedItem,
    selectedType,
    justCreatedNode,
    
    // Methods
    addNewNode,
    handleMapClick,
    deleteSelected,
    handleEdgeCreated,
    moveNode,
    handleMapStateChange,
    handleSelect: handleSelectLocal
  }
}

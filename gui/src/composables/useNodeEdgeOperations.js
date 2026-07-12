import { ref } from 'vue'
import Node from '../models/Node'
import { generateUUid, setEdgeCorrectNodeOrder } from '../utils/Utils'

/**
 * useNodeEdgeOperations - Composable for node and edge operations
 */
export function useNodeEdgeOperations(projectData, hasSimulationRun, addLog) {
  const mapCenter = ref([-98.5795, 39.8283])
  const mapZoom = ref(4)
  
  const selectedItem = ref(null)
  const selectedType = ref(null)
  const justCreatedNode = ref(false)
  const isCreatingNode = ref(false)
  const newNodeName = ref('')
  const newNodeType = ref('city')
  const waitingForPosition = ref(false)

  function handleSelectLocal(item, type) {
    selectedItem.value = item
    selectedType.value = type
    if (!item && !type) {
      window.hideSlotState()
    }
    if (type === 'node' && item) {
      item.expanded = true
    }
  }

  function addNewNode(name, type, position){
    if (hasSimulationRun.value) {
      alert('Cannot add nodes after simulation has started.\n\nPlease click the Reset button (or Stop button) to clear the simulation state and enable editing again.')
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
      return
    }

    if (!waitingForPosition.value) return

    addNewNode(null, newNodeType.value, coords)  

    isCreatingNode.value = false
    waitingForPosition.value = false
    newNodeName.value = ''
    newNodeType.value = 'city'
  }

  function createNewSlotClicked(selectedItem){
    if (hasSimulationRun.value) {
      alert('Cannot add slots after simulation has started.\n\nPlease click the Reset button (or Stop button) to clear the simulation state and enable editing again.')
      return
    }

    if( selectedItem ){
      selectedItem.createNewSlot()
    }
  }

  function deleteSelected(item, type) {
    console.log( 'deleteSelected', item )
    if (!item) return

    if (hasSimulationRun.value) {
      alert('Cannot delete network items after simulation has started.\n\nPlease click the Reset button (or Stop button) to clear the simulation state and enable editing again.')
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
      alert('Cannot add edges after simulation has started.\n\nPlease click the Reset button (or Stop button) to clear the simulation state and enable editing again.')
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

  function startCreateNode() {
    isCreatingNode.value = true
  }

  function cancelCreateNode() {
    isCreatingNode.value = false
    waitingForPosition.value = false
    newNodeName.value = ''
    newNodeType.value = 'city'
  }

  function proceedToPosition() {
    if (!newNodeName.value) return
    waitingForPosition.value = true
  }

  function addNodeClickHandler() {
    addNewNode(null, 'city', mapCenter.value)
  }

  return {
    // State
    mapCenter,
    mapZoom,
    selectedItem,
    selectedType,
    justCreatedNode,
    isCreatingNode,
    newNodeName,
    newNodeType,
    waitingForPosition,
    
    // Methods
    addNewNode,
    handleMapClick,
    createNewSlotClicked,
    deleteSelected,
    handleEdgeCreated,
    moveNode,
    handleMapStateChange,
    startCreateNode,
    cancelCreateNode,
    proceedToPosition,
    addNodeClickHandler,
    handleSelect: handleSelectLocal
  }
}

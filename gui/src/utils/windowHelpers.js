/**
 * Window helper functions for global utilities
 */

export function showEntangledSlots(slotId, baseMapInstance, simulationStatus, projectData) {
  console.log('🔗 showEntangledSlots: Called for slot:', slotId)
  console.log('🔗 showEntangledSlots: simulationStatus.value:', simulationStatus.value)
  console.log('🔗 showEntangledSlots: simulationStatus.value.state:', simulationStatus.value?.state)
  const allEntanglements = simulationStatus.value?.state?.slots?.entanglements
  console.log('🔗 showEntangledSlots: All entanglements:', allEntanglements)
  
  if (!allEntanglements) {
    console.warn('⚠️ showEntangledSlots: No entanglements found')
    return
  }

  const relatedSlotIds = []
  allEntanglements.forEach(entanglement => {
    let slotIdToAdd = null
    if (entanglement[0] === slotId) {
      slotIdToAdd = entanglement[1]
    } else if (entanglement[1] === slotId) {
      slotIdToAdd = entanglement[0]
    }
    if (slotIdToAdd && !relatedSlotIds.includes(slotIdToAdd)) {
      relatedSlotIds.push(slotIdToAdd)
    }
  })

  const entangledSlots = []
  projectData.value.net.nodes.forEach(node => {
    node.data.slots.forEach(slot => {
      if (relatedSlotIds.includes(slot.id)) {
        entangledSlots.push({ nodeId: node.id, slotId: slot.id })
      }
    })
  })

  const baseMapComponent = baseMapInstance.value
  const entangledState = {
    id: "state_1",
    slots: entangledSlots
  }

  try {
    const result = baseMapComponent.showSlotConnectionState(entangledState)
  } catch (error) {
    console.error('Error calling showSlotConnectionState:', error)
  }
}


export function hideSlotState(baseMapInstance) {
  try {
    baseMapInstance.value.hideSlotConnectionState()
  } catch (error) {
    console.log('Error calling hideSlotConnectionState:', error)
  }
}


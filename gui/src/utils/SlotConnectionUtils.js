/**
 * Utility functions for managing SlotConnectionState visualizations
 */

/**
 * Find all slot elements referenced in a SlotConnectionState
 * @param {Object} slotConnectionState - The state object with slots array
 * @returns {Array} Array of objects with slot info and DOM elements
 */
export function findSlotElements(slotConnectionState) {
  const foundSlots = []
  
  for (const slotRef of slotConnectionState.slots) {
    const { nodeId, slotId } = slotRef
    
    // Find the node marker element
    const nodeMarkerEl = document.querySelector(`[data-node-id="${nodeId}"]`)
    if (!nodeMarkerEl) {
      console.warn(`Node marker not found for nodeId: ${nodeId}`)
      continue
    }
    
    // Find the slot icon element within the node marker
    const slotIconEl = nodeMarkerEl.querySelector(`[data-slot-id="${slotId}"]`)
    if (!slotIconEl) {
      console.warn(`Slot icon not found for slotId: ${slotId} in nodeId: ${nodeId}`)
      continue
    }
    
    foundSlots.push({
      nodeId,
      slotId,
      nodeElement: nodeMarkerEl,
      slotElement: slotIconEl,
      slotRef
    })
  }
  
  return foundSlots
}

/**
 * Calculate the center position for the state node based on connected slots
 * @param {Array} slotElements - Array of slot element objects from findSlotElements
 * @param {Object} map - MapLibre GL map instance
 * @returns {Array} [longitude, latitude] coordinates for state node position
 */
export function calculateStateNodePosition(slotElements, map) {
  if (!slotElements.length || !map) {
    return [0, 0] // Default fallback position
  }
  
  let totalLng = 0
  let totalLat = 0
  let validPositions = 0
  
  for (const slotEl of slotElements) {
    try {
      // Get the bounding rect of the slot element
      const rect = slotEl.slotElement.getBoundingClientRect()
      const mapContainer = map.getContainer()
      const mapRect = mapContainer.getBoundingClientRect()
      
      // Convert screen coordinates to map coordinates
      const point = {
        x: rect.left + rect.width / 2 - mapRect.left,
        y: rect.top + rect.height / 2 - mapRect.top
      }
      
      const lngLat = map.unproject([point.x, point.y])
      totalLng += lngLat.lng
      totalLat += lngLat.lat
      validPositions++
    } catch (error) {
      console.warn('Error calculating position for slot:', slotEl.slotId, error)
    }
  }
  
  if (validPositions === 0) {
    return [0, 0]
  }
  
  // Calculate center point
  const centerLng = totalLng / validPositions
  const centerLat = totalLat / validPositions
  
  // Offset the state node slightly to avoid overlapping with slots
  const offsetLat = centerLat + 0.001 // Small offset to the north
  
  return [centerLng, offsetLat]
}

/**
 * Get the map coordinates of a slot element
 * @param {HTMLElement} slotElement - The slot DOM element
 * @param {Object} map - MapLibre GL map instance
 * @returns {Array} [longitude, latitude] coordinates of the slot
 */
export function getSlotMapPosition(slotElement, map) {
  if (!slotElement || !map) {
    return null
  }
  
  try {
    const rect = slotElement.getBoundingClientRect()
    const mapContainer = map.getContainer()
    const mapRect = mapContainer.getBoundingClientRect()
    
    // Convert screen coordinates to map coordinates
    const point = {
      x: rect.left + rect.width / 2 - mapRect.left,
      y: rect.top + rect.height / 2 - mapRect.top
    }
    
    const lngLat = map.unproject([point.x, point.y])
    return [lngLat.lng, lngLat.lat]
  } catch (error) {
    console.error('Error getting slot map position:', error)
    return null
  }
}

/**
 * Generate a unique ID for state connections
 * @param {string} stateId - The state ID
 * @param {string} slotId - The slot ID
 * @returns {string} Unique connection ID
 */
export function generateConnectionId(stateId, slotId) {
  return `${stateId}-${slotId}-${Date.now()}`
}
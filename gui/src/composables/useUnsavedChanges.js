import { ref } from 'vue'

/**
 * useUnsavedChanges - Composable for tracking unsaved changes
 * Compares current project state against a saved snapshot
 */
export function useUnsavedChanges(serializeProjectData) {
  // Store the saved state as a JSON string snapshot
  const savedStateSnapshot = ref(null)

  /**
   * Check if there are unsaved changes by comparing current state to snapshot
   * @returns {boolean} true if current state differs from saved snapshot
   */
  function hasUnsavedChanges() {
    if (savedStateSnapshot.value === null) {
      // No snapshot exists, so there are no saved changes to lose
      return false
    }

    try {
      const currentState = JSON.stringify(serializeProjectData())
      return currentState !== savedStateSnapshot.value
    } catch (error) {
      console.error('Error checking unsaved changes:', error)
      // If comparison fails, assume there are changes to be safe
      return true
    }
  }

  /**
   * Mark the current state as saved by updating the snapshot
   * Call this after successful save/load operations
   */
  function markAsSaved() {
    try {
      savedStateSnapshot.value = JSON.stringify(serializeProjectData())
    } catch (error) {
      console.error('Error marking as saved:', error)
      // Set to null on error so we don't have invalid state
      savedStateSnapshot.value = null
    }
  }

  /**
   * Reset the saved snapshot (useful for new projects without saves)
   * This effectively clears the unsaved changes tracking
   */
  function markAsUnsaved() {
    savedStateSnapshot.value = null
  }

  /**
   * Clear the snapshot (when project is reset/deleted)
   */
  function clearSnapshot() {
    savedStateSnapshot.value = null
  }

  return {
    savedStateSnapshot,
    hasUnsavedChanges,
    markAsSaved,
    markAsUnsaved,
    clearSnapshot
  }
}


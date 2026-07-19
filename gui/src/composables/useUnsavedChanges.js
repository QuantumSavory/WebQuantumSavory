import { ref } from 'vue'

/**
 * useUnsavedChanges - Composable for tracking unsaved changes
 * Compares current project state against a saved snapshot
 */
export function useUnsavedChanges(serializeProjectData) {
  // Store the saved state as a JSON string snapshot
  const savedStateSnapshot = ref(null)
  const explicitlyDirty = ref(false)

  /**
   * Check if there are unsaved changes by comparing current state to snapshot
   * @returns {boolean} true if current state differs from saved snapshot
   */
  function hasUnsavedChanges() {
    if (explicitlyDirty.value) return true
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
      explicitlyDirty.value = false
    } catch (error) {
      console.error('Error marking as saved:', error)
      // Set to null on error so we don't have invalid state
      savedStateSnapshot.value = null
      explicitlyDirty.value = true
    }
  }

  /**
   * Explicitly mark the current project dirty, including projects that have
   * never had a saved snapshot.
   */
  function markAsUnsaved() {
    explicitlyDirty.value = savedStateSnapshot.value === null
  }

  /**
   * Clear the snapshot (when project is reset/deleted)
   */
  function clearSnapshot() {
    savedStateSnapshot.value = null
    explicitlyDirty.value = false
  }

  return {
    savedStateSnapshot,
    explicitlyDirty,
    hasUnsavedChanges,
    markAsSaved,
    markAsUnsaved,
    clearSnapshot
  }
}

export const EDITOR_DRAFT_REGISTRY_KEY = Symbol('editor-draft-registry')

function normalizeResult(result, editorId) {
  if (result?.busy) {
    return {
      busy: true,
      details: {
        editor: editorId,
        ...(result.details || {}),
      },
    }
  }
  if (result?.valid === false) {
    return {
      valid: false,
      details: {
        editor: editorId,
        ...(result.details || {}),
      },
    }
  }
  return { valid: true }
}

/**
 * Registry for component-owned drafts that cannot be flushed reliably by
 * blurring the active DOM element. Editors keep their own validation and
 * commit behavior; this registry only serializes those flush requests.
 */
export function createEditorDraftRegistry() {
  const editors = new Map()

  function register({ id, flush }) {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('A draft editor ID is required.')
    }
    if (typeof flush !== 'function') {
      throw new Error(`Draft editor ${id} requires a flush function.`)
    }

    const token = Symbol(id)
    editors.set(token, { id, flush })
    return () => editors.delete(token)
  }

  async function flushAll() {
    for (const editor of [...editors.values()]) {
      let result
      try {
        result = await editor.flush()
      } catch (error) {
        result = {
          valid: false,
          details: {
            message: error?.message || 'The editor draft could not be committed.',
          },
        }
      }
      const normalized = normalizeResult(result, editor.id)
      if (normalized.busy || normalized.valid === false) return normalized
    }
    return { valid: true }
  }

  return {
    register,
    flushAll,
  }
}

import { onScopeDispose, ref, unref, watch } from 'vue'
import { api as sharedApi } from '../utils/ApiConnector.js'
import { normalizeTagCatalog, normalizeTagEntries } from '../utils/tagExplorer.js'

function resolved(value) {
  return typeof value === 'function' ? value() : unref(value)
}

export function useTagExplorer({
  projectName,
  active,
  enabled,
  api = sharedApi
}) {
  const catalog = ref(normalizeTagCatalog({}))
  const catalogLoaded = ref(false)
  const catalogLoading = ref(false)
  const tags = ref([])
  const queryResults = ref([])
  const busy = ref(false)
  const error = ref('')
  let generation = 0
  let catalogController = null
  let operationController = null

  function currentProjectName() {
    return String(resolved(projectName) || '')
  }

  function clearTransient() {
    generation += 1
    operationController?.abort()
    operationController = null
    tags.value = []
    queryResults.value = []
    busy.value = false
    error.value = ''
  }

  async function ensureCatalog({ force = false } = {}) {
    if (!resolved(enabled) || (!force && catalogLoaded.value)) return catalog.value
    catalogController?.abort()
    const controller = new AbortController()
    catalogController = controller
    catalogLoading.value = true
    error.value = ''
    try {
      const response = await api.fetchTagTypes({ signal: controller.signal, force })
      if (controller.signal.aborted) return catalog.value
      catalog.value = normalizeTagCatalog(response)
      catalogLoaded.value = true
      return catalog.value
    } catch (caught) {
      if (caught?.name !== 'AbortError') error.value = caught?.message || 'Unable to load tag types'
      return catalog.value
    } finally {
      if (catalogController === controller) {
        catalogController = null
        catalogLoading.value = false
      }
    }
  }

  async function runOperation(operation) {
    if (!resolved(enabled)) return null
    const name = currentProjectName()
    if (!name) return null
    const requestGeneration = ++generation
    operationController?.abort()
    const controller = new AbortController()
    operationController = controller
    busy.value = true
    error.value = ''
    try {
      const response = await operation(name, controller.signal)
      if (controller.signal.aborted || requestGeneration !== generation) return null
      return response
    } catch (caught) {
      if (caught?.name !== 'AbortError' && requestGeneration === generation) {
        error.value = caught?.message || 'Tag request failed'
      }
      return null
    } finally {
      if (operationController === controller) operationController = null
      if (requestGeneration === generation) busy.value = false
    }
  }

  async function list(target) {
    // Do not leave a previous target's entries visible (and deletable) while a
    // replacement request is pending or after that request fails.
    tags.value = []
    const response = await runOperation((name, signal) => (
      api.listTags(name, target, { signal })
    ))
    if (response) tags.value = normalizeTagEntries(response)
    return response
  }

  async function attach(target, tag) {
    const response = await runOperation((name, signal) => (
      api.attachTag(name, target, tag, { signal })
    ))
    if (response) await list(target)
    return response
  }

  async function remove(target, tagId) {
    const response = await runOperation((name, signal) => (
      api.deleteTag(name, target, tagId, { signal })
    ))
    if (response) await list(target)
    return response
  }

  async function query(target, querySpec) {
    queryResults.value = []
    const response = await runOperation((name, signal) => (
      api.queryTags(name, target, querySpec, { signal })
    ))
    if (response) queryResults.value = normalizeTagEntries(response)
    return response
  }

  watch(
    () => [Boolean(resolved(active)), Boolean(resolved(enabled))],
    ([isActive, isEnabled]) => {
      if (!isEnabled) {
        clearTransient()
        return
      }
      if (isActive) ensureCatalog()
    },
    { immediate: true }
  )

  watch(
    currentProjectName,
    (name, previousName) => {
      if (name !== previousName) clearTransient()
    }
  )

  onScopeDispose(() => {
    generation += 1
    catalogController?.abort()
    operationController?.abort()
  })

  return {
    catalog,
    catalogLoaded,
    catalogLoading,
    tags,
    queryResults,
    busy,
    error,
    ensureCatalog,
    list,
    attach,
    remove,
    query,
    clearTransient
  }
}

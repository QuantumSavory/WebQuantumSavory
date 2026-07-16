<template>
  <div
    class="named-tag-type-autocomplete"
    :aria-busy="loading"
  >
    <AutoComplete
      v-model="selection"
      :suggestions="suggestions"
      option-label="label"
      data-key="key"
      force-selection
      complete-on-focus
      dropdown
      dropdown-mode="blank"
      fluid
      :min-length="0"
      :delay="0"
      :loading="loading"
      :disabled="disabled"
      :invalid="unavailable"
      :input-id="inputId"
      :aria-label="`${parameterName} named tag type`"
      :pt="autoCompletePassThrough"
      overlay-class="named-tag-type-overlay"
      @complete="filterOptions"
      @option-select="selectOption"
      @clear="clearSelection"
    >
      <template #option="{ option }">
        <span
          class="named-tag-type-option"
          :class="`named-tag-type-option-${option.kind}`"
        >
          <span>{{ option.name }}</span>
          <small v-if="option.kind === 'named' && option.duplicate">
            {{ option.qualification }}
          </small>
        </span>
      </template>
      <template #empty>
        No matching named tag type
      </template>
      <template #dropdownicon="{ class: iconClass }">
        <ChevronDown :class="iconClass" :size="14" aria-hidden="true" />
      </template>
      <template #loadingicon="{ class: iconClass }">
        <LoaderCircle
          :class="[iconClass, 'named-tag-type-spinner']"
          :size="14"
          aria-hidden="true"
        />
      </template>
    </AutoComplete>

    <span v-if="loading" class="named-tag-type-status" role="status">
      Loading named tag types
    </span>

    <p v-else-if="loadError" :id="errorId" class="named-tag-type-error" role="alert">
      <span>{{ loadError }}</span>
      <button
        type="button"
        class="named-tag-type-retry noborder"
        :disabled="disabled"
        aria-label="Retry loading named tag types"
        @click="loadCatalog({ force: true })"
      >
        <RefreshCw :size="13" aria-hidden="true" />
        Retry
      </button>
    </p>

    <p
      v-else-if="unavailable"
      :id="unavailableId"
      class="named-tag-type-error"
      role="alert"
    >
      The saved named tag type is unavailable. Choose a catalog entry or Default.
    </p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronDown, LoaderCircle, RefreshCw } from '@lucide/vue'
import AutoComplete from 'primevue/autocomplete'
import { useDomId } from '../../composables/useDomId'
import { api } from '../../utils/ApiConnector.js'
import { namedTagTypeOptions } from '../../utils/tagExplorer.js'

const props = defineProps({
  modelValue: {
    default: null
  },
  nullable: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  parameterName: {
    type: String,
    default: 'Parameter'
  },
  ariaDescribedby: {
    type: String,
    default: undefined
  }
})

const emit = defineEmits(['update:modelValue'])
const instanceId = useDomId('named-tag-type')
const inputId = `${instanceId}-named-tag-type`
const errorId = `${instanceId}-named-tag-type-error`
const unavailableId = `${instanceId}-named-tag-type-unavailable`
const DEFAULT_OPTION = Object.freeze({
  key: 'special:default',
  kind: 'default',
  value: null,
  name: 'Default',
  label: 'Default',
  searchText: 'default protocol constructor default'
})
const NOTHING_OPTION = Object.freeze({
  key: 'special:nothing',
  kind: 'nothing',
  value: 'nothing',
  name: 'Nothing',
  label: 'Nothing',
  searchText: 'nothing no tag'
})

const namedOptions = ref([])
const suggestions = ref([])
const selection = ref(DEFAULT_OPTION)
const loading = ref(false)
const loadError = ref('')
const lastQuery = ref('')
let catalogController = null

const allOptions = computed(() => [
  DEFAULT_OPTION,
  ...(props.nullable ? [NOTHING_OPTION] : []),
  ...namedOptions.value
])
const normalizedValue = computed(() => {
  if (props.modelValue == null || props.modelValue === '') return null
  return String(props.modelValue)
})
const selectedNamedOption = computed(() => namedOptions.value.find(option => (
  option.value === normalizedValue.value
)) || null)
const unavailable = computed(() => (
  !loading.value
  && !loadError.value
  && normalizedValue.value !== null
  && !(props.nullable && normalizedValue.value === 'nothing')
  && !selectedNamedOption.value
))
const describedBy = computed(() => [
  props.ariaDescribedby,
  loadError.value ? errorId : '',
  unavailable.value ? unavailableId : ''
].filter(Boolean).join(' ') || undefined)
const autoCompletePassThrough = computed(() => ({
  pcInputText: {
    root: {
      'aria-describedby': describedBy.value
    }
  }
}))

watch(
  () => [props.modelValue, props.nullable, namedOptions.value],
  syncSelection,
  { immediate: true }
)

function unavailableOption(value) {
  return {
    key: `unavailable:${value}`,
    kind: 'unavailable',
    value,
    name: value,
    label: value,
    searchText: String(value).toLowerCase()
  }
}

function syncSelection() {
  const value = normalizedValue.value
  if (value === null) {
    selection.value = DEFAULT_OPTION
  } else if (props.nullable && value === 'nothing') {
    selection.value = NOTHING_OPTION
  } else {
    selection.value = selectedNamedOption.value || unavailableOption(value)
  }
}

function filterOptions(event = {}) {
  const query = String(event.query || '').trim().toLowerCase()
  lastQuery.value = query
  suggestions.value = query
    ? allOptions.value.filter(option => option.searchText.includes(query))
    : [...allOptions.value]
}

function selectOption(event) {
  if (props.disabled) return
  const option = event?.value
  if (!option || !allOptions.value.some(candidate => candidate.key === option.key)) return
  emit('update:modelValue', option.value)
}

function clearSelection() {
  if (props.disabled) return
  emit('update:modelValue', null)
}

async function loadCatalog({ force = false } = {}) {
  catalogController?.abort()
  const controller = new AbortController()
  catalogController = controller
  loading.value = true
  loadError.value = ''

  try {
    const response = await api.fetchTagTypes({ signal: controller.signal, force })
    if (controller.signal.aborted) return
    namedOptions.value = namedTagTypeOptions(response)
    filterOptions({ query: lastQuery.value })
  } catch (error) {
    if (error?.name === 'AbortError' || controller.signal.aborted) return
    namedOptions.value = []
    filterOptions({ query: lastQuery.value })
    loadError.value = error?.message || 'Unable to load named tag types'
  } finally {
    if (catalogController === controller) {
      catalogController = null
      loading.value = false
    }
  }
}

onMounted(() => loadCatalog())

onBeforeUnmount(() => {
  catalogController?.abort()
})
</script>

<style scoped>
.named-tag-type-autocomplete {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: var(--app-space-1);
  text-align: left;
}

.named-tag-type-autocomplete :deep(.p-autocomplete),
.named-tag-type-autocomplete :deep(.p-autocomplete-input) {
  width: 100%;
  min-width: 0;
}

.named-tag-type-status {
  color: var(--app-color-text-muted);
  font-size: 0.72rem;
}

.named-tag-type-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-2);
  margin: 0;
  color: var(--app-color-danger);
  font-size: 0.72rem;
  line-height: 1.3;
}

.named-tag-type-retry {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--app-space-1);
  height: var(--app-control-height);
  padding: 0 var(--app-space-2);
  color: var(--app-color-primary);
}

.named-tag-type-spinner {
  animation: named-tag-type-spin 0.8s linear infinite;
}

.named-tag-type-option {
  display: flex;
  min-width: 0;
  flex-direction: column;
  line-height: 1.25;
}

.named-tag-type-option small {
  color: var(--app-color-text-muted);
  font-size: 0.72rem;
}

@keyframes named-tag-type-spin {
  to { transform: rotate(360deg); }
}
</style>

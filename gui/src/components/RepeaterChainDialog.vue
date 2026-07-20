<template>
  <LayoutGeneratorDialog
    :show="show"
    title="Repeater Chain Generator"
    form-id="repeater-chain-form"
    description="Replace one template repeater and its edge with an evenly spaced chain. Protocol automation is optional."
    :valid="validation.valid"
    :validation-message="validationMessage"
    submit-label="Generate Chain"
    width="min(920px, calc(100vw - 32px))"
    @submit="handleConfirm"
    @cancel="handleCancel"
  >
    <section class="generator-section" aria-labelledby="chain-template-heading">
      <h3 id="chain-template-heading">Chain template</h3>
      <div class="form-grid">
        <label for="chain-start-node">Start node</label>
        <select id="chain-start-node" v-model="form.startNodeId" autofocus>
          <option value="" disabled>Select a node</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>

        <label for="chain-end-node">End node</label>
        <select id="chain-end-node" v-model="form.endNodeId">
          <option value="" disabled>Select a node</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>

        <label for="chain-template-node">Repeater node</label>
        <select id="chain-template-node" v-model="form.templateNodeId">
          <option value="" disabled>Select a template node</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>

        <label for="chain-template-edge">Repeater edge</label>
        <select
          id="chain-template-edge"
          v-model="form.templateEdgeId"
          :disabled="!form.templateNodeId || incidentEdges.length === 0"
        >
          <option value="" disabled>
            {{ form.templateNodeId ? 'Select a template edge' : 'Select a repeater node first' }}
          </option>
          <option v-for="edge in incidentEdges" :key="edge.id" :value="edge.id">
            {{ edgeLabel(edge) }}
          </option>
        </select>

        <label for="chain-repeater-count">Number of repeaters</label>
        <input
          id="chain-repeater-count"
          v-model.number="form.repeaterCount"
          type="number"
          min="1"
          max="100"
          step="1"
        >
      </div>

      <p class="section-description">
        The repeater node must have exactly one incident edge: the selected template edge.
      </p>

      <div class="option-card compact-option">
        <div class="option-control-line">
          <label class="checkbox-field" for="chain-create-virtual-edge">
            <input
              id="chain-create-virtual-edge"
              v-model="form.createVirtualEdge"
              type="checkbox"
              aria-describedby="chain-create-virtual-edge-description"
            >
            <span>End-to-end virtual edge</span>
          </label>
          <OptionHelpTooltip
            label="About the end-to-end virtual edge"
            :text="virtualEdgeDescription"
          />
        </div>
        <p id="chain-create-virtual-edge-description" class="option-description">
          {{ virtualEdgeDescription }}
        </p>
      </div>
    </section>

    <section class="generator-section" aria-labelledby="chain-automation-heading">
      <h3 id="chain-automation-heading">Protocol automation</h3>
      <p class="section-description automation-introduction">
        Leave every option off to preserve the template-cloning behavior exactly.
      </p>

      <div class="automation-options">
        <div class="option-card" :class="{ 'option-unavailable': !entanglerAvailable }">
          <div class="option-control-line">
            <label class="checkbox-field" for="chain-replace-entangler">
              <input
                id="chain-replace-entangler"
                v-model="form.replaceEntangler"
                type="checkbox"
                :disabled="!entanglerAvailable"
                aria-describedby="chain-replace-entangler-description"
              >
              <span>Replace EntanglerProt on every chain edge</span>
            </label>
            <OptionHelpTooltip
              label="About EntanglerProt replacement"
              :text="entanglerDescription"
            />
          </div>
          <p id="chain-replace-entangler-description" class="option-description">
            {{ entanglerDescription }}
          </p>

          <div v-if="form.replaceEntangler && entanglerProtocol" class="constructor-panel">
            <h4>EntanglerProt constructor</h4>
            <ProtocolConstructorForm
              :protocol="entanglerProtocol"
              category="edge"
              :variables="variables"
              template
            />
          </div>
        </div>

        <div class="option-card" :class="{ 'option-unavailable': !swapperAvailable }">
          <div class="option-control-line">
            <label class="checkbox-field" for="chain-replace-swapper">
              <input
                id="chain-replace-swapper"
                v-model="form.replaceSwapper"
                type="checkbox"
                :disabled="!swapperAvailable"
                aria-describedby="chain-replace-swapper-description"
              >
              <span>Replace SwapperProt on every repeater</span>
            </label>
            <OptionHelpTooltip
              label="About SwapperProt replacement"
              :text="swapperDescription"
            />
          </div>
          <p id="chain-replace-swapper-description" class="option-description">
            {{ swapperDescription }}
          </p>

          <template v-if="form.replaceSwapper && swapperProtocol">
            <fieldset class="strategy-fieldset">
              <legend>Swapper predicate strategy</legend>
              <div
                v-for="strategy in predicateStrategies"
                :key="strategy.value"
                class="strategy-option"
              >
                <div class="option-control-line">
                  <label :for="`chain-swapper-strategy-${strategy.value}`" class="radio-field">
                    <input
                      :id="`chain-swapper-strategy-${strategy.value}`"
                      v-model="form.predicateStrategy"
                      type="radio"
                      name="chain-swapper-strategy"
                      :value="strategy.value"
                      :aria-describedby="`chain-swapper-strategy-${strategy.value}-description`"
                    >
                    <span>{{ strategy.label }}</span>
                  </label>
                  <OptionHelpTooltip
                    :label="`About the ${strategy.label} strategy`"
                    :text="strategy.description"
                  />
                </div>
                <p
                  :id="`chain-swapper-strategy-${strategy.value}-description`"
                  class="option-description"
                >
                  {{ strategy.description }}
                </p>
              </div>
            </fieldset>

            <div class="constructor-panel">
              <h4>SwapperProt constructor</h4>
              <p v-if="generatedPredicateStrategy" class="controlled-fields-note">
                nodeL and nodeH are set separately for each repeater by the selected strategy.
              </p>
              <ProtocolConstructorForm
                :protocol="swapperProtocol"
                category="node"
                :variables="variables"
                :controlled-parameters="controlledSwapperParameters"
                template
              />
            </div>
          </template>
        </div>

        <div class="option-card" :class="{ 'option-unavailable': !trackerAvailable }">
          <div class="option-control-line">
            <label class="checkbox-field" for="chain-replace-tracker">
              <input
                id="chain-replace-tracker"
                v-model="form.replaceTracker"
                type="checkbox"
                :disabled="!trackerAvailable"
                aria-describedby="chain-replace-tracker-description"
              >
              <span>Replace EntanglementTracker on repeaters and endpoints</span>
            </label>
            <OptionHelpTooltip
              label="About EntanglementTracker replacement"
              :text="trackerDescription"
            />
          </div>
          <p id="chain-replace-tracker-description" class="option-description">
            {{ trackerDescription }}
          </p>

          <div v-if="form.replaceTracker && trackerProtocol" class="constructor-panel">
            <h4>EntanglementTracker constructor</h4>
            <ProtocolConstructorForm
              :protocol="trackerProtocol"
              category="node"
              :variables="variables"
              template
              empty-text="This protocol currently has no configurable constructor parameters."
            />
          </div>
        </div>
      </div>
    </section>

    <template #help>
      <LayoutGeneratorHelp title="Repeater protocol guidance">
        <p>
          Automatic replacement removes only the named protocol type. Other node and edge
          protocols are retained, and the optional direct virtual edge always stays empty.
        </p>
        <ul>
          <li><strong>Use template</strong> keeps the constructor's nodeL and nodeH values.</li>
          <li><strong>Eager swaps</strong> accepts entanglement from either endpoint and any repeater on the appropriate side.</li>
          <li><strong>Sequential forward/backwards</strong> advances one adjacent swap at a time from the named endpoint.</li>
          <li><strong>Binary tree</strong> swaps recursive midpoints and requires 2<sup>n</sup> - 1 repeaters.</li>
        </ul>
        <p>
          Aggressive or mismatched predicates can leave protocols waiting on one another.
          Use unique node names, review the generated directions, and add CutoffProt where
          stale entanglement should be discarded to avoid persistent deadlock-like waits.
        </p>
      </LayoutGeneratorHelp>
    </template>
  </LayoutGeneratorDialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import {
  buildSwapperPredicateSources,
  repeaterName,
  SWAPPER_PREDICATE_STRATEGIES,
  validateRepeaterChain
} from '../utils/repeaterChain.js'
import {
  deepClone,
  protocolSimpleName,
  seedProtocolConstructor
} from '../utils/protocolConstructors.js'
import ProtocolConstructorForm from './panels/ProtocolConstructorForm.vue'
import LayoutGeneratorDialog from './ui/LayoutGeneratorDialog.vue'
import LayoutGeneratorHelp from './ui/LayoutGeneratorHelp.vue'
import OptionHelpTooltip from './ui/OptionHelpTooltip.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] },
  protocolTypes: { type: Object, default: () => ({}) },
  variables: { type: Array, default: () => [] }
})

const emit = defineEmits(['confirm', 'cancel'])

const templateStrategy = SWAPPER_PREDICATE_STRATEGIES.TEMPLATE

const form = reactive({
  startNodeId: '',
  endNodeId: '',
  templateNodeId: '',
  templateEdgeId: '',
  repeaterCount: 1,
  createVirtualEdge: true,
  replaceEntangler: false,
  replaceSwapper: false,
  replaceTracker: false,
  predicateStrategy: templateStrategy
})

const entanglerProtocol = ref(null)
const swapperProtocol = ref(null)
const trackerProtocol = ref(null)
const templatePredicateValues = ref({})

const net = computed(() => ({ nodes: props.nodes, edges: props.edges }))
const selectedTemplateNode = computed(() => (
  props.nodes.find(node => node.id === form.templateNodeId) || null
))
const selectedTemplateEdge = computed(() => (
  props.edges.find(edge => edge.id === form.templateEdgeId) || null
))
const incidentEdges = computed(() => {
  if (!form.templateNodeId) return []
  return props.edges.filter(edge => (
    edge.source?.id === form.templateNodeId || edge.target?.id === form.templateNodeId
  ))
})

function findProtocolDefinition(category, simpleName) {
  const definitions = props.protocolTypes?.[category]
  if (!Array.isArray(definitions)) return null
  return definitions.find(definition => protocolSimpleName(definition?.type) === simpleName) || null
}

const entanglerDefinition = computed(() => findProtocolDefinition('edge', 'EntanglerProt'))
const swapperDefinition = computed(() => findProtocolDefinition('node', 'SwapperProt'))
const trackerDefinition = computed(() => findProtocolDefinition('node', 'EntanglementTracker'))
const entanglerAvailable = computed(() => (
  !!entanglerDefinition.value
    && (selectedTemplateEdge.value?.isLogic !== true
      || entanglerDefinition.value.virtual === true)
))
const swapperAvailable = computed(() => !!swapperDefinition.value)
const trackerAvailable = computed(() => !!trackerDefinition.value)
const generatedPredicateStrategy = computed(() => form.predicateStrategy !== templateStrategy)
const controlledSwapperParameters = computed(() => {
  if (!generatedPredicateStrategy.value) return {}
  const reason = 'Set separately for each repeater by the selected predicate strategy.'
  return { nodeL: reason, nodeH: reason }
})

const virtualEdgeDescription = 'Create one direct logical edge between the named endpoints. It receives no copied or automatic protocols.'
const entanglerDescription = computed(() => {
  if (!entanglerDefinition.value) {
    return 'EntanglerProt is unavailable in runtime protocol metadata, so automatic replacement is disabled.'
  }
  if (selectedTemplateEdge.value?.isLogic === true
    && entanglerDefinition.value.virtual !== true) {
    return 'Runtime protocol metadata does not permit EntanglerProt on a virtual template edge. Select a physical edge or leave replacement off.'
  }
  return 'Remove copied EntanglerProt instances, preserve other edge protocols, and add one fresh constructor to every generated chain edge.'
})
const swapperDescription = computed(() => (
  swapperDefinition.value
    ? 'Remove copied SwapperProt instances, preserve other node protocols, and add one fresh constructor to every generated repeater.'
    : 'SwapperProt is unavailable in runtime protocol metadata, so automatic replacement is disabled.'
))
const trackerDescription = computed(() => (
  trackerDefinition.value
    ? 'Remove existing trackers only at the generated repeaters and both endpoints, preserve other protocols, and add one fresh tracker to each node.'
    : 'EntanglementTracker is unavailable in runtime protocol metadata, so automatic replacement is disabled.'
))

const predicateStrategies = [
  {
    value: templateStrategy,
    label: 'Use template',
    description: 'Keep nodeL and nodeH exactly as configured in the seeded constructor.'
  },
  {
    value: SWAPPER_PREDICATE_STRATEGIES.EAGER,
    label: 'Eager swaps',
    description: 'Accept any generated repeater on the appropriate side plus the named endpoint.'
  },
  {
    value: SWAPPER_PREDICATE_STRATEGIES.SEQUENTIAL_FORWARD,
    label: 'Sequential forward',
    description: 'Use the eager low-side predicate, but accept only the next repeater toward the end node.'
  },
  {
    value: SWAPPER_PREDICATE_STRATEGIES.SEQUENTIAL_BACKWARD,
    label: 'Sequential backwards',
    description: 'Use the eager high-side predicate, but accept only the previous repeater toward the start node.'
  },
  {
    value: SWAPPER_PREDICATE_STRATEGIES.BINARY_TREE,
    label: 'Binary tree',
    description: 'Recursively swap each subchain midpoint between its two named boundary nodes.'
  }
]

function currentOptions() {
  return {
    startNodeId: form.startNodeId,
    endNodeId: form.endNodeId,
    templateNodeId: form.templateNodeId,
    templateEdgeId: form.templateEdgeId,
    repeaterCount: form.repeaterCount,
    createVirtualEdge: form.createVirtualEdge,
    automation: {
      entangler: {
        enabled: form.replaceEntangler,
        definition: entanglerDefinition.value,
        protocol: entanglerProtocol.value
      },
      swapper: {
        enabled: form.replaceSwapper,
        definition: swapperDefinition.value,
        protocol: swapperProtocol.value,
        predicateStrategy: form.predicateStrategy
      },
      tracker: {
        enabled: form.replaceTracker,
        definition: trackerDefinition.value,
        protocol: trackerProtocol.value
      }
    }
  }
}

const generatorValidation = computed(() => validateRepeaterChain(net.value, currentOptions()))
const constructorError = computed(() => {
  const enabledProtocols = [
    form.replaceEntangler ? entanglerProtocol.value : null,
    form.replaceSwapper ? swapperProtocol.value : null,
    form.replaceTracker ? trackerProtocol.value : null
  ].filter(Boolean)
  return enabledProtocols.some(protocol => (
    protocol.parameters?.some(parameter => !!parameter.error)
  ))
    ? 'Resolve the constructor validation error before generating the chain.'
    : ''
})
const validation = computed(() => (
  constructorError.value
    ? { valid: false, error: constructorError.value }
    : generatorValidation.value
))
const validationMessage = computed(() => {
  const started = form.startNodeId
    || form.endNodeId
    || form.templateNodeId
    || form.templateEdgeId
    || form.replaceEntangler
    || form.replaceSwapper
    || form.replaceTracker
  return started && !validation.value.valid ? validation.value.error : ''
})

watch(() => form.templateNodeId, () => {
  if (!incidentEdges.value.some(edge => edge.id === form.templateEdgeId)) {
    form.templateEdgeId = ''
  }
  resetSwapperConstructor()
})

watch(() => form.templateEdgeId, resetEntanglerConstructor)
watch(entanglerDefinition, resetEntanglerConstructor)
watch(swapperDefinition, resetSwapperConstructor)
watch(trackerDefinition, resetTrackerConstructor)

watch(entanglerAvailable, available => {
  if (!available) form.replaceEntangler = false
})
watch(swapperAvailable, available => {
  if (!available) form.replaceSwapper = false
})
watch(trackerAvailable, available => {
  if (!available) form.replaceTracker = false
})

watch(() => form.replaceSwapper, enabled => {
  if (!enabled && form.predicateStrategy !== templateStrategy) {
    form.predicateStrategy = templateStrategy
  }
})

watch(() => form.predicateStrategy, (strategy, previousStrategy) => {
  if (previousStrategy === templateStrategy && strategy !== templateStrategy) {
    captureTemplatePredicates()
  }
  if (strategy === templateStrategy) {
    restoreTemplatePredicates()
  } else {
    applyGeneratedPredicatePreview()
  }
})

watch(
  () => [
    form.repeaterCount,
    form.startNodeId,
    form.endNodeId,
    form.templateNodeId
  ],
  () => {
    if (generatedPredicateStrategy.value) applyGeneratedPredicatePreview()
  }
)

watch(() => props.show, isShown => {
  if (isShown) resetForm()
}, { immediate: true })

function resetForm() {
  form.startNodeId = ''
  form.endNodeId = ''
  form.templateNodeId = ''
  form.templateEdgeId = ''
  form.repeaterCount = 1
  form.createVirtualEdge = true
  form.replaceEntangler = false
  form.replaceSwapper = false
  form.replaceTracker = false
  form.predicateStrategy = templateStrategy
  resetEntanglerConstructor()
  resetSwapperConstructor()
  resetTrackerConstructor()
}

function matchingProtocol(protocols, simpleName) {
  if (!Array.isArray(protocols)) return null
  return protocols.find(protocol => protocolSimpleName(protocol?.type) === simpleName) || null
}

function resetEntanglerConstructor() {
  const definition = entanglerDefinition.value
  if (!definition) {
    entanglerProtocol.value = null
    return
  }
  const template = matchingProtocol(
    selectedTemplateEdge.value?.data?.protocols,
    'EntanglerProt'
  )
  entanglerProtocol.value = seedProtocolConstructor(definition, template)
}

function resetSwapperConstructor() {
  const definition = swapperDefinition.value
  if (!definition) {
    swapperProtocol.value = null
    templatePredicateValues.value = {}
    return
  }
  const template = matchingProtocol(
    selectedTemplateNode.value?.data?.protocols,
    'SwapperProt'
  )
  swapperProtocol.value = seedProtocolConstructor(definition, template)
  captureTemplatePredicates()
  if (generatedPredicateStrategy.value) applyGeneratedPredicatePreview()
}

function resetTrackerConstructor() {
  trackerProtocol.value = trackerDefinition.value
    ? seedProtocolConstructor(trackerDefinition.value)
    : null
}

function predicateParameter(name) {
  return swapperProtocol.value?.parameters?.find(parameter => parameter.name === name) || null
}

function captureTemplatePredicates() {
  templatePredicateValues.value = Object.fromEntries(
    ['nodeL', 'nodeH'].map(name => [name, deepClone(predicateParameter(name))])
  )
}

function restoreTemplatePredicates() {
  if (!swapperProtocol.value) return
  for (const name of ['nodeL', 'nodeH']) {
    const saved = templatePredicateValues.value[name]
    const index = swapperProtocol.value.parameters?.findIndex(parameter => parameter.name === name)
    if (saved && index >= 0) swapperProtocol.value.parameters.splice(index, 1, deepClone(saved))
  }
}

function setGeneratedPredicatePreview(preview = null) {
  for (const name of ['nodeL', 'nodeH']) {
    const parameter = predicateParameter(name)
    if (!parameter) continue
    parameter.selectedType = 'Lambda'
    parameter.value = preview?.[name] ?? ''
    delete parameter.error
    delete parameter.latex
  }
}

function applyGeneratedPredicatePreview() {
  if (!swapperProtocol.value || !generatedPredicateStrategy.value) return
  const startNode = props.nodes.find(node => node.id === form.startNodeId)
  const endNode = props.nodes.find(node => node.id === form.endNodeId)
  const templateNode = selectedTemplateNode.value
  if (!startNode || !endNode || !templateNode || !Number.isInteger(form.repeaterCount)) {
    setGeneratedPredicatePreview()
    return
  }

  let sources
  try {
    sources = buildSwapperPredicateSources({
      strategy: form.predicateStrategy,
      repeaterCount: form.repeaterCount,
      startNodeName: startNode.name,
      endNodeName: endNode.name,
      repeaterNameAt: index => repeaterName(templateNode.name, index + 1)
    })
  } catch {
    setGeneratedPredicatePreview()
    return
  }
  const preview = sources[0]
  setGeneratedPredicatePreview(preview)
}

function edgeLabel(edge) {
  return `${edge.source?.name || edge.source?.id || edge.source} to ${edge.target?.name || edge.target?.id || edge.target}`
}

function handleConfirm() {
  if (!validation.value.valid) return
  emit('confirm', deepClone(currentOptions()))
}

function handleCancel() {
  emit('cancel')
}
</script>

<style scoped>
.generator-section + .generator-section {
  margin-top: var(--app-space-6);
}

.generator-section > h3 {
  margin: 0 0 var(--app-space-4);
  color: var(--app-color-text);
  font-size: 1rem;
}

.section-description,
.option-description,
.controlled-fields-note {
  color: var(--app-color-text-muted);
  line-height: 1.4;
}

.section-description {
  margin: var(--app-space-3) 0 0;
  font-size: 0.86rem;
}

.automation-introduction {
  margin: calc(-1 * var(--app-space-2)) 0 var(--app-space-4);
}

.automation-options {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.option-card {
  padding: var(--app-space-4);
  border: solid 1px var(--app-color-border);
  border-radius: var(--app-radius-surface);
  background: var(--app-color-surface);
}

.compact-option {
  margin-top: var(--app-space-4);
}

.option-unavailable {
  background: var(--app-color-surface-subtle);
}

.option-control-line,
.checkbox-field,
.radio-field {
  display: flex;
  align-items: center;
}

.option-control-line {
  justify-content: space-between;
  gap: var(--app-space-3);
}

.checkbox-field,
.radio-field {
  gap: var(--app-space-2);
  color: var(--app-color-text);
  font-weight: 600;
}

.checkbox-field input,
.radio-field input {
  flex: 0 0 auto;
  width: auto;
  margin: 0;
}

.option-description {
  margin: var(--app-space-2) 0 0 calc(1rem + var(--app-space-2));
  font-size: 0.82rem;
}

.strategy-fieldset {
  margin: var(--app-space-4) 0 0;
  padding: var(--app-space-3);
  border: solid 1px var(--app-color-border);
  border-radius: var(--app-radius-control);
}

.strategy-fieldset legend {
  padding: 0 var(--app-space-2);
  color: var(--app-color-text);
  font-weight: 600;
}

.strategy-option + .strategy-option {
  margin-top: var(--app-space-3);
}

.constructor-panel {
  margin-top: var(--app-space-4);
  padding: var(--app-space-4);
  border-left: 3px solid var(--app-color-primary);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface-subtle);
}

.constructor-panel h4 {
  margin: 0 0 var(--app-space-3);
  color: var(--app-color-text);
  font-size: 0.92rem;
}

.controlled-fields-note {
  margin: 0 0 var(--app-space-3);
  font-size: 0.82rem;
}

:deep(.layout-generator-help ul) {
  margin: var(--app-space-2) 0;
  padding-left: 1.25rem;
}

@media (max-width: 640px) {
  .option-card,
  .constructor-panel {
    padding: var(--app-space-3);
  }

  .option-description {
    margin-left: 0;
  }
}
</style>

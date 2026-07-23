<template>
  <ConstructorForm
    class="background-noise-constructor-form"
    :constructor="backgroundNoise"
    parameter-identity="field"
    :get-parameter-definition="parameterDefinition"
    category="node"
    :variables="variables"
    :editing-locked="editingLocked"
    :disabled="disabled"
    :empty-text="emptyText"
    :numeric-expression-context="numericExpressionContext"
    :template="template"
    subject="background noise"
    test-id="background-noise-constructor"
    template-test-id="template-background-noise-constructor"
    @commit="emit('commit')"
  />
</template>

<script setup>
import { api } from '../../utils/ApiConnector.js'
import ConstructorForm from './ConstructorForm.vue'

const props = defineProps({
  backgroundNoise: { type: Object, required: true },
  variables: { type: Array, default: () => [] },
  editingLocked: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  emptyText: { type: String, default: '' },
  numericExpressionContext: { type: Object, default: undefined },
  template: { type: Boolean, default: false },
})
const emit = defineEmits(['commit'])

function parameterDefinition(parameter) {
  return api.getBackgroundNoiseParameterDefinition(
    props.backgroundNoise.type,
    parameter.field,
  )
}
</script>

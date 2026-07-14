import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ProtocolConstructorForm from '../../src/components/panels/ProtocolConstructorForm.vue'
import ProtocolEditor from '../../src/components/panels/ProtocolEditor.vue'
import TypedValueInput from '../../src/components/panels/TypedValueInput.vue'
import { VariableReference } from '../../src/models/Variable'
import { UI_SERVICES_KEY } from '../../src/composables/uiServices'
import { api } from '../../src/utils/ApiConnector'

const PROTOCOL_TYPE = 'QuantumSavory.ProtocolZoo.TestNodeProtocol'
const protocolDefinition = {
  type: PROTOCOL_TYPE,
  group: 'node',
  parameters: [
    { field: 'sim', type: 'Any', doc: 'Injected simulation.' },
    { field: 'node', type: 'Int64', doc: 'Injected node.' },
    {
      field: 'nodeL',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
      doc: 'Choose a lower remote node.'
    },
    { field: 'rounds', type: 'Int64', doc: 'Number of rounds.' }
  ]
}

const originalConfig = api._config.value
const originalKnownFunctions = api.known_functions.value

const tooltip = {
  beforeMount(element, binding) {
    const value = typeof binding.value === 'object' ? binding.value.value : binding.value
    element.dataset.tooltip = value
  }
}

function mountForm(props) {
  return mount(ProtocolConstructorForm, {
    props,
    global: { directives: { tooltip } }
  })
}

beforeEach(() => {
  api._config.value = {
    protocolTypes: {
      node: [protocolDefinition],
      edge: [{ ...protocolDefinition, group: 'edge' }],
      floating: []
    }
  }
  api.known_functions.value = ['identity', '<(self)', '>(self)']
})

afterAll(() => {
  api._config.value = originalConfig
  api.known_functions.value = originalKnownFunctions
})

describe('ProtocolConstructorForm', () => {
  it('filters injected constructor arguments and retains documentation tooltips', () => {
    const protocol = {
      type: PROTOCOL_TYPE,
      parameters: [
        { name: 'sim', type: 'Any' },
        { name: 'node', type: 'Int64' },
        { name: 'rounds', type: 'Int64', value: 3 }
      ]
    }
    const wrapper = mountForm({ protocol, category: 'node' })

    expect(wrapper.findAll('.param-item')).toHaveLength(1)
    expect(wrapper.get('.param-name').text()).toContain('rounds')
    expect(wrapper.get('.param-name').attributes('data-tooltip')).toBe('Number of rounds.')
    expect(wrapper.get('input[type="number"]').element.value).toBe('3')
    expect(wrapper.get('input[type="number"]').attributes('step')).toBe('1')
  })

  it('renders an explicit empty constructor panel when no configurable fields remain', () => {
    const wrapper = mountForm({
      protocol: {
        type: PROTOCOL_TYPE,
        parameters: [{ name: 'sim', type: 'Any' }, { name: 'node', type: 'Int64' }]
      },
      category: 'node',
      emptyText: 'This protocol has no configurable constructor parameters.'
    })

    expect(wrapper.find('.param-item').exists()).toBe(false)
    expect(wrapper.get('.empty-protocol-parameters').text()).toBe(
      'This protocol has no configurable constructor parameters.'
    )
  })

  it('preserves union choices and contextual Function filtering', async () => {
    const parameter = {
      name: 'nodeL',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
      selectedType: 'default',
      value: null
    }
    const wrapper = mountForm({
      protocol: { type: PROTOCOL_TYPE, parameters: [parameter] },
      category: 'node'
    })
    const typeSelector = wrapper.get('.complexTypeSelector')

    expect(typeSelector.findAll('option').map(option => option.text())).toEqual([
      'Default',
      'QuantumSavory.Wildcard',
      'Int64',
      'Predefined function',
      'Custom function'
    ])

    await typeSelector.setValue('Function')
    expect(wrapper.get('.functionSelector').findAll('option').map(option => option.text())).toEqual([
      'Default',
      'identity',
      '<(self)',
      '>(self)'
    ])

    await wrapper.setProps({ category: 'edge' })
    expect(wrapper.get('.functionSelector').findAll('option').map(option => option.text())).toEqual([
      'Default',
      'identity'
    ])

    await typeSelector.setValue('QuantumSavory.Wildcard')
    expect(parameter.value).toBe('Wildcard')
    expect(wrapper.get('.param-value').text()).toContain('Wildcard')
  })

  it('links only compatible variables and restores the direct value when unlinked', async () => {
    const parameter = { name: 'rounds', type: 'Int64', value: 7 }
    const compatibleVariable = { id: 'variable-rounds', name: 'rounds', type: 'Int64' }
    const wrapper = mountForm({
      protocol: { type: PROTOCOL_TYPE, parameters: [parameter] },
      category: 'node',
      variables: [
        compatibleVariable,
        { id: 'variable-label', name: 'label', type: 'String' }
      ]
    })

    await wrapper.get('[aria-label="Set rounds from a variable"]').trigger('click')
    const variableSelector = wrapper.get('.variable-selector')
    expect(variableSelector.findAll('option').map(option => option.text())).toEqual([
      'Select a variable',
      'rounds (Int64)'
    ])

    await variableSelector.setValue(compatibleVariable.id)
    expect(parameter.value).toBeInstanceOf(VariableReference)
    expect(parameter.value.id).toBe(compatibleVariable.id)

    await wrapper.get('[aria-label="Use a direct value for rounds"]').trigger('click')
    expect(parameter.value).toBe(7)
    expect(wrapper.get('input[type="number"]').element.value).toBe('7')
  })

  it('visibly identifies strategy-controlled fields and disables every editing path', async () => {
    const parameter = {
      name: 'nodeL',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
      selectedType: 'Int64',
      value: 2
    }
    const wrapper = mountForm({
      protocol: { type: PROTOCOL_TYPE, parameters: [parameter] },
      category: 'node',
      variables: [{ id: 'variable-node', name: 'remote', type: 'Int64' }],
      controlledParameters: {
        nodeL: 'The eager-swaps strategy generates this predicate.'
      }
    })

    const note = wrapper.get('.controlled-parameter-note')
    expect(note.text()).toContain('Strategy-controlled')
    expect(note.text()).toContain('eager-swaps strategy')
    expect(wrapper.get('.param-item-row').classes()).toContain('controlled-parameter')
    expect(wrapper.get('.complexTypeSelector').attributes('disabled')).toBeDefined()
    expect(wrapper.get('input[type="number"]').attributes('disabled')).toBeDefined()

    const bindingButton = wrapper.get('[aria-label="Set nodeL from a variable"]')
    expect(bindingButton.attributes('disabled')).toBeDefined()
    expect(bindingButton.attributes('aria-describedby')).toBe(note.attributes('id'))
    expect(wrapper.get('input[type="number"]').attributes('aria-describedby')).toBe(note.attributes('id'))
  })

  it('closes an open variable picker when a parameter becomes strategy-controlled', async () => {
    const parameter = { name: 'rounds', type: 'Int64', value: 4 }
    const wrapper = mountForm({
      protocol: { type: PROTOCOL_TYPE, parameters: [parameter] },
      category: 'node',
      variables: [{ id: 'variable-rounds', name: 'rounds', type: 'Int64' }]
    })

    await wrapper.get('[aria-label="Set rounds from a variable"]').trigger('click')
    expect(wrapper.find('.variable-selector').exists()).toBe(true)

    await wrapper.setProps({
      controlledParameters: { rounds: 'This field is generated.' }
    })
    await nextTick()

    expect(wrapper.find('.variable-selector').exists()).toBe(false)
    expect(wrapper.get('input[type="number"]').attributes('disabled')).toBeDefined()
  })

  it('keeps the existing ProtocolEditor chrome and parameter selectors', async () => {
    const showResultsView = vi.fn()
    const wrapper = mount(ProtocolEditor, {
      props: {
        protocol: {
          id: 'protocol-1',
          type: PROTOCOL_TYPE,
          parameters: [{ name: 'rounds', type: 'Int64', value: 5 }]
        },
        category: 'node',
        isSelected: true
      },
      global: {
        directives: { tooltip },
        provide: { [UI_SERVICES_KEY]: { showResultsView } }
      }
    })

    expect(wrapper.get('.protocol-list-type').text()).toContain('TestNodeProtocol')
    expect(wrapper.findAll('.protocol-header-action')).toHaveLength(2)
    expect(wrapper.get('.protocol-container .param-item input').element.value).toBe('5')

    await wrapper.get('[aria-label="Show results"]').trigger('click')
    expect(showResultsView).toHaveBeenCalledWith(
      'protocol',
      expect.objectContaining({ id: 'protocol-1' }),
      expect.objectContaining({ protocolType: 'TestNodeProtocol' })
    )
  })
})

describe('TypedValueInput disabled code values', () => {
  it('allows decimal Float64 constructor values without native step mismatch', async () => {
    const parameter = { name: 'success_prob', value: 0.35 }
    const wrapper = mount(TypedValueInput, {
      props: { parameter, type: 'Float64', category: 'edge' }
    })
    const input = wrapper.get('input[type="number"]')

    expect(input.attributes('step')).toBe('any')
    await input.setValue('0.73')
    expect(input.element.validity.stepMismatch).toBe(false)
    expect(parameter.value).toBe(0.73)
  })

  it('does not open or overwrite a collapsed Lambda while disabled', async () => {
    const parameter = { name: 'nodeL', value: 'x -> x < self' }
    const wrapper = mount(TypedValueInput, {
      props: {
        parameter,
        type: 'Lambda',
        category: 'node',
        disabled: true
      },
      global: {
        stubs: {
          CodeEditorWithSymbols: {
            props: ['modelValue', 'collapsed'],
            emits: ['edit', 'update:modelValue'],
            template: '<button class="code-stub" :data-collapsed="String(collapsed)" @click="$emit(\'edit\')" @dblclick="$emit(\'update:modelValue\', \'changed\')">Code</button>'
          }
        }
      }
    })

    const editor = wrapper.get('.code-stub')
    expect(wrapper.get('fieldset.code-value-input').attributes('disabled')).toBeDefined()
    expect(editor.attributes('data-collapsed')).toBe('true')

    await editor.trigger('click')
    expect(editor.attributes('data-collapsed')).toBe('true')

    await editor.trigger('dblclick')
    expect(parameter.value).toBe('x -> x < self')
  })
})

describe('ApiConnector protocol metadata safety', () => {
  it('returns undefined while runtime protocol metadata is unavailable', () => {
    api._config.value = {}

    expect(api.getProtocolDefinition('node', PROTOCOL_TYPE)).toBeUndefined()
    expect(api.getProtocolParameterDefinition('node', PROTOCOL_TYPE, 'nodeL')).toBeUndefined()
  })
})

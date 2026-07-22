import { mount, shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PrimeVue from 'primevue/config'
import CodeEditorWithSymbols from '../../src/components/panels/CodeEditorWithSymbols.vue'
import CustomFunctionContextHelp from '../../src/components/panels/CustomFunctionContextHelp.vue'
import NodeListPanel from '../../src/components/panels/NodeListPanel.vue'
import { api } from '../../src/utils/ApiConnector.js'
import {
  CUSTOM_FUNCTION_CONTEXT_BY_ID,
  CUSTOM_FUNCTION_CONTEXT_KEYWORDS
} from '../../src/utils/customFunctionContext'

const context = (name, description, unit = null) => ({ name, description, unit })
const sourceLanguage = {
  schema_version: 1,
  unsafe_evaluation: true,
  function_forms: [
    { id: 'anonymous_lambda', example: 'x -> x + 1' },
    { id: 'short_form_definition', example: 'f(x) = x + 1' },
    { id: 'comparison_curry', example: '==(2)' },
  ],
  comparison_currying: {
    operators: ['==', '!=', '<', '<=', '>', '>=', '≠', '≤', '≥'],
    direction: 'operator(value) means candidate -> operator(candidate, value).',
    root_only: true,
    examples: ['==(2)', '<=(self)'],
  },
  contexts: {
    node: [context('nodeid', 'Resolve an exact node name.'), context('self', 'Current node ID.')],
    edge: [
      context('nodeid', 'Resolve an exact node name.'),
      context('distance', 'Edge distance.', 'm'),
      context('delay', 'Edge delay.', 's'),
      context('refractive_index', 'Edge refractive index.'),
      context('loss', 'Edge loss.', 'dB/km'),
      context('transmissivity', 'Edge transmissivity.'),
      context('node_a', 'Source node ID.'),
      context('node_b', 'Target node ID.'),
    ],
    floating: [context('nodeid', 'Resolve an exact node name.')],
    variable: [],
    query: [],
    symbolic: [],
  },
  operations: {
    ordinary: [
      { name: 'length', syntax: 'length(value)' },
      { name: 'isfinite' },
      { name: 'isinf' },
      { name: 'isnan' },
    ],
    symbolic: [{ name: 'projector' }],
  },
  constants: [{ name: 'π' }, { name: 'Inf' }, { name: 'NaN' }],
  non_finite_float64: {
    description: 'Unconstrained Float64 expressions may contain Inf and NaN.',
  },
  virtual_edge_note: 'Physical edge context values may be nothing on virtual edges.',
  limits: {},
  result_contracts: {
    custom_function: 'Inputs and results use the admitted value domain.',
    symbolic_expression: 'The result must be a SymQObj.',
  },
  forbidden_syntax: ['qualification and indexing'],
  symbolic: { atoms: [], constructors: [], states_zoo: 'States Zoo uses structured data.' },
  advanced_guidance: 'Export a script and edit and run it locally for advanced Julia.',
  security_note: 'The whitelist is not a security boundary.',
}

describe('custom-function contextual help', () => {
  beforeEach(() => {
    api._config.value = { sourceLanguage }
  })

  it('opens every contextual keyword from the shared catalog in a helper popup', async () => {
    const wrapper = mount(CustomFunctionContextHelp, {
      attachTo: document.body,
      global: { plugins: [PrimeVue] },
    })
    const trigger = wrapper.get('.custom-function-context-trigger')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(document.querySelector('[data-testid="custom-function-context-help"]')).toBeNull()

    await trigger.trigger('click')
    await nextTick()
    const popup = document.querySelector('[data-testid="custom-function-context-help"]')
    const closeButton = popup.querySelector('[aria-label="Close custom function context"]')

    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(trigger.attributes('aria-controls')).toBe(popup.id)
    expect(popup.getAttribute('role')).toBe('dialog')
    expect(popup.getAttribute('aria-modal')).toBe('true')
    expect(popup.getAttribute('aria-label')).toBe('Custom function context')
    expect(popup.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(closeButton)
    expect(popup.textContent).toContain('x -> x + 1')
    expect(popup.textContent).toContain('f(x) = x + 1')
    expect(popup.textContent).toContain('==(2)')
    expect(popup.textContent).toContain('<=(self)')
    expect(popup.textContent).toContain('candidate -> operator(candidate, value)')
    expect(popup.textContent).toContain('distance')
    expect(popup.textContent).toContain('length(value)')
    expect(popup.textContent).toContain('Inf')
    expect(popup.textContent).toContain('NaN')
    expect(popup.textContent).toContain('isfinite')
    expect(popup.textContent).toContain('nothing on virtual edges')
    expect(popup.textContent).toContain('edit and run it locally')
    expect(CUSTOM_FUNCTION_CONTEXT_KEYWORDS).toHaveLength(9)
    expect(CUSTOM_FUNCTION_CONTEXT_BY_ID.distance.syntax).toBe('distance')
    expect(CUSTOM_FUNCTION_CONTEXT_BY_ID.length).toBeUndefined()

    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    await vi.waitFor(() => {
      expect(trigger.attributes('aria-expanded')).toBe('false')
      expect(document.querySelector('[data-testid="custom-function-context-help"]')).toBeNull()
    })
    expect(document.activeElement).toBe(trigger.element)

    wrapper.unmount()
  })

  it('uses one profile-aware helper while any source editor is open', async () => {
    const wrapper = shallowMount(CodeEditorWithSymbols, {
      props: { evaluationEnabled: true },
      global: {
        directives: { tooltip: () => {} }
      }
    })

    expect(wrapper.findComponent(CustomFunctionContextHelp).exists()).toBe(true)

    await wrapper.setProps({ showLatex: true })
    expect(wrapper.findComponent(CustomFunctionContextHelp).exists()).toBe(true)
    expect(wrapper.findComponent(CustomFunctionContextHelp).props('profile'))
      .toBe('symbolic_expression')

    await wrapper.setProps({ showLatex: false, collapsible: true, collapsed: true })
    expect(wrapper.findComponent(CustomFunctionContextHelp).exists()).toBe(false)
  })

  it('keeps editor actions from submitting an enclosing constructor form', () => {
    const wrapper = shallowMount(CodeEditorWithSymbols, {
      props: { evaluationEnabled: true },
      global: {
        directives: { tooltip: () => {} }
      }
    })

    expect(wrapper.get('.validate-button').attributes('type')).toBe('button')
    expect(wrapper.findAll('.symbol-button')).not.toHaveLength(0)
    expect(wrapper.findAll('.symbol-button').every(button => (
      button.attributes('type') === 'button'
    ))).toBe(true)
  })

  it('explains name lookup beside the one-based node indices', () => {
    const wrapper = mount(NodeListPanel, {
      props: {
        nodes: [{ id: 'node-a', name: 'Alpha', data: { slots: [] } }]
      },
      global: {
        directives: { tooltip: () => {} }
      }
    })

    const help = wrapper.get('[data-testid="node-context-help"]')
    expect(help.text()).toContain('one-based simulator IDs')
    expect(help.text()).toContain(CUSTOM_FUNCTION_CONTEXT_BY_ID.nodeid.syntax)
    expect(help.text()).toContain(CUSTOM_FUNCTION_CONTEXT_BY_ID.nodeid.recommendation)
    expect(wrapper.get('.node-index').text()).toBe('#1')
  })

  it('hides node-index help when the node list is empty', () => {
    const wrapper = mount(NodeListPanel, {
      props: { nodes: [] },
      global: {
        directives: { tooltip: () => {} }
      }
    })

    expect(wrapper.get('.empty-list').text()).toBe('No nodes')
    expect(wrapper.find('[data-testid="node-context-help"]').exists()).toBe(false)
  })
})

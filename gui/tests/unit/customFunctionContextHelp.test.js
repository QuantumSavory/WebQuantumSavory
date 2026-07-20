import { mount, shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import PrimeVue from 'primevue/config'
import CodeEditorWithSymbols from '../../src/components/panels/CodeEditorWithSymbols.vue'
import CustomFunctionContextHelp from '../../src/components/panels/CustomFunctionContextHelp.vue'
import NodeListPanel from '../../src/components/panels/NodeListPanel.vue'
import {
  CUSTOM_FUNCTION_CONTEXT_BY_ID,
  CUSTOM_FUNCTION_CONTEXT_KEYWORDS
} from '../../src/utils/customFunctionContext'

describe('custom-function contextual help', () => {
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

    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect([...popup.querySelectorAll('dt code')].map(keyword => keyword.textContent)).toEqual([
      'nodeid("Node name")',
      'self',
      'length',
      'delay',
      'refractive_index',
      'node_a',
      'node_b',
    ])
    expect(popup.textContent).toContain(CUSTOM_FUNCTION_CONTEXT_BY_ID.nodeid.description)
    expect(popup.textContent).toContain(CUSTOM_FUNCTION_CONTEXT_BY_ID.nodeid.recommendation)
    expect(popup.textContent).toContain(CUSTOM_FUNCTION_CONTEXT_BY_ID.self.availability)
    expect(popup.textContent).toContain(CUSTOM_FUNCTION_CONTEXT_BY_ID.length.recommendation)
    expect(CUSTOM_FUNCTION_CONTEXT_KEYWORDS).toHaveLength(7)

    await trigger.trigger('click')
    await nextTick()
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(document.querySelector('[data-testid="custom-function-context-help"]')).toBeNull()

    wrapper.unmount()
  })

  it('appears only while a custom-function editor is open', async () => {
    const wrapper = shallowMount(CodeEditorWithSymbols, {
      props: { evaluationEnabled: true },
      global: {
        directives: { tooltip: () => {} }
      }
    })

    expect(wrapper.findComponent(CustomFunctionContextHelp).exists()).toBe(true)

    await wrapper.setProps({ showLatex: true })
    expect(wrapper.findComponent(CustomFunctionContextHelp).exists()).toBe(false)

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

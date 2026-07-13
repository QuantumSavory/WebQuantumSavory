import { mount, shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CodeEditorWithSymbols from '../../src/components/panels/CodeEditorWithSymbols.vue'
import CustomFunctionContextHelp from '../../src/components/panels/CustomFunctionContextHelp.vue'
import NodeListPanel from '../../src/components/panels/NodeListPanel.vue'
import {
  CUSTOM_FUNCTION_CONTEXT_BY_ID,
  CUSTOM_FUNCTION_CONTEXT_KEYWORDS
} from '../../src/utils/customFunctionContext'

describe('custom-function contextual help', () => {
  it('renders every contextual keyword from the shared catalog', () => {
    const wrapper = mount(CustomFunctionContextHelp)

    expect(wrapper.findAll('dt code').map(keyword => keyword.text())).toEqual([
      'nodeid("Node name")',
      'self'
    ])
    expect(wrapper.text()).toContain(CUSTOM_FUNCTION_CONTEXT_BY_ID.nodeid.description)
    expect(wrapper.text()).toContain(CUSTOM_FUNCTION_CONTEXT_BY_ID.nodeid.recommendation)
    expect(wrapper.text()).toContain(CUSTOM_FUNCTION_CONTEXT_BY_ID.self.availability)
    expect(CUSTOM_FUNCTION_CONTEXT_KEYWORDS).toHaveLength(2)
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
})

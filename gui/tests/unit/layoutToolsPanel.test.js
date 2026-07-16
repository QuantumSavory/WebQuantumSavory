import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import LayoutToolsPanel from '../../src/components/panels/LayoutToolsPanel.vue'

describe('layout tools physical settings', () => {
  it('keeps the session badge toggle available while simulation editing is locked', async () => {
    const wrapper = mount(LayoutToolsPanel, {
      props: {
        disabled: true,
        physicalConfig: { refractiveIndex: 1.468 },
        curveEditingEnabled: false,
        showPhysicalBadges: true,
      },
    })

    expect(wrapper.get('#default-refractive-index').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('#curve-editing-enabled').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('#physical-badges-visible').attributes()).not.toHaveProperty('disabled')
    await wrapper.get('#physical-badges-visible').setValue(false)
    expect(wrapper.emitted('update:show-physical-badges')).toEqual([[false]])
  })

  it('rejects invalid refractive indices and emits drawing changes', async () => {
    const wrapper = mount(LayoutToolsPanel, {
      props: {
        physicalConfig: { refractiveIndex: 1.468 },
        curveEditingEnabled: false,
      },
    })
    const refractiveIndex = wrapper.get('#default-refractive-index')

    await refractiveIndex.setValue('-1')
    expect(wrapper.emitted('update:refractive-index')).toBeUndefined()
    expect(refractiveIndex.element.value).toBe('1.468')

    await refractiveIndex.setValue('1.6')
    expect(wrapper.emitted('update:refractive-index')).toEqual([[1.6]])
    await wrapper.get('#curve-editing-enabled').setValue(true)
    expect(wrapper.emitted('update:curve-editing-enabled')).toEqual([[true]])
  })
})

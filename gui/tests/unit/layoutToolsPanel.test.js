import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import LayoutToolsPanel from '../../src/components/panels/LayoutToolsPanel.vue'

describe('layout tools physical settings', () => {
  it('places full-width help before three focused tool cards', () => {
    const wrapper = mount(LayoutToolsPanel)
    const cards = wrapper.findAll('.layout-tools-card')

    expect(cards).toHaveLength(4)
    expect(cards.map(card => card.get('h3').text())).toEqual([
      'Help',
      'Physical Defaults',
      'Drawing Tools',
      'Helpers',
    ])
    expect(cards[0].classes()).toContain('help-card')
    expect(cards.slice(1).map(card => card.classes()[1])).toEqual([
      'defaults-card',
      'drawing-card',
      'helpers-card',
    ])
  })

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
    expect(wrapper.get('.annotation-button').attributes()).not.toHaveProperty('disabled')
    expect(wrapper.get('.annotation-button .lucide-message-square-plus').exists()).toBe(true)
    await wrapper.get('#physical-badges-visible').setValue(false)
    expect(wrapper.emitted('update:show-physical-badges')).toEqual([[false]])

    await wrapper.get('.annotation-button').trigger('click')
    expect(wrapper.emitted('add-annotation')).toEqual([[]])
    expect(wrapper.get('#layout-tools-disabled-help').text()).toContain('Annotations remain available')
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

  it('shows drawing-control help on pointer hover and keyboard focus', async () => {
    const wrapper = mount(LayoutToolsPanel, {
      props: { annotationCreationEnabled: true },
    })
    const helpTitle = () => wrapper.get('#layout-tools-help-title').text()

    const curveField = wrapper.get('label[for="curve-editing-enabled"]')
    await curveField.trigger('mouseenter')
    expect(helpTitle()).toBe('Curve mode')
    await curveField.trigger('mouseleave')
    expect(helpTitle()).toBe('Help')
    await wrapper.get('#curve-editing-enabled').trigger('focusin')
    expect(helpTitle()).toBe('Curve mode')
    await wrapper.get('#curve-editing-enabled').trigger('focusout')
    expect(helpTitle()).toBe('Help')

    const badgesField = wrapper.get('label[for="physical-badges-visible"]')
    await badgesField.trigger('mouseenter')
    expect(helpTitle()).toBe('Distance and delay badges')
    await badgesField.trigger('mouseleave')
    await wrapper.get('#physical-badges-visible').trigger('focusin')
    expect(helpTitle()).toBe('Distance and delay badges')
    await wrapper.get('#physical-badges-visible').trigger('focusout')

    const annotationButton = wrapper.get('.annotation-button')
    expect(annotationButton.attributes('aria-pressed')).toBe('true')
    expect(annotationButton.classes()).toContain('active')
    await annotationButton.trigger('mouseenter')
    expect(helpTitle()).toBe('Add Annotation')
    await annotationButton.trigger('mouseleave')
    await annotationButton.trigger('focus')
    expect(helpTitle()).toBe('Add Annotation')
    await annotationButton.trigger('blur')
    expect(helpTitle()).toBe('Help')
  })

  it.each([
    'Repeater Chain Generator',
    'Star Network Generator',
    'Graph Network Generator',
  ])('shows live help for %s on hover and focus', async label => {
    const wrapper = mount(LayoutToolsPanel)
    const button = wrapper.findAll('.helpers-card .helper-button')
      .find(candidate => candidate.text().includes(label))

    await button.trigger('mouseenter')
    expect(wrapper.get('#layout-tools-help-title').text()).toBe(label)
    expect(wrapper.get('.helper-description').text().length).toBeGreaterThan(0)
    await button.trigger('mouseleave')
    expect(wrapper.get('#layout-tools-help-title').text()).toBe('Help')

    await button.trigger('focus')
    expect(wrapper.get('#layout-tools-help-title').text()).toBe(label)
    await button.trigger('blur')
    expect(wrapper.get('#layout-tools-help-title').text()).toBe('Help')
  })
})

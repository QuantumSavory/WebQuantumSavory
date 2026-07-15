import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PrimeVue from 'primevue/config'
import MarkdownTooltip, {
  renderTooltipBindingValue
} from '../../src/directives/markdownTooltip.js'
import { markdownCodeBlock } from '../../src/utils/markdown.js'

const TooltipHost = defineComponent({
  props: {
    tooltip: {
      type: [String, Object],
      default: ''
    },
    title: {
      type: String,
      default: ''
    }
  },
  template: '<button v-tooltip.top.focus="tooltip" :title="title">Target</button>'
})

const BottomTooltipHost = defineComponent({
  props: {
    tooltip: {
      type: String,
      default: ''
    }
  },
  template: '<button v-tooltip.bottom.focus="tooltip">Bottom target</button>'
})

function mountTooltip(props) {
  return mount(TooltipHost, {
    props,
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: MarkdownTooltip }
    }
  })
}

describe('Markdown tooltip directive', () => {
  it('renders string bindings while preserving placement modifiers and native titles', () => {
    const wrapper = mountTooltip({
      tooltip: '**Markdown**',
      title: '**Native title stays plain**'
    })
    const target = wrapper.get('button').element

    expect(target.$_ptooltipValue).toContain('<strong>Markdown</strong>')
    expect(target.$_ptooltipEscape).toBe(false)
    expect(target.$_ptooltipModifiers).toMatchObject({ top: true, focus: true })
    expect(target.getAttribute('title')).toBe('**Native title stays plain**')
  })

  it('preserves bottom placement through the same global Markdown wrapper', async () => {
    const wrapper = mount(BottomTooltipHost, {
      props: { tooltip: '**Bottom Markdown**' },
      global: {
        plugins: [PrimeVue],
        directives: { tooltip: MarkdownTooltip }
      }
    })
    const target = wrapper.get('button')

    expect(target.element.$_ptooltipModifiers).toMatchObject({ bottom: true, focus: true })
    await target.trigger('focus')
    await vi.waitFor(() => {
      expect(document.body.querySelector('.p-tooltip-bottom')).not.toBeNull()
    })
    expect(document.body.querySelector('.p-tooltip-text strong')?.textContent).toBe('Bottom Markdown')
    wrapper.unmount()
  })

  it('preserves object options without mutating the caller binding', () => {
    const pt = { arrow: { style: { borderTopColor: '#fff' } } }
    const tooltip = {
      value: '`details`',
      disabled: true,
      showDelay: 25,
      hideDelay: 50,
      class: 'custom-tooltip',
      autoHide: false,
      fitContent: false,
      id: 'stable-tooltip',
      escape: true,
      pt
    }
    const rendered = renderTooltipBindingValue(tooltip)

    expect(rendered).toMatchObject({
      disabled: true,
      showDelay: 25,
      hideDelay: 50,
      class: 'custom-tooltip',
      autoHide: false,
      fitContent: false,
      id: 'stable-tooltip',
      pt,
      escape: false
    })
    expect(rendered.value).toContain('<code>details</code>')
    expect(rendered.pt).toBe(pt)
    expect(tooltip.escape).toBe(true)
    expect(tooltip.value).toBe('`details`')

    const wrapper = mountTooltip({ tooltip })
    const target = wrapper.get('button').element
    expect(target.$_ptooltipDisabled).toBe(true)
    expect(target.$_ptooltipShowDelay).toBe(25)
    expect(target.$_ptooltipHideDelay).toBe(50)
    expect(target.$_ptooltipClass).toBe('custom-tooltip')
    expect(target.$_ptooltipAutoHide).toBe(false)
    expect(target.$_ptooltipFitContent).toBe(false)
    expect(target.$_ptooltipIdAttr).toBe('stable-tooltip')
    expect(target._$instances.tooltip.$binding.value.pt).toStrictEqual(pt)
  })

  it('updates rendered Markdown and all object options reactively', async () => {
    const wrapper = mountTooltip({
      tooltip: {
        value: '*first*',
        showDelay: 10,
        disabled: false,
        autoHide: true
      }
    })
    const target = wrapper.get('button').element

    expect(target.$_ptooltipValue).toContain('<em>first</em>')

    await wrapper.setProps({
      tooltip: {
        value: '$x^2$',
        showDelay: 40,
        disabled: true,
        autoHide: false
      }
    })

    expect(target.$_ptooltipValue).toContain('class="katex"')
    expect(target.$_ptooltipShowDelay).toBe(40)
    expect(target.$_ptooltipDisabled).toBe(true)
    expect(target.$_ptooltipAutoHide).toBe(false)
  })

  it('inserts rendered diagnostics without treating their HTML as markup', async () => {
    const diagnostic = '<img src=x onerror="alert(1)">\nvalidation failed'
    const wrapper = mountTooltip({
      tooltip: {
        value: markdownCodeBlock(diagnostic),
        autoHide: false
      }
    })

    await wrapper.get('button').trigger('focus')
    await vi.waitFor(() => {
      expect(document.body.querySelector('.p-tooltip-text')).not.toBeNull()
    })

    const tooltip = document.body.querySelector('.p-tooltip-text')
    expect(tooltip.querySelector('pre code')?.textContent).toBe(`${diagnostic}\n`)
    expect(tooltip.querySelector('img')).toBeNull()

    wrapper.unmount()
    expect(document.body.querySelector('.p-tooltip-text')).toBeNull()
  })
})

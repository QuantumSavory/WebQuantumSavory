import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import RightSidebarResizer from '../../src/components/RightSidebarResizer.vue'

const ResizeBoundingStub = defineComponent({
  name: 'ResizeBounding',
  props: {
    width: Number,
    minWidth: Number,
    maxWidth: Number,
    directions: String,
    disabled: Boolean,
    options: Object
  },
  emits: ['update:width', 'drag:end'],
  template: '<div data-testid="resize-stub"><slot /></div>'
})

function mountResizer(extraProps = {}) {
  return mount(RightSidebarResizer, {
    props: {
      width: 320,
      minWidth: 280,
      maxWidth: 800,
      ...extraProps
    },
    slots: {
      default: '<div data-testid="sidebar-content">Sidebar content</div>'
    },
    global: {
      stubs: {
        ResizeBounding: ResizeBoundingStub
      }
    }
  })
}

describe('RightSidebarResizer', () => {
  it('uses only the left resize boundary and forwards clamped pointer widths', async () => {
    const wrapper = mountResizer()
    const resizeBounding = wrapper.getComponent(ResizeBoundingStub)

    expect(resizeBounding.props('directions')).toBe('l')
    expect(resizeBounding.props('disabled')).toBe(false)
    expect(resizeBounding.props('options')).toMatchObject({
      activeAreaWidth: 12,
      position: 'internal',
      cursor: { horizontal: 'ew-resize' },
      knob: { show: false }
    })
    expect(wrapper.get('[data-testid="sidebar-content"]').text()).toBe('Sidebar content')

    resizeBounding.vm.$emit('update:width', 900)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:width')).toEqual([[800]])
  })

  it('offers an accessible keyboard separator for resizing', async () => {
    const wrapper = mountResizer()
    const target = wrapper.get('[data-testid="right-sidebar-width-resize-target"]')

    expect(target.attributes('role')).toBe('separator')
    expect(target.attributes('aria-orientation')).toBe('vertical')
    expect(target.attributes('aria-valuemin')).toBe('280')
    expect(target.attributes('aria-valuemax')).toBe('800')
    expect(target.attributes('aria-valuenow')).toBe('320')

    await target.trigger('keydown', { key: 'ArrowRight' })
    await target.trigger('keydown', { key: 'Home' })
    await target.trigger('keydown', { key: 'End' })

    expect(wrapper.emitted('update:width')).toEqual([[336], [280], [800]])
    expect(wrapper.emitted('resize-end')).toHaveLength(3)
  })

  it('removes pointer and keyboard resizing while disabled', () => {
    const wrapper = mountResizer({ disabled: true })

    expect(wrapper.getComponent(ResizeBoundingStub).props('disabled')).toBe(true)
    expect(wrapper.find('[data-testid="right-sidebar-width-resize-target"]').exists()).toBe(false)
  })
})

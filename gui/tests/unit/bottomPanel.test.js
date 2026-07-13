import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import BottomPanel from '../../src/components/panels/BottomPanel.vue'

const ResizeBoundingStub = defineComponent({
  name: 'ResizeBounding',
  props: {
    width: Number,
    height: Number,
    minWidth: Number,
    maxWidth: Number,
    minHeight: Number,
    maxHeight: Number
  },
  template: `
    <div
      data-testid="resize-stub"
      :data-width="width"
      :data-height="height"
      :data-max-width="maxWidth"
      :data-max-height="maxHeight"
    ><slot /></div>
  `
})

const BasePanelStub = defineComponent({
  name: 'BasePanel',
  template: '<section><slot name="content" /></section>'
})

function mountPanel(availableBounds) {
  return mount(BottomPanel, {
    props: {
      projectData: {
        name: 'Bounds Test',
        description: '',
        variables: [],
        net: { nodes: [], edges: [], protocols: [] }
      },
      variables: [],
      exportScriptPayload: { name: 'Bounds Test', net: {} },
      availableBounds
    },
    global: {
      stubs: {
        ResizeBounding: ResizeBoundingStub,
        BasePanel: BasePanelStub,
        DescriptionPanel: true,
        ExportScriptPanel: true,
        LayoutToolsPanel: true,
        LogsPanel: true,
        StatesZooPanel: true,
        VariablesPanel: true
      }
    }
  })
}

describe('BottomPanel bounds contract', () => {
  beforeAll(() => {
    const values = new Map()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: key => values.has(key) ? values.get(key) : null,
        removeItem: key => values.delete(key),
        setItem: (key, value) => values.set(key, String(value))
      }
    })
  })

  beforeEach(() => localStorage.clear())

  it('clamps exclusively against supplied viewport bounds without shell elements', async () => {
    const wrapper = mountPanel({ left: 50, right: 760, top: 50, bottom: 800 })
    const resizer = wrapper.get('[data-testid="resize-stub"]')

    expect(document.querySelector('.topbar')).toBeNull()
    expect(document.querySelector('.sidebar-right')).toBeNull()
    expect(resizer.attributes('data-width')).toBe('710')
    expect(resizer.attributes('data-height')).toBe('180')
    expect(resizer.attributes('data-max-width')).toBe('710')
    expect(resizer.attributes('data-max-height')).toBe('750')

    await wrapper.setProps({
      availableBounds: { left: 50, right: 650, top: 100, bottom: 600 }
    })
    await nextTick()

    expect(resizer.attributes('data-width')).toBe('600')
    expect(resizer.attributes('data-max-width')).toBe('600')
    expect(resizer.attributes('data-max-height')).toBe('500')
    expect(JSON.parse(localStorage.getItem('bottomPanel_size'))).toEqual({
      width: 600,
      height: 180
    })
  })
})

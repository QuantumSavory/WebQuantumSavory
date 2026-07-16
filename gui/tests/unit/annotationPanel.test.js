import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AnnotationPanel from '../../src/components/panels/AnnotationPanel.vue'
import MarkdownEditor from '../../src/components/ui/MarkdownEditor.vue'

function annotation(overrides = {}) {
  return {
    id: 'annotation_selected',
    markdown: 'Initial note',
    bounds: { west: -2, south: -1, east: 2, north: 1 },
    backgroundColor: '#ffffff',
    borderColor: '#334155',
    area: null,
    ...overrides,
  }
}

describe('AnnotationPanel', () => {
  it('shows the Markdown editor first and mutates content and colors immediately', async () => {
    const selected = annotation()
    const wrapper = mount(AnnotationPanel, {
      props: { annotation: selected },
    })
    const content = wrapper.get('.annotation-panel-content')
    const editor = wrapper.getComponent(MarkdownEditor)

    expect(content.element.firstElementChild).toBe(editor.element)
    expect(editor.props()).toMatchObject({
      modelValue: 'Initial note',
      editorLabel: 'Annotation content in Markdown',
      editButtonLabel: 'Edit annotation content',
      saveButtonLabel: 'Save annotation content',
      cancelButtonLabel: 'Cancel annotation editing',
      emptyText: 'No annotation content yet.',
    })

    editor.vm.$emit('update:modelValue', 'Updated **note**')
    expect(selected.markdown).toBe('Updated **note**')

    const background = wrapper.get('input[type="color"][value="#ffffff"]')
    const border = wrapper.get('input[type="color"][value="#334155"]')
    await background.setValue('#abcdef')
    await border.setValue('#123456')
    expect(selected.backgroundColor).toBe('#abcdef')
    expect(selected.borderColor).toBe('#123456')
  })

  it('attaches and detaches an area through the geometry helpers', async () => {
    const selected = annotation()
    const wrapper = mount(AnnotationPanel, {
      props: { annotation: selected },
    })
    const checkbox = wrapper.get('input[type="checkbox"]')

    expect(checkbox.attributes('aria-describedby')).toBeTruthy()
    expect(wrapper.get(`#${checkbox.attributes('aria-describedby')}`).text())
      .toContain('connected along an annotation edge')

    await checkbox.setValue(true)
    expect(selected.area).toEqual({ freeCorner: [6, 3] })
    expect(checkbox.element.checked).toBe(true)

    await checkbox.setValue(false)
    expect(selected.area).toBeNull()
  })

  it('emits the selected annotation deletion and collapsed-panel contract', async () => {
    const selected = annotation()
    const wrapper = mount(AnnotationPanel, {
      props: { annotation: selected },
    })

    await wrapper.get('[aria-label="Delete selected annotation"]').trigger('click')
    expect(wrapper.emitted('delete')).toEqual([[selected, 'annotation']])

    await wrapper.get('[role="button"][aria-expanded="true"]').trigger('click')
    expect(wrapper.emitted('update:collapsed')).toEqual([[true]])
  })
})

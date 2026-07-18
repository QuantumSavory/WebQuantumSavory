import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import MarkdownEditor from '../../src/components/ui/MarkdownEditor.vue'
import {
  EDITOR_DRAFT_REGISTRY_KEY,
  createEditorDraftRegistry,
} from '../../src/composables/editorDraftRegistry'

function createPasteEvent(items) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { items },
  })
  return event
}

describe('MarkdownEditor', () => {
  it('generates unique accessible IDs for independently mounted editors', async () => {
    const Host = defineComponent({
      components: { MarkdownEditor },
      template: `
        <div>
          <MarkdownEditor editor-label="First note" placeholder="First placeholder" />
          <MarkdownEditor editor-label="Second note" placeholder="Second placeholder" />
        </div>
      `,
    })
    const wrapper = mount(Host)

    const editButtons = wrapper.findAll('[aria-label="Edit Markdown content"]')
    await editButtons[0].trigger('click')
    await editButtons[1].trigger('click')

    const textareas = wrapper.findAll('textarea')
    expect(textareas).toHaveLength(2)
    expect(textareas[0].attributes('id')).not.toBe(textareas[1].attributes('id'))
    expect(textareas.map(textarea => textarea.attributes('placeholder'))).toEqual([
      'First placeholder',
      'Second placeholder',
    ])

    for (const [index, label] of ['First note', 'Second note'].entries()) {
      const textareaId = textareas[index].attributes('id')
      const helpId = textareas[index].attributes('aria-describedby')
      expect(wrapper.get(`label[for="${textareaId}"]`).text()).toBe(label)
      expect(wrapper.get(`#${helpId}`).exists()).toBe(true)
    }
  })

  it('renders safe Markdown, KaTeX, and allowlisted data images', () => {
    const wrapper = mount(MarkdownEditor, {
      props: {
        modelValue: [
          '# Note',
          '$E = mc^2$',
          '![Pixel](data:image/png;base64,AAEC)',
          '<script>alert(1)</script>',
        ].join('\n\n'),
      },
    })

    const rendered = wrapper.get('[data-testid="markdown-rendered"]')
    expect(rendered.get('h1').text()).toBe('Note')
    expect(rendered.find('.katex').exists()).toBe(true)
    expect(rendered.get('img').attributes('src')).toBe('data:image/png;base64,AAEC')
    expect(rendered.find('script').exists()).toBe(false)
    expect(rendered.text()).toContain('<script>alert(1)</script>')
  })

  it('supports configurable empty text and edit, save, and cancel labels', async () => {
    const wrapper = mount(MarkdownEditor, {
      props: {
        modelValue: '',
        emptyText: 'Nothing written.',
        editButtonLabel: 'Edit note',
        saveButtonLabel: 'Save note',
        cancelButtonLabel: 'Cancel note editing',
      },
    })

    expect(wrapper.get('.markdown-empty').text()).toBe('Nothing written.')
    await wrapper.get('[aria-label="Edit note"]').trigger('click')
    await wrapper.get('textarea').setValue('Discarded')
    await wrapper.get('[aria-label="Cancel note editing"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.get('[aria-label="Edit note"]').trigger('click')
    await wrapper.get('textarea').setValue('Saved')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('update:modelValue')).toEqual([['Saved']])
  })

  it('embeds pasted images at the active textarea selection', async () => {
    const wrapper = mount(MarkdownEditor, {
      props: { modelValue: 'Before selected after' },
    })

    await wrapper.get('[aria-label="Edit Markdown content"]').trigger('click')
    const textarea = wrapper.get('textarea')
    textarea.element.setSelectionRange(7, 15)

    const image = new File([new Uint8Array([0, 1, 2])], 'pixel.png', { type: 'image/png' })
    const pasteEvent = createPasteEvent([{
      kind: 'file',
      type: 'image/png',
      getAsFile: vi.fn(() => image),
    }])
    textarea.element.dispatchEvent(pasteEvent)

    expect(pasteEvent.defaultPrevented).toBe(true)
    await vi.waitFor(() => {
      expect(textarea.element.value)
        .toBe('Before ![Pasted image](data:image/png;base64,AAEC) after')
    })
  })

  it('flushes an open draft through the registered durable commit callback', async () => {
    const registry = createEditorDraftRegistry()
    const wrapper = mount(MarkdownEditor, {
      props: { modelValue: 'Before' },
      global: {
        provide: { [EDITOR_DRAFT_REGISTRY_KEY]: registry },
      },
    })
    await wrapper.get('[aria-label="Edit Markdown content"]').trigger('click')
    await wrapper.get('textarea').setValue('After')

    const flushing = registry.flushAll()
    const [, afterCommit] = wrapper.emitted('update:modelValue').at(-1)
    afterCommit()

    await expect(flushing).resolves.toEqual({ valid: true })
    expect(wrapper.find('textarea').exists()).toBe(false)
  })
})

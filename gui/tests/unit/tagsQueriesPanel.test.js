import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TagsQueriesPanel from '../../src/components/tags/TagsQueriesPanel.vue'
import { api } from '../../src/utils/ApiConnector.js'

const wireCatalog = {
  named_tags: [{
    type_id: 'QuantumSavory.PriorityTag',
    display_name: 'PriorityTag',
    doc: 'Priority tag',
    fields: [{ name: 'priority', type: 'Int64', doc: '', position: 1 }]
  }],
  general_signatures: [],
  allowed_data_types: [],
  unsafe_evaluation: false
}

const projectData = {
  name: 'Explorer Test',
  net: {
    nodes: [{
      id: 'node-external',
      name: 'Alice',
      data: { slots: [{ id: 'slot-external', type: 'Qubit' }] }
    }],
    edges: [],
    protocols: []
  }
}

const ConstructorStub = defineComponent({
  props: { query: Boolean, actionLabel: String },
  emits: ['submit'],
  template: `
    <button
      type="button"
      :data-testid="query ? 'query-constructor-submit' : 'tag-constructor-submit'"
      @click="$emit('submit', query
        ? { kind: 'named', type_id: 'QuantumSavory.PriorityTag', fields: { priority: { kind: 'wildcard' } } }
        : { kind: 'named', type_id: 'QuantumSavory.PriorityTag', fields: { priority: 2 } })"
    >{{ actionLabel }}</button>
  `
})

function mountPanel(extraProps = {}) {
  return mount(TagsQueriesPanel, {
    props: {
      active: true,
      enabled: true,
      projectName: 'Explorer Test',
      projectData,
      ...extraProps
    },
    global: {
      stubs: { TagConstructor: ConstructorStub }
    }
  })
}

describe('TagsQueriesPanel orchestration', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists, attaches, deletes, and refreshes target-specific tags without polling', async () => {
    vi.spyOn(api, 'fetchTagTypes').mockResolvedValue(wireCatalog)
    const list = vi.spyOn(api, 'listTags').mockResolvedValue({
      success: true,
      entries: [{
        tag_id: 'tag-1',
        kind: 'named',
        type_id: 'QuantumSavory.PriorityTag',
        display_name: 'PriorityTag',
        fields: [{ name: 'priority', type: 'Int64', value: 2, position: 1 }],
        rendered: 'Tag(PriorityTag(2))',
        slot_id: 'slot-external'
      }]
    })
    const attach = vi.spyOn(api, 'attachTag').mockResolvedValue({ success: true })
    const remove = vi.spyOn(api, 'deleteTag').mockResolvedValue({ success: true })
    const wrapper = mountPanel()
    await flushPromises()

    expect(list).toHaveBeenCalledWith('Explorer Test', expect.objectContaining({
      kind: 'register',
      node_id: 'node-external',
      destination_slot_id: 'slot-external'
    }), expect.any(Object))
    expect(wrapper.text()).toContain('PriorityTag')

    await wrapper.get('[data-testid="tag-constructor-submit"]').trigger('click')
    await flushPromises()
    expect(attach).toHaveBeenCalledWith(
      'Explorer Test',
      expect.objectContaining({ destination_slot_id: 'slot-external' }),
      expect.objectContaining({ kind: 'named' }),
      expect.any(Object)
    )

    await wrapper.get('[aria-label="Delete tag tag-1"]').trigger('click')
    await flushPromises()
    expect(remove).toHaveBeenCalledWith(
      'Explorer Test',
      expect.objectContaining({ kind: 'register' }),
      'tag-1',
      expect.any(Object)
    )

    const beforeRefresh = list.mock.calls.length
    await wrapper.get('.tag-refresh-button').trigger('click')
    await flushPromises()
    expect(list.mock.calls.length).toBeGreaterThan(beforeRefresh)

    list.mockRejectedValueOnce(new Error('Message list failed'))
    await wrapper.get('[aria-label="Tag target kind"]').setValue('message_buffer')
    await flushPromises()
    expect(wrapper.find('[aria-label="Delete tag tag-1"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('PriorityTag')
    expect(wrapper.text()).toContain('Message list failed')
    expect(wrapper.text()).toContain('can be inserted and listed, but not deleted')
  })

  it('lists an empty register even when no destination slot is available', async () => {
    vi.spyOn(api, 'fetchTagTypes').mockResolvedValue(wireCatalog)
    const list = vi.spyOn(api, 'listTags').mockResolvedValue({ success: true, entries: [] })
    const wrapper = mountPanel({
      projectData: {
        ...projectData,
        net: {
          ...projectData.net,
          nodes: [{ id: 'node-empty', name: 'Empty', data: { slots: [] } }]
        }
      }
    })
    await flushPromises()

    expect(list).toHaveBeenCalledWith(
      'Explorer Test',
      expect.objectContaining({ kind: 'register', node_id: 'node-empty' }),
      expect.any(Object)
    )
    expect(wrapper.get('.tag-refresh-button').attributes()).not.toHaveProperty('disabled')
  })

  it('supports accessible inner tab navigation, non-consuming queries, and lifecycle reset', async () => {
    vi.spyOn(api, 'fetchTagTypes').mockResolvedValue(wireCatalog)
    const list = vi.spyOn(api, 'listTags').mockResolvedValue({ success: true, entries: [] })
    const query = vi.spyOn(api, 'queryTags').mockResolvedValue({
      success: true,
      entries: [{
        tag_id: 'query-result',
        kind: 'named',
        type_id: 'QuantumSavory.PriorityTag',
        display_name: 'PriorityTag',
        fields: [{ name: 'priority', type: 'Int64', value: 3, position: 1 }],
        rendered: 'Tag(PriorityTag(3))'
      }]
    })
    const wrapper = mountPanel()
    await flushPromises()

    const tagsTab = wrapper.get('#tag-explorer-tags-tab')
    await tagsTab.trigger('keydown', { key: 'ArrowRight' })
    const queriesTab = wrapper.get('#tag-explorer-queries-tab')
    expect(queriesTab.attributes('aria-selected')).toBe('true')
    expect(wrapper.get('#tag-explorer-queries-panel').isVisible()).toBe(true)

    await wrapper.get('[data-testid="query-constructor-submit"]').trigger('click')
    await flushPromises()
    expect(query).toHaveBeenCalledWith(
      'Explorer Test',
      expect.objectContaining({ kind: 'register', node_id: 'node-external' }),
      expect.objectContaining({ fields: { priority: { kind: 'wildcard' } } }),
      expect.any(Object)
    )
    expect(wrapper.text()).toContain('Queries return all matches without consuming them')
    expect(wrapper.text()).toContain('PriorityTag')

    await wrapper.setProps({ enabled: false })
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Parse a network')

    await wrapper.setProps({ enabled: true, projectName: 'New Project' })
    await flushPromises()
    expect(wrapper.get('#tag-explorer-tags-tab').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('[aria-label="Tag target kind"]').element.value).toBe('register')
    expect(list).toHaveBeenCalledWith(
      'New Project',
      expect.objectContaining({ node_id: 'node-external' }),
      expect.any(Object)
    )
  })
})

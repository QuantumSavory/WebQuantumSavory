import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TagConstructor from '../../src/components/tags/TagConstructor.vue'
import TagResultsList from '../../src/components/tags/TagResultsList.vue'
import TagTargetSelector from '../../src/components/tags/TagTargetSelector.vue'
import { normalizeTagCatalog } from '../../src/utils/tagExplorer.js'

const catalog = normalizeTagCatalog({
  named_tags: [{
    type_id: 'QuantumSavory.PriorityTag',
    display_name: 'PriorityTag',
    doc: 'Documents the priority.',
    fields: [
      { name: 'priority', type: 'Int64', doc: 'Priority value' },
      { name: 'owner', type: 'Symbol', doc: 'Owner symbol' }
    ]
  }],
  general_signatures: [
    { signature_id: 'symbol-empty', head_type: 'Symbol', display_name: 'Symbol tag', fields: [] },
    {
      signature_id: 'symbol-int',
      head_type: 'Symbol',
      display_name: 'Symbol tag',
      fields: [{ name: 'field_1', type: 'Int64' }]
    },
    {
      signature_id: 'symbol-float',
      head_type: 'Symbol',
      display_name: 'Symbol tag',
      fields: [{ name: 'field_1', type: 'Float64' }]
    }
  ],
  allowed_data_types: [{ type_id: 'Core.Int64', display_name: 'Int64' }],
  unsafe_evaluation: false
})

const OptionHelpStub = defineComponent({
  props: ['label', 'text'],
  template: '<button type="button" class="help-stub" :aria-label="label" :title="text" />'
})

const CodeEditorStub = defineComponent({
  props: ['modelValue', 'readOnly'],
  emits: ['update:modelValue', 'validate'],
  template: '<textarea :value="modelValue" :readonly="readOnly" @input="$emit(\'update:modelValue\', $event.target.value)" />'
})

function mountConstructor(props = {}) {
  return mount(TagConstructor, {
    props: {
      catalog,
      previewer: vi.fn(async () => ({ rendered: 'Tag(PriorityTag(2, :alice))' })),
      ...props
    },
    global: {
      stubs: {
        OptionHelpTooltip: OptionHelpStub,
        CodeEditorWithSymbols: CodeEditorStub
      }
    }
  })
}

async function chooseOption(wrapper, text) {
  await wrapper.get('[role="combobox"]').trigger('focus')
  const option = wrapper.findAll('.tag-option').find(candidate => candidate.text().includes(text))
  expect(option).toBeTruthy()
  await option.trigger('mousedown')
}

describe('tag constructor components', () => {
  afterEach(() => vi.useRealTimers())

  it('filters grouped metadata, styles named choices, shows docs, and previews complete tags', async () => {
    vi.useFakeTimers()
    const previewer = vi.fn(async () => ({ rendered: 'Tag(PriorityTag(2, :alice))' }))
    const wrapper = mountConstructor({ previewer })

    await wrapper.get('[role="combobox"]').setValue('Priority')
    expect(wrapper.findAll('.tag-option-group').map(group => group.text())).toEqual(['Named tags'])
    await chooseOption(wrapper, 'PriorityTag')

    expect(wrapper.get('[role="combobox"]').classes()).toContain('named-tag-selection')
    expect(wrapper.get('.help-stub').attributes('title')).toBe('Documents the priority.')
    expect(wrapper.get('[aria-label="Documentation for priority"]').attributes('title'))
      .toBe('Priority value')
    expect(wrapper.get('[aria-label="Documentation for owner"]').attributes('title'))
      .toBe('Owner symbol')
    expect(wrapper.get('[aria-label="priority value"]').attributes('placeholder')).toBe('Int64')
    expect(wrapper.get('[aria-label="owner value"]').attributes('placeholder')).toBe('Symbol')

    await wrapper.get('[aria-label="priority value"]').setValue('2')
    await wrapper.get('[aria-label="owner value"]').setValue('alice')
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()

    expect(previewer).toHaveBeenCalledWith({
      kind: 'named',
      type_id: 'QuantumSavory.PriorityTag',
      fields: { priority: 2, owner: 'alice' }
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(wrapper.get('.tag-preview code').text()).toBe('Tag(PriorityTag(2, :alice))')

    await wrapper.get('button[type="submit"]').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      kind: 'named',
      type_id: 'QuantumSavory.PriorityTag',
      fields: { priority: 2, owner: 'alice' }
    })
  })

  it('offers every prefix-valid next type for a general signature', async () => {
    const wrapper = mountConstructor()
    await chooseOption(wrapper, 'Symbol tag (Symbol)')
    await wrapper.get('[aria-label="General tag Symbol head"]').setValue('priority')

    const nextType = wrapper.get('.add-general-field-row select')
    expect(nextType.findAll('option').map(option => option.text())).toEqual(['Int64', 'Float64'])
    await nextType.setValue('Float64')
    await wrapper.get('.add-general-field').trigger('click')

    expect(wrapper.get('.tag-field-label small').text()).toBe('Float64')
    expect(wrapper.get('[aria-label="field_1 value"]').attributes('type')).toBe('number')
  })

  it('restricts DataType heads to the selected signature metadata', async () => {
    const dataTypeCatalog = normalizeTagCatalog({
      named_tags: [],
      general_signatures: [{
        signature_id: 'datatype-empty',
        head_type: 'DataType',
        fields: [],
        allowed_data_type_ids: ['Core.Int64']
      }],
      allowed_data_types: [
        { type_id: 'Core.Float64', display_name: 'Float64' },
        { type_id: 'Core.Int64', display_name: 'Int64' }
      ]
    })
    const wrapper = mountConstructor({ catalog: dataTypeCatalog })
    await chooseOption(wrapper, 'DataType tag')

    expect(wrapper.get('[aria-label="General tag DataType head"]')
      .findAll('option').map(option => option.element.value)).toEqual(['Core.Int64'])
  })

  it('keeps backend preview failures inline and prevents attachment', async () => {
    vi.useFakeTimers()
    const wrapper = mountConstructor({
      previewer: vi.fn(async () => { throw new Error('Field value is invalid') })
    })
    await chooseOption(wrapper, 'PriorityTag')
    await wrapper.get('[aria-label="priority value"]').setValue('2')
    await wrapper.get('[aria-label="owner value"]').setValue('alice')
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('Field value is invalid')
    expect(wrapper.get('button[type="submit"]').attributes()).toHaveProperty('disabled')
  })

  it('renders wildcard/predicate controls and disables custom predicates from catalog policy', async () => {
    const wrapper = mountConstructor({ query: true, actionLabel: 'Run query' })
    await chooseOption(wrapper, 'PriorityTag')

    const termSelectors = wrapper.findAll('.query-term-kind')
    await termSelectors[0].setValue('wildcard')
    await termSelectors[1].setValue('predicate')

    expect(wrapper.get('.query-term-wildcard').element.value).toBe('wildcard')
    const predicateKind = wrapper.get('[aria-label="Predicate kind for owner"]')
    expect(predicateKind.get('option[value="custom"]').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('.evaluation-guidance').text()).toContain('unsafe evaluation is disabled')
    expect(wrapper.get('[aria-label="Predicate operator for owner"]').findAll('option').map(option => option.text()))
      .toEqual(['<', '>', '≤', '≥', '==', '!='])
  })
})

describe('tag target and results components', () => {
  const nodes = [{
    id: 'node-external',
    name: 'Alice',
    data: { slots: [{ id: 'slot-external', type: 'Qubit' }] }
  }]

  it('emits durable external node/slot IDs and register destinations', async () => {
    const wrapper = mount(TagTargetSelector, {
      props: {
        modelValue: { kind: 'register', node_id: '' },
        nodes,
        allowMessages: true,
        requireDestination: true
      }
    })
    await flushPromises()

    const initialTarget = wrapper.emitted('update:modelValue').at(-1)[0]
    await wrapper.setProps({ modelValue: initialTarget })

    expect(wrapper.props('modelValue')).toEqual({
      kind: 'register',
      node_id: 'node-external',
      destination_slot_id: 'slot-external'
    })
    await wrapper.get('[aria-label="Tag target kind"]').setValue('slot')
    await flushPromises()
    const slotTarget = wrapper.emitted('update:modelValue').at(-1)[0]
    expect(slotTarget).toEqual({
      kind: 'slot',
      node_id: 'node-external',
      slot_id: 'slot-external',
      destination_slot_id: undefined
    })
  })

  it('discloses hidden rendered IDs and only emits deletion when enabled', async () => {
    const entry = {
      id: 'tag-1',
      type_id: 'QuantumSavory.PriorityTag',
      fields: [{ name: 'priority', type: 'Int64', value: 2 }],
      rendered: 'Tag(PriorityTag(2))',
      slotId: 'slot-external'
    }
    const wrapper = mount(TagResultsList, { props: { entries: [entry], deletable: true } })

    expect(wrapper.text()).not.toContain('Tag(PriorityTag(2))')
    await wrapper.get('[aria-label="Show rendered tag details"]').trigger('click')
    expect(wrapper.text()).toContain('Tag(PriorityTag(2))')
    expect(wrapper.text()).toContain('tag-1')
    await wrapper.get('[aria-label="Delete tag tag-1"]').trigger('click')
    expect(wrapper.emitted('delete')?.[0]?.[0]).toEqual(entry)

    await wrapper.setProps({ deletable: false })
    expect(wrapper.find('[aria-label="Delete tag tag-1"]').exists()).toBe(false)
  })
})

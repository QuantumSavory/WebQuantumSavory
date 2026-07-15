import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AutoComplete from 'primevue/autocomplete'
import PrimeVue from 'primevue/config'
import NamedTagTypeAutocomplete from '../../src/components/panels/NamedTagTypeAutocomplete.vue'
import { api } from '../../src/utils/ApiConnector.js'

const TAG_ALPHA = 'Example.Alpha.ReadyTag'
const TAG_BETA = 'Example.Beta.ReadyTag'
const TAG_UNIQUE = 'QuantumSavory.EntanglementCounterpart'

function catalog(namedTags = [{
  type_id: TAG_UNIQUE,
  display_name: 'EntanglementCounterpart',
  doc: 'Counterpart tag.',
  fields: []
}]) {
  return {
    named_tags: namedTags,
    general_signatures: [],
    allowed_data_types: [],
    unsafe_evaluation: false
  }
}

function namedTag(typeId, displayName) {
  return {
    type_id: typeId,
    display_name: displayName,
    doc: `${displayName} documentation.`,
    fields: []
  }
}

const originalConfig = api._config.value
let wrappers = []

function mountControl(props = {}) {
  const wrapper = mount(NamedTagTypeAutocomplete, {
    props: {
      parameterName: 'tag',
      ...props
    },
    global: {
      plugins: [PrimeVue]
    },
    attachTo: document.body
  })
  wrappers.push(wrapper)
  return wrapper
}

function autocomplete(wrapper) {
  return wrapper.getComponent(AutoComplete)
}

async function suggestions(wrapper, query = '') {
  autocomplete(wrapper).vm.$emit('complete', { query })
  await nextTick()
  return autocomplete(wrapper).props('suggestions')
}

beforeEach(() => {
  api._config.value = {}
})

afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount())
  wrappers = []
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  api._config.value = originalConfig
})

describe('NamedTagTypeAutocomplete', () => {
  it('shows local loading and resolves cached named-tag choices without changing Default', async () => {
    let resolveCatalog
    vi.spyOn(api, 'fetchTagTypes').mockImplementation(() => new Promise(resolve => {
      resolveCatalog = resolve
    }))

    const wrapper = mountControl()
    await nextTick()
    expect(wrapper.attributes('aria-busy')).toBe('true')
    expect(wrapper.get('.named-tag-type-status').text()).toContain('Loading named tag types')

    resolveCatalog(catalog())
    await flushPromises()

    expect(wrapper.attributes('aria-busy')).toBe('false')
    expect(wrapper.find('.named-tag-type-status').exists()).toBe(false)
    expect(wrapper.get('input[role="combobox"]').element.value).toBe('Default')
    expect((await suggestions(wrapper)).map(option => option.label)).toEqual([
      'Default',
      'EntanglementCounterpart'
    ])
    expect(api.fetchTagTypes).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
      force: false
    })
  })

  it('filters readable choices while persisting only fully qualified IDs', async () => {
    vi.spyOn(api, 'fetchTagTypes').mockResolvedValue(catalog())
    const wrapper = mountControl()
    await flushPromises()

    const filtered = await suggestions(wrapper, 'counterpart')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toMatchObject({
      label: 'EntanglementCounterpart',
      value: TAG_UNIQUE
    })

    autocomplete(wrapper).vm.$emit('option-select', { value: filtered[0] })
    await nextTick()
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([TAG_UNIQUE])

    expect((await suggestions(wrapper, 'quantumsavory.entanglement')).map(option => option.value))
      .toEqual([TAG_UNIQUE])
  })

  it('qualifies duplicate short names and keeps each exact ID distinct', async () => {
    vi.spyOn(api, 'fetchTagTypes').mockResolvedValue(catalog([
      namedTag(TAG_ALPHA, 'ReadyTag'),
      namedTag(TAG_BETA, 'ReadyTag')
    ]))
    const wrapper = mountControl({ modelValue: TAG_BETA })
    await flushPromises()

    const choices = (await suggestions(wrapper, 'readytag')).filter(option => option.kind === 'named')
    expect(choices.map(option => option.label)).toEqual([
      `ReadyTag — ${TAG_ALPHA}`,
      `ReadyTag — ${TAG_BETA}`
    ])
    expect(wrapper.get('input[role="combobox"]').element.value)
      .toBe(`ReadyTag — ${TAG_BETA}`)

    autocomplete(wrapper).vm.$emit('option-select', { value: choices[0] })
    await nextTick()
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([TAG_ALPHA])
  })

  it('disambiguates concrete parametric tags by their complete qualified IDs', async () => {
    const intTag = 'Example.ReadyTag{Core.Int64}'
    const floatTag = 'Example.ReadyTag{Core.Float64}'
    vi.spyOn(api, 'fetchTagTypes').mockResolvedValue(catalog([
      namedTag(intTag, 'ReadyTag'),
      namedTag(floatTag, 'ReadyTag')
    ]))
    const wrapper = mountControl({ modelValue: floatTag })
    await flushPromises()

    const choices = (await suggestions(wrapper, 'readytag')).filter(option => option.kind === 'named')
    expect(choices.map(option => option.label)).toEqual([
      `ReadyTag — ${intTag}`,
      `ReadyTag — ${floatTag}`
    ])
    expect(wrapper.get('input[role="combobox"]').element.value)
      .toBe(`ReadyTag — ${floatTag}`)
  })

  it('offers Default and nullable Nothing as semantic values', async () => {
    vi.spyOn(api, 'fetchTagTypes').mockResolvedValue(catalog())
    const wrapper = mountControl({ nullable: true })
    await flushPromises()

    const choices = await suggestions(wrapper)
    expect(choices.slice(0, 2).map(option => option.label)).toEqual(['Default', 'Nothing'])

    autocomplete(wrapper).vm.$emit('option-select', { value: choices[1] })
    await nextTick()
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['nothing'])

    autocomplete(wrapper).vm.$emit('option-select', { value: choices[0] })
    await nextTick()
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([null])

    await wrapper.setProps({ nullable: false })
    expect((await suggestions(wrapper)).map(option => option.label)).not.toContain('Nothing')
  })

  it('force-clears forged text to the constructor default', async () => {
    vi.spyOn(api, 'fetchTagTypes').mockResolvedValue(catalog())
    const wrapper = mountControl({ modelValue: TAG_UNIQUE })
    await flushPromises()

    const input = wrapper.get('input[role="combobox"]')
    await input.setValue('Forged.ShortName')
    await input.trigger('change')
    await nextTick()

    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([null])
  })

  it('keeps an unavailable saved ID visible until the user replaces it', async () => {
    vi.spyOn(api, 'fetchTagTypes').mockResolvedValue(catalog())
    const wrapper = mountControl({
      modelValue: 'Legacy.UnknownTag',
      ariaDescribedby: 'external-tag-help'
    })
    await flushPromises()

    expect(wrapper.get('input[role="combobox"]').element.value).toBe('Legacy.UnknownTag')
    const alert = wrapper.get('[role="alert"]')
    const input = wrapper.get('input[role="combobox"]')
    expect(alert.text()).toContain('saved named tag type is unavailable')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby').split(' ')).toEqual([
      'external-tag-help',
      alert.attributes('id')
    ])
  })

  it('reports catalog failures locally and retries with a forced refresh', async () => {
    const fetchTypes = vi.spyOn(api, 'fetchTagTypes')
      .mockRejectedValueOnce(new Error('Catalog offline'))
      .mockResolvedValueOnce(catalog())
    const wrapper = mountControl({ nullable: true })
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Catalog offline')
    expect(wrapper.get('input[role="combobox"]').attributes('aria-describedby'))
      .toContain(wrapper.get('[role="alert"]').attributes('id'))
    expect((await suggestions(wrapper)).map(option => option.label)).toEqual([
      'Default',
      'Nothing'
    ])

    await wrapper.get('[aria-label="Retry loading named tag types"]').trigger('click')
    await flushPromises()

    expect(fetchTypes).toHaveBeenCalledTimes(2)
    expect(fetchTypes.mock.calls[1][0]).toEqual({
      signal: expect.any(AbortSignal),
      force: true
    })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect((await suggestions(wrapper)).map(option => option.label))
      .toContain('EntanglementCounterpart')
  })

  it('honors edit locks and aborts an outstanding catalog request on disposal', async () => {
    let requestSignal
    vi.spyOn(api, 'fetchTagTypes').mockImplementation(({ signal }) => {
      requestSignal = signal
      return new Promise(() => {})
    })
    const wrapper = mountControl({ disabled: true })

    expect(wrapper.get('input[role="combobox"]').attributes('disabled')).toBeDefined()
    autocomplete(wrapper).vm.$emit('option-select', { value: DEFAULT_OPTION_FOR_TEST })
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    wrapper.unmount()
    wrappers = wrappers.filter(candidate => candidate !== wrapper)
    expect(requestSignal.aborted).toBe(true)
  })
})

const DEFAULT_OPTION_FOR_TEST = {
  key: 'special:default',
  kind: 'default',
  value: null,
  name: 'Default',
  label: 'Default',
  searchText: 'default'
}

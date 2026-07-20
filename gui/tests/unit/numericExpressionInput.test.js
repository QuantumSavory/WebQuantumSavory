import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import NumericExpressionInput from '../../src/components/panels/NumericExpressionInput.vue'
import { api } from '../../src/utils/ApiConnector.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NumericExpressionInput', () => {
  it('keeps incomplete source local and commits the exact tag only after validation', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    const validate = vi.spyOn(api, 'validateNumericExpression').mockResolvedValue({
      success: true,
      results: {
        deferred: false,
        target_type: 'Float64',
        value: '2.5e-7',
      },
    })
    const parameter = { name: 'timeout', value: null }
    const context = {
      node_names: ['Alice', 'Bob'],
      length: 100,
      delay: 5e-7,
      refractive_index: 1.5,
      node_a: 1,
      node_b: 2,
    }
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter,
        targetType: 'Float64',
        placement: 'edge',
        context,
      },
    })

    expect(wrapper.get('.custom-function-context-trigger').text())
      .toContain('Numeric expression context')
    await wrapper.get('[data-testid="numeric-expression-source"]').setValue('delay / 2')
    expect(parameter.value).toBeNull()

    await wrapper.get('[aria-label="Validate timeout expression"]').trigger('click')
    await flushPromises()

    expect(validate).toHaveBeenCalledWith(
      'delay / 2',
      'Float64',
      'edge',
      expect.objectContaining({ context }),
    )
    expect(parameter.value).toEqual({
      kind: 'numeric_expression',
      source: 'delay / 2',
    })
    expect(wrapper.get('[data-testid="numeric-expression-result"]').text())
      .toContain('2.5e-7')
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('omits template context and renders deferred assignment status', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    const validate = vi.spyOn(api, 'validateNumericExpression').mockResolvedValue({
      success: true,
      results: { deferred: true, target_type: 'Int64' },
    })
    const parameter = {
      name: 'rounds',
      value: { kind: 'numeric_expression', source: 'self + 1' },
    }
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter,
        targetType: 'Int64',
        placement: 'node',
        context: { node_names: ['Alice'], self: 1 },
        template: true,
      },
    })

    await wrapper.get('[aria-label="Validate rounds expression"]').trigger('click')
    await flushPromises()

    expect(validate).toHaveBeenCalledWith(
      'self + 1',
      'Int64',
      'node',
      expect.objectContaining({ context: undefined }),
    )
    expect(wrapper.get('[data-testid="numeric-expression-deferred"]').text())
      .toBe('Evaluated when assigned.')
  })

  it('enforces evaluated metadata bounds before committing', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    vi.spyOn(api, 'validateNumericExpression').mockResolvedValue({
      success: true,
      results: { deferred: false, target_type: 'Float64', value: '2.0' },
    })
    const parameter = { name: 'probability', value: null }
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter,
        targetType: 'Float64',
        placement: 'floating',
        maximum: 1,
      },
    })

    await wrapper.get('[data-testid="numeric-expression-source"]').setValue('2')
    await wrapper.get('[aria-label="Validate probability expression"]').trigger('click')
    await flushPromises()

    expect(parameter.value).toBeNull()
    expect(wrapper.get('[data-testid="numeric-expression-error"]').text())
      .toContain('at most 1')
    expect(wrapper.emitted('commit')).toBeUndefined()
  })

  it('keeps a saved source viewable while unsafe evaluation is disabled', () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(false)
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter: {
          name: 'delay',
          value: { kind: 'numeric_expression', source: 'delay / 2' },
        },
        targetType: 'Float64',
      },
    })

    expect(wrapper.get('[data-testid="numeric-expression-source"]').element.value)
      .toBe('delay / 2')
    expect(wrapper.get('[data-testid="numeric-expression-source"]').attributes('readonly'))
      .toBeDefined()
    expect(wrapper.get('[data-testid="numeric-expression-disabled"]').exists()).toBe(true)
  })
})

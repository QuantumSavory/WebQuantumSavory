import { describe, expect, it } from 'vitest'

import { parseNumericParameterValue } from '../../src/utils/parameterTypes'

describe('numeric parameter parsing', () => {
  it.each([
    ['Float64', null, {}, { valid: true, empty: true, value: null }],
    ['Float64', '', {}, { valid: true, empty: true, value: null }],
    ['Float64', '0.25', {}, { valid: true, empty: false, value: 0.25 }],
    ['Int64', '3', {}, { valid: true, empty: false, value: 3 }],
    ['Float64', '0', { min: 0 }, { valid: true, empty: false, value: 0 }],
    ['Float64', '1', { max: 1 }, { valid: true, empty: false, value: 1 }],
  ])('normalizes valid %s value %#', (type, rawValue, parameter, expected) => {
    expect(parseNumericParameterValue(type, rawValue, parameter)).toEqual(expected)
  })

  it.each([
    ['Int', 1.5, {}],
    ['Int64', '1.5', {}],
    ['Float64', Number.NaN, {}],
    ['Float64', Number.POSITIVE_INFINITY, {}],
    ['Float64', -0.1, { min: 0 }],
    ['Float64', 1.1, { max: 1 }],
  ])('rejects invalid %s value %#', (type, rawValue, parameter) => {
    expect(parseNumericParameterValue(type, rawValue, parameter)).toEqual({
      valid: false,
      empty: false,
      value: null,
    })
  })
})

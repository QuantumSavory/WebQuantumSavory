export const KNOWN_PARAMETER_TYPES = [
  'Float64',
  'Int64',
  'Bool',
  'String',
  'Function',
  'Nothing',
  'Symbolic',
  'Vector{Int64}',
  'Vector{Float64}',
  'Lambda',
  'SymbolicUtils.Symbolic',
  'default'
]

export const VARIABLE_PARAMETER_TYPES = [
  'default',
  'Int64',
  'Float64',
  'Bool',
  'String',
  'Function',
  'Lambda',
  'Symbolic',
  'QuantumSavory.Wildcard',
  'Vector{Int64}',
  'Vector{Float64}',
  'Nothing'
]

const TYPE_OPTION_LABELS = {
  default: 'Default',
  Function: 'Predefined function',
  Lambda: 'Custom function'
}

export function parseJuliaType(inputType) {
  const isUnion = Array.isArray(inputType)
  const declaredTypes = isUnion ? inputType : [inputType]

  if (declaredTypes.includes('Function')) {
    return ['default', ...declaredTypes, 'Lambda']
  }

  return isUnion ? ['default', ...declaredTypes] : inputType
}

export function getTypeOptionLabel(type) {
  return TYPE_OPTION_LABELS[type] || type
}

export function isWildcardType(type) {
  return type === 'Wildcard' || type === 'QuantumSavory.Wildcard'
}

export function isSymbolicType(type) {
  return typeof type === 'string' && (type === 'Symbolic'
    || type === 'SymbolicUtils.Symbolic'
    || type.startsWith('SymbolicUtils.Symbolic{')
    || type === 'QuantumSymbolics.SymQObj'
    || type.startsWith('QuantumSymbolics.SymQObj{'))
}

export function isCodeType(type) {
  return type === 'Lambda' || isSymbolicType(type)
}

export function parameterTypeIsNumber(typeOrParameter) {
  if (typeOrParameter == null) return false

  const originalType = typeof typeOrParameter === 'object'
    ? typeOrParameter.type
    : typeOrParameter
  if (typeof originalType !== 'string') return false

  const lower = originalType.toLowerCase()
  return lower === 'int' || lower === 'int64' || lower.startsWith('float')
}

export function parseNumericParameterValue(type, rawValue, parameter = {}) {
  if (rawValue == null || rawValue === '') {
    return { valid: true, empty: true, value: null }
  }

  const value = Number(rawValue)
  const normalizedType = String(type || '').toLowerCase()
  const minimum = Number(parameter.min)
  const maximum = Number(parameter.max)
  const valid = Number.isFinite(value)
    && (
      (normalizedType !== 'int' && normalizedType !== 'int64')
      || Number.isInteger(value)
    )
    && (!Number.isFinite(minimum) || value >= minimum)
    && (!Number.isFinite(maximum) || value <= maximum)

  return {
    valid,
    empty: false,
    value: valid ? value : null,
  }
}

export function parameterTypeIsKnown(type) {
  return KNOWN_PARAMETER_TYPES.includes(type) || isWildcardType(type) || isSymbolicType(type)
}

/**
 * Whether a variable's concrete type is accepted by a protocol field.
 *
 * Compatibility is directional: a Function field accepts a custom Lambda,
 * while a Lambda-only field does not accept every predefined Function. A
 * default variable is valid for every field because it omits that protocol
 * keyword, just like leaving the field at its protocol default.
 */
export function parameterTypeSupportsVariableType(parameterType, variableType) {
  if (typeof variableType !== 'string' || variableType.length === 0) return false
  if (variableType.toLowerCase() === 'default') return true

  const declaredTypes = Array.isArray(parameterType) ? parameterType : [parameterType]
  return declaredTypes.some(declaredType => {
    if (typeof declaredType !== 'string') return false
    if (declaredType === 'Any') return true
    if (declaredType === 'Function') {
      return variableType === 'Function' || variableType === 'Lambda'
    }
    if (isSymbolicType(declaredType)) return isSymbolicType(variableType)
    if (isWildcardType(declaredType)) return isWildcardType(variableType)
    if (declaredType === 'Int') return variableType === 'Int' || variableType === 'Int64'
    if (declaredType === 'Int64') return variableType === 'Int' || variableType === 'Int64'
    return declaredType === variableType
  })
}

export function unknownParameterTypes(type) {
  if (type == null) return []
  if (Array.isArray(type)) {
    return type.filter(entry => !parameterTypeIsKnown(entry))
  }
  return parameterTypeIsKnown(type) ? [] : [type]
}

export function resetValueForType(parameter, type) {
  delete parameter.error
  delete parameter.latex

  if (type === 'default') {
    parameter.value = null
  } else if (isWildcardType(type)) {
    parameter.value = 'Wildcard'
  } else if (type === 'Bool') {
    parameter.value = false
  } else if (type === 'Function') {
    parameter.value = 'default'
  } else if (type === 'Nothing') {
    parameter.value = 'nothing'
  } else {
    parameter.value = null
  }
}

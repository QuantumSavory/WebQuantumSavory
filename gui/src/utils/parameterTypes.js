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
  return type === 'Symbolic' || type === 'SymbolicUtils.Symbolic'
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

export function parameterTypeIsKnown(type) {
  return KNOWN_PARAMETER_TYPES.includes(type) || isWildcardType(type)
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

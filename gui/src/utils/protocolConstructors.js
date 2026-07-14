function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)

  if (value instanceof Date) return new Date(value.getTime())
  if (value instanceof RegExp) return new RegExp(value.source, value.flags)

  if (value instanceof Map) {
    const clone = new Map()
    seen.set(value, clone)
    value.forEach((item, key) => clone.set(deepClone(key, seen), deepClone(item, seen)))
    return clone
  }

  if (value instanceof Set) {
    const clone = new Set()
    seen.set(value, clone)
    value.forEach(item => clone.add(deepClone(item, seen)))
    return clone
  }

  const clone = Array.isArray(value)
    ? []
    : Object.create(Object.getPrototypeOf(value))
  seen.set(value, clone)

  Reflect.ownKeys(value).forEach(key => {
    if (Array.isArray(value) && key === 'length') return

    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if ('value' in descriptor) descriptor.value = deepClone(descriptor.value, seen)
    Object.defineProperty(clone, key, descriptor)
  })

  return clone
}

export function protocolSimpleName(protocolOrType) {
  const type = typeof protocolOrType === 'string'
    ? protocolOrType
    : protocolOrType?.type
  if (typeof type !== 'string' || !type.trim()) return ''
  return type.split('.').pop()
}

function definitionParameters(definition) {
  if (!isRecord(definition) || typeof definition.type !== 'string' || !definition.type) {
    throw new Error('A runtime protocol definition is required.')
  }
  if (!Array.isArray(definition.parameters)) {
    throw new Error(`Runtime metadata for ${protocolSimpleName(definition)} has no parameter list.`)
  }
  return definition.parameters
}

function parameterFromDefinition(parameter) {
  const name = parameter?.field
  if (typeof name !== 'string' || !name) {
    throw new Error('Runtime protocol metadata contains a parameter without a field name.')
  }

  return {
    name,
    type: deepClone(parameter.type),
    value: deepClone(parameter.defaultValue)
  }
}

/**
 * Build a protocol-constructor draft from runtime metadata. IDs are assigned only
 * when the draft is installed at a concrete node or edge.
 */
export function createProtocolFromDefinition(definition) {
  const parameters = definitionParameters(definition)
  return {
    type: definition.type,
    parameters: parameters.map(parameterFromDefinition)
  }
}

/**
 * Seed a metadata-backed protocol draft from a configured template protocol.
 * Metadata supplies newly introduced fields while the template wins for every
 * field it already configures. Unknown saved fields are retained for lossless
 * cloning and can still be diagnosed by the normal constructor editor.
 */
export function seedProtocolConstructor(definition, templateProtocol = null) {
  const fallback = createProtocolFromDefinition(definition)
  if (!isRecord(templateProtocol)) return fallback

  const expectedName = protocolSimpleName(definition)
  if (protocolSimpleName(templateProtocol) !== expectedName) return fallback

  const source = deepClone(templateProtocol)
  const sourceParameters = Array.isArray(source.parameters) ? source.parameters : []
  const sourceByName = new Map(sourceParameters.map(parameter => [parameter?.name, parameter]))
  const metadataNames = new Set(fallback.parameters.map(parameter => parameter.name))
  const parameters = fallback.parameters.map(parameter => (
    sourceByName.has(parameter.name)
      ? deepClone(sourceByName.get(parameter.name))
      : parameter
  ))

  sourceParameters.forEach(parameter => {
    if (!metadataNames.has(parameter?.name)) parameters.push(deepClone(parameter))
  })

  delete source.id
  return {
    ...source,
    type: definition.type,
    parameters
  }
}

/** Create a fresh, deeply independent installed protocol from a constructor draft. */
export function instantiateProtocolConstructor(constructor, nextId) {
  if (!isRecord(constructor) || typeof constructor.type !== 'string' || !constructor.type) {
    throw new Error('A valid protocol constructor is required.')
  }
  if (!Array.isArray(constructor.parameters)) {
    throw new Error(`The ${protocolSimpleName(constructor)} constructor has no parameter list.`)
  }
  if (typeof nextId !== 'function') throw new Error('A protocol ID generator is required.')

  const protocol = deepClone(constructor)
  protocol.id = nextId('protocol')
  return protocol
}

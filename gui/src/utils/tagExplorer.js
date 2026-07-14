const INTEGER_TYPES = new Set([
  'Int', 'Int8', 'Int16', 'Int32', 'Int64', 'Int128',
  'UInt', 'UInt8', 'UInt16', 'UInt32', 'UInt64', 'UInt128', 'Integer'
])

const FLOAT_TYPES = new Set([
  'Float16', 'Float32', 'Float64', 'AbstractFloat', 'Real', 'Number'
])

function shortTypeName(typeId) {
  const value = String(typeId)
  return value.split('.').pop() || value
}

function requireObject(value, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${context} must be an object`)
  }
  return value
}

function requireArray(source, key, context) {
  if (!Array.isArray(source[key])) {
    throw new TypeError(`${context}.${key} must be an array`)
  }
  return source[key]
}

function requireString(source, key, context) {
  if (typeof source[key] !== 'string') {
    throw new TypeError(`${context}.${key} must be a string`)
  }
  return source[key]
}

function requireBoolean(source, key, context) {
  if (typeof source[key] !== 'boolean') {
    throw new TypeError(`${context}.${key} must be a boolean`)
  }
  return source[key]
}

function requirePositiveInteger(source, key, context) {
  if (!Number.isInteger(source[key]) || source[key] < 1) {
    throw new TypeError(`${context}.${key} must be a positive integer`)
  }
  return source[key]
}

function requireSuccessfulResponse(source, context) {
  if (source.success !== true) {
    throw new TypeError(`${context}.success must be true`)
  }
}

function normalizeStructuredTag(rawTag, context) {
  const tag = requireObject(rawTag, context)
  const kind = requireString(tag, 'kind', context)
  const fields = requireArray(tag, 'fields', context)
  fields.forEach((field, index) => {
    const fieldContext = `${context}.fields[${index}]`
    const source = requireObject(field, fieldContext)
    requireString(source, 'name', fieldContext)
    requireString(source, 'type', fieldContext)
    requirePositiveInteger(source, 'position', fieldContext)
    if (!Object.hasOwn(source, 'value')) {
      throw new TypeError(`${fieldContext}.value is required`)
    }
  })

  if (kind === 'named') {
    requireString(tag, 'type_id', context)
    requireString(tag, 'display_name', context)
  } else if (kind === 'general') {
    const head = requireObject(tag.head, `${context}.head`)
    requireString(head, 'type', `${context}.head`)
    requireString(head, 'value', `${context}.head`)
  } else if (kind !== 'unknown') {
    throw new TypeError(`${context}.kind must be named, general, or unknown`)
  }

  return { ...tag, fields }
}

function normalizeField(field, index, context) {
  const source = requireObject(field, `${context}[${index}]`)
  return {
    ...source,
    name: requireString(source, 'name', `${context}[${index}]`),
    type: requireString(source, 'type', `${context}[${index}]`),
    doc: requireString(source, 'doc', `${context}[${index}]`),
    position: requirePositiveInteger(source, 'position', `${context}[${index}]`)
  }
}

function normalizeNamedDefinition(definition, index) {
  const source = requireObject(definition, `tag catalog named_tags[${index}]`)
  const context = `tag catalog named_tags[${index}]`
  const typeId = requireString(source, 'type_id', context)
  const label = requireString(source, 'display_name', context)
  const fields = requireArray(source, 'fields', context)
    .map((field, fieldIndex) => normalizeField(field, fieldIndex, `${context}.fields`))

  return {
    ...source,
    kind: 'named',
    id: typeId,
    typeId,
    label,
    doc: requireString(source, 'doc', context),
    fields
  }
}

function signatureHeadKind(signature) {
  const headKind = requireString(signature, 'head_type', 'tag catalog general signature')
  if (headKind !== 'Symbol' && headKind !== 'DataType') {
    throw new TypeError('tag catalog general signature.head_type must be Symbol or DataType')
  }
  return headKind
}

function normalizeSignature(signature, index) {
  const source = requireObject(signature, `tag catalog general_signatures[${index}]`)
  const context = `tag catalog general_signatures[${index}]`
  const headKind = signatureHeadKind(source)
  const fields = requireArray(source, 'fields', context)
    .map((field, fieldIndex) => normalizeField(field, fieldIndex, `${context}.fields`))
  const id = requireString(source, 'signature_id', context)
  const baseLabel = requireString(source, 'display_name', context)
  const shape = [headKind, ...fields.map(field => field.type)].join(', ')
  const label = baseLabel.includes(`(${shape})`) ? baseLabel : `${baseLabel} (${shape})`

  return {
    ...source,
    kind: 'general',
    id,
    headKind,
    label,
    doc: '',
    fields,
    allowedDataTypeIds: requireArray(source, 'allowed_data_type_ids', context)
      .map((typeId, typeIndex) => {
        if (typeof typeId !== 'string') {
          throw new TypeError(`${context}.allowed_data_type_ids[${typeIndex}] must be a string`)
        }
        return typeId
      }),
    variadic: requireBoolean(source, 'variadic', context)
  }
}

function normalizeDataType(dataType, index) {
  const source = requireObject(dataType, `tag catalog allowed_data_types[${index}]`)
  const context = `tag catalog allowed_data_types[${index}]`
  const id = requireString(source, 'type_id', context)
  return {
    ...source,
    id,
    label: requireString(source, 'display_name', context)
  }
}

export function emptyTagCatalog() {
  return {
    named: [],
    general: [],
    dataTypes: [],
    unsafeEvaluation: false,
    groups: [
      { id: 'named', label: 'Named tags', options: [] },
      { id: 'general', label: 'General tags', options: [] }
    ]
  }
}

/** Normalize the exact GET /tag_types wire contract for component use. */
export function normalizeTagCatalog(response) {
  const source = requireObject(response, 'tag catalog')
  const named = requireArray(source, 'named_tags', 'tag catalog').map(normalizeNamedDefinition)
  const general = requireArray(source, 'general_signatures', 'tag catalog').map(normalizeSignature)
  const dataTypes = requireArray(source, 'allowed_data_types', 'tag catalog').map(normalizeDataType)
  if (typeof source.unsafe_evaluation !== 'boolean') {
    throw new TypeError('tag catalog.unsafe_evaluation must be a boolean')
  }

  return {
    named,
    general,
    dataTypes,
    unsafeEvaluation: source.unsafe_evaluation,
    groups: [
      { id: 'named', label: 'Named tags', options: named },
      { id: 'general', label: 'General tags', options: general }
    ]
  }
}

export function defaultValueForType(type, dataTypes = []) {
  if (String(type) === 'DataType') return dataTypes[0]?.id ?? ''
  return ''
}

export function createTagDraft(definition, catalog = { dataTypes: [] }, query = false) {
  if (!definition) return null
  const headDataTypes = definition.allowedDataTypeIds?.length
    ? catalog.dataTypes.filter(type => definition.allowedDataTypeIds.includes(type.id))
    : catalog.dataTypes
  const fields = definition.fields.map(field => ({
    ...field,
    value: defaultValueForType(field.type, catalog.dataTypes),
    termKind: query ? 'exact' : undefined,
    operator: '==',
    predicateKind: 'preset',
    source: ''
  }))

  return {
    kind: definition.kind,
    definitionId: definition.id,
    typeId: definition.typeId,
    signatureId: definition.kind === 'general' ? definition.id : undefined,
    headKind: definition.headKind,
    head: definition.kind === 'general'
      ? defaultValueForType(definition.headKind, headDataTypes)
      : undefined,
    fields
  }
}

export function coerceCatalogValue(type, value) {
  const normalizedType = shortTypeName(type).replace(/^Type\{(.+)\}$/, '$1')
  if (INTEGER_TYPES.has(normalizedType)) {
    if (value === '' || value === null || value === undefined) return value
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : value
  }
  if (FLOAT_TYPES.has(normalizedType)) {
    if (value === '' || value === null || value === undefined) return value
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : value
  }
  return value
}

function serializeExactField(field) {
  return coerceCatalogValue(field.type, field.value)
}

function serializeQueryField(field) {
  if (field.termKind === 'wildcard') return { kind: 'wildcard' }
  if (field.termKind === 'predicate') {
    if (field.predicateKind === 'custom') {
      return { kind: 'predicate', predicate: 'custom', source: field.source || '' }
    }
    return {
      kind: 'predicate',
      predicate: 'preset',
      operator: field.operator || '==',
      operand: serializeExactField(field)
    }
  }
  return { kind: 'exact', value: serializeExactField(field) }
}

export function serializeTagDraft(draft, { query = false } = {}) {
  if (!draft) return null
  const fieldValue = field => query ? serializeQueryField(field) : serializeExactField(field)
  if (draft.kind === 'named') {
    return {
      kind: 'named',
      type_id: draft.typeId,
      fields: Object.fromEntries(draft.fields.map(field => [field.name, fieldValue(field)]))
    }
  }

  return {
    kind: 'general',
    signature_id: draft.signatureId,
    head: {
      type: draft.headKind,
      value: draft.head
    },
    fields: draft.fields.map(field => ({
      type: field.type,
      value: fieldValue(field)
    }))
  }
}

export function isTagDraftComplete(draft, { query = false } = {}) {
  if (!draft) return false
  if (draft.kind === 'general' && (draft.head === '' || draft.head == null)) return false
  return draft.fields.every(field => {
    if (query && field.termKind === 'wildcard') return true
    if (query && field.termKind === 'predicate' && field.predicateKind === 'custom') {
      return Boolean(field.source?.trim())
    }
    return field.value !== '' && field.value !== null && field.value !== undefined
  })
}

export function normalizeTagEntries(response) {
  const source = requireObject(response, 'tag entries response')
  requireSuccessfulResponse(source, 'tag entries response')
  return requireArray(source, 'entries', 'tag entries response').map((rawEntry, index) => {
    const context = `tag entries response.entries[${index}]`
    const entry = normalizeStructuredTag(rawEntry, context)
    return {
      ...entry,
      id: requireString(entry, 'tag_id', context),
      rendered: requireString(entry, 'rendered', context),
      fields: requireArray(entry, 'fields', context),
      source: entry.source ?? null,
      depth: entry.depth ?? null,
      slotId: entry.slot_id ?? null,
      nodeId: entry.node_id ?? null,
      time: entry.time ?? null
    }
  })
}

export function normalizeTagPreview(response) {
  const source = requireObject(response, 'tag preview response')
  requireSuccessfulResponse(source, 'tag preview response')
  const tag = normalizeStructuredTag(source.tag, 'tag preview response.tag')
  const rendered = requireString(source, 'rendered', 'tag preview response')
  if (!rendered) throw new TypeError('tag preview response.rendered must not be empty')
  // Preview wraps the structured tag under `tag`; list/query entries put the
  // same structure at the entry root alongside identity and target metadata.
  return {
    ...tag,
    rendered
  }
}

export function targetKey(target) {
  return [target?.kind, target?.node_id, target?.slot_id].map(value => value ?? '').join(':')
}

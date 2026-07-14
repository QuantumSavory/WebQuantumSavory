const INTEGER_TYPES = new Set([
  'Int', 'Int8', 'Int16', 'Int32', 'Int64', 'Int128',
  'UInt', 'UInt8', 'UInt16', 'UInt32', 'UInt64', 'UInt128', 'Integer'
])

const FLOAT_TYPES = new Set([
  'Float16', 'Float32', 'Float64', 'AbstractFloat', 'Real', 'Number'
])

function arrayValue(value) {
  return Array.isArray(value) ? value : []
}

function shortTypeName(typeId) {
  const value = String(typeId || '')
  return value.split('.').pop() || value
}

function normalizeField(field, index) {
  const source = typeof field === 'string' ? { type: field } : (field || {})
  const name = source.name ?? source.field ?? source.field_name ?? `arg${index + 1}`
  const type = source.type ?? source.field_type ?? source.value_type ?? 'Any'
  return {
    ...source,
    name: String(name),
    type: String(type),
    doc: String(source.doc ?? source.documentation ?? ''),
    position: source.position ?? index
  }
}

function normalizeNamedDefinition(definition, index) {
  const typeId = definition?.type_id
    ?? definition?.qualified_type
    ?? definition?.id
    ?? definition?.type
    ?? definition?.name
    ?? `named-${index}`
  const label = definition?.display_name
    ?? definition?.label
    ?? definition?.name
    ?? shortTypeName(typeId)
  const fields = arrayValue(
    definition?.fields ?? definition?.parameters ?? definition?.arguments
  ).map(normalizeField)

  return {
    ...definition,
    kind: 'named',
    id: String(typeId),
    typeId: String(typeId),
    label: String(label),
    doc: String(definition?.doc ?? definition?.documentation ?? ''),
    fields
  }
}

function signatureHeadKind(signature) {
  const explicit = signature?.head_kind
    ?? signature?.head_type
    ?? signature?.kind
    ?? signature?.head?.kind
    ?? signature?.head?.type
  const normalized = String(explicit || '')
  if (normalized.toLowerCase().includes('datatype') || normalized.toLowerCase().includes('type')) {
    return 'DataType'
  }
  return 'Symbol'
}

function normalizeSignature(signature, index) {
  const headKind = signatureHeadKind(signature)
  const rawArguments = signature?.arguments
    ?? signature?.fields
    ?? signature?.parameters
    ?? signature?.argument_types
    ?? signature?.types
    ?? []
  let fields = arrayValue(rawArguments).map(normalizeField)
  if (fields[0]?.type === headKind && fields[0]?.name === 'arg1') fields = fields.slice(1)
  const id = signature?.id
    ?? signature?.signature_id
    ?? `${headKind}-${fields.map(field => field.type).join('-') || index}`
  const baseLabel = String(signature?.display_name ?? signature?.label ?? `${headKind} tag`)
  const shape = [headKind, ...fields.map(field => field.type)].join(', ')
  const label = baseLabel.includes(`(${shape})`) ? baseLabel : `${baseLabel} (${shape})`

  return {
    ...signature,
    kind: 'general',
    id: String(id),
    headKind,
    label,
    doc: String(signature?.doc ?? signature?.documentation ?? ''),
    fields,
    allowedDataTypeIds: arrayValue(
      signature?.allowed_data_type_ids ?? signature?.allowedDataTypeIds
    ).map(String),
    variadic: signature?.variadic === true || signature?.vararg === true
  }
}

function normalizeDataType(dataType) {
  const source = typeof dataType === 'string' ? { id: dataType } : (dataType || {})
  const id = source.type_id ?? source.qualified_type ?? source.id ?? source.type ?? source.name
  return {
    ...source,
    id: String(id),
    label: String(source.display_name ?? source.label ?? source.name ?? shortTypeName(id))
  }
}

/**
 * Normalize the metadata endpoint at one boundary. This intentionally accepts
 * the snake_case wire contract and compact fixtures used by component tests.
 */
export function normalizeTagCatalog(response) {
  const source = response?.tag_types ?? response?.catalog ?? response ?? {}
  const named = arrayValue(
    source.named ?? source.named_tags ?? source.named_definitions ?? source.named_types
  ).map(normalizeNamedDefinition)
  const general = arrayValue(
    source.general ?? source.general_signatures ?? source.signatures
  ).map(normalizeSignature)
  const dataTypes = arrayValue(
    source.allowed_data_types ?? source.data_types ?? source.datatypes
  ).map(normalizeDataType)

  return {
    named,
    general,
    dataTypes,
    unsafeEvaluation: source.unsafe_evaluation === true,
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
  const entries = response?.entries ?? response?.tags ?? response?.results ?? []
  return arrayValue(entries).map((entry, index) => ({
    ...entry,
    id: String(entry?.tag_id ?? entry?.id ?? index),
    rendered: String(entry?.rendered ?? entry?.show ?? entry?.display ?? ''),
    fields: entry?.fields ?? entry?.structured_fields ?? {},
    source: entry?.source ?? entry?.message_source ?? null,
    depth: entry?.depth ?? entry?.message_depth ?? null,
    slotId: entry?.slot_id ?? entry?.slotId ?? null,
    nodeId: entry?.node_id ?? entry?.nodeId ?? null,
    time: entry?.time ?? entry?.slot_time ?? null
  }))
}

export function targetKey(target) {
  return [target?.kind, target?.node_id, target?.slot_id].map(value => value ?? '').join(':')
}

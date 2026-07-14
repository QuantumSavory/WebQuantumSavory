import { describe, expect, it } from 'vitest'
import {
  createTagDraft,
  isTagDraftComplete,
  normalizeTagCatalog,
  normalizeTagEntries,
  serializeTagDraft
} from '../../src/utils/tagExplorer.js'

const wireCatalog = {
  named_tags: [{
    type_id: 'QuantumSavory.TestTag',
    display_name: 'TestTag',
    doc: 'A named tag.',
    fields: [
      { name: 'count', type: 'Int64', doc: 'Count', position: 1 },
      { name: 'name', type: 'Symbol', doc: 'Name', position: 2 }
    ]
  }],
  general_signatures: [
    {
      signature_id: 'symbol-empty',
      head_type: 'Symbol',
      display_name: 'Symbol tag',
      fields: []
    },
    {
      signature_id: 'symbol-int',
      head_type: 'Symbol',
      display_name: 'Symbol tag',
      fields: [{ name: 'field_1', type: 'Int64', position: 1 }]
    }
  ],
  allowed_data_types: [
    { type_id: 'Core.Int64', display_name: 'Int64' },
    { type_id: 'Core.Float64', display_name: 'Float64' }
  ],
  unsafe_evaluation: false
}

describe('tag explorer wire metadata', () => {
  it('normalizes named/general definitions, safe DataTypes, docs, and evaluation policy', () => {
    const catalog = normalizeTagCatalog(wireCatalog)

    expect(catalog.named[0]).toMatchObject({
      kind: 'named',
      id: 'QuantumSavory.TestTag',
      label: 'TestTag',
      doc: 'A named tag.',
      fields: [
        { name: 'count', type: 'Int64', doc: 'Count' },
        { name: 'name', type: 'Symbol', doc: 'Name' }
      ]
    })
    expect(catalog.general.map(signature => signature.label)).toEqual([
      'Symbol tag (Symbol)',
      'Symbol tag (Symbol, Int64)'
    ])
    expect(catalog.dataTypes).toEqual([
      expect.objectContaining({ id: 'Core.Int64', label: 'Int64' }),
      expect.objectContaining({ id: 'Core.Float64', label: 'Float64' })
    ])
    expect(catalog.unsafeEvaluation).toBe(false)
  })

  it('serializes named and general construction values using the catalog types', () => {
    const catalog = normalizeTagCatalog(wireCatalog)
    const named = createTagDraft(catalog.named[0], catalog)
    named.fields[0].value = '4'
    named.fields[1].value = 'ready'

    expect(isTagDraftComplete(named)).toBe(true)
    expect(serializeTagDraft(named)).toEqual({
      kind: 'named',
      type_id: 'QuantumSavory.TestTag',
      fields: { count: 4, name: 'ready' }
    })

    const general = createTagDraft(catalog.general[1], catalog)
    general.head = 'priority'
    general.fields[0].value = '9'
    expect(serializeTagDraft(general)).toEqual({
      kind: 'general',
      signature_id: 'symbol-int',
      head: { type: 'Symbol', value: 'priority' },
      fields: [{ type: 'Int64', value: 9 }]
    })
  })

  it('uses only signature-compatible DataTypes for a general head default', () => {
    const catalog = normalizeTagCatalog({
      ...wireCatalog,
      general_signatures: [{
        signature_id: 'datatype-empty',
        head_type: 'DataType',
        fields: [],
        allowed_data_type_ids: ['Core.Float64']
      }]
    })

    expect(catalog.general[0].allowedDataTypeIds).toEqual(['Core.Float64'])
    expect(createTagDraft(catalog.general[0], catalog).head).toBe('Core.Float64')
  })

  it('serializes exact, wildcard, preset, and custom query terms', () => {
    const catalog = normalizeTagCatalog(wireCatalog)
    const draft = createTagDraft(catalog.named[0], catalog, true)
    draft.fields[0].termKind = 'predicate'
    draft.fields[0].predicateKind = 'preset'
    draft.fields[0].operator = '≥'
    draft.fields[0].value = '2'
    draft.fields[1].termKind = 'wildcard'

    expect(serializeTagDraft(draft, { query: true })).toEqual({
      kind: 'named',
      type_id: 'QuantumSavory.TestTag',
      fields: {
        count: { kind: 'predicate', predicate: 'preset', operator: '≥', operand: 2 },
        name: { kind: 'wildcard' }
      }
    })

    draft.fields[1].termKind = 'predicate'
    draft.fields[1].predicateKind = 'custom'
    draft.fields[1].source = 'x -> x == :ready'
    expect(serializeTagDraft(draft, { query: true }).fields.name).toEqual({
      kind: 'predicate',
      predicate: 'custom',
      source: 'x -> x == :ready'
    })
  })

  it('normalizes string tag IDs and entry context metadata', () => {
    expect(normalizeTagEntries({
      entries: [{
        tag_id: 42,
        type_id: 'QuantumSavory.TestTag',
        fields: [{ name: 'count', type: 'Int64', value: 2 }],
        rendered: 'Tag(TestTag(2))',
        slot_id: 'slot-1',
        time: 1.5
      }]
    })[0]).toMatchObject({
      id: '42',
      rendered: 'Tag(TestTag(2))',
      slotId: 'slot-1',
      time: 1.5
    })
  })
})

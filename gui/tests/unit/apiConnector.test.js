import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiConnector } from '../../src/utils/ApiConnector'

const values = new Map()
const storage = {
  clear: () => values.clear(),
  getItem: key => values.has(key) ? values.get(key) : null,
  removeItem: key => values.delete(key),
  setItem: (key, value) => values.set(key, String(value))
}

describe('ApiConnector project namespaces', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage
    })
  })

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('user_uuid', 'user')
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, logs: [] })
    }))
  })

  it('encodes reserved project characters in status queries', async () => {
    const connector = new ApiConnector('http://api.test')
    await connector.getSimulationStatus('  A&B #/?  ')

    const url = new URL(fetch.mock.calls[0][0])
    expect(url.pathname).toBe('/get_state')
    expect(url.searchParams.get('name')).toBe('user_A&B #/?')
  })

  it('keeps project and item identities inside encoded path segments', async () => {
    const connector = new ApiConnector('http://api.test')
    await connector.getProtocolResults('A/B?', { id: 'protocol/#1' })
    await connector.getBackendLogs('A/B?', false)

    expect(fetch.mock.calls[0][0]).toBe(
      'http://api.test/protocols/user_A%2FB%3F/protocol%2F%231',
    )
    expect(fetch.mock.calls[1][0]).toBe(
      'http://api.test/logs/user_A%2FB%3F?purge=false',
    )
  })

  it('sends custom-function placement context for validation', async () => {
    const connector = new ApiConnector('http://api.test')
    await connector.validateFunction('<(self)', 'node')

    expect(fetch.mock.calls[0][0]).toBe('http://api.test/test_code')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      code: '<(self)',
      placement: 'node'
    })
  })

  it('keeps tag explorer simulation names and external IDs at the HTTP boundary', async () => {
    const connector = new ApiConnector('http://api.test')
    const tag = {
      kind: 'named',
      type_id: 'QuantumSavory.TagType',
      fields: { count: 2 }
    }

    await connector.listTags('A/B?', {
      kind: 'register',
      node_id: 'node/#1',
      destination_slot_id: 'ignored-for-list'
    })
    await connector.attachTag('A/B?', {
      kind: 'register',
      node_id: 'node/#1',
      destination_slot_id: 'slot/#1'
    }, tag)
    await connector.deleteTag('A/B?', {
      kind: 'slot',
      node_id: 'not-sent',
      slot_id: 'slot/#1'
    }, 'tag/#1')
    await connector.queryTags('A/B?', {
      kind: 'slot',
      slot_id: 'slot/#1'
    }, tag)

    expect(fetch.mock.calls[0][0]).toBe(
      'http://api.test/tags/user_A%2FB%3F?target=register&node_id=node%2F%231',
    )
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      target: 'register',
      node_id: 'node/#1',
      destination_slot_id: 'slot/#1',
      tag
    })
    expect(fetch.mock.calls[2][0]).toBe(
      'http://api.test/tags/user_A%2FB%3F/tag%2F%231?target=slot&slot_id=slot%2F%231',
    )
    expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({
      target: 'slot',
      slot_id: 'slot/#1',
      query: tag
    })
  })

  it('caches catalog metadata and sends preview specs without a simulation namespace', async () => {
    const response = {
      named_tags: [],
      general_signatures: [],
      allowed_data_types: [],
      unsafe_evaluation: false
    }
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => response
    }))
    const connector = new ApiConnector('http://api.test')

    expect(await connector.fetchTagTypes()).toEqual(response)
    expect(await connector.fetchTagTypes()).toEqual(response)
    expect(fetch).toHaveBeenCalledTimes(1)
    await connector.previewTag({ kind: 'named', type_id: 'T', fields: {} })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/tag_types')
    expect(fetch.mock.calls[1][0]).toBe('http://api.test/tag_preview')
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      tag: { kind: 'named', type_id: 'T', fields: {} }
    })
  })
})

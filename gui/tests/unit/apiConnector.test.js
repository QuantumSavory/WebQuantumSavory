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
})

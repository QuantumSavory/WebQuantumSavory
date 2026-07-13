import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LogsPanel from '../../src/components/panels/LogsPanel.vue'
import {
  areConsecutiveLogsEqual,
  normalizeLogRecord
} from '../../src/utils/logRecords.js'

const TIMESTAMP = '2026-07-13T12:34:56.000Z'

function log(overrides = {}) {
  return {
    id: 'log-1',
    timestamp: TIMESTAMP,
    level: 'info',
    source: 'App',
    message: 'Routine application message',
    count: 1,
    raw: { subsystem: 'Map', action: 'routine' },
    ...overrides
  }
}

describe('log record presentation model', () => {
  it('normalizes legacy sources, preserves simulator severity, and searches structured fields', () => {
    const normalized = normalizeLogRecord(log({
      severity: 'PANIC',
      level: undefined,
      source: 'QuantumSavory',
      summary: 'Simulator stopped',
      message: 'BoundsError: attempt to access 3-element Vector at index [100]',
      exception_type: 'BoundsError',
      stacktrace: 'raise at MockBrokenProtocol.jl:42',
      raw: { process: 'diagnostic_process', slot: 100 }
    }))

    expect(normalized.level).toBe('panic')
    expect(normalized.source).toBe('Simulator')
    expect(normalized.message).toBe('Simulator stopped')
    expect(normalized.fullMessage).toContain('BoundsError')
    expect(normalized.searchText).toContain('mockbrokenprotocol.jl:42')
    expect(normalized.searchText).toContain('diagnostic_process')
    expect(normalized.searchText).toContain('simulator')
  })

  it('only collapses consecutive records when message, severity, and source all match', () => {
    const base = log({ message: 'same' })
    expect(areConsecutiveLogsEqual(base, { ...base, id: 'log-2' })).toBe(true)
    expect(areConsecutiveLogsEqual(base, { ...base, id: 'log-2', level: 'error' })).toBe(false)
    expect(areConsecutiveLogsEqual(base, { ...base, id: 'log-2', source: 'Simulator' })).toBe(false)
  })
})

describe('LogsPanel', () => {
  it('shows a collapsed guide covering every severity and normalized source', () => {
    const wrapper = mount(LogsPanel)
    const guide = wrapper.get('details.log-guide')

    expect(guide.attributes('open')).toBeUndefined()
    expect(guide.get('summary').text()).toBe('Log guide')
    for (const label of [
      'Debug',
      'Info',
      'Success',
      'Warning',
      'Error',
      'Panic',
      'App',
      'Web API',
      'Simulator'
    ]) {
      expect(guide.text()).toContain(label)
    }
  })

  it('normalizes source classes, marks backend text as monospaced, and styles panic distinctly', () => {
    const wrapper = mount(LogsPanel, {
      props: {
        showTimestamps: false,
        logs: [
          log({ id: 'app', source: 'Layout Tools', message: 'Layout complete' }),
          log({ id: 'api', source: 'Backend', level: 'error', message: 'HTTP request failed' }),
          log({ id: 'sim', source: 'QuantumSavory', level: 'warning', message: 'Simulator warning' }),
          log({
            id: 'panic',
            source: 'Simulator',
            level: 'panic',
            summary: 'Unexpected simulator exception',
            message: 'BoundsError at index 100'
          })
        ]
      }
    })

    expect(wrapper.get('[data-log-id="app"]').classes()).toContain('log-source-app')
    expect(wrapper.get('[data-log-id="app"] .log-source').text()).toBe('[App]')
    expect(wrapper.get('[data-log-id="api"]').classes()).toContain('log-source-web-api')
    expect(wrapper.get('[data-log-id="api"]').classes()).toContain('is-backend-source')
    expect(wrapper.get('[data-log-id="api"] .log-source').text()).toBe('[Web API]')
    expect(wrapper.get('[data-log-id="sim"]').classes()).toContain('log-source-simulator')
    expect(wrapper.get('[data-log-id="panic"]').classes()).toContain('log-panic')
    expect(wrapper.get('[data-log-id="panic"] .log-message').text()).toBe('Unexpected simulator exception')
    expect(wrapper.findAll('.is-backend-source')).toHaveLength(3)
  })

  it('keeps complete-message and raw-JSON disclosures independent without mutating records', async () => {
    const panic = log({
      id: 'panic-123',
      source: 'Simulator',
      level: 'panic',
      message: 'Short panic summary',
      fullMessage: 'BoundsError: attempt to access [1, 2, 3] at index [100]',
      exceptionType: 'BoundsError',
      stacktrace: 'Stacktrace:\n [1] getindex at essentials.jl:14\n [2] run at mock.jl:8',
      raw: { id: 'panic-123', keyword_field: { slot: 100 } }
    })
    const original = structuredClone(panic)
    const wrapper = mount(LogsPanel, { props: { logs: [panic] } })
    const messageButton = wrapper.get('.message-disclosure')
    const rawButton = wrapper.get('.raw-json-button')

    expect(messageButton.attributes('aria-expanded')).toBe('false')
    expect(rawButton.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.log-message-details').exists()).toBe(false)
    expect(wrapper.find('.log-raw-details').exists()).toBe(false)

    await messageButton.trigger('click')
    expect(messageButton.attributes('aria-expanded')).toBe('true')
    expect(rawButton.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.log-message-details').text()).toContain(panic.fullMessage)
    expect(wrapper.get('.panic-exception-type').text()).toBe('BoundsError')
    expect(wrapper.get('.panic-stacktrace').text()).toContain('getindex at essentials.jl:14')
    expect(wrapper.find('.log-raw-details').exists()).toBe(false)

    await rawButton.trigger('click')
    expect(messageButton.attributes('aria-expanded')).toBe('true')
    expect(rawButton.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.raw-json-content').text()).toContain('"keyword_field"')
    expect(wrapper.get('.raw-json-content').text()).toContain('"slot": 100')

    await messageButton.trigger('click')
    expect(wrapper.find('.log-message-details').exists()).toBe(false)
    expect(wrapper.find('.log-raw-details').exists()).toBe(true)
    expect(panic).toEqual(original)
  })

  it('provides an accessible Braces action for every record and a message disclosure only for Simulator records', () => {
    const wrapper = mount(LogsPanel, {
      props: {
        logs: [
          log({ id: 'app', source: 'System' }),
          log({ id: 'api', source: 'Web API' }),
          log({ id: 'sim', source: 'Simulator' })
        ]
      }
    })

    expect(wrapper.findAll('.raw-json-button')).toHaveLength(3)
    expect(wrapper.findAll('.message-disclosure')).toHaveLength(1)
    for (const button of wrapper.findAll('.raw-json-button')) {
      expect(button.attributes('aria-label')).toMatch(/^Show raw JSON for (App|Web API|Simulator) log$/)
      expect(button.attributes('title')).toBe(button.attributes('aria-label'))
      expect(button.find('svg').exists()).toBe(true)
      expect(button.text()).toBe('')
    }
  })

  it.each([
    ['visible message', 'ordinary searchable text'],
    ['complete simulator text', 'full diagnostic detail'],
    ['stacktrace', 'mock_protocol.jl:99'],
    ['source', 'simulator'],
    ['severity', 'panic'],
    ['raw field', 'request-8675309']
  ])('searches %s', async (_description, query) => {
    const wrapper = mount(LogsPanel, {
      props: {
        logs: [
          log({ id: 'unrelated', message: 'Nothing to see here' }),
          log({
            id: 'search-target',
            level: 'panic',
            source: 'Simulator',
            message: 'ordinary searchable text',
            fullMessage: 'full diagnostic detail',
            exceptionType: 'BoundsError',
            stacktrace: 'at mock_protocol.jl:99',
            raw: { correlation_id: 'request-8675309' }
          })
        ]
      }
    })

    await wrapper.get('input[aria-label="Search logs"]').setValue(query)
    expect(wrapper.findAll('.log-entry-container')).toHaveLength(1)
    expect(wrapper.get('.log-entry-container').attributes('data-log-id')).toBe('search-target')
  })

  it('retains expansion state by stable record ID when polling replaces an object', async () => {
    const first = log({ id: 'stable-simulator-id', source: 'Simulator', message: 'First object' })
    const wrapper = mount(LogsPanel, { props: { logs: [first] } })

    await wrapper.get('.message-disclosure').trigger('click')
    expect(wrapper.find('.log-message-details').exists()).toBe(true)

    await wrapper.setProps({
      logs: [log({ id: 'stable-simulator-id', source: 'Simulator', message: 'Replacement object' })]
    })
    expect(wrapper.get('.message-disclosure').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.log-message-details').text()).toContain('Replacement object')
  })
})

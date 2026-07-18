import { describe, expect, it, vi } from 'vitest'
import {
  areConsecutiveLogsEqual,
  emptyStructuredLogFilters,
  logMatchesStructuredFilters,
  normalizeLogGroup,
  normalizeLogRecord,
  normalizeLogSeverity,
  normalizeLogSource,
  parseRawLogDetails,
  structuredLogFacets
} from '../../src/utils/logRecords'

describe('log record normalization', () => {
  it('normalizes application subsystems and the two backend sources', () => {
    expect(normalizeLogSource('Map')).toEqual({ source: 'App', subsystem: 'Map' })
    expect(normalizeLogSource('Layout Tools')).toEqual({ source: 'App', subsystem: 'Layout Tools' })
    expect(normalizeLogSource('Backend')).toEqual({ source: 'Web API', subsystem: null })
    expect(normalizeLogSource('QuantumSavory')).toEqual({ source: 'Simulator', subsystem: null })
  })

  it('preserves all supported simulator severities', () => {
    for (const severity of ['debug', 'info', 'success', 'warning', 'error', 'panic']) {
      expect(normalizeLogSeverity(severity)).toBe(severity)
    }
    expect(normalizeLogSeverity('Warn')).toBe('warning')
  })

  it('keeps structured raw fields searchable and wraps non-JSON text', () => {
    expect(parseRawLogDetails('{"slot":2}')).toEqual({ slot: 2 })
    expect(parseRawLogDetails('plain text')).toEqual({ details: 'plain text' })
  })

  it('preserves application subsystem context from legacy and normalized records', () => {
    const legacy = normalizeLogRecord({ source: 'Layout Tools', message: 'Generated layout' })
    const normalized = normalizeLogRecord({
      source: 'App',
      message: 'Moved a node',
      raw: { subsystem: 'Map' }
    })

    expect(legacy).toMatchObject({ source: 'App', subsystem: 'Layout Tools' })
    expect(normalized).toMatchObject({ source: 'App', subsystem: 'Map' })
    expect(normalized.searchText).toContain('map')
  })

  it('normalizes simulator groups without changing the raw payload', () => {
    const raw = {
      id: 'simulator-log',
      group: ' Protocol ',
      event: 'entanglement-created'
    }
    const normalized = normalizeLogRecord({
      source: 'Simulator',
      severity: 'debug',
      message: 'Entanglement created',
      raw
    })

    expect(normalizeLogGroup(' NETWORK ')).toBe('network')
    expect(normalizeLogGroup('')).toBeNull()
    expect(normalized.group).toBe('protocol')
    expect(normalized.raw).toBe(raw)
    expect(normalized.searchText).toContain('protocol')
    expect(raw.group).toBe(' Protocol ')
  })

  it('does not collapse otherwise identical simulator records from different groups', () => {
    const base = {
      source: 'Simulator',
      severity: 'info',
      message: 'Same simulator message'
    }

    expect(areConsecutiveLogsEqual(
      { ...base, group: 'protocol' },
      { ...base, group: 'protocol' }
    )).toBe(true)
    expect(areConsecutiveLogsEqual(
      { ...base, group: 'protocol' },
      { ...base, group: 'network' }
    )).toBe(false)
  })

  it('defers expensive raw serialization until raw JSON or search text is requested', () => {
    const toJSON = vi.fn(() => ({ response: 'complete backend state' }))
    const normalized = normalizeLogRecord({
      source: 'Web API',
      message: 'State received',
      raw: { toJSON }
    })

    expect(normalized.message).toBe('State received')
    expect(toJSON).not.toHaveBeenCalled()
    expect(normalized.rawText).toContain('complete backend state')
    expect(toJSON).toHaveBeenCalledOnce()
  })

  it('promotes structured fields, retains unknown metadata, and resolves related node names', () => {
    const normalized = normalizeLogRecord({
      id: 'structured-1',
      timestamp: '2026-07-18T12:00:00.000Z',
      source: 'Simulator',
      severity: 'debug',
      message: 'Entangled a pair',
      raw: {
        group: 'protocol',
        event: 'pair_entangled',
        sim_time: 2.5,
        sim_process_id: '9007199254740992',
        protocol: 'EntanglerProt',
        nodes: [1, 2],
        src_node: 1,
        remote_nodes: [3],
        pair_id: '9007199254740993',
        slots: [2, 4]
      }
    }, {
      nodes: [{ name: 'Amherst' }, { name: 'Cambridge' }, { name: 'Boston' }]
    })

    expect(normalized).toMatchObject({
      group: 'protocol',
      event: 'pair_entangled',
      simTime: 2.5,
      simProcessId: '9007199254740992',
      protocol: 'EntanglerProt',
      participatingNodeIds: ['1', '2'],
      relatedNodeIds: ['1', '2', '3'],
      nodeNames: ['Amherst', 'Cambridge', 'Boston'],
      isStructured: true
    })
    expect(normalized.eventData).toMatchObject({
      src_node: 1,
      remote_nodes: [3],
      pair_id: '9007199254740993',
      slots: [2, 4]
    })
    expect(normalized.searchText).toContain('cambridge')
    expect(normalized.searchText).toContain('pair_entangled')
  })

  it('combines filter categories with AND and values within a category with OR', () => {
    const records = [
      {
        source: 'Simulator',
        severity: 'debug',
        message: 'first',
        group: 'protocol',
        event: 'pair_entangled',
        protocol: 'EntanglerProt',
        sim_time: 2,
        nodes: [1, 2]
      },
      {
        source: 'Simulator',
        severity: 'warning',
        message: 'second',
        group: 'protocol',
        event: 'pair_entangled',
        protocol: 'CustomProtocol',
        sim_time: 3,
        client_nodes: [2, 3]
      }
    ].map(record => normalizeLogRecord(record))
    const filters = {
      ...emptyStructuredLogFilters(),
      severity: ['debug', 'warning'],
      source: ['Simulator'],
      group: ['protocol'],
      event: ['pair_entangled'],
      node: ['2'],
      timeFrom: '2',
      timeTo: '3'
    }

    expect(records.map(record => logMatchesStructuredFilters(record, filters)))
      .toEqual([true, true])
    expect(logMatchesStructuredFilters(records[0], { ...filters, protocol: ['CustomProtocol'] }))
      .toBe(false)
    expect(logMatchesStructuredFilters(records[0], { ...filters, timeFrom: '2', timeTo: '2' }))
      .toBe(true)
    expect(logMatchesStructuredFilters(records[1], { ...filters, timeFrom: '2', timeTo: '2' }))
      .toBe(false)
  })

  it('discovers custom event, protocol, and related-node facets', () => {
    const facets = structuredLogFacets([
      normalizeLogRecord({
        source: 'Simulator',
        message: 'custom',
        group: 'protocol',
        event: 'custom_event',
        protocol: 'UserProtocol',
        dst_node: 17
      })
    ])

    expect(facets.event).toEqual(['custom_event'])
    expect(facets.protocol).toEqual(['UserProtocol'])
    expect(facets.node).toEqual(['17'])
  })
})

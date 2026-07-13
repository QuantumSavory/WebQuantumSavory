import { describe, expect, it, vi } from 'vitest'
import {
  normalizeLogRecord,
  normalizeLogSeverity,
  normalizeLogSource,
  parseRawLogDetails
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
})

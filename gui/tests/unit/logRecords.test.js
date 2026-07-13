import { describe, expect, it } from 'vitest'
import {
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
})

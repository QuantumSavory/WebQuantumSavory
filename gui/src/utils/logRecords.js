export const LOG_LEVELS = Object.freeze([
  'debug',
  'info',
  'success',
  'warning',
  'error',
  'panic'
])

export const LOG_SOURCES = Object.freeze([
  'App',
  'Web API',
  'Simulator'
])

const WEB_API_SOURCE_ALIASES = new Set([
  'api',
  'backend',
  'server',
  'web api',
  'webquantumsavory',
  'web quantum savory'
])

const SIMULATOR_SOURCE_ALIASES = new Set([
  'julia',
  'quantumsavory',
  'quantum savory',
  'simulation',
  'simulator'
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function firstString(...values) {
  return values.find(value => typeof value === 'string' && value.length > 0)
    || values.find(value => typeof value === 'string')
    || ''
}

export function normalizeLogLevel(level) {
  const normalized = typeof level === 'string' ? level.trim().toLowerCase() : ''
  if (normalized === 'warn') return 'warning'
  return LOG_LEVELS.includes(normalized) ? normalized : 'info'
}

export function normalizeLogSource(source) {
  const suppliedSource = typeof source === 'string' ? source.trim() : ''
  const normalized = suppliedSource.toLowerCase()
  if (WEB_API_SOURCE_ALIASES.has(normalized)) return { source: 'Web API', subsystem: null }
  if (SIMULATOR_SOURCE_ALIASES.has(normalized)) return { source: 'Simulator', subsystem: null }
  return {
    source: 'App',
    subsystem: normalized === 'app' || !suppliedSource ? null : suppliedSource
  }
}

export const normalizeLogSeverity = normalizeLogLevel

export function parseLegacyLogDetails(value) {
  if (typeof value !== 'string') return value

  try {
    return JSON.parse(value)
  } catch {
    return value
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
  }
}

export function parseRawLogDetails(value) {
  const parsed = parseLegacyLogDetails(value)
  if (parsed === null || parsed === undefined) return parsed
  return isRecord(parsed) || Array.isArray(parsed) ? parsed : { details: parsed }
}

export function rawLogPayload(log) {
  if (!isRecord(log)) return log
  if (log.raw !== undefined && log.raw !== null) return log.raw
  if (log.extendedInfo !== undefined && log.extendedInfo !== null) {
    return parseRawLogDetails(log.extendedInfo)
  }
  return log
}

export function serializeLogValue(value) {
  const seen = new WeakSet()
  try {
    const serialized = JSON.stringify(value, (_key, nestedValue) => {
      if (typeof nestedValue === 'bigint') return nestedValue.toString()
      if (nestedValue instanceof Error) {
        return {
          name: nestedValue.name,
          message: nestedValue.message,
          stack: nestedValue.stack
        }
      }
      if (nestedValue && typeof nestedValue === 'object') {
        if (seen.has(nestedValue)) return '[Circular]'
        seen.add(nestedValue)
      }
      return nestedValue
    }, 2)
    return serialized === undefined ? String(value) : serialized
  } catch {
    return String(value)
  }
}

export function normalizeLogRecord(log) {
  const record = isRecord(log) ? log : { message: String(log ?? '') }
  const level = normalizeLogLevel(record.level ?? record.severity)
  const source = normalizeLogSource(record.source).source
  const message = firstString(
    level === 'panic' ? record.summary : undefined,
    record.message,
    record.msg,
    record.summary
  )
  const fullMessage = firstString(
    record.fullMessage,
    record.full_message,
    record.message,
    record.msg,
    message
  )
  const exceptionType = firstString(record.exceptionType, record.exception_type)
  const stacktrace = firstString(record.stacktrace, record.stack_trace)
  const raw = rawLogPayload(record)
  const rawText = serializeLogValue(raw)

  return {
    id: record.id,
    timestamp: record.timestamp,
    level,
    source,
    message,
    fullMessage,
    exceptionType,
    stacktrace,
    count: Number.isFinite(Number(record.count)) ? Math.max(1, Number(record.count)) : 1,
    raw,
    rawText,
    original: log,
    searchText: [
      message,
      fullMessage,
      exceptionType,
      stacktrace,
      source,
      level,
      rawText
    ].join('\n').toLowerCase()
  }
}

export function areConsecutiveLogsEqual(first, second) {
  const firstRecord = normalizeLogRecord(first)
  const secondRecord = normalizeLogRecord(second)
  return firstRecord.message === secondRecord.message
    && firstRecord.level === secondRecord.level
    && firstRecord.source === secondRecord.source
}

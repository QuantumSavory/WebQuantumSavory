import { frontendBuildInfo } from './frontendBuildInfo.js'

export const UNKNOWN_SYSTEM_VALUE = 'Unknown'

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function firstString(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || ''
}

function dependencyRows(dependencies) {
  return Object.entries(record(dependencies))
    .filter(([name, version]) => name && typeof version === 'string' && version.trim())
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([name, version]) => ({ name, version: version.trim() }))
}

function actualCommit(value) {
  const candidate = firstString(value)
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(candidate) ? candidate : ''
}

/**
 * Normalize backend platform metadata and compile-time frontend dependency
 * versions for both visible diagnostics and copied panic reports.
 */
export function normalizeSystemInformation(platformInfo = {}, buildInfo = frontendBuildInfo) {
  const source = record(platformInfo)
  const suppliedVersions = record(source.versions)
  const versions = Object.keys(suppliedVersions).length ? suppliedVersions : source
  const backendQuantumSavory = record(source.quantumsavory)
  const normalizedQuantumSavory = record(source.quantumSavory)
  const quantumSavory = Object.keys(backendQuantumSavory).length
    ? backendQuantumSavory
    : normalizedQuantumSavory
  const build = record(buildInfo)
  const dependencies = record(build.dependencies)

  return {
    webQuantumSavory: firstString(
      versions.app,
      versions.webQuantumSavory,
      versions.webquantumsavory,
      build.appVersion,
    ) || UNKNOWN_SYSTEM_VALUE,
    julia: firstString(versions.julia, source.julia) || UNKNOWN_SYSTEM_VALUE,
    genie: firstString(versions.genie, source.genie) || UNKNOWN_SYSTEM_VALUE,
    quantumSavory: {
      version: firstString(
        quantumSavory.version,
        versions.quantumSavory,
        versions.quantumsavory,
      ) || UNKNOWN_SYSTEM_VALUE,
      trackedSource: firstString(
        quantumSavory.tracked_source,
        quantumSavory.trackedSource,
      ),
      trackedRevision: firstString(
        quantumSavory.tracked_revision,
        quantumSavory.trackedRevision,
      ),
      treeHash: firstString(quantumSavory.tree_hash, quantumSavory.treeHash),
      commit: actualCommit(quantumSavory.commit),
    },
    frontend: {
      runtime: dependencyRows(dependencies.runtime),
      development: dependencyRows(dependencies.development),
    },
  }
}

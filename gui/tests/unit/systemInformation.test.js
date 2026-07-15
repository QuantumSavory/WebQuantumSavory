import { describe, expect, it } from 'vitest'

import {
  UNKNOWN_SYSTEM_VALUE,
  normalizeSystemInformation,
} from '../../src/utils/systemInformation.js'

const buildInfo = {
  appVersion: '1.8.0',
  dependencies: {
    runtime: { vue: '3.5.21', '@lucide/vue': '1.24.0' },
    development: { vitest: '3.2.7', vite: '6.4.3' },
  },
}

describe('system information normalization', () => {
  it('normalizes backend source metadata and deterministic dependency rows', () => {
    const commit = '0123456789abcdef0123456789abcdef01234567'
    expect(normalizeSystemInformation({
      versions: {
        app: '1.8.1',
        julia: '1.12.1',
        genie: '5.33.8',
        quantumsavory: '0.7.0',
      },
      quantumsavory: {
        version: '0.7.1',
        tracked_source: 'https://github.com/QuantumSavory/QuantumSavory.jl.git',
        tracked_revision: 'master',
        tree_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        commit,
      },
    }, buildInfo)).toEqual({
      webQuantumSavory: '1.8.1',
      julia: '1.12.1',
      genie: '5.33.8',
      quantumSavory: {
        version: '0.7.1',
        trackedSource: 'https://github.com/QuantumSavory/QuantumSavory.jl.git',
        trackedRevision: 'master',
        treeHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        commit,
      },
      frontend: {
        runtime: [
          { name: '@lucide/vue', version: '1.24.0' },
          { name: 'vue', version: '3.5.21' },
        ],
        development: [
          { name: 'vite', version: '6.4.3' },
          { name: 'vitest', version: '3.2.7' },
        ],
      },
    })
  })

  it('never promotes a Pkg tree hash or tracked branch to a commit', () => {
    const treeHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const information = normalizeSystemInformation({
      versions: { quantumSavory: '0.7.0' },
      quantumsavory: {
        tracked_revision: 'master',
        tree_hash: treeHash,
        commit: 'master',
      },
    }, buildInfo)

    expect(information.quantumSavory.treeHash).toBe(treeHash)
    expect(information.quantumSavory.trackedRevision).toBe('master')
    expect(information.quantumSavory.commit).toBe('')
  })

  it('supports frontend-only diagnostics and legacy version aliases', () => {
    const frontendOnly = normalizeSystemInformation({}, buildInfo)
    expect(frontendOnly.webQuantumSavory).toBe('1.8.0')
    expect(frontendOnly.julia).toBe(UNKNOWN_SYSTEM_VALUE)
    expect(frontendOnly.genie).toBe(UNKNOWN_SYSTEM_VALUE)
    expect(frontendOnly.quantumSavory.version).toBe(UNKNOWN_SYSTEM_VALUE)
    expect(frontendOnly.frontend.runtime).toHaveLength(2)

    expect(normalizeSystemInformation({
      versions: { webquantumsavory: '2.0', quantumSavory: '1.0' },
    }, buildInfo)).toMatchObject({
      webQuantumSavory: '2.0',
      quantumSavory: { version: '1.0' },
    })

    expect(normalizeSystemInformation({ app: '3.0', julia: '1.14' }, buildInfo))
      .toMatchObject({ webQuantumSavory: '3.0', julia: '1.14' })
  })

  it('accepts already-normalized QuantumSavory source information', () => {
    const normalized = normalizeSystemInformation({
      webQuantumSavory: '1.8.0',
      julia: '1.12.1',
      genie: '5.33.8',
      quantumSavory: {
        version: '0.7.0',
        trackedSource: 'https://github.com/QuantumSavory/QuantumSavory.jl.git',
        trackedRevision: 'master',
        treeHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    }, buildInfo)

    expect(normalized).toMatchObject({
      webQuantumSavory: '1.8.0',
      julia: '1.12.1',
      genie: '5.33.8',
      quantumSavory: {
        version: '0.7.0',
        trackedSource: 'https://github.com/QuantumSavory/QuantumSavory.jl.git',
        trackedRevision: 'master',
        treeHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    })
  })
})

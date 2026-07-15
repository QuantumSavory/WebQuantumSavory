// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  frontendBuildInfo,
  resolveFrontendBuildInfo,
} from '../../config/frontendBuildInfo.js'

const packageLock = JSON.parse(
  readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'),
)

function expectedGroup(groupName) {
  return Object.fromEntries(
    Object.keys(packageLock.packages[''][groupName])
      .sort()
      .map(name => [name, packageLock.packages[`node_modules/${name}`].version]),
  )
}

describe('frontend build information configuration', () => {
  it('resolves every direct runtime and development dependency from package-lock entries', () => {
    expect(frontendBuildInfo).toEqual({
      appVersion: packageLock.packages[''].version,
      dependencies: {
        runtime: expectedGroup('dependencies'),
        development: expectedGroup('devDependencies'),
      },
    })
    expect(frontendBuildInfo.dependencies.runtime.vue).not.toBe(
      packageLock.packages[''].dependencies.vue,
    )
  })

  it('rejects a direct dependency without an exact resolved package entry', () => {
    expect(() => resolveFrontendBuildInfo({
      packages: {
        '': {
          version: '1.0.0',
          dependencies: { missing: '^1.0.0' },
          devDependencies: {},
        },
      },
    })).toThrow('no resolved version for direct runtime dependency missing')
  })

  it('rejects incomplete root lockfile metadata', () => {
    expect(() => resolveFrontendBuildInfo({ packages: { '': {} } }))
      .toThrow('has no application version')
  })
})

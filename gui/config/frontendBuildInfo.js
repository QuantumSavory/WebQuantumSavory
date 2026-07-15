import { readFileSync } from 'node:fs'

const DEFAULT_LOCKFILE_URL = new URL('../package-lock.json', import.meta.url)

function requireRecord(value, description) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`package-lock.json is missing ${description}`)
  }
  return value
}

function resolveDependencyGroup(packages, directDependencies, groupName) {
  const resolved = {}
  for (const name of Object.keys(directDependencies).sort()) {
    const packageEntry = packages[`node_modules/${name}`]
    if (!packageEntry || typeof packageEntry.version !== 'string' || !packageEntry.version.trim()) {
      throw new Error(`package-lock.json has no resolved version for direct ${groupName} dependency ${name}`)
    }
    resolved[name] = packageEntry.version.trim()
  }
  return resolved
}

export function resolveFrontendBuildInfo(packageLock) {
  const lock = requireRecord(packageLock, 'root object')
  const packages = requireRecord(lock.packages, 'packages object')
  const root = requireRecord(packages[''], 'packages[""] entry')
  const appVersion = typeof root.version === 'string' ? root.version.trim() : ''
  if (!appVersion) {
    throw new Error('package-lock.json packages[""] entry has no application version')
  }

  const runtimeDependencies = requireRecord(root.dependencies, 'root dependencies')
  const developmentDependencies = requireRecord(root.devDependencies, 'root devDependencies')

  return {
    appVersion,
    dependencies: {
      runtime: resolveDependencyGroup(packages, runtimeDependencies, 'runtime'),
      development: resolveDependencyGroup(packages, developmentDependencies, 'development'),
    },
  }
}

export function readFrontendBuildInfo(lockfileUrl = DEFAULT_LOCKFILE_URL) {
  const packageLock = JSON.parse(readFileSync(lockfileUrl, 'utf8'))
  return resolveFrontendBuildInfo(packageLock)
}

export const frontendBuildInfo = readFrontendBuildInfo()

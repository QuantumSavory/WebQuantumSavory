import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import ProjectStore from '../../src/models/ProjectStore'

beforeAll(() => {
  const values = new Map()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: key => values.has(key) ? values.get(key) : null,
      removeItem: key => values.delete(key),
      setItem: (key, value) => values.set(key, String(value))
    }
  })
})

beforeEach(() => localStorage.clear())

describe('ProjectStore recent project ownership', () => {
  it('reads, writes, and clears the existing recent-project storage key', () => {
    expect(ProjectStore.getRecentProjectName()).toBeNull()

    ProjectStore.setRecentProjectName('Project A')
    expect(ProjectStore.getRecentProjectName()).toBe('Project A')
    expect(localStorage.getItem('recentProjectName')).toBe('Project A')

    ProjectStore.clearRecentProjectName()
    expect(ProjectStore.getRecentProjectName()).toBeNull()
    expect(localStorage.getItem('recentProjectName')).toBeNull()
  })
})

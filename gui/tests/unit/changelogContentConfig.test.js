// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  changelogMarkdown,
  readChangelogMarkdown,
} from '../../config/changelogContent.js'

const changelogUrl = new URL('../../../CHANGELOG.md', import.meta.url)

describe('CHANGELOG build content', () => {
  it('injects the complete repository changelog at build time', () => {
    const expected = readFileSync(changelogUrl, 'utf8')

    expect(changelogMarkdown).toBe(expected)
    expect(readChangelogMarkdown(changelogUrl)).toBe(expected)
    expect(changelogMarkdown).toContain('# Changelog')
    expect(changelogMarkdown).toContain('## 1.9.1')
  })
})

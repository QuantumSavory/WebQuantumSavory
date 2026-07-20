import { readFileSync } from 'node:fs'

const DEFAULT_CHANGELOG_URL = new URL('../../CHANGELOG.md', import.meta.url)

export function readChangelogMarkdown(changelogUrl = DEFAULT_CHANGELOG_URL) {
  const markdown = readFileSync(changelogUrl, 'utf8')
  if (!markdown.trim()) {
    throw new Error('CHANGELOG.md must not be empty')
  }
  return markdown
}

export const changelogMarkdown = readChangelogMarkdown()

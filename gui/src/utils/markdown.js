import MarkdownIt from 'markdown-it'
import markdownItKatexModule from '@vscode/markdown-it-katex'
import { SAFE_KATEX_OPTIONS } from './katexOptions.js'

const markdownItKatex = markdownItKatexModule.default ?? markdownItKatexModule

/**
 * Shared renderer for application-authored Markdown.
 *
 * markdown-it keeps raw HTML disabled and validates link destinations with its
 * built-in allowlist, including the narrow set of safe data-image MIME types.
 */
const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true
}).use(markdownItKatex, SAFE_KATEX_OPTIONS)

export function renderMarkdown(value) {
  return markdownRenderer.render(String(value ?? ''))
}

/** Wrap an untrusted diagnostic in a Markdown fence without HTML pre-escaping. */
export function markdownCodeBlock(value) {
  const diagnostic = String(value ?? '')
  const longestBacktickRun = Math.max(
    0,
    ...(diagnostic.match(/`+/g) || []).map(run => run.length)
  )
  const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1))

  return `${fence}\n${diagnostic}\n${fence}`
}

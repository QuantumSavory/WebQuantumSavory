import { describe, expect, it } from 'vitest'
import { markdownCodeBlock, renderMarkdown } from '../../src/utils/markdown.js'

function renderedElement(markdown) {
  const container = document.createElement('div')
  container.innerHTML = renderMarkdown(markdown)
  return container
}

describe('shared Markdown renderer', () => {
  it('renders emphasis, code, lists, and KaTeX', () => {
    const rendered = renderedElement([
      '**Important** and `inline()`',
      '',
      '- first',
      '- second',
      '',
      '$x^2 + y^2$'
    ].join('\n'))

    expect(rendered.querySelector('strong')?.textContent).toBe('Important')
    expect(rendered.querySelector('code')?.textContent).toBe('inline()')
    expect([...rendered.querySelectorAll('li')].map(item => item.textContent))
      .toEqual(['first', 'second'])
    expect(rendered.querySelector('.katex')).not.toBeNull()
  })

  it('escapes raw HTML and rejects unsafe link and image destinations', () => {
    const rendered = renderedElement([
      '<img src=x onerror="alert(1)">',
      '',
      '[unsafe](javascript:alert(1))',
      '',
      '![unsafe image](data:image/svg+xml;base64,PHN2Zy8+)',
      '',
      '[safe](https://example.com)'
    ].join('\n'))

    expect(rendered.querySelector('[onerror]')).toBeNull()
    expect(rendered.textContent).toContain('<img src=x onerror="alert(1)">')
    expect(rendered.querySelector('a[href^="javascript:"]')).toBeNull()
    expect(rendered.querySelector('img[src^="data:image/svg"]')).toBeNull()
    expect(rendered.querySelector('a[href="https://example.com"]')?.textContent).toBe('safe')
  })

  it('renders raw diagnostics safely inside a fence longer than their backticks', () => {
    const diagnostic = '<transport> & "down"\n```nested```'
    const markdown = markdownCodeBlock(diagnostic)
    const rendered = renderedElement(markdown)

    expect(markdown.startsWith('````\n')).toBe(true)
    expect(rendered.querySelector('pre code')?.textContent).toBe(`${diagnostic}\n`)
    expect(rendered.querySelector('transport')).toBeNull()
  })
})

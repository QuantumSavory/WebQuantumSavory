import { describe, expect, it } from 'vitest'
import { escapeErrorHtml } from '../../src/utils/errorHtml.js'

describe('escapeErrorHtml', () => {
  it('decodes escaped error formatting and escapes every HTML-significant character', () => {
    expect(escapeErrorHtml('bad <tag> & \\"double\\" \'single\'\\nnext')).toBe(
      'bad &lt;tag&gt; &amp; &quot;double&quot; &#039;single&#039;\nnext'
    )
  })
})

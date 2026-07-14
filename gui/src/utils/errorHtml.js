/** Escape server or transport errors embedded in tooltips rendered as HTML. */
export function escapeErrorHtml(value) {
  return String(value ?? '')
    .split('\\n').join('\n')
    .split('\\"').join('"')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export const INTERACTIVE_MAP_MARKER_SELECTOR = [
  '.node-marker',
  '.annotation-overlay',
  '.annotation-resize-handle',
].join(', ')

export function isInteractiveMapMarkerTarget(target) {
  return Boolean(target?.closest?.(INTERACTIVE_MAP_MARKER_SELECTOR))
}

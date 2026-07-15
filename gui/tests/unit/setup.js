// MapLibre creates its worker URL while the module loads. jsdom implements URL
// but not the object-URL methods available in browsers.
if (typeof window !== 'undefined' && typeof window.URL.createObjectURL !== 'function') {
  Object.defineProperties(window.URL, {
    createObjectURL: {
      configurable: true,
      value: () => 'blob:vitest-maplibre-worker',
    },
    revokeObjectURL: {
      configurable: true,
      value: () => {},
    },
  })
}

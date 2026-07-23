export function readCssPixels(propertyName, fallback = 0) {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return fallback
  }

  const rawValue = getComputedStyle(document.documentElement).getPropertyValue(propertyName)
  const parsedValue = Number.parseFloat(rawValue)
  return Number.isFinite(parsedValue) ? parsedValue : fallback
}

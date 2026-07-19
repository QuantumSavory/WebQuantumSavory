const WATERMARK_TEXT = 'QuantumSavory.org'
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'

function pngDataUrl(png) {
  if (typeof png !== 'string' || png.trim().length === 0) {
    throw new Error('The generated PNG is missing')
  }

  const source = png.trim()
  if (/^data:image\/png;base64,/i.test(source)) return source
  if (/^data:/i.test(source)) {
    throw new Error('The generated image is not a PNG')
  }
  return `${PNG_DATA_URL_PREFIX}${source}`
}

function abortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('PNG watermarking was aborted', 'AbortError')
  }
  const error = new Error('PNG watermarking was aborted')
  error.name = 'AbortError'
  return error
}

function defaultImageFactory() {
  if (typeof Image !== 'function') {
    throw new Error('Browser image decoding is unavailable')
  }
  return new Image()
}

function defaultCanvasFactory() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw new Error('Browser canvas rendering is unavailable')
  }
  return document.createElement('canvas')
}

function loadPng(source, { signal, imageFactory }) {
  return new Promise((resolve, reject) => {
    let image
    try {
      image = imageFactory()
    } catch (error) {
      reject(error)
      return
    }

    let settled = false
    const cleanup = () => {
      image.onload = null
      image.onerror = null
      signal?.removeEventListener('abort', handleAbort)
    }
    const settle = (callback, value) => {
      if (settled) return
      settled = true
      cleanup()
      callback(value)
    }
    const handleAbort = () => {
      settle(reject, abortError())
      try {
        image.src = ''
      } catch {
        // Some browser image implementations do not permit clearing the source.
      }
    }

    image.onload = () => settle(resolve, image)
    image.onerror = () => settle(reject, new Error('The generated PNG could not be decoded'))
    signal?.addEventListener('abort', handleAbort, { once: true })

    if (signal?.aborted) {
      handleAbort()
      return
    }

    image.decoding = 'async'
    image.src = source
  })
}

function applyWatermark(context, width, height) {
  const shortestSide = Math.min(width, height)
  const padding = Math.min(
    Math.max(2, Math.round(shortestSide * 0.018)),
    width / 4,
    height / 4,
  )
  let fontSize = Math.max(1, Math.min(28, Math.round(shortestSide * 0.04)))

  context.font = `600 ${fontSize}px sans-serif`
  const availableWidth = Math.max(1, width - (2 * padding))
  const measuredWidth = context.measureText(WATERMARK_TEXT).width
  if (Number.isFinite(measuredWidth) && measuredWidth > availableWidth) {
    fontSize = Math.max(1, Math.floor(fontSize * availableWidth / measuredWidth))
    context.font = `600 ${fontSize}px sans-serif`
  }

  context.textAlign = 'right'
  context.textBaseline = 'bottom'
  context.lineJoin = 'round'
  context.lineWidth = Math.max(1, fontSize * 0.14)
  context.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  context.fillStyle = 'rgba(0, 0, 0, 0.72)'

  const x = width - padding
  const y = height - padding
  context.strokeText(WATERMARK_TEXT, x, y)
  context.fillText(WATERMARK_TEXT, x, y)
}

/**
 * Composite the application watermark onto a generated PNG and return a PNG data URL.
 *
 * Browser factories are injectable so this browser-only boundary can be tested without a
 * canvas implementation in jsdom.
 */
export async function watermarkGeneratedPng(
  png,
  {
    signal,
    imageFactory = defaultImageFactory,
    canvasFactory = defaultCanvasFactory,
  } = {},
) {
  const source = pngDataUrl(png)
  const image = await loadPng(source, { signal, imageFactory })
  if (signal?.aborted) throw abortError()

  const width = Math.floor(Number(image.naturalWidth || image.width))
  const height = Math.floor(Number(image.naturalHeight || image.height))
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('The generated PNG has invalid dimensions')
  }

  const canvas = canvasFactory()
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext?.('2d')
  if (!context) {
    throw new Error('Browser canvas rendering is unavailable')
  }

  context.drawImage(image, 0, 0, width, height)
  applyWatermark(context, width, height)

  const result = canvas.toDataURL?.('image/png')
  if (typeof result !== 'string' || !/^data:image\/png;base64,/i.test(result)) {
    throw new Error('The watermarked PNG could not be encoded')
  }
  return result
}

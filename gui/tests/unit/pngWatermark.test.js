import { describe, expect, it, vi } from 'vitest'
import { watermarkGeneratedPng } from '../../src/utils/pngWatermark'

const RAW_PNG = 'cG5nLWJ5dGVz'
const PNG_DATA_URL = `data:image/png;base64,${RAW_PNG}`
const WATERMARKED_DATA_URL = 'data:image/png;base64,d2F0ZXJtYXJrZWQ='

function imageFactory({ width = 640, height = 480, fails = false, loads = true } = {}) {
  return () => {
    const image = {
      naturalWidth: width,
      naturalHeight: height,
      onerror: null,
      onload: null,
    }
    Object.defineProperty(image, 'src', {
      configurable: true,
      get: () => image.source,
      set: value => {
        image.source = value
        if (!loads || value === '') return
        queueMicrotask(() => {
          if (fails) image.onerror?.()
          else image.onload?.()
        })
      },
    })
    return image
  }
}

function canvasHarness({ result = WATERMARKED_DATA_URL, contextAvailable = true } = {}) {
  const context = contextAvailable
    ? {
      drawImage: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 180 })),
      strokeText: vi.fn(),
    }
    : null
  const canvas = {
    getContext: vi.fn(() => context),
    toDataURL: vi.fn(() => result),
  }
  return {
    canvas,
    canvasFactory: vi.fn(() => canvas),
    context,
  }
}

describe('generated PNG watermarking', () => {
  it('composites the generated image and shared bottom-right brand treatment', async () => {
    const image = imageFactory()()
    const imageFactorySpy = vi.fn(() => image)
    const { canvas, canvasFactory, context } = canvasHarness()

    await expect(watermarkGeneratedPng(RAW_PNG, {
      imageFactory: imageFactorySpy,
      canvasFactory,
    })).resolves.toBe(WATERMARKED_DATA_URL)

    expect(image.source).toBe(PNG_DATA_URL)
    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(480)
    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, 640, 480)
    expect(context.font).toMatch(/sans-serif$/)
    expect(context.textAlign).toBe('right')
    expect(context.textBaseline).toBe('bottom')
    expect(context.strokeText).toHaveBeenCalledWith(
      'QuantumSavory.org',
      expect.closeTo(631, 0),
      expect.closeTo(471, 0),
    )
    expect(context.fillText).toHaveBeenCalledWith(
      'QuantumSavory.org',
      expect.closeTo(631, 0),
      expect.closeTo(471, 0),
    )
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png')
  })

  it('accepts an existing PNG data URL without nesting its prefix', async () => {
    const image = imageFactory()()
    const { canvasFactory } = canvasHarness()

    await watermarkGeneratedPng(PNG_DATA_URL, {
      imageFactory: () => image,
      canvasFactory,
    })

    expect(image.source).toBe(PNG_DATA_URL)
  })

  it('rejects missing, non-PNG, undecodable, and unencodable images', async () => {
    await expect(watermarkGeneratedPng('')).rejects.toThrow('generated PNG is missing')
    await expect(watermarkGeneratedPng('data:image/jpeg;base64,AAEC')).rejects.toThrow(
      'generated image is not a PNG',
    )

    await expect(watermarkGeneratedPng(RAW_PNG, {
      imageFactory: imageFactory({ fails: true }),
      canvasFactory: canvasHarness().canvasFactory,
    })).rejects.toThrow('generated PNG could not be decoded')

    await expect(watermarkGeneratedPng(RAW_PNG, {
      imageFactory: imageFactory(),
      canvasFactory: canvasHarness({ contextAvailable: false }).canvasFactory,
    })).rejects.toThrow('canvas rendering is unavailable')

    await expect(watermarkGeneratedPng(RAW_PNG, {
      imageFactory: imageFactory(),
      canvasFactory: canvasHarness({ result: 'data:,' }).canvasFactory,
    })).rejects.toThrow('watermarked PNG could not be encoded')
  })

  it('cancels image decoding when its caller becomes stale', async () => {
    const controller = new AbortController()
    const image = imageFactory({ loads: false })()
    const canvasFactory = vi.fn()
    const result = watermarkGeneratedPng(RAW_PNG, {
      signal: controller.signal,
      imageFactory: () => image,
      canvasFactory,
    })

    controller.abort()

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(image.source).toBe('')
    expect(canvasFactory).not.toHaveBeenCalled()
  })
})

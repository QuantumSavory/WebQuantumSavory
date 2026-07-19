import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProtocolResults: vi.fn(),
  getSlotResults: vi.fn(),
  watermarkGeneratedPng: vi.fn(),
}))

vi.mock('../../src/utils/ApiConnector', () => ({
  api: {
    getProtocolResults: mocks.getProtocolResults,
    getSlotResults: mocks.getSlotResults,
  },
}))

vi.mock('../../src/utils/pngWatermark', () => ({
  watermarkGeneratedPng: mocks.watermarkGeneratedPng,
}))

import ResultsView from '../../src/components/panels/ResultsView.vue'

function mountResultsView() {
  return mount(ResultsView, {
    props: {
      windowId: 'results-protocol',
      itemDetails: {
        type: 'protocol',
        item: { id: 'protocol-1' },
        context: { protocolType: 'ExampleProtocol' },
      },
      position: { x: 10, y: 20 },
      size: { width: 500, height: 400 },
      zIndex: 2,
      projectData: {
        name: 'Generated PNG',
        net: { nodes: [] },
      },
    },
  })
}

describe('ResultsView generated PNGs', () => {
  beforeEach(() => {
    mocks.getProtocolResults.mockReset()
    mocks.getSlotResults.mockReset()
    mocks.watermarkGeneratedPng.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows only the watermarked protocol PNG returned by the shared helper', async () => {
    mocks.getProtocolResults.mockResolvedValue({
      png_base64: 'raw-generated-png',
      html_base64: btoa('<p>Protocol result</p>'),
    })
    mocks.watermarkGeneratedPng.mockResolvedValue(
      'data:image/png;base64,watermarked-generated-png',
    )
    const wrapper = mountResultsView()

    await flushPromises()

    expect(mocks.watermarkGeneratedPng).toHaveBeenCalledWith(
      'raw-generated-png',
      { signal: expect.any(AbortSignal) },
    )
    expect(wrapper.get('.image-container img').attributes('src')).toBe(
      'data:image/png;base64,watermarked-generated-png',
    )
    expect(wrapper.html()).not.toContain('raw-generated-png')
    wrapper.unmount()
  })

  it('does not expose the unwatermarked bytes when compositing fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.getProtocolResults.mockResolvedValue({ png_base64: 'raw-generated-png' })
    mocks.watermarkGeneratedPng.mockRejectedValue(new Error('Canvas unavailable'))
    const wrapper = mountResultsView()

    await flushPromises()

    expect(wrapper.find('.image-container img').exists()).toBe(false)
    expect(wrapper.get('.no-content').text()).toBe('There is no valid plot currently')
    expect(wrapper.html()).not.toContain('raw-generated-png')
    wrapper.unmount()
  })
})

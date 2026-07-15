import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RunnerPanel from '../../src/components/panels/RunnerPanel.vue'

function capabilities(overrides = {}) {
  return {
    canRun: true,
    canPause: false,
    canResume: false,
    canStop: true,
    canPrepare: true,
    ...overrides
  }
}

function mountRunner(overrides = {}) {
  return mount(RunnerPanel, {
    props: {
      projectData: { simulationConfig: { time: 1 } },
      backendSimulation: {},
      targetSimulationTime: 1,
      pollingActive: false,
      phase: 'prepared',
      capabilities: capabilities(),
      foregroundRequest: null,
      ...overrides
    }
  })
}

describe('RunnerPanel foreground loading feedback', () => {
  it('immediately replaces Play with an accessible disabled spinner while Run starts', async () => {
    const wrapper = mountRunner()
    const runButton = wrapper.get('.run-btn')
    expect(runButton.find('.lucide-play').exists()).toBe(true)
    expect(runButton.attributes('disabled')).toBeUndefined()

    await wrapper.setProps({
      foregroundRequest: { id: 1, action: 'run' },
      capabilities: capabilities({
        canRun: false,
        canPause: false,
        canResume: false,
        canStop: false,
        canPrepare: false
      })
    })

    expect(runButton.attributes('disabled')).toBeDefined()
    expect(runButton.attributes('aria-busy')).toBe('true')
    expect(runButton.attributes('aria-label')).toBe('Starting simulation')
    expect(runButton.find('.lucide-loader-circle.app-loading-spinner').exists()).toBe(true)
    expect(runButton.find('.lucide-play').exists()).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toBe('Starting simulation')
    expect(wrapper.get('.duration-input').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.settings-toggle-btn').attributes('disabled')).toBeDefined()

    await wrapper.setProps({
      foregroundRequest: null,
      capabilities: capabilities()
    })
    expect(runButton.attributes('disabled')).toBeUndefined()
    expect(runButton.find('.lucide-play').exists()).toBe(true)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('keeps Pause and Resume visible but disabled with action-specific feedback', async () => {
    const wrapper = mountRunner({
      phase: 'running',
      backendSimulation: { simulation_running: true },
      foregroundRequest: { id: 1, action: 'pause' },
      capabilities: capabilities({ canRun: false, canPause: false, canStop: false, canPrepare: false })
    })

    let actionButton = wrapper.get('.pause-btn')
    expect(actionButton.attributes('disabled')).toBeDefined()
    expect(actionButton.attributes('aria-label')).toBe('Pausing simulation')
    expect(actionButton.find('.lucide-loader-circle').exists()).toBe(true)

    await wrapper.setProps({
      phase: 'paused',
      foregroundRequest: { id: 2, action: 'resume' },
      capabilities: capabilities({ canRun: false, canResume: false, canStop: false, canPrepare: false })
    })

    actionButton = wrapper.get('.resume-btn')
    expect(actionButton.attributes('disabled')).toBeDefined()
    expect(actionButton.attributes('aria-label')).toBe('Resuming simulation')
    expect(actionButton.find('.lucide-loader-circle').exists()).toBe(true)
    expect(actionButton.find('.lucide-play').exists()).toBe(false)
  })

  it('disables advanced Parse and Prepare controls for any foreground request', () => {
    const wrapper = mountRunner({
      phase: 'parsed',
      foregroundRequest: { id: 1, action: 'prepare' },
      capabilities: capabilities({ canRun: false, canStop: false, canPrepare: false })
    })

    expect(wrapper.get('.prepare-network-graph-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.prepare-simulation-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.reset-btn').attributes('disabled')).toBeDefined()
  })
})

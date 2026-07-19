import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PhysicalEdgeControls from '../../src/components/panels/PhysicalEdgeControls.vue'
import Edge from '../../src/models/Edge'
import Node from '../../src/models/Node'
import { resolveEdgePhysicalProperties } from '../../src/utils/edgeGeometry'

function makeEdge() {
  const source = new Node({ id: 'a', name: 'A', position: [-72, 42] })
  const target = new Node({ id: 'b', name: 'B', position: [-71, 42] })
  return new Edge({ id: 'edge', source, target })
}

describe('physical edge controls', () => {
  async function applyLatestCommand(wrapper, edge) {
    const operations = wrapper.emitted('designOperations').at(-1)[0]
    Object.assign(edge.data, operations[0].value.data)
    const currentEdge = wrapper.props('edge')
    await wrapper.setProps({
      edge: {
        ...currentEdge,
        data: { ...currentEdge.data, ...operations[0].value.data },
      },
    })
  }

  it('shows automatic values at three significant digits and preserves typed overrides', async () => {
    const edge = makeEdge()
    const physicalConfig = { refractiveIndex: 1.468 }
    const wrapper = mount(PhysicalEdgeControls, {
      props: { edge, physicalConfig },
    })
    const automatic = resolveEdgePhysicalProperties(edge, physicalConfig)

    expect(wrapper.get('#edge-distance-meters').element.value)
      .toBe(String(Number(automatic.distanceMeters.toPrecision(3))))
    expect(wrapper.get('#edge-refractive-index').element.value).toBe('1.47')
    expect(wrapper.get('#edge-delay-seconds').element.value)
      .toBe(String(Number(automatic.propagationDelaySeconds.toPrecision(3))))

    await wrapper.get('#edge-distance-meters').setValue('1234.56789')
    await applyLatestCommand(wrapper, edge)
    expect(edge.data.physicalOverrides.distanceMeters).toBe(1234.56789)
    expect(wrapper.get('#edge-distance-meters').element.value).toBe('1234.56789')

    await wrapper.get('#edge-delay-seconds').setValue('0.000123456')
    await applyLatestCommand(wrapper, edge)
    expect(edge.data.physicalOverrides.delaySeconds).toBe(0.000123456)
    expect(wrapper.get('#edge-delay-seconds').element.value).toBe('0.000123456')
  })

  it('edits, resets, and restores dormant overrides around a manual delay', async () => {
    const edge = makeEdge()
    const wrapper = mount(PhysicalEdgeControls, {
      props: { edge, physicalConfig: { refractiveIndex: 1.468 } },
    })

    await wrapper.get('#edge-distance-meters').setValue('1200')
    await applyLatestCommand(wrapper, edge)
    await wrapper.get('#edge-refractive-index').setValue('1.5')
    await applyLatestCommand(wrapper, edge)
    expect(edge.data.physicalOverrides).toMatchObject({
      distanceMeters: 1200,
      refractiveIndex: 1.5,
      delaySeconds: null,
    })

    await wrapper.get('#edge-delay-seconds').setValue('0.25')
    await applyLatestCommand(wrapper, edge)
    expect(wrapper.get('#edge-distance-meters').text()).toBe('n/a')
    expect(wrapper.get('#edge-refractive-index').text()).toBe('n/a')
    expect(edge.data.physicalOverrides.distanceMeters).toBe(1200)
    expect(edge.data.physicalOverrides.refractiveIndex).toBe(1.5)

    await wrapper.get('[aria-label="Reset propagation delay to automatic"]').trigger('click')
    await applyLatestCommand(wrapper, edge)
    expect(wrapper.get('#edge-distance-meters').element.value).toBe('1200')
    expect(wrapper.get('#edge-refractive-index').element.value).toBe('1.5')

    await wrapper.get('[aria-label="Reset distance to automatic"]').trigger('click')
    await applyLatestCommand(wrapper, edge)
    await wrapper.get('[aria-label="Reset refractive index to automatic"]').trigger('click')
    await applyLatestCommand(wrapper, edge)
    expect(edge.data.physicalOverrides).toBeNull()
  })

  it('locks every editable physical value', () => {
    const wrapper = mount(PhysicalEdgeControls, {
      props: {
        edge: makeEdge(),
        physicalConfig: { refractiveIndex: 1.468 },
        editingLocked: true,
      },
    })

    expect(wrapper.findAll('input')).toHaveLength(3)
    expect(wrapper.findAll('input').every(input => input.attributes('disabled') !== undefined))
      .toBe(true)
  })
})

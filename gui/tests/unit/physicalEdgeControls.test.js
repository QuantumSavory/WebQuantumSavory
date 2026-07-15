import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'

import PhysicalEdgeControls from '../../src/components/panels/PhysicalEdgeControls.vue'
import Edge from '../../src/models/Edge'
import Node from '../../src/models/Node'

function makeEdge() {
  const source = new Node({ id: 'a', name: 'A', position: [-72, 42] })
  const target = new Node({ id: 'b', name: 'B', position: [-71, 42] })
  return new Edge({ id: 'edge', source, target })
}

describe('physical edge controls', () => {
  it('edits, resets, and restores dormant overrides around a manual delay', async () => {
    const edge = makeEdge()
    const wrapper = mount(PhysicalEdgeControls, {
      props: { edge, physicalConfig: { refractiveIndex: 1.468 } },
    })

    await wrapper.get('#edge-distance-meters').setValue('1200')
    await wrapper.get('#edge-refractive-index').setValue('1.5')
    expect(edge.data.physicalOverrides).toMatchObject({
      distanceMeters: 1200,
      refractiveIndex: 1.5,
      delaySeconds: null,
    })

    await wrapper.get('#edge-delay-seconds').setValue('0.25')
    await nextTick()
    expect(wrapper.get('#edge-distance-meters').text()).toBe('n/a')
    expect(wrapper.get('#edge-refractive-index').text()).toBe('n/a')
    expect(edge.data.physicalOverrides.distanceMeters).toBe(1200)
    expect(edge.data.physicalOverrides.refractiveIndex).toBe(1.5)

    await wrapper.get('[aria-label="Reset propagation delay to automatic"]').trigger('click')
    await nextTick()
    expect(wrapper.get('#edge-distance-meters').element.value).toBe('1200')
    expect(wrapper.get('#edge-refractive-index').element.value).toBe('1.5')

    await wrapper.get('[aria-label="Reset distance to automatic"]').trigger('click')
    await wrapper.get('[aria-label="Reset refractive index to automatic"]').trigger('click')
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

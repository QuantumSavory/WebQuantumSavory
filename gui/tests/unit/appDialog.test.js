import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AppDialog from '../../src/components/ui/AppDialog.vue'
import { UI_SERVICES_KEY } from '../../src/composables/uiServices'

const DialogStub = {
  props: ['visible'],
  template: '<div v-if="visible"><slot /></div>'
}

let wrappers = []
let elements = []

afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount())
  elements.forEach(element => element.remove())
  wrappers = []
  elements = []
})

function addButton(label) {
  const button = document.createElement('button')
  button.textContent = label
  document.body.append(button)
  elements.push(button)
  return button
}

async function openAndClose(wrapper) {
  await wrapper.setProps({ show: true })
  await wrapper.setProps({ show: false })
  await nextTick()
}

describe('AppDialog focus restoration', () => {
  it('restores a connected visible trigger before consulting the fallback', async () => {
    const trigger = addButton('Trigger')
    const fallback = addButton('Menu')
    vi.spyOn(trigger, 'getClientRects').mockReturnValue([{ width: 10, height: 10 }])
    const getDialogFallbackFocus = vi.fn(() => fallback)
    const wrapper = mount(AppDialog, {
      props: { show: false, title: 'Dialog' },
      global: {
        provide: { [UI_SERVICES_KEY]: { getDialogFallbackFocus } },
        stubs: { Dialog: DialogStub }
      }
    })
    wrappers.push(wrapper)

    trigger.focus()
    await openAndClose(wrapper)

    expect(document.activeElement).toBe(trigger)
    expect(getDialogFallbackFocus).not.toHaveBeenCalled()
  })

  it('uses the injected fallback when the captured trigger is unavailable', async () => {
    const trigger = addButton('Trigger')
    const fallback = addButton('Menu')
    const getDialogFallbackFocus = vi.fn(() => fallback)
    const wrapper = mount(AppDialog, {
      props: { show: false, title: 'Dialog' },
      global: {
        provide: { [UI_SERVICES_KEY]: { getDialogFallbackFocus } },
        stubs: { Dialog: DialogStub }
      }
    })
    wrappers.push(wrapper)

    trigger.focus()
    await wrapper.setProps({ show: true })
    trigger.remove()
    await wrapper.setProps({ show: false })
    await nextTick()

    expect(getDialogFallbackFocus).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(fallback)
  })

  it('remains mountable without application UI services', async () => {
    const wrapper = mount(AppDialog, {
      props: { show: false, title: 'Standalone dialog' },
      global: { stubs: { Dialog: DialogStub } }
    })
    wrappers.push(wrapper)

    await expect(openAndClose(wrapper)).resolves.toBeUndefined()
  })
})

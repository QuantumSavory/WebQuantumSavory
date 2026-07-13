import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { usePanelLayout } from '../../src/composables/usePanelLayout'

const legacyKeys = [
  'panelCollapsed_node_panel',
  'panelCollapsed_edge_panel',
  'panelCollapsed_void_panel'
]

beforeAll(() => {
  const values = new Map()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: key => values.has(key) ? values.get(key) : null,
      removeItem: key => values.delete(key),
      setItem: (key, value) => values.set(key, String(value))
    }
  })
})

beforeEach(() => localStorage.clear())

describe('selected-element panel storage migration', () => {
  it('writes the canonical value and removes all migrated keys', () => {
    localStorage.setItem(legacyKeys[0], 'false')
    localStorage.setItem(legacyKeys[1], 'true')
    localStorage.setItem(legacyKeys[2], 'false')

    const { panelCollapsedStates } = usePanelLayout()

    expect(panelCollapsedStates.value.selectedElementPanel).toBe(true)
    expect(localStorage.getItem('panelCollapsed_selected_element')).toBe('true')
    legacyKeys.forEach(key => expect(localStorage.getItem(key)).toBeNull())
  })

  it('keeps an existing canonical value and still removes migrated keys', () => {
    localStorage.setItem('panelCollapsed_selected_element', 'false')
    legacyKeys.forEach(key => localStorage.setItem(key, 'true'))

    const { panelCollapsedStates } = usePanelLayout()

    expect(panelCollapsedStates.value.selectedElementPanel).toBe(false)
    expect(localStorage.getItem('panelCollapsed_selected_element')).toBe('false')
    legacyKeys.forEach(key => expect(localStorage.getItem(key)).toBeNull())
  })
})

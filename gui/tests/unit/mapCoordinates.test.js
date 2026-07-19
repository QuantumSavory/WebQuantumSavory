import { describe, expect, it } from 'vitest'

import {
  MAX_WEB_MERCATOR_LATITUDE,
  isMapPosition,
  positionInProjectWorld,
} from '../../src/utils/mapCoordinates'

describe('map coordinates', () => {
  it('distinguishes geographic poles from the finite Web Mercator world', () => {
    expect(isMapPosition([180, MAX_WEB_MERCATOR_LATITUDE])).toBe(true)
    expect(isMapPosition([-180, -MAX_WEB_MERCATOR_LATITUDE])).toBe(true)
    expect(isMapPosition([0, MAX_WEB_MERCATOR_LATITUDE + 0.001])).toBe(false)
    expect(isMapPosition([0, 90])).toBe(false)
  })

  it('removes only the display-world offset captured at drag start', () => {
    expect(positionInProjectWorld(
      { lng: 290, lat: 43 },
      { lng: 289, lat: 42 },
      [-71, 42],
    )).toEqual([-70, 43])

    // Crossing out of that same durable world stays invalid instead of being
    // silently wrapped onto a different physical route.
    expect(positionInProjectWorld(
      { lng: 541, lat: 43 },
      { lng: 289, lat: 42 },
      [-71, 42],
    )).toEqual([181, 43])
  })

  it('rejects malformed drag coordinates before they reach project state', () => {
    expect(() => positionInProjectWorld(
      { lng: Number.NaN, lat: 42 },
      { lng: -71, lat: 42 },
      [-71, 42],
    )).toThrow(/finite start and end positions/)
  })
})

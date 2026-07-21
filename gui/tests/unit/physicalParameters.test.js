// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LOSS_DB_PER_KM,
  EDGE_PHYSICAL_PARAMETER_DESCRIPTORS,
  GLOBAL_PHYSICAL_PARAMETER_DESCRIPTORS,
  PHYSICAL_PARAMETER_DESCRIPTORS,
  calculateTransmissivity,
  resolvePhysicalParameters,
  validatePhysicalParameterValue,
} from '../../src/utils/physicalParameters.js'

describe('physical parameter descriptors and formulas', () => {
  it('publishes persisted, resolved, unit, and default metadata', () => {
    expect(GLOBAL_PHYSICAL_PARAMETER_DESCRIPTORS.map(parameter => parameter.configField))
      .toEqual(['refractiveIndex', 'lossDbPerKm'])
    expect(EDGE_PHYSICAL_PARAMETER_DESCRIPTORS.map(parameter => parameter.overrideField))
      .toEqual([
        'distanceMeters',
        'refractiveIndex',
        'delaySeconds',
        'lossDbPerKm',
        'transmissivity',
      ])
    expect(PHYSICAL_PARAMETER_DESCRIPTORS.lossDbPerKm).toMatchObject({
      defaultValue: 0.2,
      resolvedField: 'lossDbPerKm',
      unit: { symbol: 'dB/km' },
    })
    expect(PHYSICAL_PARAMETER_DESCRIPTORS.transmissivity).toMatchObject({
      minimum: 0,
      maximum: 1,
      resolvedField: 'transmissivity',
    })
  })

  it('calculates telecom-fiber transmission including zero loss and underflow', () => {
    expect(calculateTransmissivity(1000, DEFAULT_LOSS_DB_PER_KM))
      .toBeCloseTo(0.954992586, 9)
    expect(calculateTransmissivity(1_000_000, 0)).toBe(1)
    expect(calculateTransmissivity(1e12, 1000)).toBe(0)
  })

  it('resolves global and edge loss while distance controls automatic transmission', () => {
    const global = resolvePhysicalParameters(1000, {
      refractiveIndex: 1.468,
      lossDbPerKm: 0.2,
    })
    expect(global.lossDbPerKm).toBe(0.2)
    expect(global.transmissivity).toBeCloseTo(0.954992586, 9)

    const overridden = resolvePhysicalParameters(1000, {
      refractiveIndex: 1.468,
      lossDbPerKm: 0.2,
    }, {
      distanceMeters: 2000,
      refractiveIndex: null,
      delaySeconds: null,
      lossDbPerKm: 0.4,
      transmissivity: null,
    })
    expect(overridden.distanceMeters).toBe(2000)
    expect(overridden.lossDbPerKm).toBe(0.4)
    expect(overridden.transmissivity).toBe(calculateTransmissivity(2000, 0.4))
  })

  it('keeps delay and transmissivity manual modes independent', () => {
    const automatic = resolvePhysicalParameters(1000, { lossDbPerKm: 0.2 })
    const manualDelay = resolvePhysicalParameters(1000, { lossDbPerKm: 0.2 }, {
      distanceMeters: null,
      refractiveIndex: null,
      delaySeconds: 0.25,
      lossDbPerKm: null,
      transmissivity: null,
    })
    expect(manualDelay.manualDelay).toBe(true)
    expect(manualDelay.manualTransmissivity).toBe(false)
    expect(manualDelay.transmissivity).toBe(automatic.transmissivity)

    const manualTransmission = resolvePhysicalParameters(1000, { lossDbPerKm: 0.2 }, {
      distanceMeters: null,
      refractiveIndex: null,
      delaySeconds: null,
      lossDbPerKm: 0.4,
      transmissivity: 0.75,
    })
    expect(manualTransmission.manualDelay).toBe(false)
    expect(manualTransmission.manualTransmissivity).toBe(true)
    expect(manualTransmission.lossDbPerKm).toBe(0.4)
    expect(manualTransmission.transmissivity).toBe(0.75)
  })

  it('rejects invalid loss and transmissivity bounds', () => {
    const { lossDbPerKm, transmissivity } = PHYSICAL_PARAMETER_DESCRIPTORS
    expect(() => validatePhysicalParameterValue(lossDbPerKm, -0.1)).toThrow(/nonnegative/)
    expect(() => validatePhysicalParameterValue(lossDbPerKm, Infinity)).toThrow(/finite/)
    expect(() => validatePhysicalParameterValue(transmissivity, -0.1)).toThrow(/0 through 1/)
    expect(() => validatePhysicalParameterValue(transmissivity, 1.1)).toThrow(/0 through 1/)
    expect(validatePhysicalParameterValue(transmissivity, 0)).toBe(0)
    expect(validatePhysicalParameterValue(transmissivity, 1)).toBe(1)
  })
})

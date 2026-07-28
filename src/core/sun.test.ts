import { describe, expect, it } from 'vitest'

import { subsolarPoint } from './sun'

describe('subsolarPoint', () => {
  it('place le soleil sur l’équateur aux équinoxes', () => {
    expect(subsolarPoint(new Date('2026-03-20T12:00:00Z')).lat).toBeCloseTo(0, 0)
    expect(subsolarPoint(new Date('2026-09-23T12:00:00Z')).lat).toBeCloseTo(0, 0)
  })

  it('atteint les tropiques aux solstices (± déclinaison max ≈ 23,44°)', () => {
    expect(subsolarPoint(new Date('2026-06-21T12:00:00Z')).lat).toBeCloseTo(23.44, 0)
    expect(subsolarPoint(new Date('2026-12-21T12:00:00Z')).lat).toBeCloseTo(-23.44, 0)
  })

  it('positionne la longitude subsolaire près de Greenwich à midi UTC', () => {
    // À 12 h UTC, seule l’équation du temps écarte le soleil du méridien de Greenwich.
    expect(Math.abs(subsolarPoint(new Date('2026-03-20T12:00:00Z')).lng)).toBeLessThan(5)
  })

  it('bascule la longitude subsolaire vers l’antiméridien à minuit UTC', () => {
    const lng = subsolarPoint(new Date('2026-06-21T00:00:00Z')).lng
    expect(Math.abs(Math.abs(lng) - 180)).toBeLessThan(5)
  })

  it('reste dans [-180, 180)', () => {
    for (let h = 0; h < 24; h++) {
      const { lng } = subsolarPoint(new Date(Date.UTC(2026, 5, 21, h)))
      expect(lng).toBeGreaterThanOrEqual(-180)
      expect(lng).toBeLessThan(180)
    }
  })
})

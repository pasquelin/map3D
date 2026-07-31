import { describe, expect, it } from 'vitest'
import { approach, smoothstep } from './math'

describe('smoothstep', () => {
  it('vaut 0 avant, 1 après', () => {
    expect(smoothstep(0.75, 0.95, 0.5)).toBe(0)
    expect(smoothstep(0.75, 0.95, 1)).toBe(1)
  })

  it('passe par 0,5 au milieu', () => {
    expect(smoothstep(0.75, 0.95, 0.85)).toBeCloseTo(0.5, 6)
  })

  it('est monotone croissante', () => {
    let prev = -1
    for (let x = 0.7; x <= 1; x += 0.01) {
      const v = smoothstep(0.75, 0.95, x)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})

describe('approach', () => {
  it('colle immédiatement à la cible sans lissage', () => {
    expect(approach(0, 10, 0, 0.016)).toBe(10)
  })

  it('est indépendante de la cadence : deux pas à 60 Hz = un pas à 30 Hz', () => {
    // C'est TOUTE la raison d'être d'une constante de temps plutôt qu'un facteur par frame.
    const deuxPas = approach(approach(0, 10, 0.25, 1 / 60), 10, 0.25, 1 / 60)
    expect(deuxPas).toBeCloseTo(approach(0, 10, 0.25, 1 / 30), 10)
  })

  it('converge sans jamais dépasser', () => {
    let v = 0
    for (let i = 0; i < 500; i++) v = approach(v, 10, 0.25, 1 / 60)
    expect(v).toBeCloseTo(10, 6)
    expect(v).toBeLessThanOrEqual(10)
  })
})

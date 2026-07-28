import { describe, expect, it } from 'vitest'
import { pedestrianView } from './pedestrianView'

describe('pedestrianView', () => {
  it('rend les valeurs de la spec pour les défauts (1000 m, 0,1 m, 700 m)', () => {
    expect(pedestrianView(1000, 0.1, 700)).toEqual({ near: 0.1, far: 1000, fogNear: 700, fogFar: 1000 })
  })

  it('le brouillard finit TOUJOURS au far — sinon la coupure des tuiles reste visible', () => {
    const v = pedestrianView(500, 0.1, 400)
    expect(v.fogFar).toBe(v.far)
  })

  it('un début de brouillard au-delà du far est ramené en deçà', () => {
    // Un réglage incohérent (fog après la coupure) ne doit pas rendre le brouillard inerte.
    const v = pedestrianView(1000, 0.1, 5000)
    expect(v.fogNear).toBeLessThan(v.far)
    expect(v.fogNear).toBe(700)
  })

  it('un near nul ou négatif est relevé au plancher — un near à 0 casse la projection', () => {
    expect(pedestrianView(1000, 0, 700).near).toBe(0.01)
    expect(pedestrianView(1000, -5, 700).near).toBe(0.01)
  })

  it('une distance de vue trop courte ne descend pas sous un ratio far/near exploitable', () => {
    // far/near < 100 : le buffer de profondeur perd toute précision utile.
    const v = pedestrianView(1, 0.1, 0.5)
    expect(v.far).toBe(10)
  })

  it('le début du brouillard ne passe jamais devant le near', () => {
    expect(pedestrianView(1000, 0.1, 0).fogNear).toBeGreaterThanOrEqual(0.1)
  })
})

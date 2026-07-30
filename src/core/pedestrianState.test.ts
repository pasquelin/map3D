import { describe, expect, it } from 'vitest'
import { isGroundedView, type PedestrianState, samePedestrianState } from './pedestrianState'

const base: PedestrianState = {
  mode: 'orbit',
  phase: 'placing',
  immersion: 'explore',
  available: true,
  heading: 0,
  pitch: 0,
}

describe('samePedestrianState', () => {
  it('reconnaît deux états identiques', () => {
    expect(samePedestrianState(base, { ...base })).toBe(true)
  })

  it('distingue un changement de mode', () => {
    expect(samePedestrianState(base, { ...base, mode: 'pedestrian' })).toBe(false)
  })

  it('distingue un changement de phase', () => {
    expect(samePedestrianState(base, { ...base, phase: 'active' })).toBe(false)
  })

  it('distingue un changement de niveau d’immersion', () => {
    expect(samePedestrianState(base, { ...base, immersion: 'full' })).toBe(false)
  })

  it('distingue un changement de disponibilité', () => {
    expect(samePedestrianState(base, { ...base, available: false })).toBe(false)
  })

  it('IGNORE une variation de cap sous le seuil : la caméra bouge à chaque frame', () => {
    // Sans ce seuil, l'événement se réémettrait 60 fois par seconde et chaque consommateur
    // React se re-rendrait autant — la règle de la spec §10.6.
    expect(samePedestrianState(base, { ...base, heading: 1e-5 })).toBe(true)
  })

  it('signale une rotation réellement perceptible', () => {
    expect(samePedestrianState(base, { ...base, heading: 0.1 })).toBe(false)
  })

  it('applique le même seuil au tangage', () => {
    expect(samePedestrianState(base, { ...base, pitch: 1e-5 })).toBe(true)
    expect(samePedestrianState(base, { ...base, pitch: 0.1 })).toBe(false)
  })
})

describe('isGroundedView', () => {
  it('est vrai pendant la marche', () => {
    expect(isGroundedView({ ...base, mode: 'pedestrian', phase: 'active' })).toBe(true)
  })

  /** Le placement vise un point de rue depuis l'orbite : la caméra n'est pas encore au sol. */
  it('est faux pendant le placement', () => {
    expect(isGroundedView({ ...base, mode: 'pedestrian', phase: 'placing' })).toBe(false)
  })

  it('est faux en orbite', () => {
    expect(isGroundedView({ ...base, mode: 'orbit', phase: 'active' })).toBe(false)
  })
})

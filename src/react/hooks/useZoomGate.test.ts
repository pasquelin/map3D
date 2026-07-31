import { describe, expect, it } from 'vitest'
import { crossedCount } from './useZoomGate'

const BAND = 0.15

describe('crossedCount', () => {
  it('ouvre un seuil seulement au-dessus de la bande haute', () => {
    expect(crossedCount(11, [11], 0, BAND)).toBe(0)
    expect(crossedCount(11.1, [11], 0, BAND)).toBe(0)
    expect(crossedCount(11.2, [11], 0, BAND)).toBe(1)
  })

  it('garde un seuil ouvert jusque sous la bande basse — le clignotement évité', () => {
    // Molette arrêtée pile sur la valeur : l'oscillation ne doit rien faire basculer.
    expect(crossedCount(11, [11], 1, BAND)).toBe(1)
    expect(crossedCount(10.9, [11], 1, BAND)).toBe(1)
    expect(crossedCount(10.8, [11], 1, BAND)).toBe(0)
  })

  it("s'arrête au premier seuil non franchi", () => {
    expect(crossedCount(11.5, [11, 16], 0, BAND)).toBe(1)
    expect(crossedCount(20, [11, 16], 0, BAND)).toBe(2)
    expect(crossedCount(5, [11, 16], 0, BAND)).toBe(0)
  })

  it('applique l’hystérésis au seuil qu’on quitte, pas aux suivants', () => {
    // Deux seuils ouverts, le zoom redescend juste sous le second : le premier reste.
    expect(crossedCount(15.9, [11, 16], 2, BAND)).toBe(2)
    expect(crossedCount(15.8, [11, 16], 2, BAND)).toBe(1)
  })

  it('sans seuil, rien à compter', () => {
    expect(crossedCount(18, [], 0, BAND)).toBe(0)
  })

  it('une bande nulle rend le seuil strict', () => {
    expect(crossedCount(11, [11], 0, 0)).toBe(1)
    expect(crossedCount(10.999, [11], 1, 0)).toBe(0)
  })
})

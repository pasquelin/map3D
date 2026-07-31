import { describe, expect, it } from 'vitest'
import { GRATICULE_LEVELS, pickLevel, visibleSpanDeg } from './graticule'

const MIN = 1 / 60
const SEC = 1 / 3600

describe('GRATICULE_LEVELS', () => {
  it('est strictement décroissante', () => {
    for (let i = 1; i < GRATICULE_LEVELS.length; i++) {
      expect(GRATICULE_LEVELS[i]!).toBeLessThan(GRATICULE_LEVELS[i - 1]!)
    }
  })

  it('ne contient que des valeurs sexagésimales (jamais 0,1°)', () => {
    // Chaque palier vaut un nombre ENTIER de secondes d'arc : c'est ce qui distingue une
    // échelle sexagésimale d'une échelle décimale.
    for (const lvl of GRATICULE_LEVELS) {
      const seconds = lvl * 3600
      expect(Math.abs(seconds - Math.round(seconds))).toBeLessThan(1e-9)
    }
  })

  it('couvre 30° jusqu’à 1″', () => {
    expect(GRATICULE_LEVELS[0]).toBe(30)
    expect(GRATICULE_LEVELS[GRATICULE_LEVELS.length - 1]).toBeCloseTo(SEC, 12)
  })
})

describe('visibleSpanDeg', () => {
  it('rétrécit quand on descend', () => {
    const haut = visibleSpanDeg(10_000_000, 45, 900)
    const bas = visibleSpanDeg(1_000, 45, 900)
    expect(bas).toBeLessThan(haut)
  })

  it('rétrécit vers les pôles à altitude égale (convergence des méridiens)', () => {
    expect(visibleSpanDeg(100_000, 80, 900)).toBeLessThan(visibleSpanDeg(100_000, 0, 900))
  })
})

describe('pickLevel', () => {
  it('choisit une maille qui laisse au moins `targetLines` lignes', () => {
    const lvl = pickLevel(40, 8, null, 0.15, null)
    expect(40 / lvl).toBeGreaterThanOrEqual(8)
  })

  it('prend la maille la PLUS GROSSE qui satisfait la cible', () => {
    // 40° / 5° = 8 lignes : 5° convient, 2° serait inutilement dense.
    expect(pickLevel(40, 8, null, 0.15, null)).toBe(5)
  })

  it('descend en minutes puis en secondes', () => {
    expect(pickLevel(0.5, 8, null, 0.15, null)).toBeCloseTo(2 * MIN, 12)
    expect(pickLevel(0.01, 8, null, 0.15, null)).toBeCloseTo(2 * SEC, 12)
  })

  it('ne descend jamais sous le dernier palier, même en vue extrême', () => {
    expect(pickLevel(1e-9, 8, null, 0.15, null)).toBeCloseTo(SEC, 12)
  })

  it('ne monte jamais au-dessus du premier palier', () => {
    expect(pickLevel(100_000, 8, null, 0.15, null)).toBe(30)
  })

  it('garde le palier courant dans la bande morte (anti-oscillation)', () => {
    // 40° est la frontière exacte entre 5° et 2° à 8 lignes visées. À 38°, le choix « à
    // froid » serait 2° — mais on vient de 5° et l'écart de densité (0,95) reste dans la
    // bande. Sans elle, un zoom arrêté là rebasculerait d'une frame à l'autre, donc
    // reconstruirait la géométrie en boucle.
    expect(pickLevel(38, 8, null, 0.15, null)).toBe(2)
    expect(pickLevel(38, 8, 5, 0.15, null)).toBe(5)
  })

  it('finit par basculer au-delà de la bande morte', () => {
    // 30° : écart de densité 0,75, sous le seuil bas — la maille cède.
    expect(pickLevel(30, 8, 5, 0.15, null)).toBe(2)
    // 100° : écart 2,5, au-dessus du seuil haut — elle cède dans l'autre sens.
    expect(pickLevel(100, 8, 5, 0.15, null)).toBe(10)
  })

  it('un aller-retour autour de la frontière ne bascule pas deux fois', () => {
    let lvl = pickLevel(40, 8, null, 0.15, null)
    const vus = new Set<number>([lvl])
    for (const span of [40 * 1.05, 40 * 0.96, 40 * 1.08, 40 * 0.95]) {
      lvl = pickLevel(span, 8, lvl, 0.15, null)
      vus.add(lvl)
    }
    expect(vus.size).toBe(1)
  })

  it('`range` fige effectivement la maille', () => {
    expect(pickLevel(0.001, 8, null, 0.15, [1, 1])).toBe(1)
    expect(pickLevel(100_000, 8, null, 0.15, [1, 1])).toBe(1)
  })
})

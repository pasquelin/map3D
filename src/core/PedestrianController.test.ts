import { describe, expect, it } from 'vitest'
import { clampPitch, feelerAngles, headingAfterLook } from './PedestrianController'

/* Le contrôleur lui-même a besoin de tuiles et d'un contexte WebGL : ce qui se teste sans
   eux, ce sont les décisions qu'il prend — la répartition des palpeurs et la composition du
   regard. Le reste se vérifie à la main dans l'exemple (spec §17). */

describe('feelerAngles', () => {
  it('vise droit devant avec un palpeur unique — c’est lui qui arrête un mur frontal', () => {
    expect(feelerAngles(1)).toEqual([0])
  })

  it('reste symétrique : autant de palpeurs à gauche qu’à droite', () => {
    const a = feelerAngles(6)
    expect(a).toHaveLength(6)
    expect(a.reduce((s, x) => s + x, 0)).toBeCloseTo(0, 10)
  })

  it('couvre le demi-plan avant, jamais l’arrière — on ne teste pas d’où l’on vient', () => {
    for (const angle of feelerAngles(8)) expect(Math.abs(angle)).toBeLessThanOrEqual(Math.PI / 2)
  })

  it('rend un éventail vide pour un compte nul ou négatif (collision désactivée)', () => {
    expect(feelerAngles(0)).toEqual([])
    expect(feelerAngles(-3)).toEqual([])
  })

  it('pose un palpeur droit devant dès que le compte est impair', () => {
    expect(feelerAngles(7)).toContain(0)
  })

  it('encadre la direction de marche au plus près quand le compte est pair', () => {
    // Pas de palpeur central possible : les deux du milieu doivent rester rapprochés,
    // sinon un mur frontal passerait entre eux.
    const a = feelerAngles(6)
    expect(Math.min(...a.map(Math.abs))).toBeLessThan(Math.PI / 8)
  })
})

describe('clampPitch', () => {
  it('laisse passer un regard dans les bornes', () => {
    expect(clampPitch(0.5, 89)).toBeCloseTo(0.5, 10)
  })

  it('borne le regard vers le haut', () => {
    expect(clampPitch(3, 89)).toBeCloseTo((89 * Math.PI) / 180, 10)
  })

  it('borne le regard vers le bas', () => {
    expect(clampPitch(-3, 89)).toBeCloseTo((-89 * Math.PI) / 180, 10)
  })

  it('n’atteint JAMAIS la verticale exacte, même sur une borne à 90°', () => {
    // À ±90° la base (avant × haut) dégénère et l'orientation devient indéfinie.
    expect(Math.abs(clampPitch(99, 90))).toBeLessThan(Math.PI / 2)
  })
})

describe('headingAfterLook', () => {
  it('tourne proportionnellement au déplacement souris et à la sensibilité', () => {
    // 10 px × 0,15 °/px = 1,5° vers la droite.
    expect(headingAfterLook(0, 10, 0.15)).toBeCloseTo((1.5 * Math.PI) / 180, 10)
  })

  it('reste dans [0, 2π[ après plusieurs tours', () => {
    const h = headingAfterLook(0, 100_000, 0.15)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(2 * Math.PI)
  })

  it('reste positif en tournant à gauche — un cap négatif fausserait toute comparaison', () => {
    expect(headingAfterLook(0, -10, 0.15)).toBeGreaterThan(0)
  })
})

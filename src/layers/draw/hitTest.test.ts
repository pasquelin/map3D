import { describe, expect, it } from 'vitest'
import { pointInPolygon, segDistPx, segmentsIntersect, shapeTouchesSelector, type ScreenPt } from './hitTest'

// Filet anti-régression (Tâche 0) : fige le comportement RÉEL de ces fonctions pures
// avant tout déplacement de fichier. Les valeurs attendues sont calculées à la main
// à partir du code lu (clamp du paramètre t, ray casting, orientation signée) —
// aucune n'est « souhaitée », toutes sont dérivées de l'implémentation actuelle.

describe('segDistPx', () => {
  it('point perpendiculaire au milieu d’un segment horizontal : distance = écart vertical', () => {
    // Segment (0,0)-(10,0), point (5,3) : projection au milieu, t = 0.5.
    expect(segDistPx(5, 3, 0, 0, 10, 0)).toBe(3)
  })

  it('point au-delà de l’extrémité B : t se clampe à 1, distance au bout du segment', () => {
    // t brut = 1.5 → clampé à 1 → point le plus proche = (10,0).
    expect(segDistPx(15, 4, 0, 0, 10, 0)).toBeCloseTo(Math.hypot(5, 4), 10)
  })

  it('segment dégénéré (A = B) : len2 = 0, distance point à point', () => {
    expect(segDistPx(5, 6, 2, 2, 2, 2)).toBe(5)
  })
})

describe('pointInPolygon', () => {
  const square: ScreenPt[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  it('point au centre d’un carré : dedans', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
  })

  it('point à l’extérieur, à droite du carré : dehors', () => {
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false)
  })
})

describe('segmentsIntersect', () => {
  it('deux segments en croix (diagonales d’un carré) se croisent', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true)
  })

  it('deux segments disjoints et non parallèles, du même côté l’un de l’autre : ne se croisent pas', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 6, y: 1 }, { x: 6, y: 4 })).toBe(false)
  })

  it('deux segments parallèles disjoints : ne se croisent pas', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false)
  })
})

describe('shapeTouchesSelector', () => {
  const square: ScreenPt[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  it('un sommet de la forme tombe dans le sélecteur : touche', () => {
    const shape: ScreenPt[] = [
      { x: 5, y: 5 },
      { x: 20, y: 20 },
    ]
    expect(shapeTouchesSelector(shape, false, square)).toBe(true)
  })

  it('forme entièrement hors du sélecteur, aucune arête ne le croise : ne touche pas', () => {
    const shape: ScreenPt[] = [
      { x: 50, y: 50 },
      { x: 60, y: 60 },
    ]
    expect(shapeTouchesSelector(shape, false, square)).toBe(false)
  })

  it('aucun sommet dedans, mais une arête traverse le sélecteur de part en part : touche', () => {
    const shape: ScreenPt[] = [
      { x: -5, y: 5 },
      { x: 15, y: 5 },
    ]
    expect(shapeTouchesSelector(shape, false, square)).toBe(true)
  })

  it('forme fermée qui englobe le sélecteur (sommets du sélecteur dedans, sans arête croisée) : touche', () => {
    const big: ScreenPt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]
    const small: ScreenPt[] = [
      { x: 40, y: 40 },
      { x: 60, y: 40 },
      { x: 60, y: 60 },
      { x: 40, y: 60 },
    ]
    expect(shapeTouchesSelector(big, true, small)).toBe(true)
  })

  it('sélecteur de moins de 3 sommets : jamais de contact', () => {
    const shape: ScreenPt[] = [{ x: 5, y: 5 }]
    const selector: ScreenPt[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]
    expect(shapeTouchesSelector(shape, false, selector)).toBe(false)
  })

  it('forme vide : jamais de contact', () => {
    expect(shapeTouchesSelector([], false, square)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { type FeelerHit, slideMove, smoothHeight, stepGround } from './pedestrianCollision'

/** Palpeur touchant dans la direction donnée (déjà normalisée), à `distance` mètres. */
const hit = (dirEast: number, dirNorth: number, distance: number): FeelerHit => ({ dirEast, dirNorth, distance })

describe('slideMove', () => {
  it('laisse le déplacement intact quand aucun palpeur ne touche', () => {
    expect(slideMove({ east: 1, north: 0 }, [], 0.3)).toEqual({ east: 1, north: 0 })
  })

  it('ignore un impact hors de portée du corps', () => {
    // 0,9 m > rayon 0,3 m : le mur est vu mais pas encore atteint.
    expect(slideMove({ east: 1, north: 0 }, [hit(1, 0, 0.9)], 0.3)).toEqual({ east: 1, north: 0 })
  })

  it('annule la composante frontale contre un mur perpendiculaire', () => {
    const out = slideMove({ east: 1, north: 0 }, [hit(1, 0, 0.1)], 0.3)
    expect(out.east).toBeCloseTo(0, 10)
    expect(out.north).toBeCloseTo(0, 10)
  })

  it('GLISSE le long du mur au lieu de coller : la composante tangente survit', () => {
    // On marche au nord-est, le mur est plein est → il reste le nord.
    const out = slideMove({ east: 1, north: 1 }, [hit(1, 0, 0.1)], 0.3)
    expect(out.east).toBeCloseTo(0, 10)
    expect(out.north).toBeCloseTo(1, 10)
  })

  it('glisse sur un mur en biais à 45°', () => {
    const s = Math.SQRT1_2
    const out = slideMove({ east: 1, north: 0 }, [hit(s, s, 0.1)], 0.3)
    // Projeté sur le plan du mur : la norme diminue, la direction tourne vers le sud-est.
    expect(out.east).toBeCloseTo(0.5, 10)
    expect(out.north).toBeCloseTo(-0.5, 10)
  })

  it("n'entrave pas un déplacement qui S'ÉLOIGNE d'un mur déjà collé", () => {
    // Mur à l'est, on repart à l'ouest : sans cette garde, on resterait scotché.
    expect(slideMove({ east: -1, north: 0 }, [hit(1, 0, 0.05)], 0.3)).toEqual({ east: -1, north: 0 })
  })

  it('bloque un angle rentrant (deux murs perpendiculaires)', () => {
    const out = slideMove({ east: 1, north: 1 }, [hit(1, 0, 0.1), hit(0, 1, 0.1)], 0.3)
    expect(out.east).toBeCloseTo(0, 10)
    expect(out.north).toBeCloseTo(0, 10)
  })
})

describe('stepGround', () => {
  it('monte un trottoir sous le seuil', () => {
    expect(stepGround(34, 34.15, 0.4)).toBe(34.15)
  })

  it('accepte le seuil exact', () => {
    expect(stepGround(34, 34.4, 0.4)).toBe(34.4)
  })

  it('refuse une montée au-dessus du seuil : c’est un mur, pas une marche', () => {
    expect(stepGround(34, 37, 0.4)).toBeNull()
  })

  it('ne borne PAS la descente — on tombe le long d’une pente ou d’un escalier', () => {
    expect(stepGround(34, 30, 0.4)).toBe(30)
  })
})

describe('smoothHeight', () => {
  it('atteint la cible immédiatement quand le lissage est nul', () => {
    expect(smoothHeight(0, 10, 0, 1 / 60)).toBe(10)
  })

  it('avance vers la cible sans la dépasser', () => {
    const out = smoothHeight(0, 10, 0.25, 1 / 60)
    expect(out).toBeGreaterThan(0)
    expect(out).toBeLessThan(10)
  })

  it('est indépendant de la cadence : deux demi-pas valent un pas entier', () => {
    // C'est tout l'intérêt de l'interpolation exponentielle — un facteur brut ferait
    // dépendre la vitesse de convergence du nombre de frames par seconde.
    const un = smoothHeight(0, 10, 0.25, 1 / 30)
    const deux = smoothHeight(smoothHeight(0, 10, 0.25, 1 / 60), 10, 0.25, 1 / 60)
    expect(deux).toBeCloseTo(un, 10)
  })

  it('converge vers la cible sur un grand pas de temps', () => {
    expect(smoothHeight(0, 10, 0.25, 5)).toBeCloseTo(10, 6)
  })
})

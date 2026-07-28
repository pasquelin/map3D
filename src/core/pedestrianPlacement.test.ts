import { describe, expect, it } from 'vitest'
import { isGroundPlacement } from './pedestrianPlacement'

describe('isGroundPlacement', () => {
  it('accepte la rue : la surface visée est au niveau du sol de la couronne', () => {
    expect(isGroundPlacement(34.2, 34.0, 2)).toBe(true)
  })

  it('refuse un toit : la surface visée domine la rue voisine de plusieurs dizaines de mètres', () => {
    expect(isGroundPlacement(78, 34, 2)).toBe(false)
  })

  it('refuse le ciel — aucun impact, donc rien à valider', () => {
    expect(isGroundPlacement(null, 34, 2)).toBe(false)
  })

  it('refuse un sol de couronne indéterminé : aucune tuile chargée sous le point', () => {
    expect(isGroundPlacement(34, null, 2)).toBe(false)
  })

  it('accepte le seuil EXACT — la borne est inclusive', () => {
    expect(isGroundPlacement(36, 34, 2)).toBe(true)
  })

  it('refuse juste au-dessus du seuil', () => {
    expect(isGroundPlacement(36.001, 34, 2)).toBe(false)
  })

  it('accepte un point SOUS le sol de la couronne (creux, passage sous voie)', () => {
    // Le minimum de la couronne peut être plus haut que le point visé : ce n'est pas un toit.
    expect(isGroundPlacement(30, 34, 2)).toBe(true)
  })
})

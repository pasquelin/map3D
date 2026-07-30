import { describe, expect, it } from 'vitest'
import { meshRows } from './TiledGlobeLayer'
import { tileYToLat } from '../core/googleTiles'

/** Limite mathématique de Web Mercator : au-delà, la projection part à l'infini. */
const MERCATOR_MAX = 85.0511287798066

describe('meshRows — calottes polaires du fond tuilé', () => {
  it('laisse une tuile ordinaire strictement dans son emprise', () => {
    const rows = meshRows(1, 2, 4, true)
    expect(rows).toHaveLength(5)
    expect(rows[0]!.lat).toBeCloseTo(tileYToLat(1, 2), 6)
    expect(rows[rows.length - 1]!.lat).toBeCloseTo(tileYToLat(2, 2), 6)
    // Les `v` couvrent l'image entière, sans débord.
    expect(rows.map((r) => r.v)).toEqual([0, 0.25, 0.5, 0.75, 1])
  })

  it('prolonge la rangée du nord jusqu’au pôle', () => {
    const rows = meshRows(0, 2, 4, true)
    expect(rows).toHaveLength(6)
    expect(rows[0]!.lat).toBe(90)
    // La ligne du pôle échantillonne le MÊME texel que le bord : c'est ce qui étire la
    // dernière ligne de l'image au lieu de l'extrapoler.
    expect(rows[0]!.v).toBe(0)
    expect(rows[1]!.v).toBe(0)
    expect(rows[1]!.lat).toBeCloseTo(MERCATOR_MAX, 4)
  })

  it('prolonge la rangée du sud jusqu’au pôle', () => {
    const rows = meshRows(3, 2, 4, true)
    expect(rows).toHaveLength(6)
    const dernier = rows[rows.length - 1]!
    const avant = rows[rows.length - 2]!
    expect(dernier.lat).toBe(-90)
    expect(dernier.v).toBe(1)
    expect(avant.v).toBe(1)
    expect(avant.lat).toBeCloseTo(-MERCATOR_MAX, 4)
  })

  it('ne touche à rien quand le remplissage est coupé', () => {
    for (const y of [0, 3]) {
      const rows = meshRows(y, 2, 4, false)
      expect(rows).toHaveLength(5)
      expect(rows.some((r) => Math.abs(r.lat) === 90)).toBe(false)
    }
  })

  it('ne remplit qu’un seul côté quand la pyramide n’a qu’une tuile', () => {
    // Au zoom 0, l'unique tuile est À LA FOIS la rangée du nord et celle du sud : elle
    // doit recevoir les DEUX calottes, sans quoi le globe de repli garderait un trou.
    const rows = meshRows(0, 0, 2, true)
    expect(rows[0]!.lat).toBe(90)
    expect(rows[rows.length - 1]!.lat).toBe(-90)
    expect(rows).toHaveLength(5)
  })

  it('monte les lignes du nord vers le sud, quel que soit le cas', () => {
    // Invariant du maillage : les indices de triangles supposent des lignes ordonnées.
    for (const [y, z] of [
      [0, 0],
      [0, 2],
      [1, 2],
      [3, 2],
      [17, 5],
    ] as const) {
      const rows = meshRows(y, z, 4, true)
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]!.lat).toBeLessThan(rows[i - 1]!.lat)
      }
    }
  })
})

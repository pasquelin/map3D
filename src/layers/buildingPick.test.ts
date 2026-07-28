import { describe, expect, it } from 'vitest'
import type { TileBuildings } from '../data/mvt'
import { buildingAtVertex, buildingAttrs, paintRange, restoreRange, saveRange } from './buildingPick'

/** Trois bâtiments : sommets 0-9, 10-29, 30-31. La 4ᵉ entrée est la sentinelle. */
const V_START = new Uint32Array([0, 10, 30, 32])

describe('buildingAtVertex', () => {
  it('trouve le bâtiment de chaque sommet, bornes comprises', () => {
    expect(buildingAtVertex(V_START, 0)).toBe(0)
    expect(buildingAtVertex(V_START, 9)).toBe(0)
    expect(buildingAtVertex(V_START, 10)).toBe(1)
    expect(buildingAtVertex(V_START, 29)).toBe(1)
    expect(buildingAtVertex(V_START, 30)).toBe(2)
    expect(buildingAtVertex(V_START, 31)).toBe(2)
  })

  it('rend -1 hors de toute plage', () => {
    // La sentinelle n'appartient à personne : un sommet au-delà du total n'existe pas, et
    // rendre le dernier bâtiment ferait surligner un voisin arbitraire.
    expect(buildingAtVertex(V_START, 32)).toBe(-1)
    expect(buildingAtVertex(V_START, 99)).toBe(-1)
    expect(buildingAtVertex(V_START, -1)).toBe(-1)
  })

  it('rend -1 sur une table vide', () => {
    expect(buildingAtVertex(new Uint32Array([0]), 0)).toBe(-1)
  })
})

describe('buildingAttrs', () => {
  const table: TileBuildings = {
    vStart: V_START,
    featureIds: new Float64Array([41, Number.NaN, 43]),
    heights: new Float32Array([12, 0, 30, 4, 8, 0]),
    props: null,
  }

  it('lit les hauteurs entrelacées du bon bâtiment', () => {
    expect(buildingAttrs(table, 1)).toEqual({ featureId: null, height: 30, minHeight: 4, props: {} })
  })

  it('traduit le NaN d’identifiant en null', () => {
    // `NaN` est le marqueur de transport (un `Float64Array` ne porte pas `undefined`) : il
    // ne doit jamais atteindre l'hôte.
    expect(buildingAttrs(table, 1).featureId).toBeNull()
    expect(buildingAttrs(table, 0).featureId).toBe(41)
  })

  it('rend les attributs demandés quand la tuile en porte', () => {
    expect(buildingAttrs({ ...table, props: [{ name: 'A' }, { name: 'B' }, {}] }, 1).props).toEqual({ name: 'B' })
  })
})

describe('paintRange / restoreRange', () => {
  /** Trois sommets, trois couleurs distinctes — de quoi voir un décalage d'un octet. */
  const original = () => new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90])

  it('ne repeint que la plage demandée', () => {
    const colors = original()
    paintRange(colors, 1, 2, 200, 100, 50)
    expect(Array.from(colors)).toEqual([10, 20, 30, 200, 100, 50, 70, 80, 90])
  })

  it('survol puis sortie rendent EXACTEMENT les couleurs d’origine', () => {
    // C'est l'invariant du highlight : il emprunte des couleurs, il ne les remplace pas.
    // Un octet non rendu se voit comme une façade restée teintée après le passage.
    const colors = original()
    const saved = new Uint8Array(3)
    saveRange(colors, 1, 2, saved)
    paintRange(colors, 1, 2, 200, 100, 50)
    restoreRange(colors, 1, saved, 3)
    expect(Array.from(colors)).toEqual(Array.from(original()))
  })

  it('restaure sur une longueur donnée, pas sur celle du tampon', () => {
    // Le tampon de sauvegarde est RECYCLÉ entre deux survols : plus grand que la plage
    // courante, il déborderait sur le bâtiment voisin si la longueur venait de lui.
    const colors = original()
    const saved = new Uint8Array(9)
    saveRange(colors, 0, 1, saved)
    paintRange(colors, 0, 3, 1, 1, 1)
    restoreRange(colors, 0, saved, 3)
    expect(Array.from(colors)).toEqual([10, 20, 30, 1, 1, 1, 1, 1, 1])
  })
})

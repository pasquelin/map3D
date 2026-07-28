import { describe, expect, it } from 'vitest'
import type { TileBuildings } from '../data/mvt'
import { buildingAtVertex, buildingAttrs, highlightActions, paintRange, restoreRange, saveRange } from './buildingPick'

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

describe('highlightActions — survol et menu ne se marchent pas dessus', () => {
  const A = { tileKey: 't1', index: 0 }
  const B = { tileKey: 't1', index: 1 }
  const none = { hover: null, active: null }

  it('pose le survol quand rien n’est posé', () => {
    expect(highlightActions(none, A, 'hover')).toEqual({ restore: ['hover'], paint: A })
  })

  it('ne rejoue rien quand le survol ne bouge pas', () => {
    // `pointermove` appelle à chaque pixel : re-sauvegarder capturerait la teinte posée.
    expect(highlightActions({ hover: A, active: null }, A, 'hover')).toEqual({ restore: [], paint: null })
  })

  it('lève le survol avant d’ouvrir le menu SUR LE MÊME bâtiment', () => {
    // LA régression : sans ce `restore('hover')`, le menu sauvegardait la teinte de survol
    // et la rendait à sa fermeture — le bâtiment restait jaune définitivement.
    expect(highlightActions({ hover: A, active: null }, A, 'active')).toEqual({
      restore: ['hover', 'active'],
      paint: A,
    })
  })

  it('laisse le menu ouvert primer sur le survol du même bâtiment', () => {
    // Le pointeur repasse sur le bâtiment dont le menu est ouvert : il garde sa teinte de
    // sélection. Le survol précédent, lui, est bien levé.
    expect(highlightActions({ hover: B, active: A }, A, 'hover')).toEqual({ restore: ['hover'], paint: null })
  })

  it('permet de survoler un AUTRE bâtiment que celui du menu', () => {
    expect(highlightActions({ hover: null, active: A }, B, 'hover')).toEqual({ restore: ['hover'], paint: B })
  })

  it('retire un genre avec null', () => {
    expect(highlightActions({ hover: A, active: null }, null, 'hover')).toEqual({ restore: ['hover'], paint: null })
  })
})

describe('paintRange / restoreRange', () => {
  /** Trois sommets, trois couleurs distinctes — de quoi voir un décalage d'un octet. */
  const original = () => new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90])
  /** Ombrage neutre : toutes les faces à pleine lumière. */
  const FULL = new Uint8Array([255, 255, 255])

  it('ne repeint que la plage demandée', () => {
    const colors = original()
    paintRange(colors, 1, 2, 200, 100, 50, FULL)
    expect(Array.from(colors)).toEqual([10, 20, 30, 200, 100, 50, 70, 80, 90])
  })

  it('GARDE le relief : la teinte est modulée par l’ombrage de chaque sommet', () => {
    // La régression que ce test verrouille : une teinte UNIE effaçait l'ombrage cuit dans
    // les couleurs de sommets. Le bâtiment survolé devenait un aplat — ses quatre façades
    // confondues, sans le volume que tout le quartier garde.
    const colors = new Uint8Array(9)
    // Trois faces d'exposition décroissante : pleine, moitié, tiers.
    const shade = new Uint8Array([255, 128, 85])
    paintRange(colors, 0, 3, 240, 180, 60, shade)
    expect(Array.from(colors.subarray(0, 3))).toEqual([240, 180, 60])
    // Chaque sommet garde SON facteur : la façade à mi-lumière sort à mi-teinte.
    expect(colors[3]).toBe(Math.trunc((240 * 128) / 255))
    expect(colors[6]).toBe(Math.trunc((240 * 85) / 255))
    // …et les trois faces restent distinctes entre elles, ce qui est tout l'enjeu.
    expect(new Set([colors[0], colors[3], colors[6]]).size).toBe(3)
  })

  it('survol puis sortie rendent EXACTEMENT les couleurs d’origine', () => {
    // C'est l'invariant du highlight : il emprunte des couleurs, il ne les remplace pas.
    // Un octet non rendu se voit comme une façade restée teintée après le passage.
    const colors = original()
    const saved = new Uint8Array(3)
    saveRange(colors, 1, 2, saved)
    paintRange(colors, 1, 2, 200, 100, 50, FULL)
    restoreRange(colors, 1, saved, 3)
    expect(Array.from(colors)).toEqual(Array.from(original()))
  })

  it('restaure sur une longueur donnée, pas sur celle du tampon', () => {
    // Le tampon de sauvegarde est RECYCLÉ entre deux survols : plus grand que la plage
    // courante, il déborderait sur le bâtiment voisin si la longueur venait de lui.
    const colors = original()
    const saved = new Uint8Array(9)
    saveRange(colors, 0, 1, saved)
    paintRange(colors, 0, 3, 1, 1, 1, new Uint8Array([255, 255, 255]))
    restoreRange(colors, 0, saved, 3)
    expect(Array.from(colors)).toEqual([10, 20, 30, 1, 1, 1, 1, 1, 1])
  })
})

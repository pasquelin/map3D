import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../config/defaultConfig'
import type { MapConfig } from '../../config/types'
import { ErasableRegistry, type ErasableProvider } from '../../core/Erasables'
import { Projection } from '../../core/Projection'
import { DrawLayer, type DrawDefaults, type EraseResult } from '../DrawLayer'

// `Projection` non contextualisée (`isReady() === false`) : aucun rendu WebGL réel. Les
// chemins testés ici (eraseSymbol, filtre config, verrou, historique) sont géométrie-
// indépendants — ils opèrent par id sur la collection, pas par projection écran.

const DEFAULTS: DrawDefaults = { color: '#3388ff', width: 2, fillOpacity: 0.3 }

/** Deux points suffisent à une ligne — la géométrie n'entre pas dans ces prédicats. */
const POINTS = [
  { lat: 48.85, lng: 2.35 },
  { lat: 48.86, lng: 2.36 },
]

function makeLayer(): DrawLayer {
  return new DrawLayer(new THREE.Group(), new Projection(), document.createElement('div'), DEFAULTS)
}

/** `config` complet avec une catégorie de gomme désactivée. */
function withTarget(key: keyof MapConfig['erase']['targets'], value: boolean): MapConfig {
  return { ...defaultConfig, erase: { targets: { ...defaultConfig.erase.targets, [key]: value } } }
}

describe('DrawLayer.eraseSymbol — gomme ponctuelle d’un symbole', () => {
  it('retire le symbole, émet onErase (dans shapes) ET onShapeDelete', () => {
    const layer = makeLayer()
    const id = layer.placeSymbol('sugpewrh--------', { lat: 48.85, lng: 2.35 })
    const erased: EraseResult[] = []
    const deleted: string[] = []
    layer.onErase = (r) => erased.push(r)
    layer.onShapeDelete = (s) => deleted.push(s.id)

    layer.eraseSymbol(id)

    expect(layer.getShape(id)).toBeNull()
    expect(erased).toHaveLength(1)
    expect(erased[0]!.shapes.map((s) => s.id)).toEqual([id])
    expect(erased[0]!.paths).toEqual([])
    expect(erased[0]!.hostShapes).toEqual([])
    // Iso avec le CRUD par identité : les objets possédés passent aussi par onShapeDelete.
    expect(deleted).toEqual([id])
    // Une entrée d’historique → annulable.
    expect(layer.canUndo).toBe(true)
  })

  it('respecte config.erase.targets.symbol = false (rien effacé, rien émis)', () => {
    const layer = makeLayer()
    layer.setConfig(withTarget('symbol', false))
    const id = layer.placeSymbol('sugpewrh--------', { lat: 48.85, lng: 2.35 })
    const erased: EraseResult[] = []
    layer.onErase = (r) => erased.push(r)

    layer.eraseSymbol(id)

    expect(layer.getShape(id)).not.toBeNull()
    expect(erased).toEqual([])
  })

  it('épargne un symbole verrouillé', () => {
    const layer = makeLayer()
    const id = layer.placeSymbol('sugpewrh--------', { lat: 48.85, lng: 2.35 })
    layer.setLocked([id], true)
    const erased: EraseResult[] = []
    layer.onErase = (r) => erased.push(r)

    layer.eraseSymbol(id)

    expect(layer.getShape(id)).not.toBeNull()
    expect(erased).toEqual([])
  })
})

/** Provider hôte minimal : `has` répond depuis la même liste que `items`, comme le font
 *  `PathLayer`/`ShapeLayer` (qui, eux, l'évaluent sans construire les anneaux). */
function hostProvider(kind: 'path' | 'shape', ids: readonly string[]): ErasableProvider {
  return {
    kind,
    items: () => ids.map((id) => ({ id, ring: [{ lat: 0, lng: 0 }], closed: kind === 'shape', kind })),
    has: () => ids.length > 0,
  }
}

describe('ErasableRegistry — inventaire des objets hôte effaçables', () => {
  it('all() concatène les items des providers ; la désinscription les retire', () => {
    const reg = new ErasableRegistry()
    const off = reg.register(hostProvider('path', ['r1']))
    reg.register(hostProvider('shape', ['z1']))

    expect(
      reg
        .all()
        .map((i) => i.id)
        .sort(),
    ).toEqual(['r1', 'z1'])

    off()
    expect(reg.all().map((i) => i.id)).toEqual(['z1'])
  })

  it('hasAny() ne répond que pour les catégories AUTORISÉES', () => {
    const reg = new ErasableRegistry()
    reg.register(hostProvider('path', ['r1']))

    expect(reg.hasAny(defaultConfig.erase.targets)).toBe(true)
    // Seule catégorie présente interdite → la gomme n'a plus rien à mordre.
    expect(reg.hasAny(withTarget('path', false).erase.targets)).toBe(false)
  })

  it('hasAny() est faux sur un provider vide (registre non vide ≠ objets présents)', () => {
    const reg = new ErasableRegistry()
    reg.register(hostProvider('shape', []))
    expect(reg.hasAny(defaultConfig.erase.targets)).toBe(false)
  })
})

describe('DrawLayer.canClear — ce que « Tout effacer » aurait à effacer', () => {
  it('faux sur une carte vierge, vrai dès qu’une forme est posée', () => {
    const layer = makeLayer()
    expect(layer.canClear).toBe(false)

    layer.placeSymbol('sugpewrh--------', { lat: 48.85, lng: 2.35 })
    expect(layer.canClear).toBe(true)
  })

  it('faux quand tout est verrouillé — `clear()` épargne ces formes', () => {
    const layer = makeLayer()
    const id = layer.placeSymbol('sugpewrh--------', { lat: 48.85, lng: 2.35 })
    layer.setLocked([id], true)
    expect(layer.canClear).toBe(false)
  })

  it('faux quand le filtre « Couches » masque tout — `clear()` ne touche que le visible', () => {
    const layer = makeLayer()
    layer.addShape({ kind: 'line', points: POINTS, style: {}, tags: ['secteur'] })
    expect(layer.canClear).toBe(true)

    layer.setTagVisibility(() => false)
    expect(layer.canClear).toBe(false)

    layer.setTagVisibility(() => true)
    expect(layer.canClear).toBe(true)
  })
})

describe('DrawLayer.canErase — ce que la gomme aurait à mordre', () => {
  it('faux sur une carte vierge, vrai dès qu’une forme est posée', () => {
    const layer = makeLayer()
    expect(layer.canErase).toBe(false)

    layer.addShape({ kind: 'line', points: POINTS, style: {} })
    expect(layer.canErase).toBe(true)
  })

  it('suit config.erase.targets catégorie par catégorie', () => {
    const layer = makeLayer()
    layer.placeSymbol('sugpewrh--------', { lat: 48.85, lng: 2.35 })
    expect(layer.canErase).toBe(true)

    // Seuls des symboles à l'écran, et les symboles sont interdits à la gomme.
    layer.setConfig(withTarget('symbol', false))
    expect(layer.canErase).toBe(false)
  })

  it('épargne les formes verrouillées et masquées, comme les deux modes de gomme', () => {
    const layer = makeLayer()
    const id = layer.addShape({ kind: 'line', points: POINTS, style: {}, tags: ['secteur'] })!
    layer.setLocked([id], true)
    expect(layer.canErase).toBe(false)

    layer.setLocked([id], false)
    layer.setTagVisibility(() => false)
    expect(layer.canErase).toBe(false)
  })

  it('compte les objets HÔTE, eux aussi filtrés par les cibles', () => {
    const layer = makeLayer()
    const reg = new ErasableRegistry()
    reg.register(hostProvider('path', ['r1']))
    layer.setErasables(reg)

    // Aucune forme possédée : la gomme n'existe que pour le tracé hôte.
    expect(layer.canErase).toBe(true)

    layer.setConfig(withTarget('path', false))
    expect(layer.canErase).toBe(false)
  })
})

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../config/defaultConfig'
import type { MapConfig } from '../../config/types'
import { ErasableRegistry } from '../../core/Erasables'
import { Projection } from '../../core/Projection'
import { DrawLayer, type DrawDefaults, type EraseResult } from '../DrawLayer'

// `Projection` non contextualisée (`isReady() === false`) : aucun rendu WebGL réel. Les
// chemins testés ici (eraseSymbol, filtre config, verrou, historique) sont géométrie-
// indépendants — ils opèrent par id sur la collection, pas par projection écran.

const DEFAULTS: DrawDefaults = { color: '#3388ff', width: 2, fillOpacity: 0.3 }

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

describe('ErasableRegistry — inventaire des objets hôte effaçables', () => {
  it('all() concatène les items des providers ; la désinscription les retire', () => {
    const reg = new ErasableRegistry()
    const off = reg.register({
      items: () => [{ id: 'r1', ring: [{ lat: 0, lng: 0 }], closed: false, kind: 'path' }],
    })
    reg.register({
      items: () => [{ id: 'z1', ring: [{ lat: 1, lng: 1 }], closed: true, kind: 'shape' }],
    })

    expect(
      reg
        .all()
        .map((i) => i.id)
        .sort(),
    ).toEqual(['r1', 'z1'])

    off()
    expect(reg.all().map((i) => i.id)).toEqual(['z1'])
  })
})

import { describe, expect, it } from 'vitest'
import {
  catalogKey,
  deserializeSelection,
  parseCatalogKey,
  purgeSources,
  removeFromSelection,
  serializeSelection,
  toggleSelection,
} from './selection'

describe('catalogKey', () => {
  it('compose et décompose une clé', () => {
    const k = catalogKey('cities', 42)
    expect(k).toBe('cities:42')
    expect(parseCatalogKey(k)).toEqual({ sourceId: 'cities', itemId: '42' })
  })

  it('décompose un id contenant lui-même un deux-points', () => {
    const k = catalogKey('zones', 'geo:ref:7')
    expect(parseCatalogKey(k)).toEqual({ sourceId: 'zones', itemId: 'geo:ref:7' })
  })

  it('rejette une clé sans séparateur', () => {
    expect(parseCatalogKey('zones')).toBeNull()
  })

  it('rejette une clé dont la source ou l’élément est vide', () => {
    expect(parseCatalogKey(':42')).toBeNull()
    expect(parseCatalogKey('zones:')).toBeNull()
  })
})

describe('toggleSelection', () => {
  it('ajoute en fin quand absent', () => {
    expect(toggleSelection(['a:1'], 'b:2')).toEqual(['a:1', 'b:2'])
  })

  it('retire quand présent', () => {
    expect(toggleSelection(['a:1', 'b:2'], 'a:1')).toEqual(['b:2'])
  })

  it('ne mute pas le tableau d’entrée', () => {
    const sel = ['a:1']
    toggleSelection(sel, 'b:2')
    expect(sel).toEqual(['a:1'])
  })
})

describe('removeFromSelection', () => {
  it('retire une clé présente', () => {
    expect(removeFromSelection(['a:1', 'b:2'], 'a:1')).toEqual(['b:2'])
  })

  it('retire une clé absente sans erreur et rend la MÊME référence', () => {
    const sel = ['a:1']
    expect(removeFromSelection(sel, 'z:9')).toBe(sel)
  })
})

describe('purgeSources', () => {
  it('ne garde que les clés dont la source est connue', () => {
    expect(purgeSources(['a:1', 'b:2', 'c:3'], new Set(['a', 'c']))).toEqual(['a:1', 'c:3'])
  })

  it('rend la MÊME référence quand rien n’est purgé — pas de re-render inutile', () => {
    const sel = ['a:1']
    expect(purgeSources(sel, new Set(['a']))).toBe(sel)
  })

  it('purge une clé malformée, quelle que soit la liste des sources connues', () => {
    expect(purgeSources(['a:1', 'malformee'], new Set(['a']))).toEqual(['a:1'])
  })
})

describe('sérialisation', () => {
  it('fait un aller-retour fidèle', () => {
    const sel = ['cities:42', 'zones:geo:ref:7']
    expect(deserializeSelection(serializeSelection(sel))).toEqual(sel)
  })

  it('rend une sélection vide sur une entrée illisible', () => {
    expect(deserializeSelection('pas du json')).toEqual([])
    expect(deserializeSelection(null)).toEqual([])
  })

  it('ignore une charge d’une autre version', () => {
    expect(deserializeSelection(JSON.stringify({ v: 0, keys: ['a:1'] }))).toEqual([])
  })

  it('ignore les entrées non conformes dans une charge valide', () => {
    const raw = JSON.stringify({ v: 1, keys: ['a:1', 42, null, 'sans-separateur'] })
    expect(deserializeSelection(raw)).toEqual(['a:1'])
  })

  it('ignore une charge dont `keys` n’est pas un tableau', () => {
    expect(deserializeSelection(JSON.stringify({ v: 1, keys: 'a:1' }))).toEqual([])
  })
})

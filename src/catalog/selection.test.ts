import { describe, expect, it } from 'vitest'
import {
  catalogKey,
  deserializeSelection,
  deserializeSelectionTitles,
  parseCatalogKey,
  purgeSources,
  removeFromSelection,
  restoreCatalogId,
  serializeSelection,
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

describe('restoreCatalogId', () => {
  it('rend un NOMBRE quand l’identifiant était numérique', () => {
    expect(restoreCatalogId('42')).toBe(42)
    expect(restoreCatalogId('0')).toBe(0)
    expect(restoreCatalogId('-7')).toBe(-7)
  })

  it('laisse en texte ce qui ne se re-sérialise pas à l’identique', () => {
    // Une source dont les ids sont des chaînes numériques à zéros significatifs serait
    // cassée par une conversion aveugle : `'007'` n'est pas `7`.
    expect(restoreCatalogId('007')).toBe('007')
    expect(restoreCatalogId('1e3')).toBe('1e3')
    expect(restoreCatalogId(' 42')).toBe(' 42')
    expect(restoreCatalogId('')).toBe('')
  })

  it('laisse en texte un identifiant non numérique', () => {
    expect(restoreCatalogId('geo:ref:7')).toBe('geo:ref:7')
    expect(restoreCatalogId('NaN')).toBe('NaN')
    expect(restoreCatalogId('Infinity')).toBe('Infinity')
  })

  it('fait un aller-retour fidèle avec catalogKey', () => {
    const parsed = parseCatalogKey(catalogKey('cities', 42))
    expect(restoreCatalogId(parsed?.itemId ?? '')).toBe(42)
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

  it('rend une sélection vide sur une charge illisible', () => {
    expect(deserializeSelection('pas un objet')).toEqual([])
    expect(deserializeSelection(null)).toEqual([])
    expect(deserializeSelection(undefined)).toEqual([])
  })

  it('ignore une charge d’une autre version', () => {
    expect(deserializeSelection({ v: 0, keys: ['a:1'] })).toEqual([])
  })

  it('ignore les entrées non conformes dans une charge valide', () => {
    expect(deserializeSelection({ v: 2, keys: ['a:1', 42, null, 'sans-separateur'] })).toEqual(['a:1'])
  })

  it('ignore une charge dont `keys` n’est pas un tableau', () => {
    expect(deserializeSelection({ v: 2, keys: 'a:1' })).toEqual([])
  })
})

describe('sérialisation des titres', () => {
  it('fait un aller-retour fidèle des titres des clés sélectionnées', () => {
    const sel = ['cities:42', 'zones:geo:ref:7']
    const titles = new Map([
      ['cities:42', 'Paris'],
      ['zones:geo:ref:7', 'Secteur 7'],
    ])
    const back = deserializeSelectionTitles(serializeSelection(sel, titles))
    expect(back.get('cities:42')).toBe('Paris')
    expect(back.get('zones:geo:ref:7')).toBe('Secteur 7')
  })

  it('n’écrit que les titres des clés encore sélectionnées', () => {
    const titles = new Map([
      ['a:1', 'Gardé'],
      ['a:2', 'Orphelin'],
    ])
    const back = deserializeSelectionTitles(serializeSelection(['a:1'], titles))
    expect(back.get('a:1')).toBe('Gardé')
    expect(back.has('a:2')).toBe(false)
  })

  it('rend une table vide sans titres, sur une charge illisible ou d’une autre version', () => {
    expect(deserializeSelectionTitles(serializeSelection(['a:1'])).size).toBe(0)
    expect(deserializeSelectionTitles('pas un objet').size).toBe(0)
    expect(deserializeSelectionTitles({ v: 1, titles: { 'a:1': 'x' } }).size).toBe(0)
  })

  it('ignore les titres non conformes (valeur non chaîne, clé malformée)', () => {
    const back = deserializeSelectionTitles({ v: 2, titles: { 'a:1': 'ok', 'b:2': 42, malformee: 'x' } })
    expect(back.get('a:1')).toBe('ok')
    expect(back.has('b:2')).toBe(false)
    expect(back.has('malformee')).toBe(false)
  })
})

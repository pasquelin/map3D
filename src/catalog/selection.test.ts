import { describe, expect, it } from 'vitest'
import {
  catalogKey,
  deserializeSnapshot,
  parseCatalogKey,
  purgeSources,
  removeFromSelection,
  restoreCatalogId,
  serializeSnapshot,
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

describe('charge persistée — clés', () => {
  it('fait un aller-retour fidèle', () => {
    const keys = ['cities:42', 'zones:geo:ref:7']
    expect(deserializeSnapshot(serializeSnapshot({ keys })).keys).toEqual(keys)
  })

  it('rend une charge vide sur une entrée illisible', () => {
    expect(deserializeSnapshot('pas un objet').keys).toEqual([])
    expect(deserializeSnapshot(null).keys).toEqual([])
    expect(deserializeSnapshot(undefined).keys).toEqual([])
  })

  it('ignore une charge d’une autre version', () => {
    expect(deserializeSnapshot({ v: 0, keys: ['a:1'] }).keys).toEqual([])
  })

  it('ignore les entrées non conformes dans une charge valide', () => {
    expect(deserializeSnapshot({ v: 2, keys: ['a:1', 42, null, 'sans-separateur'] }).keys).toEqual(['a:1'])
  })

  it('ignore une charge dont `keys` n’est pas un tableau', () => {
    expect(deserializeSnapshot({ v: 2, keys: 'a:1' }).keys).toEqual([])
  })

  // Chaque champ est validé pour lui-même : un `titles` illisible ne doit pas coûter les clés.
  it('garde les clés même quand les titres sont illisibles', () => {
    const snap = deserializeSnapshot({ v: 2, keys: ['a:1'], titles: 'pas un objet' })
    expect(snap.keys).toEqual(['a:1'])
    expect(snap.titles.size).toBe(0)
  })
})

describe('charge persistée — sources à bascule', () => {
  it('fait un aller-retour fidèle', () => {
    const back = deserializeSnapshot(serializeSnapshot({ keys: [], sources: ['defibs', 'bornes'] }))
    expect(back.sources).toEqual(['defibs', 'bornes'])
  })

  // Le point de la feature : une bascule ne doit RIEN devoir à une clé d'élément. Un id de
  // source qui atterrirait dans `keys` entrerait en collision avec un élément homonyme.
  it('n’écrit aucune bascule dans `keys`, ni aucune clé dans `sources`', () => {
    const back = deserializeSnapshot(serializeSnapshot({ keys: ['defibs:1'], sources: ['defibs'] }))
    expect(back.keys).toEqual(['defibs:1'])
    expect(back.sources).toEqual(['defibs'])
  })

  it('rend une liste vide sur une charge sans bascules — une session écrite AVANT la feature', () => {
    expect(deserializeSnapshot({ v: 2, keys: ['a:1'], titles: {} }).sources).toEqual([])
  })

  it('rend une liste vide sur une charge illisible ou d’une autre version', () => {
    expect(deserializeSnapshot('pas un objet').sources).toEqual([])
    expect(deserializeSnapshot({ v: 1, sources: ['defibs'] }).sources).toEqual([])
    expect(deserializeSnapshot({ v: 2, sources: 'defibs' }).sources).toEqual([])
  })

  it('écarte les entrées non conformes sans jeter le reste', () => {
    expect(deserializeSnapshot({ v: 2, sources: ['defibs', 42, null, '', 'bornes'] }).sources).toEqual([
      'defibs',
      'bornes',
    ])
  })
})

describe('charge persistée — titres', () => {
  it('fait un aller-retour fidèle des titres des clés sélectionnées', () => {
    const keys = ['cities:42', 'zones:geo:ref:7']
    const titles = new Map([
      ['cities:42', 'Paris'],
      ['zones:geo:ref:7', 'Secteur 7'],
    ])
    const back = deserializeSnapshot(serializeSnapshot({ keys, titles })).titles
    expect(back.get('cities:42')).toBe('Paris')
    expect(back.get('zones:geo:ref:7')).toBe('Secteur 7')
  })

  it('n’écrit que les titres des clés encore sélectionnées', () => {
    const titles = new Map([
      ['a:1', 'Gardé'],
      ['a:2', 'Orphelin'],
    ])
    const back = deserializeSnapshot(serializeSnapshot({ keys: ['a:1'], titles })).titles
    expect(back.get('a:1')).toBe('Gardé')
    expect(back.has('a:2')).toBe(false)
  })

  it('rend une table vide sans titres, sur une charge illisible ou d’une autre version', () => {
    expect(deserializeSnapshot(serializeSnapshot({ keys: ['a:1'] })).titles.size).toBe(0)
    expect(deserializeSnapshot('pas un objet').titles.size).toBe(0)
    expect(deserializeSnapshot({ v: 1, titles: { 'a:1': 'x' } }).titles.size).toBe(0)
  })

  it('ignore les titres non conformes (valeur non chaîne, clé malformée)', () => {
    const back = deserializeSnapshot({ v: 2, titles: { 'a:1': 'ok', 'b:2': 42, malformee: 'x' } }).titles
    expect(back.get('a:1')).toBe('ok')
    expect(back.has('b:2')).toBe(false)
    expect(back.has('malformee')).toBe(false)
  })
})

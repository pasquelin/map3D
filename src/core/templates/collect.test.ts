import { describe, expect, it } from 'vitest'
import type { GeoJSONFeatureCollection } from '../../layers/DrawLayer'
import {
  categoryOf,
  filterByCategories,
  mergeCollections,
  mergeTemplateInto,
  namespaceTemplate,
  removeTemplateFrom,
  statsOf,
} from './collect'

const fc = (...features: GeoJSONFeatureCollection['features']): GeoJSONFeatureCollection => ({
  type: 'FeatureCollection',
  features,
})

const line = (id: string): GeoJSONFeatureCollection['features'][number] => ({
  type: 'Feature',
  id,
  geometry: {
    type: 'LineString',
    coordinates: [
      [2, 48],
      [3, 49],
    ],
  },
  properties: { kind: 'line', color: '#fff', width: 2, fillOpacity: 0 },
})

const freehand = (id: string): GeoJSONFeatureCollection['features'][number] => ({
  type: 'Feature',
  id,
  geometry: {
    type: 'LineString',
    coordinates: [
      [0, 0],
      [1, 1],
    ],
  },
  properties: { kind: 'freehand', color: '#fff', width: 2, fillOpacity: 0 },
})

const symbol = (id: string): GeoJSONFeatureCollection['features'][number] => ({
  type: 'Feature',
  id,
  geometry: { type: 'Point', coordinates: [10, 20] },
  properties: { kind: 'symbol', color: '#fff', width: 2, fillOpacity: 0, symbol: { key: 'sfgpuci' } },
})

describe('categoryOf', () => {
  it('classe chaque kind dans sa famille', () => {
    expect(categoryOf('line')).toBe('shapes')
    expect(categoryOf('polygon')).toBe('shapes')
    expect(categoryOf('circle')).toBe('shapes')
    expect(categoryOf('arrow')).toBe('shapes')
    expect(categoryOf('measure')).toBe('shapes')
    expect(categoryOf('freehand')).toBe('freehand')
    expect(categoryOf('symbol')).toBe('symbols')
  })

  it('ignore les modes (jamais sérialisés)', () => {
    expect(categoryOf('select')).toBeNull()
    expect(categoryOf('erase')).toBeNull()
  })
})

describe('filterByCategories', () => {
  it('ne garde que les catégories demandées', () => {
    const src = fc(line('a'), freehand('b'), symbol('c'))
    expect(filterByCategories(src, ['symbols']).features.map((f) => f.id)).toEqual(['c'])
    expect(filterByCategories(src, ['shapes', 'freehand']).features.map((f) => f.id)).toEqual(['a', 'b'])
  })

  it('rend une collection vide si aucune catégorie', () => {
    expect(filterByCategories(fc(line('a')), []).features).toEqual([])
  })
})

describe('statsOf', () => {
  it('compte par famille et calcule l’emprise', () => {
    const s = statsOf(fc(line('a'), freehand('b'), symbol('c')))
    expect(s).toMatchObject({ shapes: 1, freehand: 1, symbols: 1 })
    // Emprise sur l'ensemble des positions (line 2..3/48..49, freehand 0..1, symbol 10/20).
    expect(s.bounds).toEqual({ north: 49, south: 0, east: 10, west: 0 })
    expect(s.bytes).toBeGreaterThan(0)
  })

  it('rend bounds=null pour une collection vide', () => {
    expect(statsOf(fc()).bounds).toBeNull()
  })
})

describe('mergeCollections', () => {
  it('concatène les features', () => {
    const merged = mergeCollections(fc(line('a')), fc(symbol('c')))
    expect(merged.features.map((f) => f.id)).toEqual(['a', 'c'])
  })
})

describe('mergeTemplateInto', () => {
  it('ajoute TOUTES les formes de deux templates dont les ids se recouvrent', () => {
    // Deux templates indépendants partagent draw-0/draw-1 (compteur local du DrawLayer).
    const a = fc(line('draw-0'), symbol('draw-1'))
    const b = fc(line('draw-0'), freehand('draw-1'))
    const afterA = mergeTemplateInto(fc(), a, 'A')
    const afterB = mergeTemplateInto(afterA, b, 'B')
    // Sans namespacing, B aurait été entièrement filtré (ids « déjà présents ») → 2.
    expect(afterB.features).toHaveLength(4)
  })

  it('reste idempotent : re-cliquer le même template n’empile pas ses formes', () => {
    const a = fc(line('draw-0'), symbol('draw-1'))
    const once = mergeTemplateInto(fc(), a, 'A')
    const twice = mergeTemplateInto(once, a, 'A')
    expect(twice.features).toHaveLength(2)
  })
})

describe('removeTemplateFrom', () => {
  it('retire exactement les formes fusionnées par ce template, sans toucher aux autres', () => {
    const a = fc(line('draw-0'), symbol('draw-1'))
    const b = fc(line('draw-0'), freehand('draw-1'))
    const withBoth = mergeTemplateInto(mergeTemplateInto(fc(), a, 'A'), b, 'B')
    expect(withBoth.features).toHaveLength(4)
    const withoutA = removeTemplateFrom(withBoth, a, 'A')
    // Les 2 formes de A partent, les 2 de B restent.
    expect(withoutA.features.map((f) => f.id)).toEqual(['B:draw-0', 'B:draw-1'])
  })

  it('ne retire rien si le template n’est pas dans le dessin', () => {
    const a = fc(line('draw-0'))
    const other = mergeTemplateInto(fc(), fc(line('draw-0')), 'B')
    expect(removeTemplateFrom(other, a, 'A').features).toHaveLength(1)
  })

  it('retire aussi un template chargé par « remplacer » (ids namespacés à l’application)', () => {
    const a = fc(line('draw-0'), symbol('draw-1'))
    // « Remplacer » pose la même clé namespacée que la fusion (cf. `namespaceTemplate`).
    const replaced = namespaceTemplate(a, 'A')
    expect(removeTemplateFrom(replaced, a, 'A').features).toHaveLength(0)
  })

  it('namespacing IDEMPOTENT : re-namespacer un dessin déjà préfixé ne double pas', () => {
    const a = fc(line('draw-0'))
    const once = namespaceTemplate(a, 'A')
    const twice = namespaceTemplate(once, 'A')
    expect(twice.features.map((f) => f.id)).toEqual(['A:draw-0'])
  })
})

import { describe, expect, it } from 'vitest'
import { familyTag, matchesSelector, selectTargets } from './selection'
import type { MapPoint, RelationRule } from './types'

// `selectTargets` est la FONCTION UNIQUE de sélection : les compteurs du menu et le calcul
// réellement facturé passent tous deux par elle. Une divergence ferait annoncer au menu un
// nombre de liens que la carte ne trace pas — et le garde-fou de coût (`maxMeters`) est ici.

describe('matchesSelector', () => {
  it('any = OU, all = ET, none = exclusion, combinés en ET', () => {
    expect(matchesSelector(['a'], { any: ['a', 'b'] })).toBe(true)
    expect(matchesSelector(['c'], { any: ['a', 'b'] })).toBe(false)
    expect(matchesSelector(['a', 'b'], { all: ['a', 'b'] })).toBe(true)
    expect(matchesSelector(['a'], { all: ['a', 'b'] })).toBe(false)
    expect(matchesSelector(['a', 'x'], { none: ['x'] })).toBe(false)
    // any satisfait MAIS none exclut → rejeté (les clauses se combinent en ET).
    expect(matchesSelector(['a', 'x'], { any: ['a'], none: ['x'] })).toBe(false)
  })

  it('un sélecteur vide accepte tout', () => {
    expect(matchesSelector([], {})).toBe(true)
  })
})

describe('familyTag', () => {
  it("prend le DERNIER tag d'un all (le plus spécifique), le PREMIER d'un any", () => {
    expect(familyTag({ all: ['alert', 'critical'] })).toBe('critical')
    expect(familyTag({ any: ['a', 'b'] })).toBe('a')
  })

  it('all prime sur any ; none seul ou sélecteur vide ne nomme rien', () => {
    expect(familyTag({ all: ['x'], any: ['y'] })).toBe('x')
    expect(familyTag({ none: ['z'] })).toBeNull()
    expect(familyTag({})).toBeNull()
  })
})

const source: MapPoint = { id: 'src', lat: 0, lng: 0, tags: ['src'] }
// Cibles à distances croissantes vers l'est : ~1113 m, ~2226 m, ~5566 m.
const near: MapPoint = { id: 'near', lat: 0, lng: 0.01, tags: ['target'] }
const mid: MapPoint = { id: 'mid', lat: 0, lng: 0.02, tags: ['target'] }
const far: MapPoint = { id: 'far', lat: 0, lng: 0.05, tags: ['target'] }
const other: MapPoint = { id: 'other', lat: 0, lng: 0.01, tags: ['autre'] }

const rule = (over: Partial<RelationRule['selection']> = {}): RelationRule => ({
  id: 'r',
  label: 'R',
  from: { any: ['src'] },
  to: { any: ['target'] },
  mode: 'DRIVE',
  selection: { mode: 'fastest', count: 1, maxMeters: 1e7, ...over },
  limit: { compute: 100, render: 100 },
})

describe('selectTargets', () => {
  it('exclut la source elle-même et les non-correspondants au sélecteur `to`', () => {
    const out = selectTargets(source, rule(), [source, other, near])
    expect(out.map((p) => p.id)).toEqual(['near'])
  })

  it('trie par distance croissante à vol d’oiseau', () => {
    const out = selectTargets(source, rule({ mode: 'radius' }), [far, near, mid])
    expect(out.map((p) => p.id)).toEqual(['near', 'mid', 'far'])
  })

  it('applique le garde-fou maxMeters AVANT tout appel réseau', () => {
    // maxMeters ~3 km : `far` (~5,5 km) est écarté quel que soit le mode.
    const out = selectTargets(source, rule({ mode: 'radius', maxMeters: 3000 }), [near, mid, far])
    expect(out.map((p) => p.id)).toEqual(['near', 'mid'])
  })

  it('radius : garde tout ce qui est sous radiusMeters', () => {
    const out = selectTargets(source, rule({ mode: 'radius', radiusMeters: 2000 }), [near, mid, far])
    expect(out.map((p) => p.id)).toEqual(['near'])
  })

  it('fastest : sur-échantillonne count × oversample des plus proches', () => {
    // count 1 × oversample 2 → les 2 plus proches interrogés (la durée tranchera ensuite).
    const out = selectTargets(source, rule({ mode: 'fastest', count: 1 }), [far, near, mid], 2)
    expect(out.map((p) => p.id)).toEqual(['near', 'mid'])
  })
})

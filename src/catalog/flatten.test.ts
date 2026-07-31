import { describe, expect, it } from 'vitest'
import { flattenCatalog } from './flatten'
import type { CatalogId, CatalogItem } from './types'

const item = (id: CatalogId, hasChildren = false): CatalogItem => ({ id, title: String(id), hasChildren })

const racines = [item('g1', true), item('z9')]
const enfants = new Map<CatalogId, readonly CatalogItem[]>([['g1', [item('a'), item('b')]]])

describe('flattenCatalog', () => {
  it('rend les racines à plat quand rien n’est déplié', () => {
    const nodes = flattenCatalog('zones', racines, new Set(), new Map())
    expect(nodes.map((n) => n.item.id)).toEqual(['g1', 'z9'])
    expect(nodes.every((n) => n.depth === 0 && n.parentId === null)).toBe(true)
  })

  it('insère les enfants JUSTE APRÈS leur parent, à depth 1', () => {
    const nodes = flattenCatalog('zones', racines, new Set(['g1']), enfants)
    expect(nodes.map((n) => n.item.id)).toEqual(['g1', 'a', 'b', 'z9'])
    expect(nodes.map((n) => n.depth)).toEqual([0, 1, 1, 0])
    expect(nodes[1]?.parentId).toBe('g1')
  })

  it('porte une clé unique par ligne, préfixée par la source', () => {
    const nodes = flattenCatalog('zones', racines, new Set(['g1']), enfants)
    expect(nodes.map((n) => n.key)).toEqual(['zones:g1', 'zones:a', 'zones:b', 'zones:z9'])
  })

  it('déplié mais enfants pas encore chargés : le parent reste seul', () => {
    const nodes = flattenCatalog('zones', racines, new Set(['g1']), new Map())
    expect(nodes.map((n) => n.item.id)).toEqual(['g1', 'z9'])
  })

  it('replier retire les enfants', () => {
    const ouvert = flattenCatalog('zones', racines, new Set(['g1']), enfants)
    const ferme = flattenCatalog('zones', racines, new Set(), enfants)
    expect(ouvert).toHaveLength(4)
    expect(ferme).toHaveLength(2)
  })

  it('ignore un id déplié qui ne correspond à aucune racine', () => {
    const nodes = flattenCatalog('zones', racines, new Set(['fantome']), enfants)
    expect(nodes).toHaveLength(2)
  })

  it('ne descend pas au-delà d’un niveau — un petit-enfant n’est pas inséré', () => {
    const profond = new Map<CatalogId, readonly CatalogItem[]>([
      ['g1', [item('a', true)]],
      ['a', [item('a1')]],
    ])
    const nodes = flattenCatalog('zones', racines, new Set(['g1', 'a']), profond)
    expect(nodes.map((n) => n.item.id)).toEqual(['g1', 'a', 'z9'])
  })

  it('porte le sourceId sur chaque ligne, enfants compris', () => {
    const nodes = flattenCatalog('zones', racines, new Set(['g1']), enfants)
    expect(nodes.every((n) => n.sourceId === 'zones')).toBe(true)
  })

  it('liste de racines vide : aucune ligne', () => {
    expect(flattenCatalog('zones', [], new Set(['g1']), enfants)).toEqual([])
  })
})

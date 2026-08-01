import { describe, expect, it } from 'vitest'
import { flattenCatalog } from './flatten'
import type { CatalogId, CatalogItem } from './types'

const item = (id: CatalogId, hasChildren = false): CatalogItem => ({ id, title: String(id), hasChildren })

const racines = [item('g1', true), item('z9')]
const enfants = new Map<CatalogId, readonly CatalogItem[]>([['g1', [item('a'), item('b')]]])

describe('flattenCatalog', () => {
  it('rend les racines à plat quand rien n’est déplié', () => {
    const nodes = flattenCatalog(racines, new Set(), new Map())
    expect(nodes.map((n) => n.item.id)).toEqual(['g1', 'z9'])
    expect(nodes.every((n) => n.depth === 0)).toBe(true)
  })

  it('insère les enfants JUSTE APRÈS leur parent, à depth 1', () => {
    const nodes = flattenCatalog(racines, new Set(['g1']), enfants)
    expect(nodes.map((n) => n.item.id)).toEqual(['g1', 'a', 'b', 'z9'])
    expect(nodes.map((n) => n.depth)).toEqual([0, 1, 1, 0])
  })

  it('ne porte PAS de clé globale : la liste la construit pour les seules lignes rendues', () => {
    const nodes = flattenCatalog(racines, new Set(['g1']), enfants)
    // Décision de perf, pas un oubli : ces nœuds sont produits pour tous les éléments
    // accumulés (des dizaines de milliers après quelques pages), alors que la clé ne
    // sert qu'aux ~19 lignes visibles. La porter ici allouait une chaîne par élément à
    // chaque page chargée. Le contenu du nœud se limite donc à l'élément et sa
    // profondeur — cf. `catalogKey` dans `selection.ts`.
    expect(nodes.map((n) => Object.keys(n).sort())).toEqual(Array(4).fill(['depth', 'item']))
  })

  it('déplié mais enfants pas encore chargés : le parent reste seul', () => {
    const nodes = flattenCatalog(racines, new Set(['g1']), new Map())
    expect(nodes.map((n) => n.item.id)).toEqual(['g1', 'z9'])
  })

  it('replier retire les enfants', () => {
    const ouvert = flattenCatalog(racines, new Set(['g1']), enfants)
    const ferme = flattenCatalog(racines, new Set(), enfants)
    expect(ouvert).toHaveLength(4)
    expect(ferme).toHaveLength(2)
  })

  it('ignore un id déplié qui ne correspond à aucune racine', () => {
    const nodes = flattenCatalog(racines, new Set(['fantome']), enfants)
    expect(nodes).toHaveLength(2)
  })

  it('ne descend pas au-delà d’un niveau — un petit-enfant n’est pas inséré', () => {
    const profond = new Map<CatalogId, readonly CatalogItem[]>([
      ['g1', [item('a', true)]],
      ['a', [item('a1')]],
    ])
    const nodes = flattenCatalog(racines, new Set(['g1', 'a']), profond)
    expect(nodes.map((n) => n.item.id)).toEqual(['g1', 'a', 'z9'])
  })

  it('liste de racines vide : aucune ligne', () => {
    expect(flattenCatalog([], new Set(['g1']), enfants)).toEqual([])
  })
})

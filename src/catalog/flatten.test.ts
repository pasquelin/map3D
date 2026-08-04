import { describe, expect, it } from 'vitest'
import { flattenCatalog, type CatalogNode } from './flatten'
import type { CatalogId, CatalogItem } from './types'

const item = (id: CatalogId, hasChildren = false): CatalogItem => ({ id, title: String(id), hasChildren })

/** Les seules lignes d'ÉLÉMENT — les en-têtes n'ont ni id ni profondeur. */
const items = (nodes: readonly CatalogNode[]) => nodes.filter((n) => n.kind === 'item')
const ids = (nodes: readonly CatalogNode[]) => items(nodes).map((n) => n.item.id)
const depths = (nodes: readonly CatalogNode[]) => items(nodes).map((n) => n.depth)

const racines = [item('g1', true), item('z9')]
const enfants = new Map<CatalogId, readonly CatalogItem[]>([['g1', [item('a'), item('b')]]])

describe('flattenCatalog', () => {
  it('rend les racines à plat quand rien n’est déplié', () => {
    const nodes = flattenCatalog(racines, new Set(), new Map(), true)
    expect(ids(nodes)).toEqual(['g1', 'z9'])
    expect(depths(nodes).every((d) => d === 0)).toBe(true)
  })

  it('insère les enfants JUSTE APRÈS leur parent, à depth 1', () => {
    const nodes = flattenCatalog(racines, new Set(['g1']), enfants, true)
    expect(ids(nodes)).toEqual(['g1', 'a', 'b', 'z9'])
    expect(depths(nodes)).toEqual([0, 1, 1, 0])
  })

  it('ne porte PAS de clé globale : la liste la construit pour les seules lignes rendues', () => {
    const nodes = flattenCatalog(racines, new Set(['g1']), enfants, true)
    // Décision de perf, pas un oubli : ces nœuds sont produits pour tous les éléments
    // accumulés (des dizaines de milliers après quelques pages), alors que la clé ne
    // sert qu'aux ~19 lignes visibles. La porter ici allouait une chaîne par élément à
    // chaque page chargée. Le contenu du nœud se limite donc à l'élément et sa
    // profondeur — cf. `catalogKey` dans `selection.ts`.
    expect(nodes.map((n) => Object.keys(n).sort())).toEqual(Array(4).fill(['depth', 'item', 'kind']))
  })

  it('déplié mais enfants pas encore chargés : le parent reste seul', () => {
    const nodes = flattenCatalog(racines, new Set(['g1']), new Map(), true)
    expect(ids(nodes)).toEqual(['g1', 'z9'])
  })

  it('replier retire les enfants', () => {
    const ouvert = flattenCatalog(racines, new Set(['g1']), enfants, true)
    const ferme = flattenCatalog(racines, new Set(), enfants, true)
    expect(ouvert).toHaveLength(4)
    expect(ferme).toHaveLength(2)
  })

  it('ignore un id déplié qui ne correspond à aucune racine', () => {
    const nodes = flattenCatalog(racines, new Set(['fantome']), enfants, true)
    expect(nodes).toHaveLength(2)
  })

  it('ne descend pas au-delà d’un niveau — un petit-enfant n’est pas inséré', () => {
    const profond = new Map<CatalogId, readonly CatalogItem[]>([
      ['g1', [item('a', true)]],
      ['a', [item('a1')]],
    ])
    const nodes = flattenCatalog(racines, new Set(['g1', 'a']), profond, true)
    expect(ids(nodes)).toEqual(['g1', 'a', 'z9'])
  })

  it('liste de racines vide : aucune ligne', () => {
    expect(flattenCatalog([], new Set(['g1']), enfants, true)).toEqual([])
  })
})

describe('sections nommées (`CatalogItem.group`)', () => {
  const grouped = (...pairs: [CatalogId, string | undefined][]): CatalogItem[] =>
    pairs.map(([id, group]) => ({ id, title: String(id), group }))

  const titles = (nodes: readonly CatalogNode[]) => nodes.filter((n) => n.kind === 'group').map((n) => n.title)

  it('ouvre une section au CHANGEMENT de groupe, pas par élément', () => {
    const nodes = flattenCatalog(grouped(['a', 'Nord'], ['b', 'Nord'], ['c', 'Sud']), new Set(), new Map(), true)
    expect(titles(nodes)).toEqual(['Nord', 'Sud'])
    expect(nodes.map((n) => (n.kind === 'group' ? `#${n.title}` : n.item.id))).toEqual(['#Nord', 'a', 'b', '#Sud', 'c'])
  })

  it('n’ouvre AUCUNE section quand la source ne renseigne pas `group`', () => {
    const nodes = flattenCatalog(racines, new Set(), new Map(), true)
    expect(titles(nodes)).toEqual([])
    expect(nodes.every((n) => n.kind === 'item')).toBe(true)
  })

  it('un groupe vide ou absent n’ouvre pas de section, et n’interrompt pas la suivante', () => {
    const nodes = flattenCatalog(grouped(['a', undefined], ['b', ''], ['c', 'Sud']), new Set(), new Map(), true)
    expect(titles(nodes)).toEqual(['Sud'])
    expect(ids(nodes)).toEqual(['a', 'b', 'c'])
  })

  // La pagination en dépend : une page qui arrive prolonge la section en cours au lieu
  // d'en rouvrir une identique juste en dessous.
  it('ne rouvre pas une section quand la page suivante reste dans le même groupe', () => {
    const page1 = grouped(['a', 'Nord'], ['b', 'Nord'])
    const page2 = grouped(['c', 'Nord'], ['d', 'Sud'])
    expect(titles(flattenCatalog([...page1, ...page2], new Set(), new Map(), true))).toEqual(['Nord', 'Sud'])
  })

  // La lib ne TRIE pas : elle affiche fidèlement ce que la source a rendu.
  it('une source servie en désordre voit son intitulé revenir — ce n’est pas un tri', () => {
    const nodes = flattenCatalog(grouped(['a', 'Nord'], ['b', 'Sud'], ['c', 'Nord']), new Set(), new Map(), true)
    expect(titles(nodes)).toEqual(['Nord', 'Sud', 'Nord'])
  })

  it('les enfants d’un agrégat n’ouvrent pas de section — ils sont dans celle du parent', () => {
    const parent: CatalogItem = { id: 'g1', title: 'g1', hasChildren: true, group: 'Nord' }
    const kids = new Map<CatalogId, readonly CatalogItem[]>([['g1', [{ id: 'k', title: 'k', group: 'Sud' }]]])
    const nodes = flattenCatalog([parent], new Set(['g1']), kids, true)
    expect(titles(nodes)).toEqual(['Nord'])
  })

  it('numérote les sections — c’est leur identité pour React, pas leur position', () => {
    const nodes = flattenCatalog(grouped(['a', 'Nord'], ['b', 'Sud'], ['c', 'Nord']), new Set(), new Map(), true)
    // Reconstruire la clé depuis l'index de la fenêtre visible marchait tant que les pages
    // s'ajoutaient en fin de liste ; déplier un agrégat plus haut décalait tout.
    expect(nodes.filter((n) => n.kind === 'group').map((n) => n.rank)).toEqual([0, 1, 2])
  })

  it('réglage coupé : pas un seul en-tête, quoi que la source déclare', () => {
    const nodes = flattenCatalog(grouped(['a', 'Nord'], ['b', 'Sud']), new Set(), new Map(), false)
    expect(titles(nodes)).toEqual([])
    expect(ids(nodes)).toEqual(['a', 'b'])
  })
})

import { describe, expect, it } from 'vitest'

import { CONFIG_LABELS, FOLDER_LABELS } from './configLabels'
import { type ConfigNode, buildTree, flattenLeaves } from './configSchema'

/* Le garde-fou du banc d'essai.

   Le panneau DÉDUIT ses contrôleurs de `defaultConfig` : une clé ajoutée à `MapConfig`
   y apparaît toute seule, ce qui est l'intérêt du dispositif. Mais son libellé, lui, ne
   se déduit pas — `labelOf` retombe alors sur `autoLabel`, qui rend le nom de la clé,
   donc de l'ANGLAIS au milieu de 199 libellés français.

   Sans ce test, « ça se met à jour tout seul » devient « ça se dégrade tout seul », en
   silence. C'est lui qui rend le reste du dispositif défendable. */

const tree = buildTree()
const leaves = flattenLeaves(tree)

const folderPaths = (nodes: readonly ConfigNode[]): string[] =>
  nodes.flatMap((n) => (n.kind === 'folder' ? [n.path, ...folderPaths(n.children)] : []))

describe('libellés du panneau de réglages', () => {
  it('chaque feuille de MapConfig a un libellé français', () => {
    expect(leaves.filter((l) => CONFIG_LABELS[l.path] === undefined).map((l) => l.path)).toEqual([])
  })

  it('chaque dossier de MapConfig a un libellé français', () => {
    expect(folderPaths(tree).filter((p) => FOLDER_LABELS[p] === undefined)).toEqual([])
  })

  it('la table ne décrit que des chemins réels', () => {
    // Le pendant du test précédent : une clé RETIRÉE de `MapConfig` doit faire
    // disparaître son libellé, sinon la table accumule des entrées mortes.
    const realLeaves = new Set(leaves.map((l) => l.path))
    expect(Object.keys(CONFIG_LABELS).filter((p) => !realLeaves.has(p))).toEqual([])
    const realFolders = new Set(folderPaths(tree))
    expect(Object.keys(FOLDER_LABELS).filter((p) => !realFolders.has(p))).toEqual([])
  })

  it('les libellés tiennent dans la colonne', () => {
    // 36 caractères : au-delà, Tweakpane tronque dans une colonne de 340 px.
    expect(Object.entries(CONFIG_LABELS).filter(([, label]) => label.length > 36)).toEqual([])
  })

  it('aucun libellé ne laisse passer de camelCase anglais', () => {
    // La signature d'un repli `autoLabel` non traduit : les mots collés d'origine.
    expect(Object.entries(CONFIG_LABELS).filter(([, l]) => /[a-z][A-Z]/.test(l))).toEqual([])
  })
})

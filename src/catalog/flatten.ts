import type { CatalogId, CatalogItem } from './types'

/**
 * Une LIGNE de la liste — pas un élément : un élément déplié en engendre plusieurs, et
 * un changement de groupe en insère une qui n'appartient à aucun élément.
 *
 * Union DISCRIMINÉE plutôt qu'un champ optionnel : un en-tête n'a ni case, ni actions, ni
 * état d'affichage, et les lui donner à `undefined` aurait laissé chaque consommateur
 * décider seul de ce qu'un en-tête « coché » veut dire.
 *
 * Volontairement SANS clé globale : le nœud est produit pour tous les éléments accumulés
 * (36 699 villes après quelques pages), la clé n'est utile qu'aux dix-neuf lignes
 * réellement rendues. La porter ici allouait une chaîne par élément à chaque page chargée,
 * sur le chemin même que la virtualisation dégage — la liste la construit donc au moment
 * du rendu, pour les seules lignes qu'elle rend.
 */
export type CatalogNode =
  | {
      kind: 'item'
      item: CatalogItem
      /** 0 = racine, 1 = enfant. Sert à l'indentation, et à rien d'autre. */
      depth: number
    }
  | {
      kind: 'group'
      /** Intitulé de la section, tel que la source l'a écrit (`CatalogItem.group`). */
      title: string
      /**
       * Rang de la section dans la liste (0, 1, 2…) — son IDENTITÉ pour React.
       *
       * Émis ici parce que c'est le seul endroit qui sait où une section commence. La
       * reconstruire au rendu depuis l'index de la fenêtre visible marchait tant que les
       * pages s'ajoutaient en fin de liste, mais déplier un agrégat plus haut décale tous
       * les index et remonte inutilement les en-têtes situés en dessous.
       */
      rank: number
    }

/** La ligne d'un ÉLÉMENT — ce que consomment la case, les actions et le cadrage. */
export type CatalogItemNode = Extract<CatalogNode, { kind: 'item' }>

/**
 * Aplatit racines, enfants dépliés et en-têtes de groupe en UNE liste à hauteur de ligne
 * constante.
 *
 * C'est ce qui rend la virtualisation triviale : sans cet aplatissement, une ligne dépliée
 * contiendrait une sous-liste défilante, donc un scroll imbriqué — ingérable au trackpad —
 * et un virtualiseur à hauteurs variables. Un en-tête entre donc dans le flux comme une
 * ligne ordinaire, et occupe la MÊME hauteur : c'est le prix de la virtualisation, et il
 * est payé une fois ici plutôt qu'à chaque calcul de fenêtre.
 *
 * **Le regroupement suit l'ordre de la source**, il ne trie pas : un en-tête est inséré
 * quand `group` change d'une racine à la suivante. C'est ce qui le rend compatible avec la
 * pagination — une page arrive après coup, elle est ajoutée à la fin, et une section
 * reprend là où elle s'était arrêtée. Une source qui rendrait ses éléments en désordre
 * verrait donc le même intitulé revenir plus bas : c'est à elle de les servir groupés,
 * comme c'est à elle de décider de leur ordre.
 *
 * Un seul niveau de descente, délibérément : le contrat de source expose `children` sur un
 * élément, pas un arbre. Les enfants d'un agrégat n'ouvrent jamais de section — ils
 * appartiennent à celle de leur parent.
 */
export function flattenCatalog(
  roots: readonly CatalogItem[],
  expanded: ReadonlySet<CatalogId>,
  childrenByParent: ReadonlyMap<CatalogId, readonly CatalogItem[]>,
  /**
   * `config.catalog.groupHeaders`. Faux ⇒ pas un seul en-tête, et pas une comparaison.
   *
   * REQUIS, sans valeur par défaut : le défaut vit dans `catalogDefaults` et nulle part
   * ailleurs — deux endroits à changer, c'est un endroit qu'on oublie.
   */
  groupHeaders: boolean,
): readonly CatalogNode[] {
  const out: CatalogNode[] = []
  // `undefined` au départ, pas `''` : une source sans `group` ne doit ouvrir AUCUNE
  // section, et une source qui commence par un groupe nommé doit en ouvrir une.
  let current: string | undefined
  let rank = 0
  for (const item of roots) {
    // Le drapeau EN PREMIER : réglage coupé, le court-circuit évite jusqu'à la lecture de
    // propriété. Le vrai coût de cette boucle n'est pas là — c'est l'objet alloué et poussé
    // par élément — mais autant ne rien payer quand la fonctionnalité est éteinte.
    if (groupHeaders && item.group !== current) {
      current = item.group
      if (current) out.push({ kind: 'group', title: current, rank: rank++ })
    }
    out.push({ kind: 'item', item, depth: 0 })
    if (!expanded.has(item.id)) continue
    for (const child of childrenByParent.get(item.id) ?? []) {
      out.push({ kind: 'item', item: child, depth: 1 })
    }
  }
  return out
}

import type { CatalogId, CatalogItem } from './types'

/**
 * Une LIGNE de la liste — pas un élément : un élément déplié en engendre plusieurs.
 *
 * Volontairement SANS sa clé globale : le nœud est produit pour tous les éléments
 * accumulés (36 699 villes après quelques pages), la clé n'est utile qu'aux dix-neuf
 * lignes réellement rendues. La porter ici allouait une chaîne par élément à chaque
 * page chargée, sur le chemin même que la virtualisation dégage — la liste la construit
 * donc au moment du rendu, pour les seules lignes qu'elle rend.
 */
export type CatalogNode = {
  item: CatalogItem
  /** 0 = racine, 1 = enfant. Sert à l'indentation, et à rien d'autre. */
  depth: number
}

/**
 * Aplatit racines et enfants dépliés en UNE liste à hauteur de ligne constante.
 *
 * C'est ce qui rend la virtualisation triviale : sans cet aplatissement, une ligne
 * dépliée contiendrait une sous-liste défilante, donc un scroll imbriqué — ingérable au
 * trackpad — et un virtualiseur à hauteurs variables.
 *
 * Un seul niveau de descente, délibérément : le contrat de source expose `children` sur
 * un élément, pas un arbre. Autoriser la récursion demanderait une pagination par niveau
 * et un état de dépliage arborescent, pour un besoin (groupe → zones) qui est plat.
 */
export function flattenCatalog(
  roots: readonly CatalogItem[],
  expanded: ReadonlySet<CatalogId>,
  childrenByParent: ReadonlyMap<CatalogId, readonly CatalogItem[]>,
): readonly CatalogNode[] {
  const out: CatalogNode[] = []
  for (const item of roots) {
    out.push({ item, depth: 0 })
    if (!expanded.has(item.id)) continue
    for (const child of childrenByParent.get(item.id) ?? []) {
      out.push({ item: child, depth: 1 })
    }
  }
  return out
}

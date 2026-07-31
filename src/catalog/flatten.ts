import { catalogKey } from './selection'
import type { CatalogId, CatalogItem, CatalogKey } from './types'

/** Une LIGNE de la liste — pas un élément : un élément déplié en engendre plusieurs. */
export type CatalogNode = {
  item: CatalogItem
  sourceId: string
  /** 0 = racine, 1 = enfant. Sert à l'indentation, et à rien d'autre. */
  depth: number
  parentId: CatalogId | null
  key: CatalogKey
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
  sourceId: string,
  roots: readonly CatalogItem[],
  expanded: ReadonlySet<CatalogId>,
  childrenByParent: ReadonlyMap<CatalogId, readonly CatalogItem[]>,
): readonly CatalogNode[] {
  const out: CatalogNode[] = []
  for (const item of roots) {
    out.push({ item, sourceId, depth: 0, parentId: null, key: catalogKey(sourceId, item.id) })
    if (!expanded.has(item.id)) continue
    for (const child of childrenByParent.get(item.id) ?? []) {
      out.push({ item: child, sourceId, depth: 1, parentId: item.id, key: catalogKey(sourceId, child.id) })
    }
  }
  return out
}

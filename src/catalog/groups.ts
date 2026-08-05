import type { CatalogBrowseSource, CatalogItem, CatalogKey } from './types'

/**
 * La méthode `children` d'un AGRÉGAT, ou `undefined` si cet élément n'en est pas un.
 *
 * Point de vérité UNIQUE de « qu'est-ce qu'un agrégat » : l'élément en annonce
 * (`hasChildren`) **et** la source sait les rendre. C'est d'avoir répondu à cette question
 * à deux endroits — la case traitant les enfants, le nom traitant le groupe comme un
 * élément ordinaire — qui inscrivait la clé du groupe en sélection.
 *
 * Rend la MÉTHODE plutôt qu'un booléen : l'appelant qui doit charger les enfants l'a alors
 * sous la main, correctement typée, sans re-tester `source.children` pour convaincre le
 * compilateur.
 */
export const aggregateChildren = (
  source: CatalogBrowseSource,
  item: CatalogItem,
): CatalogBrowseSource['children'] | undefined => (item.hasChildren === true ? source.children : undefined)

/**
 * L'état d'une case d'AGRÉGAT, dérivé de ses seuls enfants.
 *
 * Un agrégat n'a pas d'état propre : il n'entre jamais en sélection, il n'est qu'un
 * sélecteur de ses enfants (cf. `CatalogItem.hasChildren`). Sa case reflète donc ce que
 * ses enfants sont, et rien d'autre — c'est ce qui empêche les deux vérités qu'on a
 * connues, où le groupe était coché pendant que ses zones étaient retirées.
 *
 * Le COMPTE voyage avec l'état parce que la ligne l'affiche (« 2/3 ») : le recalculer
 * côté rendu redemanderait le même balayage des enfants, une fois par ligne visible et
 * par frame de défilement.
 */
export type GroupCheck = {
  state: 'on' | 'off' | 'mixed'
  /** Enfants actuellement sur la carte. */
  shown: number
  /** Enfants connus de l'agrégat. `0` ⇒ appartenance inconnue, rien à afficher. */
  total: number
}

/** Rendu quand l'appartenance n'est pas connue — identité stable, pas d'allocation. */
export const NO_GROUP_CHECK: GroupCheck = { state: 'off', shown: 0, total: 0 }

/**
 * Dérive l'état d'un agrégat de ses enfants.
 *
 * `mixed` est l'état natif `indeterminate` d'une case, pas une troisième valeur métier :
 * une partie des enfants est affichée, et le geste attendu depuis là est de tout cocher.
 */
export function groupCheck(childKeys: readonly CatalogKey[], isShown: (key: CatalogKey) => boolean): GroupCheck {
  if (childKeys.length === 0) return NO_GROUP_CHECK
  let shown = 0
  for (const k of childKeys) if (isShown(k)) shown++
  const state = shown === 0 ? 'off' : shown === childKeys.length ? 'on' : 'mixed'
  return { state, shown, total: childKeys.length }
}

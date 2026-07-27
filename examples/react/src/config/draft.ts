/* ══════════════════ BROUILLONS BINDÉS PAR TWEAKPANE ══════════════════
   Les onglets « Interface » et « Données » bindent directement des sous-objets de leur
   état (`draft.toolbar`, `draft.alerts`) : c'est ce qui permet à Tweakpane d'écrire
   dedans sans qu'on ait à recoudre un modèle plat.

   Ce choix impose deux opérations, et une seule fois pour tous les onglets :
   - CLONER en profondeur avant d'émettre vers React — sinon on lui rend l'objet qu'on
     continue de muter, donc pas de re-render ;
   - recopier EN PLACE quand la valeur revient de l'extérieur — remplacer un sous-objet
     laisserait les contrôleurs écrire dans celui d'avant, que plus personne ne lit.

   Elles étaient écrites quatre fois (deux par onglet), énumérant les clés à la main :
   toute clé ajoutée à `UiSettings` ou `DataSettings` devait l'être aux quatre, et
   l'oubli dans un `assign` ne se voyait pas — le panneau cessait simplement de se
   resynchroniser sur ce réglage. */

import { isRecord } from './isRecord'

/**
 * Copie profonde d'un arbre de réglages.
 *
 * `structuredClone` ferait l'affaire — les réglages sont des scalaires purs — mais il
 * jette sur une fonction, et rien dans le type n'interdit d'en ajouter une un jour.
 */
export function cloneDraft<T>(value: T): T {
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cloneDraft(v)])) as T
}

/** Recopie `source` dans `target` **sans remplacer aucun sous-objet** (cf. préambule). */
export function assignDraft<T extends object>(target: T, source: T): void {
  for (const key of Object.keys(target) as (keyof T)[]) {
    const current = target[key]
    const next = source[key]
    if (isRecord(current) && isRecord(next)) assignDraft(current, next)
    else target[key] = next
  }
}

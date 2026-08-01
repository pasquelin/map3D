import type { SelectableKind } from '../../core/Selectables'

/**
 * Politique de **sélectionnabilité** : quels types d'objets l'outil sélection
 * peut atteindre. Une clé à `false` exclut ce type de TOUS les outils (clic,
 * rectangle, lasso, polygone) ; absente ou `true` = sélectionnable. Levier pour
 * limiter la sélection selon le cas (ex. `cluster: false` pour n'attraper que
 * les markers et les tracés). Appliquée au point d'entrée unique du registre.
 */
export type SelectionConfig = {
  selectable: Record<SelectableKind, boolean>
}

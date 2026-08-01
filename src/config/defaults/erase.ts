import type { EraseConfig } from '../types'

/** Défauts de la gomme : efface TOUTES les catégories effaçables (markers exclus par
 *  nature). L'hôte restreint au cas par cas via `config.erase.targets`. */
export const eraseDefaults: EraseConfig = {
  targets: { drawing: true, measure: true, symbol: true, path: true, shape: true },
}

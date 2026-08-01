import type { ClusteringConfig } from '../types'

// ⚠️ Déplacé depuis `theme.clustering` : paramètres d'algorithme, pas d'apparence.
// Valeurs reprises à l'identique.
export const clusteringDefaults: ClusteringConfig = {
  radius: 60,
  minPoints: 2,
  maxZoom: 18,
  levelQuantization: 1,
  spiderfyZoom: 19,
}

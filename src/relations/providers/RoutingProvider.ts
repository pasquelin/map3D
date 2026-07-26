// Contrat du fournisseur de routage. C'est le SEUL point par lequel le moteur
// atteint le réseau : le core dépend de ce type, jamais d'une implémentation.
// Substituer un proxy serveur à l'appel Google direct (pour ne plus exposer la
// clé côté client) ne demandera donc aucune modification du core.

import type { LatLng } from '../../shared'
import type { MapPoint, TravelMode } from '../core/types'

/** Une case de la matrice. `error` = pas d'itinéraire pour ce couple (jamais 0 par défaut). */
export type MatrixEntry =
  | { toId: string; distanceMeters: number; durationSeconds: number; error?: false }
  | { toId: string; error: true }

/** Un itinéraire tracé (principal ou alternatif). */
export type ProviderRoute = { distanceMeters: number; durationSeconds: number; path: LatLng[] }

export type RoutingProvider = {
  /**
   * Temps et distances de chaque origine vers UNE destination, en un seul appel.
   * Le sens compte : une origine → destination n'a pas la même durée qu'un retour.
   */
  matrix(
    origins: readonly MapPoint[],
    destination: MapPoint,
    mode: TravelMode,
    signal?: AbortSignal,
  ): Promise<MatrixEntry[]>
  /** Itinéraire détaillé d'un seul couple, alternatifs compris (index 0 = principal). */
  route(from: MapPoint, to: MapPoint, mode: TravelMode, signal?: AbortSignal): Promise<ProviderRoute[]>
}

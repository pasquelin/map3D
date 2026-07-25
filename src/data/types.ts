import type { Bounds, LatLng } from '../shared'

export type { Bounds, LatLng } from '../shared'

/** Vue courante (aligné sur `MapViewport` d'operator). */
export type Viewport = {
  bounds: Bounds
  center: LatLng
  zoom: number
}

/**
 * Source de données rechargée selon la vue (bbox). `minZoom` agit comme
 * gate : en-dessous, aucun chargement (équivalent du gate `zoom >= 15` des
 * couches POI d'operator). `load` reçoit un `AbortSignal` pour annuler la
 * requête précédente lorsqu'une nouvelle vue arrive.
 */
export interface DataSource<T> {
  minZoom?: number
  load(viewport: Viewport, signal: AbortSignal): Promise<T[]>
}

/**
 * Point à identité **stable** (`id` = clé métier, ex. uuid d'agent),
 * indépendante de la position : au changement de `position`, le marker est
 * translaté en douceur plutôt que recréé.
 */
export type MarkerData<T = unknown> = {
  id: string | number
  position: LatLng
  /** Type/catégorie → couleur via `theme.colors.marker[type]`. */
  type: string
  /** Tags de filtrage (panneau « Couches »), ex. `['user', 'move']`. */
  tags?: string[]
  /**
   * URL d'avatar (photo d'un user/agent) — GÉRÉ par la couche : rendu en
   * pastille photo ronde cerclée de la couleur du type, prioritaire sur `icon`.
   */
  avatar?: string
  /**
   * Élément fraîchement arrivé (ex. nouvelle alerte) : animation sonar autour
   * du marker jusqu'au premier clic dessus (état « vu » géré par la couche).
   */
  new?: boolean
  /**
   * Urgence (ex. alerte critique) : viseur rouge animé ultra visible autour du
   * marker, tant que le flag est vrai — conçu pour attirer l'œil immédiatement.
   */
  urgent?: boolean
  data: T
}

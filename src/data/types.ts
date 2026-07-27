import type { ReactNode } from 'react'
import { boundsOfLatLngs } from '../core/bounds'
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
  /**
   * Nom lisible de l'élément. Point de vérité UNIQUE : titre de l'infobulle, des
   * lignes de liste (loupe, panneau de sélection, dock) et **texte indexé par la
   * recherche**. Absent, ces surfaces retombent sur l'id — lisible pour personne.
   *
   * Volontairement `string` et non `ReactNode` : un nom doit pouvoir être comparé,
   * trié et cherché, ce qu'un arbre React ne permet pas. Pour un titre mis en forme,
   * `titleColor` couvre le cas courant et `MarkerLayer.tooltip` reste la surcharge.
   */
  title?: string
  /** Teinte du titre (alerte critique, statut d'agent) — sans quoi il faudrait du JSX. */
  titleColor?: string
  /** Corps de l'infobulle : tout ReactNode (badges, avatar, mini-tableau). */
  content?: ReactNode
  /** Tags de filtrage (panneau « Couches »), ex. `['user', 'move']`. */
  tags?: string[]
  /**
   * URL d'avatar (photo d'un user/agent) — GÉRÉ par la couche : rendu en
   * pastille photo ronde cerclée de la couleur du type, prioritaire sur `icon`.
   */
  avatar?: string
  /**
   * Icône (URL ou data-URI) représentant ce marker dans les LISTES (loupe, panneau
   * de sélection) — affichée **entière**, là où `avatar` est une photo recadrée.
   *
   * Distinction reprise de `PinnedItem` : un pictogramme perd son sens s'il est
   * rogné en rond, un portrait non. Renseignée d'office pour les symboles, dont le
   * graphisme EST l'identité — une pastille de couleur ne dirait rien de ce qui est
   * posé sur la carte.
   */
  icon?: string
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
  /**
   * Ce marker peut être **déplacé sur la carte** pour définir une nouvelle position
   * (drag → `onReposition`). Porté par la donnée : dans un même jeu de markers,
   * seuls certains sont éditables (le point qu'on pose dans un formulaire, un
   * symbole placé à la main) tandis que les autres reflètent un état non modifiable.
   *
   * Sans rapport avec `MarkerLayer.draggable`, qui est le drag-and-drop à payload
   * (emporter le marker vers une autre zone de l'app, ex. un dock de favoris).
   */
  repositionable?: boolean
  /**
   * Priorité d'affichage entre markers qui se recouvrent — le plus haut passe
   * devant. Défaut 0. Utile pour qu'un point courant, un focus ou une alerte
   * critique ne disparaisse pas sous un voisin.
   *
   * Le marker sélectionné et celui dont le menu est ouvert restent **au-dessus de
   * toute valeur** : un `zIndex` ne peut pas enterrer ce avec quoi on interagit.
   */
  zIndex?: number
  /**
   * Couleur de l'anneau de sélection quand ce marker est le `selectedId`.
   * Absente = couleur d'accent du thème. Permet de faire porter à l'anneau une
   * information (statut de l'agent, source de l'alerte) plutôt qu'une teinte fixe.
   */
  selectedColor?: string
  data: T
}

/**
 * Tags EFFECTIFS d'un marker. Un marker sans tags reçoit `['marker', type]`
 * (miroir du défaut `['draw', kind]` des dessins) — sans quoi il disparaîtrait
 * dès qu'un filtre est actif. Point de vérité unique : la couche marker et le
 * moteur de relations doivent voir exactement les mêmes tags.
 */
export function markerTags<T>(m: MarkerData<T>): string[] {
  return m.tags ?? ['marker', m.type]
}

/**
 * Cadre englobant un ensemble de markers — à passer à `camera.fitBounds()`.
 *
 * Contrainte volontairement réduite à `{ position }` plutôt que `MarkerData<T>` :
 * le générique n'apporterait rien ici (seule la position compte) et forcerait
 * l'appelant à annoter des listes hétérogènes dont `T` s'infère mal.
 */
export function boundsOfMarkers(markers: Iterable<{ position: LatLng }>): Bounds | null {
  const points: LatLng[] = []
  for (const m of markers) points.push(m.position)
  return boundsOfLatLngs(points)
}

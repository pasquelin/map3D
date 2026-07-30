// Modèle de données du gestionnaire de templates. Un template = une sauvegarde du
// DESSIN (formes + main levée + symboles) et, optionnellement, de la VUE d'où on le
// regarde — jamais les zones, markers, tracés ou relations. Le contenu est le
// `GeoJSONFeatureCollection` de `DrawLayer` (le seul format d'échange déjà éprouvé de
// bout en bout, cf. `toGeoJSON`/`fromGeoJSON`), filtrable par catégorie via le `kind`
// de chaque feature.

import type { MapMode } from '../basemap'
import type { ImmersionLevel } from '../pedestrianState'
import type { GeoJSONFeatureCollection } from '../../layers/DrawLayer'
import type { Bounds } from '../../shared'

/** Familles d'entités sauvegardables, dérivées du `kind` d'une forme. */
export type TemplateCategory = 'shapes' | 'freehand' | 'symbols'

/**
 * Effet d'un clic sur un template : fusionner ses formes au dessin, remplacer le dessin,
 * ou en retirer les formes venues de ce template. `defaultApply` (config) n'expose que
 * `'merge'`/`'replace'` — « retirer » est une action, pas un défaut sensé.
 */
export type ApplyMode = 'merge' | 'replace' | 'remove'

/** Le sous-ensemble « défaut sensé » d'`ApplyMode` : « retirer » est une action, jamais un défaut. */
export type ApplyDefault = Exclude<ApplyMode, 'remove'>

/** Compteurs et étendue d'un template — pour la vignette, les stats et le tri. */
export type TemplateStats = {
  shapes: number
  freehand: number
  symbols: number
  /** Emprise géographique du contenu (null si vide). */
  bounds: Bounds | null
  /** Poids JSON du contenu, en octets. */
  bytes: number
}

/**
 * Vue piéton mémorisée : où l'on se tient et ce que l'on regarde. Sans `groundHeight` —
 * la hauteur du sol se remesure à l'arrivée (`enterPedestrian` la raycaste), et une
 * valeur figée dans un fichier vieillirait avec les tuiles.
 */
export type TemplatePedestrianView = {
  lat: number
  lng: number
  /** Cap (rad), 0 = nord. */
  heading: number
  /** Regard vertical (rad), 0 = horizon. */
  pitch: number
  immersion: ImmersionLevel
}

/**
 * La VUE mémorisée d'un template : « Vernon vu du sud à 1 200 m », « Nice à plat ».
 * Strictement de l'usage — où l'on regarde et comment la carte est réglée pour le
 * regarder. Aucune donnée : ni marker, ni zone, ni tracé.
 *
 * `lat`/`lng` désignent le point au sol **sous l'œil** (convention de `Camera.getPose`),
 * `altitude` la hauteur de la caméra. Rien de dérivé n'est stocké : le zoom se déduit de
 * l'altitude (`zoomForAltitude`) et l'emprise de la pose — les figer serait deux vérités
 * pour un même état, qui divergeraient au premier changement de taille de conteneur.
 */
export type TemplateView = {
  lat: number
  lng: number
  /** Hauteur de la caméra (m au-dessus de la surface). */
  altitude: number
  /** Cap (rad), 0 = nord, positif vers l'est. */
  heading: number
  /** Inclinaison (rad), 0 = nadir, π/2 = horizon. */
  tilt: number
  mapMode: MapMode
  traffic: boolean
  /**
   * Sélection du filtre « Couches » — des NOMS de tags, jamais les éléments qu'ils
   * portent. Absent = ne pas toucher au filtre en place (une vue peut vouloir cadrer
   * sans rien masquer).
   */
  tags?: readonly string[]
  /** Vue première personne, si c'est là qu'on était. */
  pedestrian?: TemplatePedestrianView
}

/**
 * Contenu sérialisable d'un template. Objet dédié pour rester extensible : `view` est
 * arrivée après `draw` et reste OPTIONNELLE — un `.m3dt` v1 (dessin seul) se relit sans
 * migration, et un template de vue seule a un `draw` vide.
 */
export type TemplateContent = { draw: GeoJSONFeatureCollection; view?: TemplateView }

/**
 * Un template nommé. `origin` distingue le cache local (`'local'`, persisté en
 * localStorage) du template servi par l'API (`'api'`, dont la source de vérité est
 * le backend et qui peut venir d'un autre utilisateur — d'où `readOnly`).
 */
export type Template = {
  id: string
  name: string
  content: TemplateContent
  origin: 'local' | 'api'
  /** Template API non modifiable par cet utilisateur (créé par un autre). */
  readOnly?: boolean
  author?: string
  createdAt?: number
  updatedAt?: number
  stats?: TemplateStats
}

// Modèle de données du gestionnaire de templates. Un template = une sauvegarde du
// DESSIN (formes + main levée + symboles) — jamais les zones, markers, tracés ou
// relations. Le contenu est le `GeoJSONFeatureCollection` de `DrawLayer` (le seul
// format d'échange déjà éprouvé de bout en bout, cf. `toGeoJSON`/`fromGeoJSON`),
// filtrable par catégorie via le `kind` de chaque feature.

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

/** Contenu sérialisable d'un template. Objet dédié pour rester extensible. */
export type TemplateContent = { draw: GeoJSONFeatureCollection }

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

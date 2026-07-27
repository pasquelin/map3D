import { MARKER_TYPES, markerTypeSpec } from './markerTypes'

/**
 * Palette de la démo, dérivée du registre des types (`markerTypes.ts`).
 *
 * Le thème, les sprites et la donnée (`selectedColor`) lisent tous ce fichier : une
 * couleur ne se règle qu'au registre, et marqueurs, parts de cluster et tags restent
 * forcément d'accord.
 */

/** Couleur par TYPE de marker (`alert-*`, `agent-*`). */
export const TYPE_COLORS: Record<string, string> = Object.fromEntries(Object.entries(MARKER_TYPES).map(([type, spec]) => [type, spec.color]))

/** Couleur d'un type, avec repli neutre pour un type inconnu (symbole posé, etc.). */
export const typeColor = (type: string): string => markerTypeSpec(type)?.color ?? '#64748b'

/**
 * Couleurs des tags = couleurs des TYPES correspondants (mêmes pastilles que les
 * markers dans le panneau « Couches » → lecture immédiate). Injectées dans le thème
 * (`colors.tags`) ; les tags sans correspondance (villes, dessins : draw, rect…)
 * gardent la palette hashée de la lib.
 */
export const TAG_COLORS: Record<string, string> = {
  alert: typeColor('alert-high'),
  critical: typeColor('alert-critical'),
  high: typeColor('alert-high'),
  medium: typeColor('alert-medium'),
  low: typeColor('alert-low'),
  user: typeColor('agent-available'),
  standby: typeColor('agent-available'),
  move: typeColor('agent-enroute'),
  onsite: typeColor('agent-onsite'),
  defib: typeColor('defib'),
}

/** Trait des zones de couverture (cercles de ville + thème `colors.zone`). */
export const ZONE_STROKE = '#2E7CF6'

/** Gris ardoise des bâtiments : un bâtiment n'est pas une zone de sécurité. */
export const BUILDING_COLOR = '#94a3b8'

/** Volumes de démo — deux teintes, pour montrer que la hauteur est portée par LA ZONE. */
export const VOLUME_COLORS = { tall: '#f59e0b', short: '#22c55e' }

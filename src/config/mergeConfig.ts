import { deepMerge } from '../theme/mergeTheme'
import type { AutoLocale, MapConfig, PartialConfig } from './types'

/**
 * Merge profond d'une config partielle sur une base complète.
 *
 * Même sémantique ET même ordre d'arguments que `mergeTheme`/`mergeLabels` : base
 * d'abord, override ensuite. Les objets fusionnent, les tableaux et les fonctions se
 * remplacent en bloc (un tableau de presets à moitié fusionné n'aurait aucun sens).
 */
export function mergeConfig(base: MapConfig, override?: PartialConfig): MapConfig {
  return deepMerge(base, override)
}

/**
 * Résout `'auto'` en langue du navigateur, au moment de l'appel.
 *
 * Pas au chargement du module : `navigator` n'existe pas en SSR, et une valeur figée
 * à l'import survivrait à un changement de locale.
 */
export function resolveLocale(value: AutoLocale): string | undefined {
  if (value !== 'auto') return value
  return typeof navigator !== 'undefined' ? navigator.language : undefined
}

/**
 * Idem pour un biais régional : `'auto'` signifie « laisse le fournisseur déduire »,
 * donc l'absence du champ dans la requête — et non une région choisie à sa place.
 */
export function resolveRegion(value: AutoLocale): string | undefined {
  return value === 'auto' ? undefined : value
}

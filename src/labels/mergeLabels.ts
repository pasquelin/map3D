import { deepMerge } from '../theme/mergeTheme'
import type { MapLabels, PartialLabels } from './types'

/** Merge profond de libellés partiels sur une base (mêmes règles que `mergeTheme`). */
export function mergeLabels(base: MapLabels, override?: PartialLabels): MapLabels {
  return deepMerge(base, override)
}

/** Interpole les variables `{nom}` d'un gabarit de libellé : `formatLabel('Bordure {width} px', { width: 4 })`. */
export function formatLabel(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (params[key] !== undefined ? String(params[key]) : m))
}

/**
 * Gabarit dénombrable : choisit la forme singulier/pluriel et interpole `{count}`.
 * Le choix de la forme appartient au système de labels, pas aux composants.
 */
export function formatCount(one: string, other: string, count: number): string {
  return formatLabel(count > 1 ? other : one, { count })
}

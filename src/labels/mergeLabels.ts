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
 *
 * `plural` vient des labels (`labels.plural`) et est REQUIS : lui donner un repli en
 * dur redupliquerait la règle française de `defaultLabels`, soit deux sources pour la
 * même décision — exactement ce que ce module cherche à éviter.
 */
export function formatCount(one: string, other: string, count: number, plural: (n: number) => 'one' | 'other'): string {
  return formatLabel(plural(count) === 'other' ? other : one, { count })
}

/**
 * Libellé et description d'une entrée de catalogue de symboles, traduits si la
 * locale les couvre.
 *
 * Le catalogue par défaut (MIL-STD-2525D) porte ses textes en français dans le
 * module qui le déclare : c'est commode pour l'écrire, mais c'était jusqu'ici une
 * impasse — 91 libellés que rien ne pouvait traduire, dans une UI par ailleurs
 * entièrement traduisible. La table `labels.symbols.catalog` les recouvre par clé,
 * partiellement si besoin.
 */
export function symbolText(
  labels: MapLabels,
  entry: { key: string; label: string; description?: string },
): { label: string; description?: string } {
  const t = labels.symbols.catalog[entry.key]
  return { label: t?.label ?? entry.label, description: t?.description ?? entry.description }
}

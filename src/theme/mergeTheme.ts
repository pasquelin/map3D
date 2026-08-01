import { deepMerge } from '../core/deepMerge'
import type { MapTheme, PartialTheme } from './types'

export { deepMerge }

export type MergeOptions = { prefersReducedMotion?: boolean }

/**
 * Merge profond d'un thème partiel sur une base. `prefers-reduced-motion` est
 * respecté automatiquement **sauf** si l'override force explicitement
 * `animations.enabled`.
 */
export function mergeTheme(base: MapTheme, override?: PartialTheme, opts?: MergeOptions): MapTheme {
  const merged = deepMerge(base, override)
  if (opts?.prefersReducedMotion && override?.animations?.enabled === undefined) {
    // Copie, jamais d'affectation sur `merged` : sans override, `deepMerge` renvoie
    // `base` **par référence** (cf. son premier test). Muter ici écrivait donc dans
    // l'objet de l'appelant — en pratique le singleton `defaultTheme`, exporté
    // publiquement, qui restait figé sur `enabled: false` pour toute l'application
    // dès qu'un utilisateur avait `prefers-reduced-motion: reduce`.
    return { ...merged, animations: { ...merged.animations, enabled: false } }
  }
  return merged
}

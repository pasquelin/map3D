import type { MapTheme, PartialTheme } from './types'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Merge profond générique (partagé par `mergeTheme` et `mergeLabels`). */
export function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined) return base
  if (!isPlainObject(base) || !isPlainObject(override)) return override as T
  const out: Record<string, unknown> = { ...base }
  for (const key of Object.keys(override)) {
    const b = (base as Record<string, unknown>)[key]
    const o = override[key]
    // Fonctions et tableaux : remplacement complet (jamais de fusion).
    if (typeof o === 'function' || Array.isArray(o) || !isPlainObject(o)) {
      out[key] = o
    } else {
      out[key] = deepMerge(b, o)
    }
  }
  return out as T
}

export type MergeOptions = { prefersReducedMotion?: boolean }

/**
 * Merge profond d'un thème partiel sur une base. `prefers-reduced-motion` est
 * respecté automatiquement **sauf** si l'override force explicitement
 * `animations.enabled`.
 */
export function mergeTheme(
  base: MapTheme,
  override?: PartialTheme,
  opts?: MergeOptions,
): MapTheme {
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

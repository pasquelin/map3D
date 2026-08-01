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

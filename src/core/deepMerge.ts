function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Merge profond générique (partagé par `mergeTheme` et `mergeLabels`). */
export function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined) return base
  if (!isPlainObject(base) || !isPlainObject(override)) return override as T
  const out: Record<string, unknown> = { ...base }
  for (const key of Object.keys(override)) {
    // Un override issu de `JSON.parse` (localStorage, API) peut porter une clé `__proto__`
    // PROPRE : l'affecter changerait le prototype de l'objet fusionné.
    if (key === '__proto__' || key === 'constructor') continue
    const b = (base as Record<string, unknown>)[key]
    const o = override[key]
    // Feuille absente = défaut conservé, comme à la racine (ligne 7). Sans cette garde,
    // `{ retries: env.X }` avec la variable absente EFFAÇAIT le défaut, et la lib lisait
    // `undefined` là où elle attend un nombre.
    if (o === undefined) continue

    // Fonctions et tableaux : remplacement complet (jamais de fusion).
    if (typeof o === 'function' || Array.isArray(o) || !isPlainObject(o)) {
      out[key] = o
    } else {
      out[key] = deepMerge(b, o)
    }
  }
  return out as T
}

import type { PluginField } from './types'

const keysOf = (schema: readonly PluginField[] | undefined): Set<string> => new Set((schema ?? []).map((f) => f.key))

/** Objet de config initial : chaque champ à sa valeur par défaut. Seule source des défauts. */
export function defaultsOf(schema: readonly PluginField[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of schema ?? []) out[f.key] = f.default
  return out
}

/** Partiel persisté = écart aux défauts (survit aux évolutions de schéma). */
export function partialOf(
  config: Record<string, unknown>,
  schema: readonly PluginField[] | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of schema ?? []) if (f.key in config && config[f.key] !== f.default) out[f.key] = config[f.key]
  return out
}

/** Ne conserve d'un patch que les clés connues du schéma (le schéma est la vérité). */
export function filterKnown(
  patch: Record<string, unknown>,
  schema: readonly PluginField[] | undefined,
): Record<string, unknown> {
  const known = keysOf(schema)
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(patch)) if (known.has(k)) out[k] = patch[k]
  return out
}

/** Config effective : défauts ⊕ partiels (dans l'ordre), en ignorant toute clé absente du schéma. */
export function resolveConfig(
  schema: readonly PluginField[] | undefined,
  ...partials: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
  const known = keysOf(schema)
  const out = defaultsOf(schema)
  for (const p of partials) {
    if (!p) continue
    for (const k of Object.keys(p)) if (known.has(k)) out[k] = p[k]
  }
  return out
}

import type { CatalogId, CatalogKey } from './types'

/**
 * Version de la charge persistée. L'incrémenter invalide les sélections d'un ancien
 * format plutôt que de tenter de les migrer — une sélection perdue se refait en trois
 * clics, une migration ratée laisse un état incohérent.
 */
export const SELECTION_STORAGE_VERSION = 1

/**
 * Clé globale d'un élément.
 *
 * Le séparateur est le PREMIER deux-points : un identifiant métier peut en contenir
 * (`geo:ref:7`), un identifiant de source non — c'est nous qui le choisissons.
 */
export const catalogKey = (sourceId: string, itemId: CatalogId): CatalogKey => `${sourceId}:${itemId}`

export const parseCatalogKey = (key: CatalogKey): { sourceId: string; itemId: string } | null => {
  const i = key.indexOf(':')
  if (i <= 0 || i === key.length - 1) return null
  return { sourceId: key.slice(0, i), itemId: key.slice(i + 1) }
}

/**
 * Restitue l'identifiant d'origine après un aller-retour par le stockage.
 *
 * Une clé est du texte : `42` en ressort en `'42'`, et une source qui compare ses ids
 * avec `===` ne reconnaîtrait plus rien. On rend donc un NOMBRE quand la chaîne est sa
 * propre représentation canonique — ce qui laisse intacts les identifiants textuels qui
 * ressemblent à des nombres (`'007'`, `'1e3'`, `' 42'`), lesquels ne se re-sérialisent
 * pas à l'identique.
 */
export const restoreCatalogId = (itemId: string): CatalogId => {
  const n = Number(itemId)
  return Number.isFinite(n) && String(n) === itemId ? n : itemId
}

export const toggleSelection = (sel: readonly CatalogKey[], key: CatalogKey): readonly CatalogKey[] =>
  sel.includes(key) ? sel.filter((k) => k !== key) : [...sel, key]

/**
 * Rend la MÊME référence quand la clé est absente : passée à `setState`, une valeur
 * identique n'entraîne pas de re-render, là où un nouveau tableau en provoquerait un à
 * chaque échec de chargement.
 */
export const removeFromSelection = (sel: readonly CatalogKey[], key: CatalogKey): readonly CatalogKey[] =>
  sel.includes(key) ? sel.filter((k) => k !== key) : sel

/**
 * Ne garde que les clés dont la source est encore déclarée — et jette au passage les
 * clés malformées. Appelée quand une source disparaît (plugin démonté) et à la
 * restauration de la charge persistée.
 */
export const purgeSources = (sel: readonly CatalogKey[], known: ReadonlySet<string>): readonly CatalogKey[] => {
  const kept = sel.filter((k) => {
    const parsed = parseCatalogKey(k)
    return parsed !== null && known.has(parsed.sourceId)
  })
  return kept.length === sel.length ? sel : kept
}

export const serializeSelection = (sel: readonly CatalogKey[]): string =>
  JSON.stringify({ v: SELECTION_STORAGE_VERSION, keys: sel })

/**
 * Tolérante par construction : une charge corrompue, écrite par une autre version, ou
 * contenant des entrées étrangères ne doit jamais empêcher la carte de démarrer.
 */
export const deserializeSelection = (raw: string | null): readonly CatalogKey[] => {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return []
    const { v, keys } = parsed as { v?: unknown; keys?: unknown }
    if (v !== SELECTION_STORAGE_VERSION || !Array.isArray(keys)) return []
    return keys.filter((k): k is CatalogKey => typeof k === 'string' && parseCatalogKey(k) !== null)
  } catch {
    return []
  }
}

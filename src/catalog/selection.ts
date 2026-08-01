import type { CatalogId, CatalogKey } from './types'

/**
 * Version de la charge persistée. L'incrémenter invalide les sélections d'un ancien
 * format plutôt que de tenter de les migrer — une sélection perdue se refait en trois
 * clics, une migration ratée laisse un état incohérent.
 *
 * v2 : la charge porte désormais, à côté des clés, le TITRE de chaque forme anonyme, sans
 * quoi une zone restaurée sans nom propre sortait introuvable de la recherche (cf.
 * `deserializeSelectionTitles` et le repli de `useCatalog`).
 */
export const SELECTION_STORAGE_VERSION = 2

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

/**
 * Sérialise la sélection ET les titres à restituer aux formes anonymes.
 *
 * Seuls les titres des clés ENCORE sélectionnées sont écrits — un titre orphelin (clé
 * retirée) gonflerait la charge pour une forme que plus rien ne réaffichera.
 */
export const serializeSelection = (sel: readonly CatalogKey[], titles?: ReadonlyMap<CatalogKey, string>): unknown => {
  const kept: Record<string, string> = {}
  if (titles) {
    for (const k of sel) {
      const t = titles.get(k)
      if (t !== undefined) kept[k] = t
    }
  }
  return { v: SELECTION_STORAGE_VERSION, keys: sel, titles: kept }
}

/**
 * Tolérante par construction : une charge corrompue, écrite par une autre version, ou
 * contenant des entrées étrangères ne doit jamais empêcher la carte de démarrer.
 *
 * Reçoit la charge DÉJÀ parsée (`readStoredJSON`) : le `try`/`JSON.parse` appartient au
 * module de stockage, unique propriétaire des accidents de persistance.
 */
export const deserializeSelection = (raw: unknown): readonly CatalogKey[] => {
  if (typeof raw !== 'object' || raw === null) return []
  const { v, keys } = raw as { v?: unknown; keys?: unknown }
  if (v !== SELECTION_STORAGE_VERSION || !Array.isArray(keys)) return []
  return keys.filter((k): k is CatalogKey => typeof k === 'string' && parseCatalogKey(k) !== null)
}

/**
 * Titres retenus par clé — le nom prêté à une forme anonyme pour qu'elle reste cherchable
 * après restauration (cf. `useCatalog`, repli identique à `fetchGeometry`).
 *
 * Même tolérance que `deserializeSelection` : une charge illisible ou d'une autre version
 * rend une table vide, jamais une erreur.
 */
export const deserializeSelectionTitles = (raw: unknown): ReadonlyMap<CatalogKey, string> => {
  const out = new Map<CatalogKey, string>()
  if (typeof raw !== 'object' || raw === null) return out
  const { v, titles } = raw as { v?: unknown; titles?: unknown }
  if (v !== SELECTION_STORAGE_VERSION || typeof titles !== 'object' || titles === null) return out
  for (const [k, t] of Object.entries(titles as Record<string, unknown>)) {
    if (typeof t === 'string' && parseCatalogKey(k) !== null) out.set(k, t)
  }
  return out
}

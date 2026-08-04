import type { CatalogId, CatalogKey } from './types'

/**
 * Version de la charge persistée. L'incrémenter invalide les sélections d'un ancien
 * format plutôt que de tenter de les migrer — une sélection perdue se refait en trois
 * clics, une migration ratée laisse un état incohérent.
 *
 * v2 : la charge porte, à côté des clés, le TITRE de chaque forme anonyme — sans quoi une
 * zone restaurée sans nom propre sortait introuvable de la recherche (cf. `CatalogSnapshot`
 * et le repli de `useCatalog`).
 *
 * Le champ `sources` (bascules allumées) est arrivé APRÈS, sans bump : purement additif et
 * optionnel, une charge v2 qui l'ignore se relit intacte. Bumper aurait jeté la sélection
 * de tout le monde pour un ajout qui ne casse rien.
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
 * Ce que le catalogue retient d'une session — la charge persistée, en un seul objet.
 *
 * Un objet nommé plutôt que trois arguments positionnels et trois lecteurs parallèles :
 * chaque champ ajouté imposait sinon un `undefined` de plus aux appelants, un quatrième
 * désérialiseur répétant la même garde de version, et une passe de plus sur la même charge.
 */
export type CatalogSnapshot = {
  keys: readonly CatalogKey[]
  /** Titre prêté à une forme anonyme, par clé — sans lui, elle sort introuvable de la recherche. */
  titles: ReadonlyMap<CatalogKey, string>
  /** Sources à BASCULE allumées. */
  sources: readonly string[]
}

const EMPTY_SNAPSHOT: CatalogSnapshot = { keys: [], titles: new Map(), sources: [] }

/**
 * Sérialise la sélection, les titres à restituer aux formes anonymes, et les sources à
 * bascule allumées.
 *
 * Seuls les titres des clés ENCORE sélectionnées sont écrits — un titre orphelin (clé
 * retirée) gonflerait la charge pour une forme que plus rien ne réaffichera.
 *
 * Les bascules occupent un CHAMP à part (`sources`) et non une clé sentinelle glissée
 * dans `keys` : un identifiant de source y entrerait en collision avec un identifiant
 * d'élément parfaitement légitime, et la purge ne saurait plus lequel des deux elle
 * retire.
 */
export const serializeSnapshot = (snap: {
  keys: readonly CatalogKey[]
  titles?: ReadonlyMap<CatalogKey, string>
  sources?: Iterable<string>
}): unknown => {
  const kept: Record<string, string> = {}
  if (snap.titles) {
    for (const k of snap.keys) {
      const t = snap.titles.get(k)
      if (t !== undefined) kept[k] = t
    }
  }
  return {
    v: SELECTION_STORAGE_VERSION,
    keys: snap.keys,
    titles: kept,
    sources: snap.sources ? [...snap.sources] : [],
  }
}

/**
 * Relit la charge — UNE passe, trois champs.
 *
 * Tolérante par construction : une charge corrompue, écrite par une autre version, ou
 * contenant des entrées étrangères ne doit jamais empêcher la carte de démarrer. Chaque
 * champ est validé pour lui-même, si bien qu'un `titles` illisible ne fait pas perdre les
 * clés, ni l'inverse.
 *
 * `sources` est optionnel : une session écrite avant l'arrivée des bascules se relit
 * intacte, sans aucune source allumée. Une source disparue depuis est écartée plus tard, à
 * la purge — ici on ne sait pas encore ce qui est inscrit.
 *
 * Reçoit la charge DÉJÀ parsée (`readStoredJSON`) : le `try`/`JSON.parse` appartient au
 * module de stockage, unique propriétaire des accidents de persistance.
 */
export const deserializeSnapshot = (raw: unknown): CatalogSnapshot => {
  if (typeof raw !== 'object' || raw === null) return EMPTY_SNAPSHOT
  const { v, keys, titles, sources } = raw as { v?: unknown; keys?: unknown; titles?: unknown; sources?: unknown }
  if (v !== SELECTION_STORAGE_VERSION) return EMPTY_SNAPSHOT

  const outKeys = Array.isArray(keys)
    ? keys.filter((k): k is CatalogKey => typeof k === 'string' && parseCatalogKey(k) !== null)
    : []

  const outTitles = new Map<CatalogKey, string>()
  if (typeof titles === 'object' && titles !== null) {
    for (const [k, t] of Object.entries(titles as Record<string, unknown>)) {
      if (typeof t === 'string' && parseCatalogKey(k) !== null) outTitles.set(k, t)
    }
  }

  const outSources = Array.isArray(sources)
    ? sources.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []

  return { keys: outKeys, titles: outTitles, sources: outSources }
}

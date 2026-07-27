import { ProviderRegistry } from '../core/ProviderRegistry'
import type { SearchEntry, SearchGroup, SearchProvider, SearchQueryOptions, SearchQueryResult } from './types'

/**
 * Réponse « rien pour moi », pour un fournisseur hors portée.
 *
 * Une FABRIQUE et non un singleton : `entries` et `totals` sont mutables, et un objet
 * vide partagé finit toujours par se faire pousser dedans par un appelant — corrompant
 * tous les « vides » suivants. Deux allocations par frappe et par couche hors portée,
 * c'est le bon prix pour supprimer ce piège.
 */
export const emptyResult = (): SearchQueryResult => ({ entries: [], totals: new Map() })

/**
 * Identifiants de rubrique. Regroupés ici pour que la convention ait un propriétaire :
 * sans ça, l'application doit deviner que les formes s'appellent `'shape'` et
 * reconstruire `` `marker:${type}` `` à la main pour composer un `groupOrder`.
 */
export const markerGroupId = (type: string): string => `marker:${type}`
/** Formes déclaratives (`<ShapeLayer shapes>`). */
export const SHAPE_GROUP = 'shape'
/** Formes dessinées à la main, nommées. */
export const DRAW_GROUP = 'draw'
/** Géocodage de lieux — hors classement, toujours en tête de liste. */
export const PLACE_GROUP = 'place'

/** Signature d'un jeu de rubriques, pour ne notifier que sur changement réel. */
const signatureOf = (groups: readonly SearchGroup[]): string =>
  groups.map((g) => `${g.id}\u0000${g.label}\u0000${g.color ?? ''}\u0000${g.count}`).join('\u0001')

/**
 * Registre de recherche partagé sur `MapEngine` (`engine.search`) : chaque couche
 * s'inscrit comme fournisseur de ses propres éléments, la boîte de recherche les
 * interroge toutes sans en connaître aucune. Même mécanique que `engine.markers` ou
 * `engine.tags` — c'est elle qui permet aux formes DESSINÉES, créées à l'exécution,
 * d'être cherchables sans que `<Map>` ait à les inventorier.
 *
 * Les rubriques sont **déclarées** (`report`) et non demandées, exactement comme les
 * compteurs de `TagFilter` : sur un flux temps réel, le tableau de markers est
 * remplacé plusieurs fois par seconde alors que les rubriques, elles, ne changent
 * pas. Comparer avant d'émettre évite de faire rescanner et re-rendre tous les
 * abonnés à chaque tick GPS.
 */
export class SearchRegistry extends ProviderRegistry<SearchProvider> {
  private readonly sources = new Map<string, { groups: SearchGroup[]; signature: string }>()

  /**
   * Déclare (ou met à jour) les rubriques d'une couche. N'émet que si elles ont
   * réellement changé — libellé, couleur et compte inclus.
   */
  report(source: string, groups: SearchGroup[]): void {
    const signature = signatureOf(groups)
    if (this.sources.get(source)?.signature === signature) return
    this.sources.set(source, { groups, signature })
    this.itemsChanged()
  }

  /** Retire une source (couche démontée). */
  unreport(source: string): void {
    if (this.sources.delete(source)) this.itemsChanged()
  }

  /**
   * Rubriques présentes sur la carte, comptes fusionnés. Deux couches portant le
   * même type produisent UNE rubrique dont les comptes s'additionnent — l'utilisateur
   * voit des « Agents », pas deux couches d'implémentation.
   */
  groups(): SearchGroup[] {
    const merged = new Map<string, SearchGroup>()
    for (const { groups } of this.sources.values()) {
      for (const g of groups) {
        const prev = merged.get(g.id)
        if (prev) prev.count += g.count
        else merged.set(g.id, { ...g })
      }
    }
    return [...merged.values()]
  }

  /** Fusion des résultats de tous les fournisseurs (le regroupement final revient à l'appelant). */
  query(needle: string, opts: SearchQueryOptions): SearchQueryResult {
    const entries: SearchEntry[] = []
    const totals = new Map<string, number>()
    for (const p of this.providers) {
      const r = p.query(needle, opts)
      entries.push(...r.entries)
      for (const [group, n] of r.totals) totals.set(group, (totals.get(group) ?? 0) + n)
    }
    return { entries, totals }
  }
}

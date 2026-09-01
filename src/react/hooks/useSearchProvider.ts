import { useEffect, useRef } from 'react'
import { centerOfBounds } from '../../core/bounds'
import { type Hit, NO_MATCH, proximityRank, rankHits, scoreMatch } from '../../search/match'
import { emptyResult } from '../../search/registry'
import type { SearchEntry } from '../../search/types'
import type { Bounds } from '../../shared'
import { useMapContext } from '../context'

/** Ce qu'une couche de formes doit dire de ses éléments pour être cherchable. */
export type SearchProviderSpec<T> = {
  /** Identifiant de rubrique (`SHAPE_GROUP`, `DRAW_GROUP`). */
  group: string
  /** Libellé et couleur de la rubrique — les mêmes que ses éléments sur la carte. */
  label: string
  color: string
  /** Clé de cette couche dans le registre (`useId()` de l'appelant : deux couches coexistent). */
  source: string
  /** Candidats — lus À LA REQUÊTE, jamais capturés. */
  items: () => Iterable<T>
  /** Titre normalisé (cf. `normalizeSearch`), ou `null` pour un élément sans nom : ignoré. */
  normalizedTitle: (item: T) => string | null
  boundsOf: (item: T) => Bounds | null
  /** Ce qui distingue une entrée : identité, titre affiché, couleur, action de sélection. */
  entryOf: (item: T, bounds: Bounds) => Pick<SearchEntry, 'id' | 'title' | 'color' | 'select'>
  /** Nombre d'éléments nommés — la rubrique déclarée (le registre compare avant d'émettre). */
  count: number
}

/**
 * Inscrit une couche de formes au registre de recherche (`engine.search`), et déclare
 * sa rubrique tant qu'elle a quelque chose à y montrer.
 *
 * `ShapeLayer` et `DrawLayer` en tenaient chacun leur copie : même boucle de scoring,
 * même classement, même emprise portée par l'entrée (c'est ce qui fait CADRER la zone au
 * choix au lieu de survoler son centre), même déclaration comparée et même retrait au
 * démontage. Seuls diffèrent la provenance des candidats et ce qu'une entrée dit d'eux.
 *
 * Le fournisseur est inscrit UNE fois par moteur et lit la spec par ref : un `spec` écrit
 * en littéral à chaque rendu — le cas normal — ne le réinscrit pas.
 */
export function useSearchProvider<T>(spec: SearchProviderSpec<T>): void {
  const { engine } = useMapContext()
  const specRef = useRef(spec)
  specRef.current = spec

  useEffect(() => {
    return engine.search.register({
      query: (needle, opts) => {
        const { group, items, normalizedTitle, boundsOf, entryOf } = specRef.current
        if (opts.group && opts.group !== group) return emptyResult()
        const hits: Hit<{ item: T; bounds: Bounds }>[] = []
        for (const item of items()) {
          const title = normalizedTitle(item)
          if (title === null) continue
          const score = scoreMatch(title, needle)
          if (score === NO_MATCH) continue
          const bounds = boundsOf(item)
          if (!bounds) continue
          hits.push({
            item: { item, bounds },
            score,
            distance: opts.origin ? proximityRank(centerOfBounds(bounds), opts.origin) : 0,
          })
        }
        return {
          entries: rankHits(hits, opts.limit).map(({ item, bounds }) => ({
            group,
            position: centerOfBounds(bounds),
            bounds,
            ...entryOf(item, bounds),
          })),
          totals: new Map([[group, hits.length]]),
        }
      },
    })
  }, [engine])

  const { group, label, color, source, count } = spec
  useEffect(() => {
    engine.search.report(source, count > 0 ? [{ id: group, label, color, count }] : [])
  }, [engine, source, group, label, color, count])
  useEffect(() => () => engine.search.unreport(source), [engine, source])
}

import { type RefObject, useEffect } from 'react'
import { boundsContains } from '../../core/MarkerQuery'
import type { MapEngine } from '../../core/MapEngine'
import type { SelectableScreenItem } from '../../core/Selectables'
import type { MarkerData } from '../../data/types'
import type { MarkerLayer as CoreMarkerLayer } from '../../layers/MarkerLayer'
import { type Hit, NO_MATCH, proximityRank, rankHits, scoreMatch } from '../../search/match'
import { markerGroupId } from '../../search/registry'
import type { SearchEntry, SearchGroup } from '../../search/types'
import { markerColorOf } from '../../theme/colors'
import type { MapTheme } from '../../theme/types'
import type { MenuItem } from '../components/ContextMenu'

/** Ce que les registres (sélection, recherche) lisent du rendu courant — via `latest`. */
type MarkerRegistriesSnapshot<T> = {
  points: MarkerData<T>[]
  getId: (p: MarkerData<T>) => string | number
  menu?: (p: MarkerData<T>) => MenuItem[]
  onSelect?: (p: MarkerData<T> | null) => void
}

/**
 * Câblage des registres portés par le moteur pour une couche de markers : marquee
 * (`selectables`), inventaire loupe (`markers`) et recherche unifiée (`search`).
 * Extrait tel quel de `MarkerLayer` : mêmes effets, mêmes deps, même ordre relatif
 * entre eux. Le registre « Couches » (tags) est à part (`useTagRegistry`), appelé
 * plus tôt dans `MarkerLayer` pour garder sa position D'ORIGINE dans l'ordre des
 * hooks — `normalizedTitle` (mémo, consommateur unique de ce hook) le suit de même,
 * reçu ici en paramètre plutôt que recréé.
 */
export function useMarkerRegistries<T>({
  engine,
  coreRef,
  entriesRef,
  pointsByIdRef,
  latest,
  searchSource,
  points,
  typeLabel,
  theme,
  normalizedTitle,
}: {
  engine: MapEngine
  coreRef: RefObject<CoreMarkerLayer | null>
  entriesRef: RefObject<Map<string | number, MarkerData<T>>>
  pointsByIdRef: RefObject<Map<string | number, MarkerData<T>>>
  latest: RefObject<MarkerRegistriesSnapshot<T>>
  searchSource: string
  points: MarkerData<T>[]
  typeLabel: ((type: string) => string) | undefined
  theme: MapTheme
  normalizedTitle: (m: MarkerData<T>) => string
}): void {
  // Provider du registre de sélection : expose au marquee les markers que cette
  // couche pose RÉELLEMENT — ceux qu'une pastille agrège n'en sont pas.
  useEffect(() => {
    return engine.selectables.register({
      screenItems: () => {
        const core = coreRef.current
        if (!core) return []
        const out: SelectableScreenItem[] = []
        for (const it of core.screenPositions(engine.threeCamera)) {
          const marker = entriesRef.current.get(it.id)
          if (marker) out.push({ id: latest.current.getId(marker), kind: 'marker', x: it.x, y: it.y })
        }
        return out
      },
      setSelected: (ids) => {
        coreRef.current?.setMultiSelected(new Set(ids))
      },
      info: (id) => {
        const p = pointsByIdRef.current.get(id)
        return p ? { kind: 'marker', type: p.type } : null
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coreRef, engine])

  // Fournisseur d'inventaire de l'outil loupe : TOUS les markers d'un cadre géo,
  // depuis les données sources (post-filtre tags) — donc clusters inclus, à la
  // différence du provider de sélection qui ne voit que les markers visibles.
  useEffect(() => {
    return engine.markers.register({
      markersInBounds: (bounds) => {
        const out: MarkerData<T>[] = []
        for (const p of latest.current.points) {
          if (boundsContains(bounds, p.position)) out.push(p)
        }
        return out
      },
      markerById: (id) => pointsByIdRef.current.get(id) ?? null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  // Fournisseur de recherche : une rubrique par TYPE présent, alimentée par
  // `MarkerData.title`. Part des mêmes `points` que le registre d'inventaire — donc
  // post-filtre « Couches » : ce qui est masqué sur la carte est introuvable, ce qui
  // évite de faire voler la caméra vers un marker que l'utilisateur ne verra pas.
  //
  // Un marker sans `title` est ÉCARTÉ, jamais indexé sous son id : proposer
  // « 7f3a-91b2 » dans une liste de résultats n'aide personne.
  useEffect(() => {
    return engine.search.register({
      query: (needle, opts) => {
        const { points, getId, menu, onSelect } = latest.current
        const perGroup = new Map<string, Hit<MarkerData<T>>[]>()
        for (const m of points) {
          if (!m.title) continue
          const group = markerGroupId(m.type)
          if (opts.group && opts.group !== group) continue
          const score = scoreMatch(normalizedTitle(m), needle)
          if (score === NO_MATCH) continue
          const distance = opts.origin ? proximityRank(m.position, opts.origin) : 0
          const bucket = perGroup.get(group)
          if (bucket) bucket.push({ item: m, score, distance })
          else perGroup.set(group, [{ item: m, score, distance }])
        }
        const entries: SearchEntry[] = []
        const totals = new Map<string, number>()
        // Les entrées (et leurs closures) ne sont construites qu'APRÈS la troncature :
        // une requête de deux lettres peut correspondre à des centaines de markers
        // dont six seulement seront affichés.
        for (const [group, hits] of perGroup) {
          totals.set(group, hits.length)
          for (const m of rankHits(hits, opts.limit)) {
            entries.push({
              group,
              id: getId(m),
              title: m.title!,
              titleColor: m.titleColor,
              // Pas de sous-titre de type : l'en-tête de rubrique le dit déjà, et le
              // répéter sur chaque ligne noierait le nom qu'on cherche à lire.
              position: m.position,
              avatar: m.avatar,
              icon: m.icon,
              color: markerColorOf(theme, m.type).base,
              // Le chemin EXACT d'un clic sur la carte : la couche signale, l'hôte
              // décide de `selectedId`. Court-circuiter reviendrait à inventer une
              // seconde sémantique de sélection.
              select: () => onSelect?.(m),
              menu: menu ? () => menu(m) : undefined,
            })
          }
        }
        return { entries, totals }
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, theme, normalizedTitle])

  // Rubriques DÉCLARÉES (et non demandées) : `points` est remplacé à chaque tick d'un
  // flux temps réel, alors que les rubriques ne bougent quasiment jamais. Le registre
  // compare avant d'émettre, donc les abonnés ne se re-rendent que sur changement réel.
  useEffect(() => {
    const counts = new Map<string, SearchGroup>()
    for (const p of points) {
      if (!p.title) continue
      const id = markerGroupId(p.type)
      const prev = counts.get(id)
      if (prev) prev.count++
      else
        counts.set(id, {
          id,
          label: typeLabel?.(p.type) ?? p.type,
          color: markerColorOf(theme, p.type).base,
          count: 1,
        })
    }
    engine.search.report(searchSource, [...counts.values()])
  }, [engine, points, typeLabel, theme, searchSource])
  useEffect(() => () => engine.search.unreport(searchSource), [engine, searchSource])
}

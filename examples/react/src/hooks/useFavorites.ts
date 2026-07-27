import type { DragPayload, MarkerData, PinnedItem, PlacedSymbolShape } from 'map3d'
import { useEffect, useState } from 'react'

import { markerLabel } from '../config/labels'
import type { AnyData } from '../data/types'
import { iconDataUri, svgToDataUri } from '../icons/markerIcons'

const STORAGE_KEY = 'm3d-demo-favs'

type Favorites = {
  items: PinnedItem<MarkerData<AnyData>>[]
  onPin: (payload: DragPayload<unknown>) => void
  onUnpin: (id: string | number) => void
  onReorder: (ids: Array<string | number>) => void
  /** Cet élément est-il déjà épinglé ? (état de l'entrée « Épingler » d'un menu). */
  isPinned: (id: string | number) => boolean
  /** Bascule l'épinglage d'un élément DÉJÀ connu de la carte — le geste du menu. */
  togglePin: (id: string | number) => void
}

/**
 * Le stockage local n'est pas une source sûre : il survit aux versions, et rien
 * n'empêche un tiers d'écrire cette clé. On ne lui fait donc confiance qu'après
 * vérification — sinon une valeur mal formée ferait planter le premier rendu, sans
 * autre issue que de vider le stockage à la main.
 */
const readIds = (): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * Favoris épinglés : la lib ne persiste rien, la dock est un composant CONTRÔLÉ.
 * Ce hook tient les ids (localStorage), résout les markers connus et mémorise les
 * éléments étrangers (un symbole posé sur la carte, absent de nos données).
 */
export function useFavorites(markers: MarkerData<AnyData>[]): Favorites {
  const [ids, setIds] = useState<string[]>(readIds)
  const [foreign, setForeign] = useState<PinnedItem<MarkerData<AnyData>>[]>([])

  // La persistance SUIT l'état plutôt que d'accompagner chaque geste : les
  // mutations passent toutes par la forme fonctionnelle de `setIds` (deux
  // basculements dans le même cycle de rendu ne peuvent donc pas s'écraser), et il
  // n'y a plus qu'un seul endroit qui écrit dans le stockage.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  }, [ids])

  /**
   * Résolu DANS L'ORDRE de `ids`, en retombant sur ce que le dépôt a livré pour ce
   * que nos données ne connaissent pas. Les concaténer après les markers les
   * collerait en fin de liste, et `onReorder` n'aurait alors aucun effet visible.
   */
  const items = ids
    .map((id): PinnedItem<MarkerData<AnyData>> | undefined => {
      const m = markers.find((x) => String(x.id) === id)
      if (!m) return foreign.find((p) => String(p.id) === id)
      return {
        id: m.id,
        position: m.position,
        type: m.type,
        label: markerLabel(m),
        avatar: m.avatar,
        icon: iconDataUri(m.type),
        data: m,
      }
    })
    .filter((p): p is PinnedItem<MarkerData<AnyData>> => !!p)

  const isPinned = (id: string | number) => ids.includes(String(id))
  const pin = (id: string | number) => setIds((prev) => [...new Set([...prev, String(id)])])
  const unpin = (id: string | number) => setIds((prev) => prev.filter((x) => x !== String(id)))

  const onPin = (payload: DragPayload<unknown>) => {
    pin(payload.id)
    if (markers.some((m) => String(m.id) === String(payload.id))) return
    // La couche symboles embarque son SVG et son libellé dans la donnée — c'est le
    // contrat public `PlacedSymbolShape` : la pastille affiche donc le vrai
    // pictogramme, pas une initiale.
    const m = payload.data as MarkerData<PlacedSymbolShape> | undefined
    const svg = m?.data?.svg
    setForeign((prev) =>
      prev.some((x) => String(x.id) === String(payload.id))
        ? prev
        : [
            ...prev,
            {
              id: payload.id,
              position: m?.position,
              // La pastille prend la couleur de la CATÉGORIE du symbole : le type
              // du marker ('symbol') n'en dirait rien.
              type: m?.data?.category ?? m?.type ?? 'symbol',
              color: m?.data?.color,
              label: m?.data?.label ?? String(payload.id),
              icon: svg ? svgToDataUri(svg) : undefined,
            },
          ],
    )
  }

  return {
    items,
    onPin,
    onUnpin: unpin,
    // Glisser une pastille entre deux autres réordonne les favoris. La dock fournit
    // la liste complète : c'est le seul cas où l'état n'est pas dérivé du précédent.
    onReorder: (next) => setIds(next.map(String)),
    isPinned,
    // Un marker de la carte n'a rien à mémoriser dans `foreign` : il est déjà
    // résolu par `items`, seul son id compte.
    togglePin: (id) => (isPinned(id) ? unpin(id) : pin(id)),
  }
}

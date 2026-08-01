import { useEffect } from 'react'
import { countTags } from '../../core/TagFilter'
import type { TagFilter } from '../../core/TagFilter'
import type { MarkerData } from '../../data/types'

/**
 * Registre du panneau « Couches » (tags), pour une couche de markers : reporte les
 * tags portés par TOUS les points (même masqués par le filtre) et se désinscrit au
 * démontage. Extrait tel quel de `MarkerLayer` — isolé de `useMarkerRegistries` pour
 * garder sa position D'ORIGINE dans l'ordre d'appel des hooks (le tout premier
 * registre câblé, avant `useOverlayLayer`/cull/cluster/points/rendered).
 */
export function useTagRegistry<T>(tagFilter: TagFilter, tagSource: string, allPoints: MarkerData<T>[]): void {
  useEffect(() => {
    tagFilter.report(
      tagSource,
      countTags(allPoints, (p) => p.tags),
    )
  }, [allPoints, tagFilter, tagSource])
  useEffect(() => () => tagFilter.unreport(tagSource), [tagFilter, tagSource])
}

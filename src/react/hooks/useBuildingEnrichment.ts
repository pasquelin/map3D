import { useMemo, useSyncExternalStore } from 'react'
import { useMapContext } from '../context'
import type { EnrichmentState } from '../../core/PluginEnrichment'

export type BuildingEnrichment = {
  loading: boolean
  /** Attrs fusionnés de tous les enrichisseurs actifs et non filtrés. */
  data: Record<string, unknown> | null
  /** Union des provenances (pour afficher/filtrer les sources). */
  tags: string[]
  error: Error | null
  /** Détail par plugin (attrs + tags + état). */
  byPlugin: (id: string) => EnrichmentState
}

/**
 * État d'enrichissement du dernier bâtiment piqué. `useSyncExternalStore` sur
 * `PluginEnrichment.on` : re-render seulement aux transitions loading→data→error (et au
 * changement du filtre « Couches »). À lire dans le composant qu'ouvre `<Map buildingMenu>`.
 */
export function useBuildingEnrichment(): BuildingEnrichment {
  const { engine } = useMapContext()
  const enr = engine.enrichment
  const version = useSyncExternalStore(enr.on, () => enr.version)
  // `merged()` refusionne les attrs de tous les enrichisseurs actifs : le refaire à
  // chaque render du consommateur, alors que le store ne bouge qu'aux transitions
  // loading→data→error, était du travail pur perte — et l'objet neuf invalidait au
  // passage tout `memo` en aval. `version` est la clé d'invalidation, d'où le disable.
  return useMemo(() => {
    const m = enr.merged()
    return { loading: m.loading, data: m.data, tags: m.tags, error: m.error, byPlugin: (id: string) => enr.get(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enr, version])
}

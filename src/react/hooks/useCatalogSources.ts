import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { CatalogSource } from '../../catalog/types'
import { useMapContext } from '../context'

/**
 * Sources de catalogue déclarées, réactives.
 *
 * `useSyncExternalStore` sur le jeton d'instantané du registre : la liste ne se
 * recalcule que lorsqu'une source entre ou sort, jamais parce que l'hôte s'est re-rendu.
 * Le jeton est une RÉFÉRENCE stable entre deux mutations — c'est ce qui permet de le
 * comparer par identité plutôt que de comparer les sources une à une.
 */
export function useCatalogSources(): readonly CatalogSource[] {
  const { engine } = useMapContext()
  const subscribe = useCallback((cb: () => void) => engine.catalog.onItemsChanged(cb), [engine])
  const token = useSyncExternalStore(
    subscribe,
    () => engine.catalog.snapshot(),
    () => engine.catalog.snapshot(),
  )
  // `token` EST la dépendance : il change à chaque mutation du registre, et à elle seule.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => engine.catalog.sources(), [engine, token])
}

/** Une source par son id, ou `undefined` si elle a été retirée entre-temps. */
export function useCatalogSource(id: string | null): CatalogSource | undefined {
  const sources = useCatalogSources()
  return id === null ? undefined : sources.find((s) => s.id === id)
}

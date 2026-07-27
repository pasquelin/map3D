import { useEffect, useRef, useState } from 'react'
import { ViewportController } from '../../data/ViewportController'
import type { DataSource } from '../../data/types'
import { useConfig, useMap } from '../context'

export type UseLiveDataOptions = {
  /** Anti-rebond du chargement (ms). Défaut `data.viewportDebounceMs`. */
  debounce?: number
}

/**
 * Charge une `DataSource` en fonction de la vue (bbox) : le contrôleur débounce,
 * gate par zoom (`source.minZoom`) et annule la requête précédente. Découplé du
 * transport — operator branche ses lazy queries `*ByBounds` dans `source.load`.
 */
export function useLiveData<T>(
  source: DataSource<T> | undefined,
  opts: UseLiveDataOptions = {},
): { data: T[]; loading: boolean } {
  const engine = useMap()
  // Contexte et non `engine.config` : cf. `useConfig`.
  const viewportDebounceMs = useConfig().data.viewportDebounceMs
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const controllerRef = useRef<ViewportController<T> | null>(null)

  useEffect(() => {
    const controller = new ViewportController<T>(
      { debounce: opts.debounce ?? viewportDebounceMs },
      setData,
      setLoading,
    )
    controllerRef.current = controller
    // Amorce avec la vue courante.
    const v = engine.getView()
    controller.push({ bounds: v.bounds, center: v.center, zoom: v.zoom })
    const off = engine.on('viewport', (view) =>
      controller.push({ bounds: view.bounds, center: view.center, zoom: view.zoom }),
    )
    return () => {
      off()
      controller.dispose()
      controllerRef.current = null
    }
  }, [engine, opts.debounce, viewportDebounceMs])

  useEffect(() => {
    controllerRef.current?.setSource(source ?? null)
  }, [source])

  return { data, loading }
}

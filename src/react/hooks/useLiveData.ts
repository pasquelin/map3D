import { useEffect, useRef, useState } from 'react'
import { ViewportController, type ViewportControllerOptions } from '../../data/ViewportController'
import type { DataSource } from '../../data/types'
import { useConfig, useMap } from '../context'

export type UseLiveDataOptions = {
  /** Anti-rebond du chargement (ms). Défaut `data.viewportDebounceMs`. */
  debounce?: number
  /**
   * Échec de `source.load` (hors abandon par une vue plus récente). Sans lui, l'erreur
   * reste dans le contrôleur et l'hôte n'a aucun moyen d'afficher un bandeau.
   */
  onError?: (error: unknown) => void
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
  // La source courante, lue à la (re)construction du contrôleur : celui-ci naît sans
  // source, et l'effet qui la pose ne dépend que de `source`. Sans cette reprise, un
  // contrôleur reconstruit — changement de cadence, `opts.debounce` recalculé — restait
  // muet à jamais (`push` sort tant que `source` est nulle), sans la moindre erreur.
  const sourceRef = useRef(source)
  sourceRef.current = source
  // Latest ref : un handler redéfini à chaque render de l'hôte ne doit pas reconstruire
  // le contrôleur (et relancer un chargement).
  const onErrorRef = useRef(opts.onError)
  onErrorRef.current = opts.onError

  useEffect(() => {
    // ⚠️ TRANSITOIRE : `onError` rejoint `ViewportControllerOptions` par une autre branche
    // (cœur). Objet élargi pour compiler seul ; à la fusion, repasser le littéral.
    const options: ViewportControllerOptions & { onError?: (error: unknown) => void } = {
      debounce: opts.debounce ?? viewportDebounceMs,
      onError: (error) => onErrorRef.current?.(error),
    }
    const controller = new ViewportController<T>(options, setData, setLoading)
    controllerRef.current = controller
    controller.setSource(sourceRef.current ?? null)
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

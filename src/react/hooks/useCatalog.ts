import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { catalogKey, parseCatalogKey, restoreCatalogId } from '../../catalog/selection'
import type { CatalogSettings } from '../../catalog/store'
import type { CatalogItem, CatalogKey, CatalogSource } from '../../catalog/types'
import { boundsOfShapes, type ShapeData } from '../../layers/ShapeLayer'
import type { Bounds } from '../../shared'
import { useConfig, useMapContext } from '../context'
import { useCatalogSources } from './useCatalogSources'

export type CatalogApi = {
  /** Clés affichées (ou en cours de chargement) sur la carte. */
  selection: readonly CatalogKey[]
  isShown: (key: CatalogKey) => boolean
  isPending: (key: CatalogKey) => boolean
  hasError: (key: CatalogKey) => boolean
  /** Affiche l'élément s'il ne l'est pas, le retire sinon. */
  toggle: (source: CatalogSource, item: CatalogItem) => void
  /** Cadre la caméra sur l'élément, sans l'afficher. */
  target: (source: CatalogSource, item: CatalogItem) => void
  clear: () => void
  /** Formes à passer à `<ShapeLayer>`. */
  shapes: readonly ShapeData[]
}

/** S'abonne à l'état partagé du catalogue (`engine.catalogState`). */
function useCatalogState(): void {
  const { engine } = useMapContext()
  const subscribe = useCallback((cb: () => void) => engine.catalogState.onChanged(cb), [engine])
  useSyncExternalStore(
    subscribe,
    () => engine.catalogState.snapshot(),
    () => engine.catalogState.snapshot(),
  )
}

/**
 * Ce qui est affiché depuis le catalogue, et les gestes qui le changent.
 *
 * L'état vit dans `engine.catalogState` ; ce hook n'en est qu'une façade réactive.
 * `<ShapeLayer>` fait tout le reste — drapage sur le relief, extrusion, thème, et
 * l'inscription à la recherche qui rend cherchable ce qu'on vient d'afficher.
 */
export function useCatalog(): CatalogApi {
  const { engine, theme } = useMapContext()
  const config = useConfig()
  const sources = useCatalogSources()
  const store = engine.catalogState

  useCatalogState()

  // Clés de stockage : connues de la config, que le moteur n'a pas. Idempotent.
  useEffect(() => {
    store.configure({
      selection: config.data.storageKeys.catalog,
      settings: config.data.storageKeys.catalogSettings,
    })
  }, [store, config.data.storageKeys.catalog, config.data.storageKeys.catalogSettings])

  // Un chargement par clé, annulable — retirer un élément pendant sa requête doit
  // couper le réseau, pas attendre qu'il revienne pour le jeter.
  const abortsRef = useRef(new Map<CatalogKey, AbortController>())

  useEffect(() => {
    const aborts = abortsRef.current
    return () => {
      for (const c of aborts.values()) c.abort()
      aborts.clear()
    }
  }, [])

  const fit = useCallback(
    (bounds: Bounds) => {
      // La barre de contrôles est à droite par défaut : on réserve la largeur du
      // panneau de ce côté, sinon la zone cadrée atterrit sous la liste ouverte.
      engine.camera.fitBounds(bounds, {
        padding: { left: 40, top: 40, bottom: 40, right: theme.sizing.catalogPanelW + 40 },
      })
    },
    [engine, theme.sizing.catalogPanelW],
  )

  const load = useCallback(
    async (source: CatalogSource, item: CatalogItem, key: CatalogKey, withFit: boolean) => {
      const ctrl = new AbortController()
      abortsRef.current.get(key)?.abort()
      abortsRef.current.set(key, ctrl)
      try {
        const shapes = await source.geometry(item.id, ctrl.signal)
        // Retiré pendant le chargement : ce n'est pas un échec, c'est un abandon.
        if (ctrl.signal.aborted || !store.isShown(key)) return
        // Une forme sans nom est invisible pour la recherche (cf. ZONES.md § 5) : on lui
        // prête celui de son élément de catalogue, qui est précisément ce qu'on a cliqué.
        const named = shapes.map((s) => (s.title ? s : { ...s, title: item.title }))
        store.setGeometry(key, named)
        engine.invalidate()
        if (!withFit) return
        const b = boundsOfShapes(named)
        if (b) fit(b)
      } catch {
        if (ctrl.signal.aborted) return
        store.remove(key, true)
        engine.invalidate()
      } finally {
        if (abortsRef.current.get(key) === ctrl) abortsRef.current.delete(key)
      }
    },
    [engine, fit, store],
  )

  const toggle = useCallback(
    (source: CatalogSource, item: CatalogItem) => {
      const key = catalogKey(source.id, item.id)
      if (store.isShown(key)) {
        abortsRef.current.get(key)?.abort()
        store.remove(key)
        engine.invalidate()
        return
      }
      store.markSelected(key)
      void load(source, item, key, store.getSettings().fitOnAdd)
    },
    [engine, load, store],
  )

  const target = useCallback(
    (source: CatalogSource, item: CatalogItem) => {
      // Emprise connue : aucun aller-retour réseau pour un simple cadrage.
      if (item.bounds) {
        fit(item.bounds)
        return
      }
      const ctrl = new AbortController()
      void source
        .geometry(item.id, ctrl.signal)
        .then((shapes) => {
          const b = boundsOfShapes(shapes)
          if (b) fit(b)
        })
        .catch(() => {
          // Cadrage impossible : la caméra reste où elle est. Rien à signaler — aucune
          // promesse n'a été faite à l'écran, contrairement à un ajout.
        })
    },
    [fit],
  )

  const clear = useCallback(() => {
    for (const c of abortsRef.current.values()) c.abort()
    abortsRef.current.clear()
    store.clear()
    engine.invalidate()
  }, [engine, store])

  // Une source démontée emporte ce qu'elle avait mis sur la carte : garder ses formes
  // laisserait des zones que plus aucun panneau ne sait retirer.
  useEffect(() => {
    store.purge(new Set(sources.map((s) => s.id)))
    engine.invalidate()
  }, [engine, sources, store])

  // Clés déjà traitées à la restauration — une clé dont la source n'est pas encore
  // inscrite n'y entre PAS, pour être retentée quand le plugin qui la porte arrivera.
  const restoredRef = useRef(new Set<CatalogKey>())

  /**
   * Recharge ce que la session précédente affichait.
   *
   * Seules les CLÉS ont été persistées : la géométrie est la réponse d'une API à un
   * instant donné, et la resservir depuis un stockage local ferait afficher un périmètre
   * que le backend a peut-être déplacé depuis. On la redemande donc, sans cadrer (on
   * restaure une vue, on ne la vole pas) et sans signaler d'échec — une zone supprimée
   * côté API n'a pas à ouvrir une erreur au démarrage.
   */
  useEffect(() => {
    for (const key of store.selection()) {
      if (restoredRef.current.has(key) || store.hasGeometry(key)) continue
      const parsed = parseCatalogKey(key)
      if (!parsed) continue
      const source = sources.find((s) => s.id === parsed.sourceId)
      if (!source) continue
      restoredRef.current.add(key)
      const ctrl = new AbortController()
      abortsRef.current.set(key, ctrl)
      void source
        .geometry(restoreCatalogId(parsed.itemId), ctrl.signal)
        .then((shapes) => {
          if (ctrl.signal.aborted || !store.isShown(key)) return
          store.setGeometry(key, shapes)
          engine.invalidate()
        })
        .catch(() => {
          if (ctrl.signal.aborted) return
          store.remove(key)
          engine.invalidate()
        })
        .finally(() => {
          if (abortsRef.current.get(key) === ctrl) abortsRef.current.delete(key)
        })
    }
    // `store.snapshot()` : la sélection restaurée n'arrive qu'après `configure`, donc
    // après le premier rendu — sans cette dépendance, la restauration n'aurait jamais lieu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, sources, store, store.snapshot()])

  return useMemo(
    () => ({
      selection: store.selection(),
      isShown: (k: CatalogKey) => store.isShown(k),
      isPending: (k: CatalogKey) => store.isPending(k),
      hasError: (k: CatalogKey) => store.hasError(k),
      toggle,
      target,
      clear,
      shapes: store.shapes(),
    }),
    // `store.snapshot()` est la dépendance réelle : le store mute en place, et
    // `useCatalogState` a déjà provoqué le re-render au bon moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, store.snapshot(), toggle, target, clear],
  )
}

export type CatalogSettingsApi = CatalogSettings & {
  setPersist: (v: boolean) => void
  setFitOnAdd: (v: boolean) => void
}

/** Réglages du catalogue — partagés avec `useCatalog`, donc jamais désynchronisés. */
export function useCatalogSettings(): CatalogSettingsApi {
  const { engine } = useMapContext()
  const store = engine.catalogState

  useCatalogState()

  const setPersist = useCallback((v: boolean) => store.setSettings({ persist: v }), [store])
  const setFitOnAdd = useCallback((v: boolean) => store.setSettings({ fitOnAdd: v }), [store])

  const settings = store.getSettings()
  return useMemo(
    () => ({ ...settings, setPersist, setFitOnAdd }),
    [settings, setPersist, setFitOnAdd],
  )
}

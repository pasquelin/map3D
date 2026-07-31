import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
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
  /**
   * Affiche l'élément s'il ne l'est pas, le retire sinon.
   *
   * `fit: true` force le cadrage dans les DEUX sens — c'est le geste du clic sur le
   * nom, qui bascule et emmène la caméra du même mouvement. Sans lui, le cadrage suit
   * seulement le réglage « cadrer à l'ajout ».
   */
  toggle: (source: CatalogSource, item: CatalogItem, opts?: { fit?: boolean }) => void
  /**
   * Affiche ou retire un LOT d'un coup — les enfants d'un agrégat qu'on coche.
   *
   * Le cadrage porte sur l'UNION de ce qui a été chargé, et n'a lieu qu'une fois tout
   * arrivé : cadrer élément par élément ferait voler la caméra trois fois pour un seul
   * geste, en s'arrêtant sur le dernier arrivé plutôt que sur l'ensemble.
   */
  setMany: (source: CatalogSource, items: readonly CatalogItem[], shown: boolean, opts?: { fit?: boolean }) => void
  /** Cadre la caméra sur l'élément, sans toucher à son affichage. */
  target: (source: CatalogSource, item: CatalogItem) => void
  clear: () => void
  /** Formes à passer à `<ShapeLayer>`. */
  shapes: readonly ShapeData[]
}

/** S'abonne à l'état partagé du catalogue (`engine.catalogState`). */
function useCatalogStore() {
  const { engine } = useMapContext()
  const store = engine.catalogState
  const subscribe = useCallback((cb: () => void) => store.onChanged(cb), [store])
  const token = useSyncExternalStore(
    subscribe,
    () => store.snapshot(),
    () => store.snapshot(),
  )
  return { store, token }
}

/**
 * Ce qui est affiché depuis le catalogue, et les gestes qui le changent.
 *
 * **Sans aucun effet de montage** : ce hook a plusieurs consommateurs simultanés (le
 * panneau, chaque ligne, la surface d'affichage). Les effets qui doivent n'avoir lieu
 * QU'UNE FOIS — configuration du stockage, purge, restauration — vivent dans
 * `useCatalogHost`, que seule `<CatalogSurface>` appelle. Les avoir laissés ici aurait
 * déclenché autant de restaurations concurrentes que de composants montés.
 */
export function useCatalog(): CatalogApi {
  const { engine, theme } = useMapContext()
  const { store, token } = useCatalogStore()

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

  /** Affiche un élément et rend ses formes — `null` si abandonné ou en échec. */
  const show = useCallback(
    (source: CatalogSource, item: CatalogItem): Promise<readonly ShapeData[] | null> => {
      const key = catalogKey(source.id, item.id)
      if (store.isShown(key)) return Promise.resolve(store.getGeometry(key) ?? null)
      store.markSelected(key)
      const ctrl = store.beginLoad(key)
      return source
        .geometry(item.id, ctrl.signal)
        .then((shapes) => {
          // Retiré pendant le chargement : ce n'est pas un échec, c'est un abandon.
          if (ctrl.signal.aborted || !store.isShown(key)) return null
          // Une forme sans nom est invisible pour la recherche (cf. ZONES.md § 5) : on
          // lui prête celui de son élément, qui est précisément ce qu'on a cliqué.
          const named = shapes.map((s) => (s.title ? s : { ...s, title: item.title }))
          store.setGeometry(key, named)
          engine.invalidate()
          return named as readonly ShapeData[]
        })
        .catch(() => {
          if (!ctrl.signal.aborted) {
            store.remove(key, true)
            engine.invalidate()
          }
          return null
        })
        .finally(() => store.endLoad(key, ctrl))
    },
    [engine, store],
  )

  const hide = useCallback(
    (source: CatalogSource, item: CatalogItem) => {
      const key = catalogKey(source.id, item.id)
      store.abortLoad(key)
      store.remove(key)
      engine.invalidate()
    },
    [engine, store],
  )

  const toggle = useCallback(
    (source: CatalogSource, item: CatalogItem, opts?: { fit?: boolean }) => {
      const key = catalogKey(source.id, item.id)
      const forceFit = opts?.fit === true
      if (store.isShown(key)) {
        // Cadrer AVANT de retirer : après, la géométrie a quitté la mémoire et il ne
        // resterait plus rien à viser.
        if (forceFit) {
          const b = item.bounds ?? boundsOfShapes(store.getGeometry(key) ?? [])
          if (b) fit(b)
        }
        hide(source, item)
        return
      }
      const withFit = forceFit || store.getSettings().fitOnAdd
      void show(source, item).then((shapes) => {
        if (!withFit || !shapes) return
        const b = boundsOfShapes(shapes)
        if (b) fit(b)
      })
    },
    [fit, hide, show, store],
  )

  const setMany = useCallback(
    (source: CatalogSource, items: readonly CatalogItem[], shown: boolean, opts?: { fit?: boolean }) => {
      if (!shown) {
        for (const item of items) hide(source, item)
        return
      }
      const withFit = opts?.fit === true || store.getSettings().fitOnAdd
      void Promise.all(items.map((item) => show(source, item))).then((all) => {
        if (!withFit) return
        const b = boundsOfShapes(all.flatMap((s) => s ?? []))
        if (b) fit(b)
      })
    },
    [fit, hide, show, store],
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
    store.abortAll()
    store.clear()
    engine.invalidate()
  }, [engine, store])

  return useMemo(
    () => ({
      selection: store.selection(),
      isShown: (k: CatalogKey) => store.isShown(k),
      isPending: (k: CatalogKey) => store.isPending(k),
      hasError: (k: CatalogKey) => store.hasError(k),
      toggle,
      setMany,
      target,
      clear,
      shapes: store.shapes(),
    }),
    // `token` est la dépendance réelle : le store mute en place, donc aucune de ses
    // lectures ne peut servir de dépendance — c'est le jeton qui dit « ça a changé ».
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, token, toggle, setMany, target, clear],
  )
}

/**
 * Effets à instance UNIQUE du catalogue : configuration du stockage, purge des sources
 * disparues, restauration de la session précédente. Appelé par `<CatalogSurface>`, que
 * `<Map>` monte une seule fois.
 */
export function useCatalogHost(): readonly ShapeData[] {
  const { engine } = useMapContext()
  const config = useConfig()
  const sources = useCatalogSources()
  const { store, token } = useCatalogStore()

  // Clés de stockage : connues de la config, que le moteur n'a pas. Idempotent.
  useEffect(() => {
    store.configure({
      selection: config.data.storageKeys.catalog,
      settings: config.data.storageKeys.catalogSettings,
    })
  }, [store, config.data.storageKeys.catalog, config.data.storageKeys.catalogSettings])

  // Une source démontée emporte ce qu'elle avait mis sur la carte : garder ses formes
  // laisserait des zones que plus aucun panneau ne sait retirer.
  useEffect(() => {
    store.purge(new Set(sources.map((s) => s.id)))
    engine.invalidate()
  }, [engine, sources, store])

  /**
   * Recharge ce que la session précédente affichait.
   *
   * Seules les CLÉS ont été persistées : une géométrie est la réponse d'une API à un
   * instant donné, et la resservir depuis un stockage local ferait afficher un périmètre
   * que le backend a peut-être déplacé depuis. On la redemande donc, sans cadrer (on
   * restaure une vue, on ne la vole pas) et sans signaler d'échec — une zone supprimée
   * côté API n'a pas à ouvrir une erreur au démarrage.
   */
  useEffect(() => {
    // `pendingRestores()` et NON `selection()` : seules les clés venues du stockage sont
    // à recharger ici. Une clé qu'on vient de cocher a le même profil (sélectionnée,
    // sans géométrie) mais son chargement est déjà en vol, avec le cadrage qui va avec.
    for (const key of store.pendingRestores()) {
      if (store.hasGeometry(key)) continue
      const parsed = parseCatalogKey(key)
      if (!parsed) continue
      // Source pas encore inscrite : on RESSORT sans réclamer la clé, pour retenter
      // quand le plugin qui la porte arrivera.
      const source = sources.find((s) => s.id === parsed.sourceId)
      if (!source) continue
      store.claimRestore(key)
      const ctrl = store.beginLoad(key)
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
        .finally(() => store.endLoad(key, ctrl))
    }
    // `token` : la sélection restaurée n'arrive qu'après `configure`, donc après le
    // premier rendu — sans cette dépendance, la restauration n'aurait jamais lieu.
  }, [engine, sources, store, token])

  // Carte démontée : couper tout ce qui est en vol.
  useEffect(() => () => store.abortAll(), [store])

  return store.shapes()
}

export type CatalogSettingsApi = CatalogSettings & {
  setPersist: (v: boolean) => void
  setFitOnAdd: (v: boolean) => void
}

/** Réglages du catalogue — partagés avec `useCatalog`, donc jamais désynchronisés. */
export function useCatalogSettings(): CatalogSettingsApi {
  const { store, token } = useCatalogStore()

  const setPersist = useCallback((v: boolean) => store.setSettings({ persist: v }), [store])
  const setFitOnAdd = useCallback((v: boolean) => store.setSettings({ fitOnAdd: v }), [store])

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `token` : cf. `useCatalog`
  return useMemo(() => ({ ...store.getSettings(), setPersist, setFitOnAdd }), [store, token, setPersist, setFitOnAdd])
}

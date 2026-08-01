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
  setMany: (source: CatalogSource, items: readonly CatalogItem[], shown: boolean) => void
  clear: () => void
  /** Formes à passer à `<ShapeLayer>`. */
  shapes: readonly ShapeData[]
}

/**
 * Issue d'un chargement de géométrie, avant qu'elle ne soit posée.
 *
 * Trois cas et non deux : `shapes: null, failed: false` est l'ABANDON (retiré pendant
 * son chargement, source changée), qui ne doit ni poser de formes ni allumer de pastille
 * d'erreur. Les confondre faisait clignoter une erreur sur un élément qu'on venait de
 * décocher soi-même.
 */
type LoadOutcome = {
  key: CatalogKey
  shapes: readonly ShapeData[] | null
  failed: boolean
}

/** S'abonne à l'état partagé du catalogue (`engine.catalogState`). */
function useCatalogStore() {
  const { engine } = useMapContext()
  const store = engine.catalogState
  // Champ fléché, comme les registres du socle : pas de wrapper.
  const token = useSyncExternalStore(
    store.onChanged,
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
export function useCatalog(side: 'left' | 'right' = 'right'): CatalogApi {
  const { engine, theme } = useMapContext()
  const config = useConfig()
  const { store, token } = useCatalogStore()

  const fit = useCallback(
    (bounds: Bounds) => {
      // On réserve la largeur du panneau DU CÔTÉ où il s'ouvre : codée à droite, la
      // marge poussait l'élément SOUS le panneau quand la barre est à gauche — et
      // `fitOnAdd` étant actif par défaut, c'était le chemin nominal.
      //
      // Les DEUX surfaces comptent : le cadrage part de la liste, donc au moment précis
      // où le menu des types et la liste sont accolés. N'en réserver qu'une faisait
      // atterrir la zone sous la seconde — le même bug, sur l'autre axe.
      const margin = config.data.search.fitPadding
      const reserved = theme.sizing.catalogPanelW + theme.sizing.catalogSubPanelW + margin
      engine.camera.fitBounds(bounds, {
        padding: {
          top: margin,
          bottom: margin,
          left: side === 'left' ? reserved : margin,
          right: side === 'right' ? reserved : margin,
        },
      })
    },
    [engine, theme.sizing.catalogPanelW, theme.sizing.catalogSubPanelW, config.data.search.fitPadding, side],
  )

  /**
   * Charge la géométrie d'une clé DÉJÀ entrée dans la sélection, sans rien poser.
   *
   * Séparé de la pose pour que l'appelant décide du grain : un élément seul l'applique
   * tout de suite, un lot attend d'avoir tout et n'écrit qu'une fois — chaque écriture
   * reconstruit sinon la couche 3D entière.
   */
  const fetchGeometry = useCallback(
    (source: CatalogSource, item: CatalogItem, key: CatalogKey): Promise<LoadOutcome> => {
      const ctrl = store.beginLoad(key)
      return source
        .geometry(item.id, ctrl.signal)
        .then((shapes) => {
          // Retiré pendant le chargement : ce n'est pas un échec, c'est un abandon.
          if (ctrl.signal.aborted || !store.isShown(key)) return { key, shapes: null, failed: false }
          // Une forme sans nom est invisible pour la recherche (cf. ZONES.md § 5) : on
          // lui prête celui de son élément, qui est précisément ce qu'on a cliqué.
          const named = shapes.map((s) => (s.title ? s : { ...s, title: item.title }))
          return { key, shapes: named as readonly ShapeData[], failed: false }
        })
        .catch(() => ({ key, shapes: null, failed: !ctrl.signal.aborted }))
        .finally(() => store.endLoad(key, ctrl))
    },
    [store],
  )

  /**
   * Pose un lot de résultats en UNE passe : une reconstruction des formes, une écriture
   * du stockage, une notification, une frame. Rend les formes réellement posées.
   */
  const applyOutcomes = useCallback(
    (outcomes: readonly LoadOutcome[]): readonly ShapeData[] => {
      const loaded: (readonly [CatalogKey, readonly ShapeData[]])[] = []
      const failed: CatalogKey[] = []
      for (const o of outcomes) {
        if (o.shapes !== null) loaded.push([o.key, o.shapes])
        else if (o.failed) failed.push(o.key)
      }
      if (loaded.length > 0) store.setGeometryMany(loaded)
      if (failed.length > 0) store.removeMany(failed, true)
      if (loaded.length > 0 || failed.length > 0) engine.invalidate()
      return loaded.flatMap(([, shapes]) => shapes)
    },
    [engine, store],
  )

  /** Affiche un élément et rend ses formes — `null` si abandonné ou en échec. */
  const show = useCallback(
    (source: CatalogSource, item: CatalogItem): Promise<readonly ShapeData[] | null> => {
      const key = catalogKey(source.id, item.id)
      if (store.isShown(key)) return Promise.resolve(store.getGeometry(key) ?? null)
      store.markSelected(key)
      return fetchGeometry(source, item, key).then((o) => {
        applyOutcomes([o])
        return o.shapes
      })
    },
    [applyOutcomes, fetchGeometry, store],
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
    (source: CatalogSource, items: readonly CatalogItem[], shown: boolean) => {
      if (!shown) {
        // Un seul retrait pour tout le lot : en boucle, chaque `hide` reconstruisait
        // toutes les formes, réécrivait le stockage et relançait un rendu.
        store.removeMany(items.map((item) => catalogKey(source.id, item.id)))
        engine.invalidate()
        return
      }
      const withFit = store.getSettings().fitOnAdd
      // Une SEULE entrée en sélection pour tout le lot : en boucle sur `markSelected`,
      // chaque enfant recopiait la sélection entière et réécrivait le stockage —
      // `localStorage.setItem` étant synchrone, cocher un agrégat gelait le thread
      // principal autant de fois qu'il comptait d'enfants.
      const pairs = items.map((item) => ({ item, key: catalogKey(source.id, item.id) }))
      const added = new Set(store.markSelectedMany(pairs.map((p) => p.key)))
      engine.invalidate()
      void Promise.all(
        pairs.map((p) =>
          added.has(p.key)
            ? fetchGeometry(source, p.item, p.key)
            : // Déjà affiché : sa géométrie compte pour le cadrage, sans la redemander.
              Promise.resolve<LoadOutcome>({ key: p.key, shapes: store.getGeometry(p.key) ?? null, failed: false }),
        ),
      ).then((outcomes) => {
        const shapes = applyOutcomes(outcomes)
        if (!withFit) return
        const b = boundsOfShapes(shapes)
        if (b) fit(b)
      })
    },
    [applyOutcomes, engine, fetchGeometry, fit, store],
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
      clear,
      shapes: store.shapes(),
    }),
    // `token` est la dépendance réelle : le store mute en place, donc aucune de ses
    // lectures ne peut servir de dépendance — c'est le jeton qui dit « ça a changé ».
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, token, toggle, setMany, clear],
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
      persistDebounceMs: config.catalog.persistDebounceMs,
    })
  }, [
    store,
    config.data.storageKeys.catalog,
    config.data.storageKeys.catalogSettings,
    config.catalog.persistDebounceMs,
  ])

  // L'écriture de la sélection est amortie : elle doit partir avant que la page ne
  // disparaisse, sinon fermer l'onglet juste après avoir coché perdrait le geste.
  // `pagehide` et non `beforeunload` : le second empêche la mise en cache de la page et
  // ne se déclenche pas du tout sur mobile.
  useEffect(() => {
    const flush = () => store.flushPersist()
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [store])

  /** Sources par id — l'effet de restauration en cherche une PAR clé à restaurer. */
  const sourcesById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources])

  // Une source démontée emporte ce qu'elle avait mis sur la carte : garder ses formes
  // laisserait des zones que plus aucun panneau ne sait retirer.
  useEffect(() => {
    // Repeindre SEULEMENT si quelque chose est parti : sous `renderOnDemand`, invalider
    // sans condition rendait une frame à chaque plugin qui s'inscrit sans rien retirer.
    if (store.purge(new Set(sourcesById.keys()))) engine.invalidate()
  }, [engine, sourcesById, store])

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
    // Sortie avant toute allocation : cet effet est rejoué à CHAQUE mutation du store
    // (il dépend du jeton), donc à chaque géométrie qui arrive. Sans cette garde, chaque
    // arrivée payait une copie de la liste à restaurer pour ne rien faire.
    if (!store.hasPendingRestores()) return
    // `pendingRestores()` et NON `selection()` : seules les clés venues du stockage sont
    // à recharger ici. Une clé qu'on vient de cocher a le même profil (sélectionnée,
    // sans géométrie) mais son chargement est déjà en vol, avec le cadrage qui va avec.
    const jobs: Promise<{ key: CatalogKey; shapes: readonly ShapeData[] | null }>[] = []
    for (const key of store.pendingRestores()) {
      if (store.hasGeometry(key)) continue
      const parsed = parseCatalogKey(key)
      if (!parsed) continue
      // Source pas encore inscrite : on RESSORT sans réclamer la clé, pour retenter
      // quand le plugin qui la porte arrivera.
      const source = sourcesById.get(parsed.sourceId)
      if (!source) continue
      store.claimRestore(key)
      const ctrl = store.beginLoad(key)
      jobs.push(
        source
          .geometry(restoreCatalogId(parsed.itemId), ctrl.signal)
          .then((shapes) => ({
            key,
            shapes: ctrl.signal.aborted || !store.isShown(key) ? null : (shapes as readonly ShapeData[]),
          }))
          // Échec silencieux, volontairement : une zone supprimée côté API n'a pas à
          // ouvrir une erreur au démarrage. On la retire, sans pastille.
          .catch(() => ({ key, shapes: null }))
          .finally(() => store.endLoad(key, ctrl)),
      )
    }
    if (jobs.length === 0) return
    // Une seule pose pour toute la session restaurée : élément par élément, chaque
    // arrivée reconstruisait TOUTES les formes puis toute la couche 3D — O(N²) au
    // démarrage, là où une passe suffit.
    void Promise.all(jobs).then((results) => {
      const loaded: (readonly [CatalogKey, readonly ShapeData[]])[] = []
      const gone: CatalogKey[] = []
      for (const r of results) {
        if (r.shapes !== null) loaded.push([r.key, r.shapes])
        else if (store.isShown(r.key) && !store.hasGeometry(r.key)) gone.push(r.key)
      }
      if (loaded.length > 0) store.setGeometryMany(loaded)
      if (gone.length > 0) store.removeMany(gone)
      if (loaded.length > 0 || gone.length > 0) engine.invalidate()
    })
    // `token` : la sélection restaurée n'arrive qu'après `configure`, donc après le
    // premier rendu — sans cette dépendance, la restauration n'aurait jamais lieu.
  }, [engine, sourcesById, store, token])

  // Carte démontée : couper tout ce qui est en vol.
  useEffect(() => () => store.abortAll(), [store])

  return store.shapes()
}

/**
 * Nombre d'éléments affichés — le badge du bouton de barre, et rien d'autre.
 *
 * L'instantané est le COMPTE lui-même, pas le jeton du store : React court-circuite
 * alors le rendu tant qu'il ne bouge pas. Avec `useCatalog`, le contrôle se re-rendait
 * à chaque mutation — donc à chaque géométrie qui arrive — pour afficher le même chiffre.
 */
export function useCatalogSelectionCount(): number {
  const { engine } = useMapContext()
  const store = engine.catalogState
  return useSyncExternalStore(
    store.onChanged,
    () => store.selection().length,
    () => store.selection().length,
  )
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

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { unionBounds } from '../../core/bounds'
import { boundsOfMarkers, type MarkerData } from '../../data/types'
import { catalogKey, parseCatalogKey, restoreCatalogId } from '../../catalog/selection'
import { NO_MARKERS, type CatalogContent, type CatalogSettings } from '../../catalog/store'
import {
  isToggleSource,
  type CatalogBrowseSource,
  type CatalogId,
  type CatalogItem,
  type CatalogKey,
  type CatalogToggleSource,
} from '../../catalog/types'
import { boundsOfShapes, type ShapeData } from '../../layers/ShapeLayer'
import type { Bounds } from '../../shared'
import type { MapEngine } from '../../core/MapEngine'
import type { CatalogStore } from '../../catalog/store'
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
  toggle: (source: CatalogBrowseSource, item: CatalogItem, opts?: { fit?: boolean }) => void
  /**
   * Affiche ou retire un LOT d'un coup — les enfants d'un agrégat qu'on coche.
   *
   * Le cadrage porte sur l'UNION de ce qui a été chargé, et n'a lieu qu'une fois tout
   * arrivé : cadrer élément par élément ferait voler la caméra trois fois pour un seul
   * geste, en s'arrêtant sur le dernier arrivé plutôt que sur l'ensemble.
   */
  setMany: (source: CatalogBrowseSource, items: readonly CatalogItem[], shown: boolean) => void
  /**
   * Cadre la caméra sur un élément **sans le poser** ni l'inscrire en sélection.
   *
   * Le geste des sources `checkable: false`, dont l'hôte peint déjà les éléments : il n'y a
   * rien à afficher, seulement à retrouver. L'emprise vient de `item.bounds` s'il est
   * annoncé — aucune requête alors —, sinon de la géométrie, chargée le temps de la
   * calculer puis jetée.
   */
  focus: (source: CatalogBrowseSource, item: CatalogItem) => void
  clear: () => void
  /** Formes à passer à `<ShapeLayer>`. */
  shapes: readonly ShapeData[]
  /** Points posés par les éléments affichés (cf. `CatalogBrowseSource.markers`). */
  markers: readonly MarkerData[]

  // ── Sources à bascule ──

  /**
   * Allume ou éteint un jeu — **sans cadrage, jamais**.
   *
   * Cadrer n'aurait pas de sens sur un jeu piloté par la vue : c'est la vue qui décide du
   * contenu, l'y asservir reviendrait à faire décider au contenu de la vue qui le
   * détermine. La caméra n'est d'ailleurs pas atteignable d'ici.
   *
   * Pour LIRE l'état d'un jeu (allumé, en chargement), c'est `useCatalogToggle(id)` :
   * il s'abonne aux deux booléens de CE jeu, là où l'API entière re-rendrait l'appelant à
   * chaque mutation du catalogue.
   */
  toggleSource: (id: string, on?: boolean) => void
}

/**
 * Issue d'un chargement, avant que son contenu ne soit posé.
 *
 * Trois cas et non deux : `content: null, failed: false` est l'ABANDON (retiré pendant
 * son chargement, source changée), qui ne doit ni poser de formes ni allumer de pastille
 * d'erreur. Les confondre faisait clignoter une erreur sur un élément qu'on venait de
 * décocher soi-même.
 */
type LoadOutcome = {
  key: CatalogKey
  content: CatalogContent | null
  failed: boolean
}

/**
 * Prête un titre de repli à ce qui est ANONYME : une forme ou un point sans nom est
 * invisible pour la recherche (cf. ZONES.md § 5), on lui donne celui de son élément de
 * catalogue. `undefined` (aucun titre connu) rend la liste inchangée.
 *
 * Générique sur `{ title? }` plutôt qu'une fonction par type : la règle est la même des
 * deux côtés, et deux copies auraient divergé au premier ajustement.
 */
function withFallbackTitle<T extends { title?: string }>(items: readonly T[], title: string | undefined): readonly T[] {
  if (title === undefined) return items
  return items.map((it) => (it.title ? it : { ...it, title }))
}

/**
 * Demande à une source TOUT ce qu'un élément pose — formes et points, de front sur le même
 * signal : un élément qui porte les deux les affiche d'un bloc, là où un enchaînement
 * séquentiel aurait fait apparaître les seconds après les premières sur un geste unique.
 *
 * Hors des hooks parce que les DEUX chemins l'appellent (la pose et la restauration), avec
 * pour seule différence la provenance du titre de repli.
 */
function loadContent(
  source: CatalogBrowseSource,
  id: CatalogId,
  title: string | undefined,
  signal: AbortSignal,
): Promise<CatalogContent> {
  // `Promise.all` accepte une valeur nue : pas de promesse allouée pour une source sans points.
  return Promise.all([source.geometry(id, signal), source.markers?.(id, signal) ?? NO_MARKERS]).then(
    ([shapes, markers]) => ({
      shapes: withFallbackTitle(shapes, title),
      markers: withFallbackTitle(markers, title),
    }),
  )
}

/**
 * Allume ou éteint un jeu. Aucun réseau ici : la couche montée par `<CatalogSurface>`
 * charge d'elle-même au premier cadre, et se démonte en emportant sa requête en vol.
 *
 * Au niveau module : les deux portes d'entrée (`useCatalog().toggleSource` pour piloter un
 * jeu qu'on nomme, `useCatalogToggle` pour une ligne d'interface) faisaient le même geste
 * chacune de son côté.
 */
function flipSource(engine: MapEngine, store: CatalogStore, id: string, on?: boolean): void {
  store.setSourceOn(id, on ?? !store.isSourceOn(id))
  engine.invalidate()
}

/** Cadre de ce qu'un élément a posé — formes ET points : un élément peut n'avoir que des points. */
const boundsOfContent = (content: CatalogContent): Bounds | null =>
  unionBounds([boundsOfShapes(content.shapes), boundsOfMarkers(content.markers)])

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
  const fetchContent = useCallback(
    (source: CatalogBrowseSource, item: CatalogItem, key: CatalogKey): Promise<LoadOutcome> => {
      const ctrl = store.beginLoad(key)
      // Le titre de repli est celui de l'élément cliqué, toujours défini ici.
      return loadContent(source, item.id, item.title, ctrl.signal)
        .then((content): LoadOutcome => {
          // Retiré pendant le chargement : ce n'est pas un échec, c'est un abandon.
          if (ctrl.signal.aborted || !store.isShown(key)) return { key, content: null, failed: false }
          return { key, content, failed: false }
        })
        .catch((): LoadOutcome => ({ key, content: null, failed: !ctrl.signal.aborted }))
        .finally(() => store.endLoad(key, ctrl))
    },
    [store],
  )

  /**
   * Pose un lot de résultats en UNE passe — une reconstruction des formes, une écriture du
   * stockage, une notification, une frame — et rend le CADRE de ce qui a été posé.
   *
   * Le cadre et non le contenu : c'est la seule chose que les appelants en fassent, et
   * rendre le contenu aplati allouait deux tableaux complets (formes et points de tout le
   * lot) que le chemin nominal jetait aussitôt.
   */
  const applyOutcomes = useCallback(
    (outcomes: readonly LoadOutcome[]): Bounds | null => {
      const loaded: (readonly [CatalogKey, CatalogContent])[] = []
      const failed: CatalogKey[] = []
      for (const o of outcomes) {
        if (o.content !== null) loaded.push([o.key, o.content])
        else if (o.failed) failed.push(o.key)
      }
      if (loaded.length > 0) store.setContentMany(loaded)
      if (failed.length > 0) store.removeMany(failed, true)
      if (loaded.length > 0 || failed.length > 0) engine.invalidate()
      return unionBounds(loaded.map(([, c]) => boundsOfContent(c)))
    },
    [engine, store],
  )

  /** Affiche un élément et rend le CADRE de ce qu'il a posé — `null` si abandonné ou en échec. */
  const show = useCallback(
    (source: CatalogBrowseSource, item: CatalogItem): Promise<Bounds | null> => {
      const key = catalogKey(source.id, item.id)
      const already = store.getContent(key)
      if (store.isShown(key)) return Promise.resolve(already && boundsOfContent(already))
      // Le titre est retenu dès la sélection : c'est lui qui rendra la forme anonyme
      // cherchable après une restauration, où l'élément cliqué n'est plus en portée.
      store.markSelected(key, item.title)
      return fetchContent(source, item, key).then((o) => applyOutcomes([o]))
    },
    [applyOutcomes, fetchContent, store],
  )

  const hide = useCallback(
    (source: CatalogBrowseSource, item: CatalogItem) => {
      const key = catalogKey(source.id, item.id)
      store.abortLoad(key)
      store.remove(key)
      engine.invalidate()
    },
    [engine, store],
  )

  const toggle = useCallback(
    (source: CatalogBrowseSource, item: CatalogItem, opts?: { fit?: boolean }) => {
      const key = catalogKey(source.id, item.id)
      const forceFit = opts?.fit === true
      if (store.isShown(key)) {
        // Cadrer AVANT de retirer : après, le contenu a quitté la mémoire et il ne
        // resterait plus rien à viser.
        if (forceFit) {
          const shown = store.getContent(key)
          const b = item.bounds ?? (shown && boundsOfContent(shown))
          if (b) fit(b)
        }
        hide(source, item)
        return
      }
      const withFit = forceFit || store.getSettings().fitOnAdd
      void show(source, item).then((b) => {
        if (withFit && b) fit(b)
      })
    },
    [fit, hide, show, store],
  )

  /**
   * Requête de cadrage en vol, abandonnée par la suivante et au démontage : deux clics
   * rapides ne doivent pas laisser la caméra partir vers la première cible.
   */
  const focusLoad = useRef<AbortController | null>(null)
  useEffect(() => () => focusLoad.current?.abort(), [])

  const focus = useCallback(
    (source: CatalogBrowseSource, item: CatalogItem) => {
      focusLoad.current?.abort()
      focusLoad.current = null
      // Emprise annoncée par l'hôte : le cadrage part immédiatement, sans réseau. C'est le
      // chemin nominal d'un référentiel que l'hôte peint — il connaît déjà ses emprises.
      if (item.bounds) {
        fit(item.bounds)
        return
      }
      const ctrl = new AbortController()
      focusLoad.current = ctrl
      // Rien n'entre dans le store : ni sélection, ni contenu, ni état de chargement. Ce
      // contenu ne sert qu'à mesurer une emprise, et repart avec la promesse.
      void loadContent(source, item.id, item.title, ctrl.signal)
        .then((content) => {
          if (ctrl.signal.aborted) return
          const b = boundsOfContent(content)
          if (b) fit(b)
        })
        .catch(() => {
          // Cadrage impossible : la ligne reste où elle est, sans pastille d'erreur — rien
          // n'a été promis à l'écran, contrairement à une pose qui aurait échoué.
        })
        .finally(() => {
          if (focusLoad.current === ctrl) focusLoad.current = null
        })
    },
    [fit],
  )

  const setMany = useCallback(
    (source: CatalogBrowseSource, items: readonly CatalogItem[], shown: boolean) => {
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
      // Titres du lot, pour que chaque forme anonyme reste cherchable après restauration.
      const titles = new Map(pairs.map((p) => [p.key, p.item.title] as const))
      const added = new Set(
        store.markSelectedMany(
          pairs.map((p) => p.key),
          titles,
        ),
      )
      engine.invalidate()
      void Promise.all(
        pairs.map((p) =>
          added.has(p.key)
            ? fetchContent(source, p.item, p.key)
            : // Déjà affiché : son contenu compte pour le cadrage, sans le redemander.
              Promise.resolve<LoadOutcome>({ key: p.key, content: store.getContent(p.key), failed: false }),
        ),
      ).then((outcomes) => {
        const b = applyOutcomes(outcomes)
        if (withFit && b) fit(b)
      })
    },
    [applyOutcomes, engine, fetchContent, fit, store],
  )

  const clear = useCallback(() => {
    store.abortAll()
    store.clear()
    engine.invalidate()
  }, [engine, store])

  const toggleSource = useCallback((id: string, on?: boolean) => flipSource(engine, store, id, on), [engine, store])

  return useMemo(
    () => ({
      selection: store.selection(),
      isShown: (k: CatalogKey) => store.isShown(k),
      isPending: (k: CatalogKey) => store.isPending(k),
      hasError: (k: CatalogKey) => store.hasError(k),
      toggle,
      focus,
      setMany,
      clear,
      shapes: store.shapes(),
      markers: store.markers(),
      toggleSource,
    }),
    // `token` est la dépendance réelle : le store mute en place, donc aucune de ses
    // lectures ne peut servir de dépendance — c'est le jeton qui dit « ça a changé ».
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, token, toggle, focus, setMany, clear, toggleSource],
  )
}

/**
 * Effets à instance UNIQUE du catalogue : configuration du stockage, purge des sources
 * disparues, restauration de la session précédente. Appelé par `<CatalogSurface>`, que
 * `<Map>` monte une seule fois.
 */
export function useCatalogHost(): CatalogContent {
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
   * Clés ET titres ont été persistés, jamais les géométries : une géométrie est la réponse
   * d'une API à un instant donné, et la resservir depuis un stockage local ferait afficher
   * un périmètre que le backend a peut-être déplacé depuis. On la redemande donc, sans
   * cadrer (on restaure une vue, on ne la vole pas) et sans signaler d'échec — une zone
   * supprimée côté API n'a pas à ouvrir une erreur au démarrage. Le titre persisté, lui, est
   * reprêté aux formes anonymes pour qu'elles restent cherchables.
   */
  useEffect(() => {
    // Sortie avant toute allocation : cet effet est rejoué à CHAQUE mutation du store
    // (il dépend du jeton), donc à chaque géométrie qui arrive. Sans cette garde, chaque
    // arrivée payait une copie de la liste à restaurer pour ne rien faire.
    if (!store.hasPendingRestores()) return
    // `pendingRestores()` et NON `selection()` : seules les clés venues du stockage sont
    // à recharger ici. Une clé qu'on vient de cocher a le même profil (sélectionnée,
    // sans géométrie) mais son chargement est déjà en vol, avec le cadrage qui va avec.
    const jobs: Promise<{ key: CatalogKey; content: CatalogContent | null }>[] = []
    for (const key of store.pendingRestores()) {
      if (store.hasGeometry(key)) continue
      const parsed = parseCatalogKey(key)
      if (!parsed) continue
      // Source pas encore inscrite : on RESSORT sans réclamer la clé, pour retenter
      // quand le plugin qui la porte arrivera.
      const source = sourcesById.get(parsed.sourceId)
      if (!source) continue
      // Une source à bascule n'a pas d'éléments : une clé qui prétendrait lui appartenir
      // ne peut venir que d'une source qui a changé de régime entre deux versions de
      // l'hôte. On la réclame quand même, sinon elle serait retentée à chaque mutation.
      if (isToggleSource(source)) {
        store.claimRestore(key)
        continue
      }
      store.claimRestore(key)
      const ctrl = store.beginLoad(key)
      // Repli avec le titre PERSISTÉ (l'élément n'est plus en portée), sinon une zone
      // restaurée sortait introuvable de la recherche.
      jobs.push(
        loadContent(source, restoreCatalogId(parsed.itemId), store.titleOf(key), ctrl.signal)
          .then((content) => ({ key, content: ctrl.signal.aborted || !store.isShown(key) ? null : content }))
          // Échec silencieux, volontairement : une zone supprimée côté API n'a pas à
          // ouvrir une erreur au démarrage. On la retire, sans pastille.
          .catch(() => ({ key, content: null }))
          .finally(() => store.endLoad(key, ctrl)),
      )
    }
    if (jobs.length === 0) return
    // Une seule pose pour toute la session restaurée : élément par élément, chaque
    // arrivée reconstruisait TOUTES les formes puis toute la couche 3D — O(N²) au
    // démarrage, là où une passe suffit.
    void Promise.all(jobs).then((results) => {
      const loaded: (readonly [CatalogKey, CatalogContent])[] = []
      const gone: CatalogKey[] = []
      for (const r of results) {
        if (r.content !== null) loaded.push([r.key, r.content])
        else if (store.isShown(r.key) && !store.hasGeometry(r.key)) gone.push(r.key)
      }
      if (loaded.length > 0) store.setContentMany(loaded)
      if (gone.length > 0) store.removeMany(gone)
      if (loaded.length > 0 || gone.length > 0) engine.invalidate()
    })
    // `token` : la sélection restaurée n'arrive qu'après `configure`, donc après le
    // premier rendu — sans cette dépendance, la restauration n'aurait jamais lieu.
  }, [engine, sourcesById, store, token])

  // Carte démontée : couper tout ce qui est en vol.
  useEffect(() => () => store.abortAll(), [store])

  // Les deux tableaux gardent leur identité tant que le store n'a pas changé de contenu :
  // c'est ce qui permet à la surface de ne recopier que sur un vrai changement.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `token` : cf. `useCatalog`
  return useMemo(() => ({ shapes: store.shapes(), markers: store.markers() }), [store, token])
}

/**
 * Ce que le catalogue peint — le badge du bouton de barre, et rien d'autre.
 *
 * Éléments cochés PLUS jeux allumés : les deux mettent quelque chose sur la carte, et
 * n'en compter qu'un laissait le bouton éteint alors qu'un jeu entier était affiché.
 *
 * L'instantané est le COMPTE lui-même, pas le jeton du store : React court-circuite
 * alors le rendu tant qu'il ne bouge pas. Avec `useCatalog`, le contrôle se re-rendait
 * à chaque mutation — donc à chaque géométrie qui arrive — pour afficher le même chiffre.
 */
export function useCatalogActiveCount(): number {
  const { engine } = useMapContext()
  const store = engine.catalogState
  return useSyncExternalStore(
    store.onChanged,
    () => store.activeCount(),
    () => store.activeCount(),
  )
}

/**
 * Vide la carte de tout ce que le catalogue y peint — éléments cochés ET jeux allumés.
 *
 * Un geste seul, sans abonnement : le bouton « Tout retirer » n'a pas à se re-rendre à
 * chaque géométrie qui arrive (son état désactivé vient de `useCatalogActiveCount`, qui
 * s'abonne au seul compte).
 */
export function useCatalogClear(): () => void {
  const { engine } = useMapContext()
  const store = engine.catalogState
  return useCallback(() => {
    store.abortAll()
    store.clear()
    engine.invalidate()
  }, [engine, store])
}

/**
 * État d'UNE ligne à bascule, et le geste qui la retourne.
 *
 * Deux instantanés SCALAIRES plutôt que l'API entière : React court-circuite le rendu tant
 * que les deux booléens ne bougent pas. Avec `useCatalog`, le menu des types et la liste
 * virtualisée se re-rendaient à chaque mutation du store — donc à chaque géométrie qui
 * arrive — pour réafficher exactement la même ligne. Même raison que `useCatalogActiveCount`.
 */
export function useCatalogToggle(id: string): { on: boolean; loading: boolean; toggle: () => void } {
  const { engine } = useMapContext()
  const store = engine.catalogState
  const on = useSyncExternalStore(
    store.onChanged,
    () => store.isSourceOn(id),
    () => store.isSourceOn(id),
  )
  const loading = useSyncExternalStore(
    store.onChanged,
    () => store.isSourceLoading(id),
    () => store.isSourceLoading(id),
  )
  const toggle = useCallback(() => flipSource(engine, store, id), [engine, store, id])
  // Sans `useMemo` : l'unique consommateur déstructure aussitôt, mémoïser coûterait plus
  // que le littéral de trois champs qu'on éviterait.
  return { on, loading, toggle }
}

/**
 * Jeux à bascule ALLUMÉS — `<CatalogSurface>` monte une couche par entrée.
 *
 * Éteint, un jeu n'a aucune couche montée : ni contrôleur, ni écoute de la vue, ni
 * requête. C'est ce qui rend une source à 36 000 points gratuite tant qu'on n'y touche pas.
 */
export function useEnabledToggleSources(): readonly CatalogToggleSource[] {
  const sources = useCatalogSources()
  const { store, token } = useCatalogStore()
  return useMemo(
    () => sources.filter((s): s is CatalogToggleSource => isToggleSource(s) && store.isSourceOn(s.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `token` : cf. `useCatalog`
    [sources, store, token],
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

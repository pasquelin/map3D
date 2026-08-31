import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { unionBounds } from '../../core/bounds'
import { boundsOfMarkers, type MarkerData } from '../../data/types'
import { catalogKey, parseCatalogKey, restoreCatalogId } from '../../catalog/selection'
import { aggregateChildren, type GroupCheck } from '../../catalog/groups'
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
   *
   * `fit: true` force le cadrage dans les DEUX sens, comme sur un élément seul (cf.
   * `toggle`) : c'est le clic sur le NOM d'un agrégat, qui emmène la caméra du même geste.
   */
  setMany: (
    source: CatalogBrowseSource,
    items: readonly CatalogItem[],
    shown: boolean,
    opts?: { fit?: boolean },
  ) => void
  /**
   * Retient de quoi un AGRÉGAT est fait, dès que ses enfants sont connus.
   *
   * Un agrégat n'entre jamais en sélection — il n'est qu'un sélecteur de ses enfants. Sa
   * case doit pourtant rester juste une fois REPLIÉE, et après réouverture du panneau : ce
   * n'est possible que si l'appartenance survit à la liste qui l'a chargée. Appeler à
   * chaque page d'enfants reçue ; le store persiste, dédoublonne et ne notifie que sur
   * changement réel.
   */
  rememberGroup: (source: CatalogBrowseSource, parentId: CatalogId, children: readonly CatalogItem[]) => void
  /**
   * État de la case d'un agrégat, dérivé de ses enfants connus — `total: 0` tant qu'on
   * ignore de quoi il est fait.
   */
  groupState: (parentKey: CatalogKey) => GroupCheck
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

/** Clés d'un lot — trois gestes les recalculaient chacun de son côté. */
const keysOf = (source: CatalogBrowseSource, items: readonly CatalogItem[]): CatalogKey[] =>
  items.map((item) => catalogKey(source.id, item.id))

/**
 * Ce qu'il faut viser AVANT de retirer un élément : après, son contenu a quitté la mémoire
 * et il ne resterait plus rien à cadrer.
 *
 * L'emprise ANNONCÉE prime — elle est disponible même quand la géométrie n'est pas encore
 * arrivée. Une seule définition pour le retrait à l'unité et pour celui d'un lot : écrites
 * séparément, la seconde avait déjà oublié `item.bounds`, si bien que décocher un agrégat
 * par son nom ne cadrait pas sur une source qui annonce pourtant ses emprises.
 */
const boundsBeforeRemove = (store: CatalogStore, item: CatalogItem, key: CatalogKey): Bounds | null => {
  if (item.bounds) return item.bounds
  const content = store.getContent(key)
  return content && boundsOfContent(content)
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
 * **Aucun effet PARTAGÉ** : ce hook a plusieurs consommateurs simultanés (le panneau,
 * chaque ligne, la surface d'affichage). Les effets qui doivent n'avoir lieu QU'UNE FOIS —
 * configuration du stockage, purge, restauration — vivent dans `useCatalogHost`, que seule
 * `<CatalogSurface>` appelle. Les avoir laissés ici aurait déclenché autant de
 * restaurations concurrentes que de composants montés. Le seul effet qui subsiste ici
 * n'abandonne QUE la requête de cadrage de SON appelant (cf. `focus`) : il ne touche à rien
 * de partagé, et deux consommateurs ne peuvent pas se marcher dessus.
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

  /**
   * Requête de cadrage en vol, abandonnée par la suivante et au démontage : deux clics
   * rapides ne doivent pas laisser la caméra partir vers la première cible.
   */
  const focusLoad = useRef<AbortController | null>(null)
  useEffect(() => () => focusLoad.current?.abort(), [])

  const focus = useCallback(
    (source: CatalogBrowseSource, item: CatalogItem) => {
      focusLoad.current?.abort()
      // Emprise annoncée par l'hôte : le cadrage part immédiatement, sans réseau. C'est le
      // chemin nominal d'un référentiel que l'hôte peint — il connaît déjà ses emprises.
      if (item.bounds) {
        focusLoad.current = null
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
    },
    [fit],
  )

  const setMany = useCallback(
    (source: CatalogBrowseSource, items: readonly CatalogItem[], shown: boolean, opts?: { fit?: boolean }) => {
      // Même règle qu'à l'unité (cf. `toggle`) : cette source ne pose rien, donc il n'y a
      // ni lot à poser ni lot à retirer. Pas de cadrage non plus — cadrer une poignée
      // d'éléments qu'on n'a pas désignés n'est le geste de personne.
      if (source.checkable === false) return
      const forceFit = opts?.fit === true
      if (!shown) {
        const keys = keysOf(source, items)
        // Le cadre du LOT, mesuré avant le retrait — exactement la règle de l'unité,
        // appliquée à chaque membre puis réunie.
        if (forceFit) {
          const b = unionBounds(items.map((item) => boundsBeforeRemove(store, item, catalogKey(source.id, item.id))))
          if (b) fit(b)
        }
        // Un seul retrait pour tout le lot : en boucle, chaque `hide` reconstruisait
        // toutes les formes, réécrivait le stockage et relançait un rendu.
        store.removeMany(keys)
        engine.invalidate()
        return
      }
      const withFit = forceFit || store.getSettings().fitOnAdd
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

  const rememberGroup = useCallback(
    (source: CatalogBrowseSource, parentId: CatalogId, children: readonly CatalogItem[]) => {
      const keys = keysOf(source, children)
      // `true` ⇒ une clé d'agrégat héritée vient d'être retirée de la sélection, donc des
      // formes ont quitté la carte : c'est le seul cas où il y a quelque chose à repeindre.
      if (store.rememberGroup(catalogKey(source.id, parentId), keys)) engine.invalidate()
    },
    [engine, store],
  )

  /**
   * Chargement d'enfants en vol pour un geste d'agrégat, abandonné par le suivant et au
   * démontage — même patron que `focusLoad` : deux clics rapides ne doivent pas faire
   * appliquer le lot du premier après celui du second.
   */
  const groupLoad = useRef<AbortController | null>(null)
  useEffect(() => () => groupLoad.current?.abort(), [])

  /**
   * Le geste d'un AGRÉGAT : ce sont ses enfants qui entrent en sélection, jamais lui.
   *
   * Les enfants sont donc nécessaires, y compris replié — d'où ce chargement. L'interface
   * de la lib passe par son propre cache (`CatalogList`), qui évite la requête quand le
   * groupe a déjà été ouvert ; ce chemin-ci est celui de `toggle`, c'est-à-dire de l'hôte.
   */
  const toggleGroup = useCallback(
    (
      source: CatalogBrowseSource,
      item: CatalogItem,
      children: NonNullable<CatalogBrowseSource['children']>,
      opts?: { fit?: boolean },
    ) => {
      groupLoad.current?.abort()
      const ctrl = new AbortController()
      groupLoad.current = ctrl
      // Depuis « partiellement affiché », le geste attendu est de TOUT afficher — la
      // convention des arbres de cases, lue au moment du clic.
      const next = store.groupState(catalogKey(source.id, item.id)).state !== 'on'
      void children(item.id, { query: '', limit: config.catalog.pageSize, signal: ctrl.signal })
        .then((page) => {
          if (ctrl.signal.aborted) return
          rememberGroup(source, item.id, page.items)
          if (page.items.length > 0) setMany(source, page.items, next, opts)
        })
        .catch(() => {
          // Enfants indisponibles : rien à basculer, et l'état reste où il était.
        })
    },
    [config.catalog.pageSize, rememberGroup, setMany, store],
  )

  const toggle = useCallback(
    (source: CatalogBrowseSource, item: CatalogItem, opts?: { fit?: boolean }) => {
      // Source qui ne pose pas : la règle vit ICI, pas dans la liste qui l'appelle. Sinon
      // elle ne tiendrait que pour les gestes de l'UI de la lib, et un hôte — ou un futur
      // chemin interne — inscrirait quand même ces éléments en sélection et en
      // persistance, c'est-à-dire le doublon que `checkable: false` existe pour empêcher.
      // « Afficher » s'y réduit à « montrer » : on cadre.
      if (source.checkable === false) {
        focus(source, item)
        return
      }
      // Agrégat : MÊME raisonnement, même endroit. Un groupe n'est qu'un sélecteur de ses
      // enfants ; laisser cette règle à la liste seule permettait à quiconque appelle
      // `toggle` (l'hôte, un futur chemin interne) de réinscrire la clé que tout le reste
      // s'interdit d'écrire — elle repeignait alors les zones de ses enfants par-dessus les
      // leurs, et survivait à un décochage qui ne porte que sur eux.
      const children = aggregateChildren(source, item)
      if (children) {
        toggleGroup(source, item, children, opts)
        return
      }
      const key = catalogKey(source.id, item.id)
      const forceFit = opts?.fit === true
      if (store.isShown(key)) {
        if (forceFit) {
          const b = boundsBeforeRemove(store, item, key)
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
    [fit, focus, hide, show, store, toggleGroup],
  )

  const clear = useCallback(() => {
    store.abortAll()
    store.clear()
    engine.invalidate()
  }, [engine, store])

  const toggleSource = useCallback((id: string, on?: boolean) => flipSource(engine, store, id, on), [engine, store])

  // Stables comme leurs sœurs : le store mute en place, ces lectures n'ont donc pas
  // besoin de `token`. `groupState` surtout — `CatalogList` le met en dépendance de
  // `onActivate`, passé à `CatalogRow` qui est `memo()` : une identité neuve à chaque
  // mutation re-rendrait toutes les lignes visibles pour une géométrie arrivée ailleurs.
  const isShown = useCallback((k: CatalogKey) => store.isShown(k), [store])
  const isPending = useCallback((k: CatalogKey) => store.isPending(k), [store])
  const hasError = useCallback((k: CatalogKey) => store.hasError(k), [store])
  const groupState = useCallback((k: CatalogKey) => store.groupState(k), [store])

  return useMemo(
    () => ({
      selection: store.selection(),
      isShown,
      isPending,
      hasError,
      toggle,
      focus,
      setMany,
      rememberGroup,
      groupState,
      clear,
      shapes: store.shapes(),
      markers: store.markers(),
      toggleSource,
    }),
    // `token` est la dépendance réelle : le store mute en place, donc aucune de ses
    // lectures ne peut servir de dépendance — c'est le jeton qui dit « ça a changé ».
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      store,
      token,
      toggle,
      focus,
      setMany,
      rememberGroup,
      clear,
      toggleSource,
      isShown,
      isPending,
      hasError,
      groupState,
    ],
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
      // Deux régimes n'ont RIEN à restaurer, et pour la même raison : ils ne posent pas
      // d'élément. Une bascule n'a pas d'éléments du tout ; une source `checkable: false`
      // est peinte par l'hôte lui-même. Dans les deux cas, la clé ne peut venir que d'une
      // version antérieure de l'hôte, où la source posait encore — la recharger
      // repeindrait par-dessus ce que l'hôte affiche déjà, et sans case pour l'en
      // retirer. On la réclame quand même : sinon elle serait retentée à chaque mutation.
      if (isToggleSource(source) || source.checkable === false) {
        store.claimRestore(key)
        store.remove(key)
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
 * Combien d'éléments de CETTE source sont sur la carte — le compte d'une ligne du menu
 * des types.
 *
 * Instantané SCALAIRE, comme `useCatalogActiveCount` : React court-circuite le rendu de la
 * ligne tant que le chiffre ne bouge pas, là où l'API entière la re-rendrait à chaque
 * géométrie qui arrive.
 */
export function useCatalogSourceCount(id: string): number {
  const { engine } = useMapContext()
  const store = engine.catalogState
  return useSyncExternalStore(
    store.onChanged,
    () => store.shownCountOf(id),
    () => store.shownCountOf(id),
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

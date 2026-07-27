import { type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { altitudeForZoom } from '../../core/MapEngine'
import type { SelectableScreenItem } from '../../core/Selectables'
import { boundsContains, type VisualNode } from '../../core/MarkerQuery'
import { countTags } from '../../core/TagFilter'
import { MarkerLayer as CoreMarkerLayer, type OverlayItem } from '../../layers/MarkerLayer'
import {
  ClusterEngine,
  type ClusterEntry,
  type ClusterInfo,
  clusterInfoFromCounts,
  markerEntryKey,
  spiderfyLayout,
} from '../../layers/ClusterLayer'
import type { LatLng } from '../../shared'
import { markerTags } from '../../data/types'
import type { DataSource, MarkerData } from '../../data/types'
import { createTitleCache, type Hit, NO_MATCH, proximityRank, rankHits, scoreMatch } from '../../search/match'
import { markerGroupId } from '../../search/registry'
import type { SearchEntry, SearchGroup } from '../../search/types'
import { useLiveData } from '../hooks/useLiveData'
import { useTagSelection } from '../hooks/useTags'
import { useDraggable } from '../hooks/useDraggable'
import { useRepositionable } from '../hooks/useRepositionable'
import { useConfig, useMapContext } from '../context'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { DefaultCluster, defaultClusterRadius } from './DefaultCluster'
import { DefaultMarker } from './DefaultMarker'
import { hasTipContent, MarkerTip } from './MarkerTip'
import { useDismiss } from './useDismiss'
import { markerColorOf } from '../../theme/colors'

export type MarkerLayerProps<T> = {
  /** Markers à afficher. Exclusif avec `source`, qui les charge selon la vue. */
  points?: MarkerData<T>[]
  /** Source viewport-driven (rechargée au déplacement, gate `minZoom`). */
  source?: DataSource<MarkerData<T>>
  /** Clé stable d'un marker (défaut `p.id`) : elle décide de l'identité, donc du tween. */
  getId?: (p: MarkerData<T>) => string | number
  /**
   * Regroupement des markers proches. `radius`, `maxZoom` et `spiderfyZoom`
   * surchargent les valeurs du thème pour CETTE couche : deux cartes de la même app
   * n'ont pas forcément la même densité de points.
   *
   * `maxZoom` = zoom au-delà duquel le regroupement géographique s'arrête ; ce qui
   * reste superposé à l'écran est alors éclaté en éventail.
   */
  cluster?: { enabled: boolean; radius?: number; minPoints?: number; maxZoom?: number; spiderfyZoom?: number }
  /** Icône **SVG** (markup) d'un marker, rendue en `<img>` DOM ancrée à la carte. */
  icon?: (p: MarkerData<T>) => string
  /** Icône **SVG** (markup) d'un cluster. */
  clusterIcon?: (c: ClusterInfo) => string
  /** Icône d'un type (fragment SVG viewBox `0 0 24 24`, `currentColor`) pour les satellites du cluster. */
  clusterTypeIcon?: (type: string) => ReactNode
  /**
   * Libellé lisible d'un type (`'agent'` → « Agents ») : **nom de rubrique dans la
   * recherche**, et repli de `clusterTypeLabel`. Un type se nomme ici, une fois.
   */
  typeLabel?: (type: string) => string
  /** Libellé d'un type pour l'infobulle d'un satellite de cluster. Défaut : `typeLabel`. */
  clusterTypeLabel?: (type: string) => string
  /**
   * Infobulle au survol d'un marker : `title` et `content` acceptent tout
   * ReactNode (texte, HTML, composants — avatar, badges…). `null` = pas
   * d'infobulle pour ce marker. L'info vit AU SURVOL — le clic est réservé aux
   * actions (menu contextuel, sélection).
   *
   * **Surcharge** : sans cette prop, l'infobulle se construit d'elle-même à partir de
   * `MarkerData.title` / `titleColor` / `content`. Fournie, elle décide seule — y
   * compris pour rendre `null`. À réserver aux titres que du texte ne peut pas dire.
   */
  tooltip?: (p: MarkerData<T>) => { title?: ReactNode; content?: ReactNode } | null
  /**
   * Infobulle au survol d'un CLUSTER : reçoit l'agrégat ET la liste des markers
   * contenus (feuilles, fusion écran comprise) — permet de lister leurs infos.
   * Au survol d'une PART du donut, `members` est restreint aux markers du type
   * survolé et `segmentType` le porte ; cœur/`undefined` → infobulle globale.
   */
  clusterTooltip?: (
    c: ClusterInfo,
    members: MarkerData<T>[],
    segmentType?: string,
  ) => { title?: ReactNode; content?: ReactNode } | null
  /** Menu contextuel d'un marker (clic droit, et bouton « … » des listes). */
  menu?: (p: MarkerData<T>) => MenuItem[]
  /** Marker sélectionné — **contrôlé** : la couche ne le change jamais d'elle-même. */
  selectedId?: string | number
  /** Marker suivi par la caméra ; elle reste centrée dessus tant qu'il est fourni. */
  followId?: string | number
  /**
   * Sélection changée. La règle est uniforme : **tout clic qui ne sélectionne pas un
   * marker rend `null`** — carte nue comme cluster. `selectedId` étant contrôlé, la
   * couche ne peut pas le vider elle-même : elle signale, l'application décide.
   *
   * Sans traiter le cas `null`, l'anneau ne partirait qu'en cliquant un autre marker,
   * et survivrait à l'ouverture d'un cluster — y compris quand le marker sélectionné
   * est justement celui qui vient d'y être absorbé.
   */
  onSelect?: (p: MarkerData<T> | null) => void
  /** Diamètre (px) du marker (défaut: `theme.markers.size`). */
  size?: number
  /**
   * Diamètre (px) de l'anneau de multi-sélection (défaut: `size + 4`). À régler
   * quand l'icône SVG occupe moins que sa boîte (ex. pastille à 58/80 du sprite)
   * pour que l'anneau reste collé au visuel.
   */
  selectionRing?: number
  /**
   * Rend les markers **saisissables au long-press** pour le drag-and-drop
   * (ex. dépôt dans `<PinnedDock>`). `true` active tous les markers ; une fonction
   * cible sélectivement. Le clic normal (sélection/menu) reste préservé ; le ghost
   * accroché au curseur réutilise l'icône du marker. Les clusters ne sont jamais
   * saisissables.
   */
  draggable?: boolean | ((p: MarkerData<T>) => boolean)
  /**
   * Markers **repositionnables** : appui + déplacement les fait suivre la surface,
   * le relâchement livre la nouvelle position à `onReposition`.
   *
   * Le cas normal est de laisser cette prop vide et de porter le drapeau sur la
   * DONNÉE (`MarkerData.repositionable`) : dans un même jeu, seuls certains markers
   * sont éditables. Cette prop sert à trancher globalement (`true`/`false`) ou selon
   * un critère externe au marker — elle **prime** alors sur le champ de la donnée.
   *
   * À ne pas confondre avec `draggable` (drag-and-drop à payload, vers un dock).
   * Les deux cohabitent tant que la tige est affichée : le repositionnement part
   * alors du **point au sol**, la saisie vers le dock part de l'**icône**. Sans tige
   * (`leaderLine={false}`) il n'y a plus qu'une surface de préhension, et le
   * repositionnement prend le pas sur `draggable`.
   */
  repositionable?: boolean | ((p: MarkerData<T>) => boolean)
  /** Nouvelle position au relâchement — à répercuter dans vos données. */
  onReposition?: (p: MarkerData<T>, latLng: LatLng) => void
  /** Position suivie en continu pendant le geste (aperçu live, champ de formulaire). */
  onRepositionMove?: (p: MarkerData<T>, latLng: LatLng) => void
  /**
   * Tige verticale + point au sol, le contenu étant soulevé au-dessus de la
   * position (défaut `true`) : un badge d'alerte reste lisible sans masquer le point
   * qu'il marque. À passer à `false` quand l'icône DOIT coïncider avec sa
   * coordonnée — c'est le cas des symboles tactiques, dont le point d'ancrage est
   * porté par le graphisme lui-même.
   */
  leaderLine?: boolean
  /**
   * Marge (px écran) au-delà du cadre au-delà de laquelle un marker est **masqué**
   * (`display:none`) : le navigateur cesse d'en calculer le style, la mise en page et
   * la composition. Défaut : 200 px. `0` désactive le cull.
   *
   * Un marker déjà affiché n'est pas démonté pour autant — son nœud et son portail
   * React restent. Un marker créé hors cadre, lui, n'entre jamais dans le document
   * (le `CSS2DRenderer` n'insère l'élément qu'au premier rendu visible) : sur la
   * démo, 9 ancres dans le DOM au lieu de 32. Le tri z du `CSS2DRenderer` continue en
   * revanche de porter sur tout ce qui est monté, et la vraie borne reste de ne pas
   * charger la donnée lointaine (`source` cadrée sur le viewport).
   *
   * Un marker masqué sort aussi de la sélection au marquee : hors cadre d'au moins
   * cette marge, aucun rectangle tracé à l'écran ne peut l'atteindre.
   */
  cullMargin?: number
}

type Entry<T> =
  | { kind: 'marker'; marker: MarkerData<T> }
  | { kind: 'cluster'; cluster: ClusterInfo }


/** SVG → data-URI, idempotent (une source déjà encodée passe telle quelle). */
export const svgToDataUri = (svg: string): string =>
  svg.startsWith('data:') ? svg : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** Le marker se décrit-il lui-même (cf. `MarkerData.title` / `content`) ? */
const hasOwnTip = <T,>(m: MarkerData<T>): boolean => m.title != null || m.content != null

/**
 * Infobulle déduite de la DONNÉE, quand la couche n'en fournit pas. `titleColor`
 * évite à l'appelant d'écrire du JSX pour la seule chose qu'un titre a besoin
 * d'exprimer au-delà de son texte : sa gravité.
 */
const tipFromData = <T,>(m: MarkerData<T>): { title?: ReactNode; content?: ReactNode } | null => {
  if (!hasOwnTip(m)) return null
  return {
    title:
      m.title == null ? undefined : (
        <span style={m.titleColor ? { color: m.titleColor } : undefined}>{m.title}</span>
      ),
    content: m.content,
  }
}

export function MarkerLayer<T>(props: MarkerLayerProps<T>) {
  const { engine, theme } = useMapContext()
  // Contexte et non `engine.config` : au render, le moteur porte encore les réglages
  // de la frame précédente (cf. `useConfig`).
  const config = useConfig()
  const getId = props.getId ?? ((p: MarkerData<T>) => p.id)

  const { data: sourceData } = useLiveData<MarkerData<T>>(props.source)
  const rawPoints = props.points ?? sourceData

  // Tags garantis (cf. `markerTags`). Identité ET allocation évitées dans le cas
  // courant « tout est taggé » (flux temps réel : un tick de données ne coûte rien ici).
  const allPoints = useMemo(() => {
    if (!rawPoints.some((p) => !p.tags)) return rawPoints
    return rawPoints.map((p) => (p.tags ? p : { ...p, tags: markerTags(p) }))
  }, [rawPoints])

  // Filtre « Couches » : appliqué AVANT le clustering (les clusters reflètent le
  // filtre). Recalculé uniquement au changement des points ou de la sélection.
  const tagFilter = useTagSelection()
  // Le marker SÉLECTIONNÉ et celui qui est SUIVI échappent au filtre : masquer ce
  // sur quoi la carte est centrée (ou ce que la caméra suit) ferait disparaître la
  // cible sans explication, et le suivi perdrait sa position en cours de route.
  const visible = useMemo(
    () => (tagFilter.isActive ? allPoints.filter((p) => tagFilter.isVisible(p.tags)) : allPoints),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allPoints, tagFilter.selectionVersion],
  )
  /**
   * Les exemptions sont ajoutées EN SECOND, et seulement quand le filtre les masque
   * vraiment : le cas courant (cible déjà visible, ou aucun filtre) rend alors la
   * MÊME référence de tableau. Les inclure dans le filtre lui-même faisait qu'un
   * simple clic de sélection produisait un tableau neuf, donc un rechargement complet
   * de l'index supercluster (O(n log n)) et un rebuild de tous les portails —
   * précisément quand un filtre est actif, c'est-à-dire quand la liste est grande.
   */
  const points = useMemo(() => {
    const exempt = [props.selectedId, props.followId].filter(
      (id) => id !== undefined && !visible.some((p) => getId(p) === id),
    )
    if (exempt.length === 0) return visible
    return [...visible, ...allPoints.filter((p) => exempt.includes(getId(p)))]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, allPoints, props.selectedId, props.followId])

  // Registre du panneau « Couches » : tags portés par TOUS les points (même masqués).
  const tagSource = useId()
  /** Clé de cette couche dans le registre de recherche (deux couches coexistent). */
  const searchSource = useId()
  useEffect(() => {
    tagFilter.report(tagSource, countTags(allPoints, (p) => p.tags))
  }, [allPoints, tagFilter, tagSource])
  useEffect(() => () => tagFilter.unreport(tagSource), [tagFilter, tagSource])

  const coreRef = useRef<CoreMarkerLayer | null>(null)
  const clusterRef = useRef<ClusterEngine | null>(null)
  const entriesRef = useRef(new Map<string | number, Entry<T>>())
  /** Points visibles (filtre tags appliqué) par id — `info()` du registre + prune. */
  const pointsByIdRef = useRef(new Map<string | number, MarkerData<T>>())
  /** Entrées géo (markers/clusters) par nœud cluster — feuilles résolues à la
   *  demande (survol, spiderfy), jamais pendant le recompute. */
  const clusterMembersRef = useRef(new Map<string | number, ClusterEntry[]>())
  /** Index `id de marker → nœud visuel`, invalidé par le recompute (cf. `visualNodeOf`). */
  const nodeIndexRef = useRef<Map<string | number, VisualNode> | null>(null)

  const [nodes, setNodes] = useState<Map<string | number, HTMLDivElement>>(new Map())
  const [openMenu, setOpenMenu] = useState<string | number | null>(null)
  const closeMenu = useCallback(() => setOpenMenu(null), [])
  /** Marker survolé (infobulle) — id de nœud du portail. */
  const [hoverId, setHoverId] = useState<string | number | null>(null)
  const [hoverSegment, setHoverSegment] = useState<string | null>(null)
  /** Rayons d'éventail par nœud éclaté (auto-spiderfy au zoom max), rebâti au recompute. */
  /** Version des données + signature du dernier jeu d'entrées (bump conditionnel). */
  const pointsRevRef = useRef(0)
  const entriesSigRef = useRef('')
  /** Version des entrées : `recompute` mute `entriesRef` hors cycle React — ce
   *  compteur re-rend les portails (flags new/urgent, compteurs de clusters). */
  const [entriesRev, bumpEntries] = useReducer((x: number) => x + 1, 0)
  /** Markers `new` déjà cliqués : leur sonar est éteint pour la session. */
  const [seenNew, setSeenNew] = useState<ReadonlySet<string | number>>(new Set())

  const markerSize = props.size ?? theme.markers.size
  const clusterSize = Math.round(markerSize * 1.18)

  const ringSize = props.selectionRing ?? markerSize + 4
  // Un avatar remplit tout le gabarit : son anneau part de la taille du marker, sans
  // le facteur de pastille que `selectionRing` porte pour les sprites.
  const avatarRing = markerSize + 12

  const clustering = config.clustering
  const maxZoom = props.cluster?.maxZoom ?? clustering.maxZoom
  const spiderfyZoom = props.cluster?.spiderfyZoom ?? clustering.spiderfyZoom
  const clusterRadius = props.cluster?.radius ?? clustering.radius
  // Instantané du rendu courant, écrit UNE fois : les deux littéraux jumeaux d'avant
  // devaient être édités symétriquement à chaque champ ajouté, et un oubli laissait
  // un champ figé à sa valeur du premier rendu — sans que le typage n'en dise rien.
  const snapshot = {
    points,
    getId,
    cluster: props.cluster,
    clusterRadius,
    ringSize,
    avatarRing,
    maxZoom,
    spiderfyZoom,
    onSelect: props.onSelect,
    menu: props.menu,
    typeLabel: props.typeLabel,
    // Via ref : le portail est mémoïsé, un handler redéfini à chaque rendu ne doit
    // pas le faire recalculer (il n'est pas dans ses dépendances).
    onReposition: props.onReposition,
    onRepositionMove: props.onRepositionMove,
    leaderLine: props.leaderLine,
    cullMargin: props.cullMargin,
    // Dans l'instantané comme le reste : les closures longue durée de ce fichier
    // (recompute, gestes de cluster) tournent longtemps après leur render et doivent
    // voir les réglages COURANTS, pas ceux qu'elles ont capturés à leur création.
    config,
  }
  const latest = useRef(snapshot)
  latest.current = snapshot

  // Titres normalisés mémoïsés PAR OBJET marker : un tick temps réel reconstruit le
  // tableau mais préserve la plupart des références, donc ne renormalise que ce qui
  // a réellement changé.
  const normalizedTitle = useMemo(() => createTitleCache<MarkerData<T>>((m) => m.title), [])

  // Couche DOM de positionnement (pool, tween, ancrage CSS2DObject).
  useEffect(() => {
    const core = new CoreMarkerLayer(
      engine.overlayAnchor,
      engine.tiles.ellipsoid,
      engine.projection,
      (id, el) => setNodes((prev) => new Map(prev).set(id, el)),
      (id) =>
        setNodes((prev) => {
          const next = new Map(prev)
          next.delete(id)
          return next
        }),
    )
    core.moveTween = {
      durationMs: theme.markers.moveTween.duration,
      easing: theme.markers.moveTween.easing,
    }
    // Deux diamètres : `ringSize` cale l'anneau sur la pastille d'un sprite (calibrage
    // de l'appelant), le second sur le gabarit plein d'un avatar — cf. `setSelectionRing`.
    core.setSelectionRing(latest.current.ringSize, latest.current.avatarRing)
    core.leaderLine = latest.current.leaderLine ?? true
    core.cullMargin = latest.current.cullMargin ?? latest.current.config.performance.markerCullMarginPx
    engine.addLayer(core)
    coreRef.current = core
    return () => {
      engine.removeLayer(core)
      coreRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  // Réglage VIVANT, contrairement à `leaderLine` : celui-ci décide de la structure DOM
  // d'un nœud à sa création, alors que le cull ne fait que masquer — le changer à chaud
  // n'a donc rien à reconstruire. Sans cet effet, la prop resterait figée à sa valeur
  // du premier rendu, et rien dans le typage ne le dirait.
  const cullMarginPx = config.performance.markerCullMarginPx
  useEffect(() => {
    if (coreRef.current) coreRef.current.cullMargin = props.cullMargin ?? cullMarginPx
  }, [props.cullMargin, cullMarginPx])

  // Moteur de clustering (supercluster).
  useEffect(() => {
    if (!props.cluster?.enabled) {
      clusterRef.current = null
      return
    }
    clusterRef.current = new ClusterEngine({
      radius: props.cluster.radius ?? clustering.radius,
      minPoints: props.cluster.minPoints ?? clustering.minPoints,
      maxZoom: clustering.maxZoom,
    })
    return () => {
      clusterRef.current = null
    }
  }, [props.cluster?.enabled, props.cluster?.radius, props.cluster?.minPoints, clustering])

  /** Entrées géo (markers/sous-clusters) → markers feuilles. UNIQUE implémentation
   *  (recompute, infobulle de cluster) — ne lit que des refs. */
  const leavesOf = useCallback((ges: ClusterEntry[]): MarkerData<T>[] => {
    const out: MarkerData<T>[] = []
    for (const ge of ges) {
      if (ge.kind === 'marker') {
        const m = pointsByIdRef.current.get(ge.markerId)
        if (m) out.push(m)
      } else {
        for (const mid of clusterRef.current?.leafMarkerIds(ge.clusterId) ?? []) {
          const m = pointsByIdRef.current.get(mid)
          if (m) out.push(m)
        }
      }
    }
    return out
  }, [])

  const recompute = useCallback(() => {
    const core = coreRef.current
    if (!core) return
    const { points: pts, getId: idOf } = latest.current
    // Index id → point maintenu par l'effet points (mêmes données) : pas de
    // reconstruction ici — recompute tourne à ~11 Hz pendant un pan en clustering.
    const byId = pointsByIdRef.current

    let items: OverlayItem[] = []
    const entries = new Map<string | number, Entry<T>>()
    // Ce que la donnée d'un marker impose au nœud (priorité, couleur d'anneau) —
    // les clusters n'en portent pas, c'est propre au point.
    const markerItem = (
      id: string | number,
      position: LatLng,
      m: MarkerData<T>,
      animateEnter?: false,
    ): OverlayItem => ({ id, position, animateEnter, zIndex: m.zIndex, selectedColor: m.selectedColor })

    if (clusterRef.current) {
      const view = engine.getView()
      // Bounds MONDE (pas le viewport) : une alerte ne doit JAMAIS être filtrée par la
      // vue. En oblique, les bounds du viewport n'atteignent pas l'horizon → les
      // marqueurs lointains tombaient hors boîte et disparaissaient. supercluster
      // regroupe toujours par proximité au zoom courant ; les points hors écran sont
      // gérés par la projection (derrière la caméra) et l'occlusion du globe.
      const WORLD_BOUNDS = { north: 85, south: -85, east: 180, west: -180 }
      const geo = clusterRef.current.getClusters(WORLD_BOUNDS, view.zoom)

      // Déclutter ÉCRAN : le clustering géographique n'empêche pas deux clusters de se
      // SUPERPOSER à l'écran en vue 3D oblique (l'un derrière l'autre → illisible). On
      // projette chaque cluster, on trie du plus PROCHE au plus lointain (profondeur),
      // et on fusionne tout ce qui tombe dans le même disque écran (~même rayon caméra)
      // dans le cluster de DEVANT → aucune info n'est masquée en arrière-plan.
      const cam = engine.threeCamera
      const proj = engine.projection
      const mergePx = latest.current.clusterRadius
      const r2 = mergePx * mergePx
      const projected = geo
        .map((entry) => {
          const sp = proj.worldToScreen(proj.latLngToWorld(entry.position), cam)
          return { entry, sx: sp.sx, sy: sp.sy, z: sp.z }
        })
        .sort((a, b) => a.z - b.z)

      type Bin = { sx: number; sy: number; members: ClusterEntry[]; counts: Record<string, number>; position: LatLng }
      const countsOf = (e: ClusterEntry): Record<string, number> =>
        e.kind === 'cluster' ? { ...e.cluster.counts } : { [e.type]: 1 }
      const bins: Bin[] = []
      for (const p of projected) {
        const onScreen = p.z >= -1 && p.z <= 1
        let target: Bin | null = null
        if (onScreen) {
          for (const bin of bins) {
            const dx = p.sx - bin.sx
            const dy = p.sy - bin.sy
            if (dx * dx + dy * dy < r2) {
              target = bin
              break
            }
          }
        }
        if (target) {
          target.members.push(p.entry)
          const c = countsOf(p.entry)
          for (const k in c) target.counts[k] = (target.counts[k] ?? 0) + c[k]!
        } else {
          bins.push({ sx: p.sx, sy: p.sy, members: [p.entry], counts: countsOf(p.entry), position: p.entry.position })
        }
      }

      // Entrées géo par nœud cluster (références, gratuit) — les feuilles sont
      // résolues à la demande (survol de l'infobulle, spiderfy), pas à 11 Hz.
      const members = new Map<string | number, ClusterEntry[]>()
      for (const bin of bins) {
        const solo = bin.members.length === 1 ? bin.members[0]! : null
        if (solo && solo.kind === 'marker') {
          const marker = byId.get(solo.markerId)
          if (!marker) continue
          items.push(markerItem(solo.key, solo.position, marker))
          entries.set(solo.key, { kind: 'marker', marker })
        } else {
          // Cluster géo seul → clé stable `cl:`/`pt:` ; fusion écran → clé basée sur le
          // membre de DEVANT (`grp:`) : stable tant qu'il reste le plus proche → le nœud
          // DOM persiste pendant la rotation (seul son contenu se met à jour, pas de churn).
          // `animateEnter: false` → pas de clignotement quand la fusion se fait/défait.
          const key = solo ? solo.key : `grp:${bin.members[0]!.key}`
          items.push({ id: key, position: bin.position, animateEnter: solo ? undefined : false })
          entries.set(key, { kind: 'cluster', cluster: clusterInfoFromCounts(bin.counts, bin.position) })
          members.set(key, bin.members)
        }
      }
      clusterMembersRef.current = members

      // AUTO-éventail : dès que le clustering géographique s'arrête (zoom ≥ maxZoom),
      // supercluster ne fusionne plus par proximité géographique — tout nœud encore
      // fusionné est un CHEVAUCHEMENT ÉCRAN qu'on décolle (markers réels décalés d'un
      // petit offset ; chacun garde son propre fil vertical vers son point au sol).
      // Replié dès qu'on dézoome.
      const { maxZoom: clusterMaxZoom, ringSize } = latest.current
      const spiderfy = latest.current.config.interaction.spiderfy
      if (view.zoom >= clusterMaxZoom - spiderfy.zoomEpsilon) {
        // `members` ne contient QUE les nœuds cluster — itération directe. Les nœuds
        // éclatés sont retirés en UNE passe après la boucle (pas de splice O(n) par cluster).
        const exploded = new Set<string | number>()
        for (const [key, ges] of members) {
          const entry = entries.get(key)
          if (entry?.kind !== 'cluster') continue
          const leaves = leavesOf(ges)
          if (leaves.length < 2) continue
          exploded.add(key)
          entries.delete(key)
          const slots = spiderfyLayout(leaves.length, entry.cluster.position, view.zoom, ringSize, spiderfy)
          leaves.forEach((m, i) => {
            const mkey = markerEntryKey(idOf(m))
            items.push(markerItem(mkey, slots[i]!.position, m, false))
            entries.set(mkey, { kind: 'marker', marker: m })
          })
        }
        if (exploded.size) items = items.filter((it) => !exploded.has(it.id))
      }
    } else {
      for (const p of pts) {
        const id = idOf(p)
        items.push(markerItem(id, p.position, p))
        entries.set(id, { kind: 'marker', marker: p })
      }
    }
    entriesRef.current = entries
    // Le regroupement vient de changer : l'index de `visualNodeOf` décrit l'état
    // précédent. Invalidé plutôt que reconstruit — personne ne le redemandera peut-être.
    nodeIndexRef.current = null
    core.setItems(items)
    // Signature bon marché du jeu d'entrées (clés triées + totaux de clusters +
    // version des données) : pendant un pan où le regroupement ne change pas,
    // le recompute à ~11 Hz ne re-rend PAS les portails.
    const parts: string[] = []
    for (const [k, e] of entries) parts.push(e.kind === 'cluster' ? `${k}:${e.cluster.total}` : String(k))
    parts.sort()
    const sig = `${pointsRevRef.current}|${parts.join(',')}`
    if (sig !== entriesSigRef.current) {
      entriesSigRef.current = sig
      bumpEntries()
    }
  }, [engine, leavesOf])

  // Recharge l'index de clustering et recalcule quand les points changent.
  useEffect(() => {
    const map = new Map<string | number, MarkerData<T>>()
    for (const p of points) map.set(latest.current.getId(p), p)
    pointsByIdRef.current = map
    pointsRevRef.current++
    clusterRef.current?.load(points)
    recompute()
    // Un marker supprimé ou masqué par le filtre tags sort de la sélection (prune).
    engine.selectables.itemsChanged()
    // L'inventaire de la loupe reflète les données courantes (post-filtre tags).
    engine.markers.itemsChanged()
  }, [points, recompute, engine])

  // Provider du registre de sélection : expose les markers individuels visibles
  // au marquee de l'outil sélection (ids MARKERS côté hôte — la clé de nœud
  // `pt:<id>` du clustering est traduite dans les deux sens).
  useEffect(() => {
    const toNodeId = (id: string | number) => (latest.current.cluster?.enabled ? markerEntryKey(id) : id)
    return engine.selectables.register({
      screenItems: () => {
        const core = coreRef.current
        if (!core) return []
        const out: SelectableScreenItem[] = []
        for (const it of core.screenPositions(engine.threeCamera)) {
          const entry = entriesRef.current.get(it.id)
          // Les clusters sont ignorés : seuls les markers individuellement
          // visibles sont sélectionnables au marquee.
          if (entry?.kind === 'marker') out.push({ id: latest.current.getId(entry.marker), x: it.x, y: it.y })
        }
        return out
      },
      setSelected: (ids) => {
        const nodeIds = new Set<string | number>()
        for (const id of ids) nodeIds.add(toNodeId(id))
        coreRef.current?.setMultiSelected(nodeIds)
      },
      info: (id) => {
        const p = pointsByIdRef.current.get(id)
        return p ? { type: p.type } : null
      },
    })
  }, [engine])

  // Fournisseur d'inventaire de l'outil loupe : TOUS les markers d'un cadre géo,
  // depuis les données sources (post-filtre tags) — donc clusters inclus, à la
  // différence du provider de sélection qui ne voit que les markers visibles.
  useEffect(() => {
    return engine.markers.register({
      markersInBounds: (bounds) => {
        const out: MarkerData<T>[] = []
        for (const p of latest.current.points) {
          if (boundsContains(bounds, p.position)) out.push(p)
        }
        return out
      },
      markerById: (id) => pointsByIdRef.current.get(id) ?? null,
      // Nœud visuel courant d'un marker : le cluster qui l'agrège, ou lui-même.
      // Répond depuis l'état de clustering DÉJÀ calculé — interroger ne déclenche
      // aucun recompute et ne change jamais le zoom.
      //
      // Passe par un index inverse construit À LA DEMANDE, et non par un balayage.
      // Le balayage était O(nœuds × membres) PAR APPEL, avec une matérialisation des
      // feuilles à chaque nœud visité ; l'appelant (une couche de relations) en émet
      // un par lien affiché, à chaque recalcul de ses visuels. L'index est invalidé
      // par le recompute et n'est reconstruit que si quelqu'un le redemande : sans
      // consommateur, il ne coûte rien du tout.
      visualNodeOf: (id) => {
        let index = nodeIndexRef.current
        if (!index) {
          index = new Map()
          for (const [nodeId, ges] of clusterMembersRef.current) {
            const entry = entriesRef.current.get(nodeId)
            const position = entry?.kind === 'cluster' ? entry.cluster.position : entry?.marker.position
            if (!position) continue
            const memberIds = leavesOf(ges).map((m) => latest.current.getId(m))
            // Un seul objet par nœud, partagé par tous ses membres.
            const node: VisualNode = { key: String(nodeId), position, memberIds }
            for (const memberId of memberIds) index.set(memberId, node)
          }
          nodeIndexRef.current = index
        }
        return index.get(id) ?? null
      },
    })
  }, [engine, leavesOf])

  // Fournisseur de recherche : une rubrique par TYPE présent, alimentée par
  // `MarkerData.title`. Part des mêmes `points` que le registre d'inventaire — donc
  // post-filtre « Couches » : ce qui est masqué sur la carte est introuvable, ce qui
  // évite de faire voler la caméra vers un marker que l'utilisateur ne verra pas.
  //
  // Un marker sans `title` est ÉCARTÉ, jamais indexé sous son id : proposer
  // « 7f3a-91b2 » dans une liste de résultats n'aide personne.
  useEffect(() => {
    return engine.search.register({
      query: (needle, opts) => {
        const { points, getId, menu, onSelect } = latest.current
        const perGroup = new Map<string, Hit<MarkerData<T>>[]>()
        for (const m of points) {
          if (!m.title) continue
          const group = markerGroupId(m.type)
          if (opts.group && opts.group !== group) continue
          const score = scoreMatch(normalizedTitle(m), needle)
          if (score === NO_MATCH) continue
          const distance = opts.origin ? proximityRank(m.position, opts.origin) : 0
          const bucket = perGroup.get(group)
          if (bucket) bucket.push({ item: m, score, distance })
          else perGroup.set(group, [{ item: m, score, distance }])
        }
        const entries: SearchEntry[] = []
        const totals = new Map<string, number>()
        // Les entrées (et leurs closures) ne sont construites qu'APRÈS la troncature :
        // une requête de deux lettres peut correspondre à des centaines de markers
        // dont six seulement seront affichés.
        for (const [group, hits] of perGroup) {
          totals.set(group, hits.length)
          for (const m of rankHits(hits, opts.limit)) {
            entries.push({
              group,
              id: getId(m),
              title: m.title!,
              titleColor: m.titleColor,
              // Pas de sous-titre de type : l'en-tête de rubrique le dit déjà, et le
              // répéter sur chaque ligne noierait le nom qu'on cherche à lire.
              position: m.position,
              avatar: m.avatar,
              icon: m.icon,
              color: markerColorOf(theme, m.type).base,
              // Le chemin EXACT d'un clic sur la carte : la couche signale, l'hôte
              // décide de `selectedId`. Court-circuiter reviendrait à inventer une
              // seconde sémantique de sélection.
              select: () => onSelect?.(m),
              menu: menu ? () => menu(m) : undefined,
            })
          }
        }
        return { entries, totals }
      },
    })
  }, [engine, theme, normalizedTitle])

  // Rubriques DÉCLARÉES (et non demandées) : `points` est remplacé à chaque tick d'un
  // flux temps réel, alors que les rubriques ne bougent quasiment jamais. Le registre
  // compare avant d'émettre, donc les abonnés ne se re-rendent que sur changement réel.
  useEffect(() => {
    const counts = new Map<string, SearchGroup>()
    for (const p of points) {
      if (!p.title) continue
      const id = markerGroupId(p.type)
      const prev = counts.get(id)
      if (prev) prev.count++
      else
        counts.set(id, {
          id,
          label: props.typeLabel?.(p.type) ?? p.type,
          color: markerColorOf(theme, p.type).base,
          count: 1,
        })
    }
    engine.search.report(searchSource, [...counts.values()])
  }, [engine, points, props.typeLabel, theme, searchSource])
  useEffect(() => () => engine.search.unreport(searchSource), [engine, searchSource])

  // Recalcule les clusters au déplacement caméra — UNIQUEMENT en mode clustering
  // (sans clustering les markers sont des CSS2DObject ancrés en 3D et suivent la
  // caméra tout seuls). Le recompute (supercluster + projection écran + binning) est
  // THROTTLÉ à ~11 Hz pendant un mouvement continu : les clusters restent ancrés en
  // 3D et suivent la carte à 60 fps, seul le RE-groupement tourne moins souvent. Un
  // appel de traîne garantit l'état final correct une fois la caméra immobile.
  useEffect(() => {
    if (!props.cluster?.enabled) return
    // `performance.markerRecomputeMs` — à relever sur un jeu de markers très dense,
    // à abaisser si le regroupement paraît traîner derrière la carte.
    const MIN_INTERVAL = latest.current.config.performance.markerRecomputeMs
    let lastRun = 0
    let trailing = 0
    const run = () => {
      trailing = 0
      lastRun = performance.now()
      recompute()
    }
    const onCamera = () => {
      const wait = MIN_INTERVAL - (performance.now() - lastRun)
      if (wait <= 0) {
        if (trailing) {
          clearTimeout(trailing)
          trailing = 0
        }
        run()
      } else if (!trailing) {
        trailing = window.setTimeout(run, wait)
      }
    }
    const off = engine.on('camera', onCamera)
    return () => {
      off()
      if (trailing) clearTimeout(trailing)
    }
  }, [engine, recompute, props.cluster?.enabled])

  // Sélection — réappliquée quand un nœud (ré)apparaît. En clustering les nœuds
  // sont keyés `pt:<id>` : l'id hôte doit être traduit.
  useEffect(() => {
    const id = props.selectedId ?? null
    coreRef.current?.setSelected(id != null && props.cluster?.enabled ? markerEntryKey(id) : id)
  }, [props.selectedId, props.cluster?.enabled, nodes])

  // Clic à côté de tout marker → sélection vidée, comme un menu se referme au clic
  // extérieur. L'event `click` du moteur ne porte QUE les clics carte : ceux qui
  // touchent un marker sont absorbés par son nœud DOM, et un outil de dessin actif
  // les consomme avant émission — donc aucune désélection parasite en cours de tracé.
  useEffect(() => engine.on('click', () => latest.current.onSelect?.(null)), [engine])

  // Taille de l'anneau de multi-sélection : le core la pose par nœud à la
  // création — ici seule la resynchronisation au changement de valeur.
  useEffect(() => {
    coreRef.current?.setSelectionRing(ringSize, avatarRing)
  }, [ringSize])

  // Relève le marker dont le menu est ouvert — ou survolé (infobulle) —
  // au-dessus des clusters/markers voisins (le CSS2DRenderer trie le z-index par
  // renderOrder), sinon la surface passe sous un voisin plus proche de la caméra.
  useEffect(() => {
    coreRef.current?.setRaised(openMenu ?? hoverId ?? null)
  }, [openMenu, hoverId, nodes])

  // Suivi caméra d'un marker/agent live (id hôte traduit en clé de nœud `pt:` en clustering).
  useEffect(() => {
    if (props.followId == null) return
    const nodeId = props.cluster?.enabled ? markerEntryKey(props.followId) : props.followId
    const stop = engine.camera.follow(() => coreRef.current?.getItemPosition(nodeId) ?? null)
    return stop
  }, [engine, props.followId, props.cluster?.enabled])

  /**
   * Tout geste qui ne vise pas le marker ouvert le referme — au `pointerdown`, donc
   * AVANT que le geste ne devienne un déplacement.
   *
   * L'événement `click` du moteur ne pouvait pas tenir ce rôle : il n'est émis que
   * si l'appui a démarré sur le CANVAS et que le pointeur a bougé de moins de 6 px
   * (cf. `MapEngine.onPointerUp`). Un drag de marker part de l'overlay DOM et
   * dépasse ce seuil — le menu survivait donc au déplacement, comme au pan et à la
   * molette.
   *
   * Le `contains` porte sur le CONTENEUR DE PORTAIL, qui abrite le marker ET son
   * menu : le re-clic sur le marker reste donc un toggle, et l'ouvreur n'a aucun
   * `stopPropagation` à semer — `useDismiss` promet précisément que ses hôtes n'en
   * ont pas besoin. Le point au sol, lui, est un FRÈRE de ce conteneur : le
   * repositionnement referme, ce qui est l'effet attendu.
   */
  const openNode = useMemo(
    () => ({ current: openMenu === null ? null : (nodes.get(openMenu) ?? null) }),
    [openMenu, nodes],
  )
  useDismiss(openNode, openMenu !== null, closeMenu, { wheel: true, captureEscape: true })

  // Saisie du marker OUVERT vers la dock : son `pointerdown` tombe dans le conteneur,
  // et le long-press neutralise le clic — ni `useDismiss` ni le toggle ne referment.
  // Le registre, lui, sait quand la charge décolle vraiment.
  useEffect(() => {
    if (openMenu === null) return
    return engine.drag.onChange(() => {
      if (engine.drag.active) closeMenu()
    })
  }, [engine, openMenu, closeMenu])

  /** Markers feuilles d'un nœud cluster, résolus à la demande (infobulle). */
  const leafMarkersOf = useCallback(
    (nodeId: string | number): MarkerData<T>[] => leavesOf(clusterMembersRef.current.get(nodeId) ?? []),
    [leavesOf],
  )

  const handleClick = useCallback(
    (id: string | number, entry: Entry<T>, ev: React.MouseEvent) => {
      if (entry.kind === 'cluster') {
        // La sélection tombe : entrer dans un cluster change de contexte, et le
        // marker sélectionné est peut-être DANS celui qu'on ouvre — son anneau
        // deviendrait invisible alors que l'état persisterait.
        props.onSelect?.(null)
        // Le clic sur un cluster ne fait ensuite QUE zoomer : vers le zoom
        // d'éclatement réel (supercluster) s'il est séparable, sinon juste au-delà
        // de l'arrêt du clustering — où l'auto-éventail du recompute prend le relais.
        // Toujours borné : fini le zoom infini dans le globe.
        const { maxZoom, spiderfyZoom } = latest.current
        const geo = clusterMembersRef.current.get(id) ?? []
        const soloCluster = geo.length === 1 && geo[0]!.kind === 'cluster' ? geo[0] : null
        const expansion = soloCluster ? (clusterRef.current?.expansionZoom(soloCluster.clusterId) ?? Infinity) : Infinity
        // Marge au-delà du zoom d'éclatement pour que la séparation soit nette.
        const openZoom = latest.current.config.interaction.clusterOpenZoom
        const targetZoom = Math.min(expansion <= maxZoom ? expansion + openZoom.expansion : maxZoom + openZoom.max, spiderfyZoom)
        engine.camera.flyTo(
          {
            lat: entry.cluster.position.lat,
            lng: entry.cluster.position.lng,
            altitude: altitudeForZoom(targetZoom),
          },
          { duration: theme.animations.clusterOpen },
        )
        return
      }
      // Premier clic sur un marker `new` : le sonar s'éteint (vu), quel que soit
      // le comportement déclenché ensuite (sélection, menu…).
      if (entry.marker.new) {
        const markerId = latest.current.getId(entry.marker)
        setSeenNew((prev) => (prev.has(markerId) ? prev : new Set(prev).add(markerId)))
      }
      // Outil sélection actif : le clic alimente la multi-sélection au lieu du
      // comportement hôte (onSelect/menu). Modificateurs transmis BRUTS —
      // leur sémantique (Maj = toggle) appartient à l'outil sélection.
      const consumer = engine.selectables.consumer
      if (consumer) {
        consumer.pick(latest.current.getId(entry.marker), ev)
        return
      }
      // Le clic = ACTIONS uniquement (sélection hôte, menu contextuel) —
      // l'information vit dans l'infobulle au survol.
      props.onSelect?.(entry.marker)
      const menuItems = props.menu?.(entry.marker)
      if (menuItems && menuItems.length > 0) setOpenMenu((cur) => (cur === id ? null : id))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, props.onSelect, props.menu],
  )

  // Data-URI d'icône par marker (clé = identité de l'objet, invalidé quand la
  // fabrique change) : l'encodage SVG (~1 Ko/marker) n'est payé qu'une fois par
  // donnée, pas à chaque rebuild des portails.
  const svgCacheRef = useRef(new WeakMap<object, string>())
  useEffect(() => {
    svgCacheRef.current = new WeakMap()
  }, [props.icon])

  const portals = useMemo(() => {
    const markerIconSrc = (m: MarkerData<T>): string => {
      let src = svgCacheRef.current.get(m)
      if (!src) {
        src = svgToDataUri(props.icon!(m))
        svgCacheRef.current.set(m, src)
      }
      return src
    }
    const out: ReactNode[] = []
    for (const [id, el] of nodes) {
      const entry = entriesRef.current.get(id)
      if (!entry) continue
      const size = entry.kind === 'cluster' ? clusterSize : markerSize
      const imgStyle: CSSProperties = {
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        display: 'block',
        cursor: 'pointer',
      }
      // Cluster : icône SVG custom si fournie, sinon `DefaultCluster` (cœur + satellites).
      // Marker : avatar (photo ronde cerclée couleur du type) PRIORITAIRE sur
      // l'icône SVG custom, sinon `DefaultMarker` (pastille + halo).
      const content: ReactNode =
        entry.kind === 'cluster'
          ? props.clusterIcon
            ? <img className="m3d-marker-img" src={svgToDataUri(props.clusterIcon(entry.cluster))} style={imgStyle} draggable={false} alt="" />
            : <DefaultCluster
                cluster={entry.cluster}
                theme={theme}
                typeIcon={props.clusterTypeIcon}
                typeLabel={props.clusterTypeLabel ?? props.typeLabel}
                satelliteTip={!props.clusterTooltip}
                onSegmentHover={props.clusterTooltip ? setHoverSegment : undefined}
              />
          : entry.marker.avatar
            ? <img
                className="m3d-marker-img m3d-marker-avatar"
                src={entry.marker.avatar}
                style={{ ...imgStyle, borderColor: markerColorOf(theme, entry.marker.type).base }}
                draggable={false}
                alt=""
                // Avatar introuvable (404, chemin cassé) → repli sur l'icône du type,
                // jamais une image cassée.
                onError={props.icon ? (e) => {
                  const img = e.currentTarget
                  img.classList.remove('m3d-marker-avatar')
                  img.style.borderColor = ''
                  img.src = markerIconSrc(entry.marker)
                } : undefined}
              />
            : props.icon
              ? <img className="m3d-marker-img" src={markerIconSrc(entry.marker)} style={imgStyle} draggable={false} alt="" />
              : <DefaultMarker marker={entry.marker as MarkerData} theme={theme} />
      // Menu : évalué SEULEMENT pour le nœud dont le menu est ouvert (l'appel
      // hôte alloue items + closures — pas pour N markers à chaque rebuild).
      const menuItems = openMenu === id && entry.kind === 'marker' ? props.menu?.(entry.marker) : undefined
      // Décorations d'attention (pointer-events:none, centrées sur l'ancre) :
      // viseur rouge tant que `urgent` ; sonar tant que `new` n'a pas été cliqué.
      // Jamais les deux : l'urgence PRIME sur la nouveauté.
      const showTarget = entry.kind === 'marker' && entry.marker.urgent === true
      const showSonar =
        !showTarget &&
        entry.kind === 'marker' &&
        entry.marker.new === true &&
        !seenNew.has(latest.current.getId(entry.marker))
      // Infobulle au survol : title/content ReactNode fournis par l'hôte —
      // marker OU cluster (avec la liste des markers contenus, résolue ici).
      // Masquée dès qu'un menu ou une popup est ouvert — jamais deux surfaces
      // empilées au même endroit.
      const hovered = hoverId === id && openMenu !== id
      // Part du donut survolée → infobulle restreinte au type ; cœur → globale.
      const segment = entry.kind === 'cluster' ? hoverSegment : null
      const tip = !hovered
        ? null
        : entry.kind === 'marker'
          ? // La prop décide seule quand elle existe (son `null` doit rester un refus,
            // pas une invitation à retomber sur la donnée).
            props.tooltip
            ? props.tooltip(entry.marker)
            : tipFromData(entry.marker)
          : props.clusterTooltip
            ? segment == null
              ? props.clusterTooltip(entry.cluster, leafMarkersOf(id))
              : props.clusterTooltip(
                  entry.cluster,
                  leafMarkersOf(id).filter((m) => m.type === segment),
                  segment,
                )
            : null
      const hoverable =
        entry.kind === 'marker' ? !!props.tooltip || hasOwnTip(entry.marker) : !!props.clusterTooltip
      // Ancrage de l'infobulle : au-dessus du VISUEL réel — donut du cluster par
      // défaut (rayon dépendant du total) ou pastille du marker.
      const tipLift =
        entry.kind === 'cluster' && !props.clusterIcon
          ? defaultClusterRadius(entry.cluster.total, theme) + 10
          : size / 2 + 10
      // La prop de couche, si fournie, prime sur le drapeau porté par la donnée —
      // sinon c'est le marker lui-même qui décide (cas courant : un seul point
      // éditable au milieu de markers en lecture seule).
      const isRepositionable =
        entry.kind === 'marker' &&
        (props.repositionable === undefined
          ? !!entry.marker.repositionable
          : typeof props.repositionable === 'function'
            ? props.repositionable(entry.marker)
            : props.repositionable)
      // Les deux gestes cohabitent : le repositionnement part du POINT AU SOL, la
      // saisie vers la dock part de l'ICÔNE. Plus d'exclusion mutuelle à faire.
      const isDraggable =
        entry.kind === 'marker' &&
        (typeof props.draggable === 'function' ? props.draggable(entry.marker) : !!props.draggable)
      out.push(
        createPortal(
          <>
            <MarkerContent
              isMarker={entry.kind === 'marker'}
              draggable={isDraggable}
              repositionable={isRepositionable}
              leaderLine={props.leaderLine ?? true}
              layer={coreRef.current}
              onRepositionStart={closeMenu}
              onReposition={
                entry.kind === 'marker' && isRepositionable
                  ? (ll) => latest.current.onReposition?.(entry.marker, ll)
                  : undefined
              }
              onRepositionMove={
                entry.kind === 'marker' && isRepositionable
                  ? (ll) => latest.current.onRepositionMove?.(entry.marker, ll)
                  : undefined
              }
              markerId={entry.kind === 'marker' ? latest.current.getId(entry.marker) : id}
              nodeKey={id}
              markerData={entry.kind === 'marker' ? entry.marker : null}
              ghost={content}
              onClick={(e) => handleClick(id, entry, e)}
              onHoverEnter={hoverable ? () => setHoverId(id) : undefined}
              onHoverLeave={
                hoverable
                  ? () => {
                      setHoverId((cur) => (cur === id ? null : cur))
                      setHoverSegment(null)
                    }
                  : undefined
              }
            >
              {showSonar && <span className="m3d-sonar" />}
              {showTarget && (
                <span className="m3d-target">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              )}
              {content}
            </MarkerContent>
            {hasTipContent(tip) && (
              <MarkerTip
                title={tip?.title}
                content={tip?.content}
                // Urgence : style rouge dédié, immédiatement distinct des autres.
                className={showTarget ? 'm3d-markertip-urgent' : undefined}
                style={{ '--m3d-tiplift': `${tipLift}px` } as CSSProperties}
              />
            )}
            {menuItems && menuItems.length > 0 && (
              <div className="m3d-menu">
                <ContextMenu items={menuItems} onClose={closeMenu} />
              </div>
            )}
          </>,
          el,
          String(id),
        ),
      )
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nodes,
    entriesRev,
    theme,
    openMenu,
    hoverId,
    hoverSegment,
    seenNew,
    props.icon,
    props.clusterIcon,
    props.clusterTypeIcon,
    props.clusterTypeLabel,
    props.menu,
    props.tooltip,
    props.clusterTooltip,
    props.draggable,
    handleClick,
    markerSize,
    clusterSize,
    ringSize,
  ])

  return <>{portals}</>
}

/**
 * Zone de contenu d'un marker/cluster : porte le clic (sélection/menu), le survol
 * (infobulle) et, pour les markers, la **saisie au long-press** (`useDraggable`).
 * Composant à part — et non `<div>` inline — parce que `useDraggable` est un hook :
 * chaque nœud a ainsi son propre état de geste (timer, nettoyage). Le hook est
 * toujours appelé (`disabled` selon `draggable`) pour respecter l'ordre des hooks.
 */
function MarkerContent<T>({
  isMarker,
  draggable,
  repositionable,
  leaderLine,
  layer,
  onRepositionStart,
  onReposition,
  onRepositionMove,
  markerId,
  nodeKey,
  markerData,
  ghost,
  onClick,
  onHoverEnter,
  onHoverLeave,
  children,
}: {
  isMarker: boolean
  draggable: boolean
  repositionable: boolean
  /** La couche dessine-t-elle la tige + le point au sol ? (cf. `surLeDot`) */
  leaderLine: boolean
  layer: CoreMarkerLayer | null
  /** Le geste est devenu un déplacement (seuil franchi) — cf. `useRepositionable`. */
  onRepositionStart?: () => void
  onReposition?: (latLng: LatLng) => void
  onRepositionMove?: (latLng: LatLng) => void
  markerId: string | number
  /**
   * Clé du nœud dans la couche — `pt:<id>` sous clustering, l'id brut sinon. Distincte
   * de `markerId` (l'id HÔTE, qui voyage dans la charge du drag) : c'est elle que la
   * couche connaît, donc la seule qui permette de déplacer le bon nœud.
   */
  nodeKey: string | number
  markerData: MarkerData<T> | null
  ghost: ReactNode
  onClick: (e: React.MouseEvent) => void
  onHoverEnter?: () => void
  onHoverLeave?: () => void
  children: ReactNode
}) {
  const drag = useDraggable({
    payload: { type: 'marker', id: markerId, data: markerData ?? undefined },
    ghost,
    disabled: !draggable,
  })
  // Comme `useDraggable` : toujours appelé, désactivé par `disabled`, pour ne pas
  // rompre l'ordre des hooks quand un marker devient (non) repositionnable.
  const move = useRepositionable({
    // La CLÉ DU NŒUD, pas l'id hôte : sous clustering les nœuds sont keyés
    // `pt:<id>`, et `moveItemNow` sur un id inconnu sortait sans rien faire — le
    // marker ne suivait alors le curseur qu'au relâchement, une fois les données de
    // l'hôte mises à jour.
    id: nodeKey,
    layer,
    disabled: !repositionable,
    onStart: onRepositionStart,
    onMove: onRepositionMove,
    onDrop: onReposition,
  })
  /**
   * Le repositionnement est porté par le POINT AU SOL, pas par l'icône : déplacer un
   * marker consiste à déplacer son point d'ancrage (précis), tandis que l'icône garde
   * le geste commun à tous les markers — la saisie au long-press vers la dock.
   *
   * Le point est créé par la couche core (hors React) : le handler du hook lui est
   * donc attaché à la main. Il ne lit que `currentTarget`, `clientX/Y`, `pointerType`
   * et `button`, tous présents sur un `PointerEvent` natif.
   */
  const rootRef = useRef<HTMLDivElement>(null)
  /**
   * Sans tige (`leaderLine={false}`), il n'y a pas de point au sol : le geste
   * retombe alors sur le CONTENU, sinon le marker ne serait plus déplaçable du tout.
   *
   * DÉDUIT de la prop, pas sondé : la couche ne crée le point que si `leaderLine`
   * (cf. `layers/MarkerLayer.createNode`). Un `useState` posé depuis l'effet coûtait
   * un second rendu par marker repositionnable au montage — systématique pour les
   * symboles, qui le sont tous — et pouvait mentir si la sonde tombait avant que le
   * core n'ait bâti le nœud.
   */
  const surLeDot = repositionable && leaderLine
  useEffect(() => {
    if (!surLeDot) return
    // Le point est un FRÈRE du conteneur de portail, dans `.m3d-marker-anchor`.
    const dot = rootRef.current?.closest('.m3d-marker-anchor')?.querySelector<HTMLElement>('.m3d-marker-dot')
    if (!dot) return
    const onDown = (e: PointerEvent) => moveRef.current(e as unknown as ReactPointerEvent)
    dot.classList.add('m3d-repositionable')
    dot.addEventListener('pointerdown', onDown)
    return () => {
      dot.classList.remove('m3d-repositionable')
      dot.removeEventListener('pointerdown', onDown)
    }
  }, [surLeDot])

  const moveRef = useRef(move.onPointerDown)
  moveRef.current = move.onPointerDown

  const className = [
    isMarker ? 'm3d-marker-content' : '',
    draggable ? drag.className : '',
    repositionable && !surLeDot ? move.className : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={rootRef}
      className={className || undefined}
      onPointerDown={
        repositionable && !surLeDot ? move.onPointerDown : draggable ? drag.onPointerDown : undefined
      }
      onClick={onClick}
      onPointerEnter={onHoverEnter}
      onPointerLeave={onHoverLeave}
    >
      {children}
    </div>
  )
}

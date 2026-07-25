import { type CSSProperties, type ReactNode, useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { altitudeForZoom } from '../../core/MapEngine'
import type { SelectableScreenItem } from '../../core/Selectables'
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
import type { DataSource, MarkerData } from '../../data/types'
import { useLiveData } from '../hooks/useLiveData'
import { useTagSelection } from '../hooks/useTags'
import { useDraggable } from '../hooks/useDraggable'
import { useMapContext } from '../context'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { DefaultCluster, defaultClusterRadius } from './DefaultCluster'
import { DefaultMarker } from './DefaultMarker'

export type MarkerLayerProps<T> = {
  points?: MarkerData<T>[]
  /** Source viewport-driven (rechargée au déplacement, gate `minZoom`). */
  source?: DataSource<MarkerData<T>>
  getId?: (p: MarkerData<T>) => string | number
  cluster?: { enabled: boolean; radius?: number; minPoints?: number }
  /** Icône **SVG** (markup) d'un marker, rendue en `<img>` DOM ancrée à la carte. */
  icon?: (p: MarkerData<T>) => string
  /** Icône **SVG** (markup) d'un cluster. */
  clusterIcon?: (c: ClusterInfo) => string
  /** Icône d'un type (fragment SVG viewBox `0 0 24 24`, `currentColor`) pour les satellites du cluster. */
  clusterTypeIcon?: (type: string) => ReactNode
  /** Libellé lisible d'un type, pour l'infobulle au survol d'un satellite. */
  clusterTypeLabel?: (type: string) => string
  /**
   * Infobulle au survol d'un marker : `title` et `content` acceptent tout
   * ReactNode (texte, HTML, composants — avatar, badges…). `null` = pas
   * d'infobulle pour ce marker. L'info vit AU SURVOL — le clic est réservé aux
   * actions (menu contextuel, sélection).
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
  menu?: (p: MarkerData<T>) => MenuItem[]
  selectedId?: string | number
  followId?: string | number
  onSelect?: (p: MarkerData<T>) => void
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
}

type Entry<T> =
  | { kind: 'marker'; marker: MarkerData<T> }
  | { kind: 'cluster'; cluster: ClusterInfo }


const svgToDataUri = (svg: string): string =>
  svg.startsWith('data:') ? svg : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

export function MarkerLayer<T>(props: MarkerLayerProps<T>) {
  const { engine, theme } = useMapContext()
  const getId = props.getId ?? ((p: MarkerData<T>) => p.id)

  const { data: sourceData } = useLiveData<MarkerData<T>>(props.source)
  const rawPoints = props.points ?? sourceData

  // Tags garantis : un marker sans tags reçoit `['marker', type]` (miroir du défaut
  // `['draw', kind]` des dessins) — sans quoi il disparaît dès qu'un filtre est
  // actif. Identité ET allocation évitées dans le cas courant « tout est taggé »
  // (flux temps réel : un tick de données ne coûte rien ici).
  const allPoints = useMemo(() => {
    if (!rawPoints.some((p) => !p.tags)) return rawPoints
    return rawPoints.map((p) => (p.tags ? p : { ...p, tags: ['marker', p.type] }))
  }, [rawPoints])

  // Filtre « Couches » : appliqué AVANT le clustering (les clusters reflètent le
  // filtre). Recalculé uniquement au changement des points ou de la sélection.
  const tagFilter = useTagSelection()
  const points = useMemo(
    () => (tagFilter.isActive ? allPoints.filter((p) => tagFilter.isVisible(p.tags)) : allPoints),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allPoints, tagFilter.selectionVersion],
  )

  // Registre du panneau « Couches » : tags portés par TOUS les points (même masqués).
  const tagSource = useId()
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

  const [nodes, setNodes] = useState<Map<string | number, HTMLDivElement>>(new Map())
  const [openMenu, setOpenMenu] = useState<string | number | null>(null)
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

  const maxZoom = theme.clustering.maxZoom
  const spiderfyZoom = theme.clustering.spiderfyZoom ?? 19
  const clusterRadius = props.cluster?.radius ?? theme.clustering.radius
  const latest = useRef({ points, getId, cluster: props.cluster, clusterRadius, ringSize, maxZoom, spiderfyZoom })
  latest.current = { points, getId, cluster: props.cluster, clusterRadius, ringSize, maxZoom, spiderfyZoom }

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
    core.setSelectionRing(latest.current.ringSize)
    engine.addLayer(core)
    coreRef.current = core
    return () => {
      engine.removeLayer(core)
      coreRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  // Moteur de clustering (supercluster).
  useEffect(() => {
    if (!props.cluster?.enabled) {
      clusterRef.current = null
      return
    }
    clusterRef.current = new ClusterEngine({
      radius: props.cluster.radius ?? theme.clustering.radius,
      minPoints: props.cluster.minPoints ?? theme.clustering.minPoints,
      maxZoom: theme.clustering.maxZoom,
    })
    return () => {
      clusterRef.current = null
    }
  }, [props.cluster?.enabled, props.cluster?.radius, props.cluster?.minPoints, theme.clustering])

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
          items.push({ id: solo.key, position: solo.position })
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
      if (view.zoom >= clusterMaxZoom - 0.05) {
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
          const slots = spiderfyLayout(leaves.length, entry.cluster.position, view.zoom, ringSize)
          leaves.forEach((m, i) => {
            const mkey = markerEntryKey(idOf(m))
            items.push({ id: mkey, position: slots[i]!.position, animateEnter: false })
            entries.set(mkey, { kind: 'marker', marker: m })
          })
        }
        if (exploded.size) items = items.filter((it) => !exploded.has(it.id))
      }
    } else {
      for (const p of pts) {
        const id = idOf(p)
        items.push({ id, position: p.position })
        entries.set(id, { kind: 'marker', marker: p })
      }
    }
    entriesRef.current = entries
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

  // Recalcule les clusters au déplacement caméra — UNIQUEMENT en mode clustering
  // (sans clustering les markers sont des CSS2DObject ancrés en 3D et suivent la
  // caméra tout seuls). Le recompute (supercluster + projection écran + binning) est
  // THROTTLÉ à ~11 Hz pendant un mouvement continu : les clusters restent ancrés en
  // 3D et suivent la carte à 60 fps, seul le RE-groupement tourne moins souvent. Un
  // appel de traîne garantit l'état final correct une fois la caméra immobile.
  useEffect(() => {
    if (!props.cluster?.enabled) return
    const MIN_INTERVAL = 90
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

  // Taille de l'anneau de multi-sélection : le core la pose par nœud à la
  // création — ici seule la resynchronisation au changement de valeur.
  useEffect(() => {
    coreRef.current?.setSelectionRing(ringSize)
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

  // Ferme le menu au clic sur le fond de carte ou Échap.
  useEffect(() => {
    const off = engine.on('click', () => setOpenMenu(null))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [engine])

  /** Markers feuilles d'un nœud cluster, résolus à la demande (infobulle). */
  const leafMarkersOf = useCallback(
    (nodeId: string | number): MarkerData<T>[] => leavesOf(clusterMembersRef.current.get(nodeId) ?? []),
    [leavesOf],
  )

  const handleClick = useCallback(
    (id: string | number, entry: Entry<T>, ev: React.MouseEvent) => {
      if (entry.kind === 'cluster') {
        // Le clic sur un cluster ne fait QUE zoomer : vers le zoom d'éclatement
        // réel (supercluster) s'il est séparable, sinon juste au-delà de l'arrêt
        // du clustering — où l'auto-éventail du recompute prend le relais.
        // Toujours borné : fini le zoom infini dans le globe.
        const { maxZoom, spiderfyZoom } = latest.current
        const geo = clusterMembersRef.current.get(id) ?? []
        const soloCluster = geo.length === 1 && geo[0]!.kind === 'cluster' ? geo[0] : null
        const expansion = soloCluster ? (clusterRef.current?.expansionZoom(soloCluster.clusterId) ?? Infinity) : Infinity
        // Marge au-delà du zoom d'éclatement pour que la séparation soit nette.
        const targetZoom = Math.min(expansion <= maxZoom ? expansion + 0.3 : maxZoom + 0.5, spiderfyZoom)
        engine.camera.flyTo(
          {
            lat: entry.cluster.position.lat,
            lng: entry.cluster.position.lng,
            altitude: altitudeForZoom(targetZoom),
          },
          { duration: 0.6 },
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
                typeLabel={props.clusterTypeLabel}
                satelliteTip={!props.clusterTooltip}
                onSegmentHover={props.clusterTooltip ? setHoverSegment : undefined}
              />
          : entry.marker.avatar
            ? <img
                className="m3d-marker-img m3d-marker-avatar"
                src={entry.marker.avatar}
                style={{ ...imgStyle, borderColor: (theme.colors.marker[entry.marker.type] ?? theme.colors.marker.default!).base }}
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
          ? props.tooltip?.(entry.marker)
          : props.clusterTooltip
            ? segment == null
              ? props.clusterTooltip(entry.cluster, leafMarkersOf(id))
              : props.clusterTooltip(
                  entry.cluster,
                  leafMarkersOf(id).filter((m) => m.type === segment),
                  segment,
                )
            : null
      const hoverable = entry.kind === 'marker' ? !!props.tooltip : !!props.clusterTooltip
      // Ancrage de l'infobulle : au-dessus du VISUEL réel — donut du cluster par
      // défaut (rayon dépendant du total) ou pastille du marker.
      const tipLift =
        entry.kind === 'cluster' && !props.clusterIcon
          ? defaultClusterRadius(entry.cluster.total) + 10
          : size / 2 + 10
      const isDraggable =
        entry.kind === 'marker' &&
        (typeof props.draggable === 'function' ? props.draggable(entry.marker) : !!props.draggable)
      out.push(
        createPortal(
          <>
            <MarkerContent
              isMarker={entry.kind === 'marker'}
              draggable={isDraggable}
              markerId={entry.kind === 'marker' ? latest.current.getId(entry.marker) : id}
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
            {tip && (tip.title != null || tip.content != null) && (
              <div
                // Urgence : style rouge dédié, immédiatement distinct des autres.
                className={`m3d-markertip${showTarget ? ' m3d-markertip-urgent' : ''}`}
                style={{ '--m3d-tiplift': `${tipLift}px` } as CSSProperties}
              >
                {tip.title != null && <div className="m3d-markertip-title">{tip.title}</div>}
                {tip.content != null && <div className="m3d-markertip-content">{tip.content}</div>}
              </div>
            )}
            {menuItems && menuItems.length > 0 && (
              <div className="m3d-menu">
                <ContextMenu items={menuItems} onClose={() => setOpenMenu(null)} />
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
  markerId,
  markerData,
  ghost,
  onClick,
  onHoverEnter,
  onHoverLeave,
  children,
}: {
  isMarker: boolean
  draggable: boolean
  markerId: string | number
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
  const className = [isMarker ? 'm3d-marker-content' : '', draggable ? drag.className : ''].filter(Boolean).join(' ')
  return (
    <div
      className={className || undefined}
      onPointerDown={draggable ? drag.onPointerDown : undefined}
      onClick={onClick}
      onPointerEnter={onHoverEnter}
      onPointerLeave={onHoverLeave}
    >
      {children}
    </div>
  )
}

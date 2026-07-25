import { type CSSProperties, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { countTags } from '../../core/TagFilter'
import { MarkerLayer as CoreMarkerLayer, type OverlayItem } from '../../layers/MarkerLayer'
import { ClusterEngine, type ClusterEntry, type ClusterInfo, clusterInfoFromCounts } from '../../layers/ClusterLayer'
import type { LatLng } from '../../shared'
import type { DataSource, MarkerData } from '../../data/types'
import { useLiveData } from '../hooks/useLiveData'
import { useTagSelection } from '../hooks/useTags'
import { useMapContext } from '../context'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { DefaultCluster } from './DefaultCluster'
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
  renderPopup?: (p: MarkerData<T>) => ReactNode
  menu?: (p: MarkerData<T>) => MenuItem[]
  selectedId?: string | number
  followId?: string | number
  onSelect?: (p: MarkerData<T>) => void
  /** Diamètre (px) du marker (défaut: `theme.markers.size`). */
  size?: number
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
  const allPoints = props.points ?? sourceData

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

  const [nodes, setNodes] = useState<Map<string | number, HTMLDivElement>>(new Map())
  const [openMenu, setOpenMenu] = useState<string | number | null>(null)
  const [openPopup, setOpenPopup] = useState<string | number | null>(null)

  const markerSize = props.size ?? theme.markers.size
  const clusterSize = Math.round(markerSize * 1.18)

  const latest = useRef({ points, getId, cluster: props.cluster })
  latest.current = { points, getId, cluster: props.cluster }

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

  const recompute = useCallback(() => {
    const core = coreRef.current
    if (!core) return
    const { points: pts, getId: idOf } = latest.current
    const byId = new Map<string | number, MarkerData<T>>()
    for (const p of pts) byId.set(idOf(p), p)

    const items: OverlayItem[] = []
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
      const mergePx = latest.current.cluster?.radius ?? 60
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
        }
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
  }, [engine])

  // Recharge l'index de clustering et recalcule quand les points changent.
  useEffect(() => {
    clusterRef.current?.load(points)
    recompute()
  }, [points, recompute])

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

  // Sélection — réappliquée quand un nœud (ré)apparaît.
  useEffect(() => {
    coreRef.current?.setSelected(props.selectedId ?? null)
  }, [props.selectedId, nodes])

  // Relève le marker dont le menu/popup est ouvert au-dessus des clusters/markers
  // voisins (le CSS2DRenderer trie le z-index par renderOrder), sinon le menu passe
  // sous un cluster plus proche de la caméra.
  useEffect(() => {
    coreRef.current?.setRaised(openMenu ?? openPopup ?? null)
  }, [openMenu, openPopup, nodes])

  // Suivi caméra d'un marker/agent live.
  useEffect(() => {
    if (props.followId == null) return
    const stop = engine.camera.follow(() => coreRef.current?.getItemPosition(props.followId!) ?? null)
    return stop
  }, [engine, props.followId])

  // Ferme menu/popup au clic sur le fond de carte ou Échap.
  useEffect(() => {
    const off = engine.on('click', () => {
      setOpenMenu(null)
      setOpenPopup(null)
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null)
        setOpenPopup(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [engine])

  const handleClick = useCallback(
    (id: string | number, entry: Entry<T>) => {
      if (entry.kind === 'cluster') {
        // Zoom vers le cluster : altitude divisée pour rapprocher.
        const altitude = engine.camera.getState().altitude
        engine.camera.flyTo(
          { lat: entry.cluster.position.lat, lng: entry.cluster.position.lng, altitude: altitude * 0.45 },
          { duration: 0.6 },
        )
        return
      }
      props.onSelect?.(entry.marker)
      const menuItems = props.menu?.(entry.marker)
      if (menuItems && menuItems.length > 0) {
        setOpenMenu((cur) => (cur === id ? null : id))
        setOpenPopup(null)
      } else if (props.renderPopup) {
        setOpenPopup((cur) => (cur === id ? null : id))
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, props.onSelect, props.menu, props.renderPopup],
  )

  const portals = useMemo(() => {
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
      // Marker : icône SVG custom si fournie, sinon `DefaultMarker` (pastille + halo).
      const content: ReactNode =
        entry.kind === 'cluster'
          ? props.clusterIcon
            ? <img className="m3d-marker-img" src={svgToDataUri(props.clusterIcon(entry.cluster))} style={imgStyle} draggable={false} alt="" />
            : <DefaultCluster cluster={entry.cluster} theme={theme} typeIcon={props.clusterTypeIcon} typeLabel={props.clusterTypeLabel} />
          : props.icon
            ? <img className="m3d-marker-img" src={svgToDataUri(props.icon(entry.marker))} style={imgStyle} draggable={false} alt="" />
            : <DefaultMarker marker={entry.marker as MarkerData} theme={theme} />
      const menuItems = entry.kind === 'marker' ? props.menu?.(entry.marker) : undefined
      out.push(
        createPortal(
          <>
            <div onClick={() => handleClick(id, entry)}>{content}</div>
            {openMenu === id && menuItems && menuItems.length > 0 && (
              <div className="m3d-menu">
                <ContextMenu items={menuItems} onClose={() => setOpenMenu(null)} />
              </div>
            )}
            {openPopup === id && entry.kind === 'marker' && props.renderPopup && (
              <div className="m3d-popup">
                <div className="m3d-popup-inner">{props.renderPopup(entry.marker)}</div>
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
    theme,
    openMenu,
    openPopup,
    props.icon,
    props.clusterIcon,
    props.clusterTypeIcon,
    props.clusterTypeLabel,
    props.menu,
    props.renderPopup,
    handleClick,
    markerSize,
    clusterSize,
  ])

  return <>{portals}</>
}

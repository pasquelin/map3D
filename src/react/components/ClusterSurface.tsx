import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { ClusterContributor, ClusterPoint } from '../../core/ClusterRegistry'
import { WORLD_BOUNDS } from '../../core/bounds'
import { altitudeForZoom } from '../../core/MapEngine'
import type { VisualNode } from '../../core/MarkerQuery'
import * as THREE from 'three'
import type { MarkerLayer as CoreMarkerLayer, OverlayItem } from '../../layers/MarkerLayer'
import type { ScreenPoint } from '../../core/Projection'
import type { SelectableGeometry, SelectableScreenItem } from '../../core/Selectables'
import { isWithinViewDistance } from '../../layers/markerCull'
import {
  ClusterEngine,
  type ClusterEntry,
  type ClusterInfo,
  clusterInfoFromCounts,
  spiderfyLayout,
} from '../../layers/ClusterLayer'
import type { MarkerData } from '../../data/types'
import { formatCount } from '../../labels/mergeLabels'
import type { LatLng } from '../../shared'
import { useConfig, useLabels, useMapContext } from '../context'
import { useEntriesSignature } from '../hooks/useEntriesSignature'
import { useOverlayLayer } from '../hooks/useOverlayLayer'
import { useGroundedView } from '../hooks/usePedestrian'
import { LEADER_LIFT_PX } from '../../style/css/markers'
import { DefaultCluster, defaultClusterRadius } from './DefaultCluster'
import { hasTipContent, MarkerTip } from './MarkerTip'
import { svgToDataUri } from './MarkerLayer'
import { MarkerContent } from './MarkerContent'

// Scratch de projection des pastilles pour le registre de sélection (chemin froid,
// synchrone) : réutilisés à travers tout le module, jamais aliasés entre deux lectures.
const clusterScratchVec = new THREE.Vector3()
const clusterScratchScreen: ScreenPoint = { sx: 0, sy: 0, z: 0 }

/** Apparence et contenu d'une pastille — cf. `ClusterSurfaceProps`. */
export type ClusterChrome<T = unknown> = {
  /** Icône **SVG** (markup) d'une pastille, à la place du camembert. */
  icon?: (c: ClusterInfo) => string
  /** Icône d'un type (fragment SVG viewBox `0 0 24 24`, `currentColor`) dans sa part. */
  typeIcon?: (type: string) => ReactNode
  /** Nom lisible d'un type, pour l'infobulle d'une part. */
  typeLabel?: (type: string) => string
  /**
   * Infobulle d'une pastille. `segmentType` est renseigné quand le survol porte sur
   * UNE part : l'hôte peut alors ne lister que les markers de ce type.
   */
  tooltip?: (
    cluster: ClusterInfo,
    members: MarkerData<T>[],
    segmentType?: string,
  ) => {
    title?: ReactNode
    content?: ReactNode
  } | null
}

export type ClusterSurfaceProps = {
  /** Coupe le regroupement pour toute la carte. */
  enabled?: boolean
  /** Diamètre (px) d'une pastille. Défaut : `theme.markers.size × 1.18`. */
  size?: number
} & ClusterChrome

/** Ce qu'un nœud de la surface porte : toujours un cluster (les markers isolés
 *  restent posés par leur couche, avec leur chrome). */
type Node = { cluster: ClusterInfo; members: ClusterEntry[] }

/**
 * Surface de regroupement de la carte.
 *
 * **Un cluster est une propriété de la CARTE, pas d'une couche.** Tant que chaque
 * couche regroupait ses propres points, un symbole posé restait affiché seul à côté —
 * voire par-dessus — la pastille de la couche voisine, qui pour lui n'existait pas.
 * Cette surface tient donc l'unique index, alimenté par toutes les couches inscrites
 * à `engine.clusters`, et rend les pastilles.
 *
 * Le partage des rôles est net : la surface décide **où est le regroupement**, chaque
 * couche décide **à quoi ressemblent ses markers** (icône, menu, infobulle, drag). Une
 * couche ne pose donc que ce que la surface lui rend — les autres points sont dans une
 * pastille.
 */
export function ClusterSurface({ enabled = true, size, ...chrome }: ClusterSurfaceProps) {
  const { engine, theme } = useMapContext()
  const config = useConfig()
  const labels = useLabels()
  const clustering = config.clustering
  /**
   * Au ras du sol, il ne reste du regroupement que le DÉCLUTTER ÉCRAN — et c'est justement
   * celui qui a un sens à hauteur d'homme : ce qui se superpose à l'œil devient une
   * pastille, où que soient les points. Les deux autres sont coupés ici :
   *
   * — le regroupement GÉOGRAPHIQUE, parce que la proximité au sol ne dit rien de ce qu'on
   *   voit : deux points distants de vingt mètres se confondent à huit cents mètres et se
   *   séparent nettement à cinq. Seule la distance à l'œil compte, et c'est le déclutter
   *   qui la mesure ;
   * — l'auto-ÉVENTAIL, dont le rayon sort de `metersPerPixelAtZoom`, résolution d'une carte
   *   2D SOUS la caméra, qui ne dit rien de la distance d'un marker en vue rasante (elle va
   *   d'un mètre à la portée de vue). Il écarterait de quelques centimètres, ~1 px à l'écran.
   */
  const grounded = useGroundedView()

  const engineRef = useRef<ClusterEngine | null>(null)
  /** Points contribués par uid — résout les feuilles sans repasser par les couches. */
  const byUidRef = useRef(new Map<string, ClusterPoint>())
  /** Révision des données de clustering — graine de la signature d'entrées. */
  const dataRevRef = useRef(0)
  const nodesRef = useRef(new Map<string | number, Node>())
  /** Index `id de marker → nœud visuel`, construit À LA DEMANDE (cf. `visualNodeOf`). */
  const visualIndexRef = useRef<Map<string | number, VisualNode> | null>(null)

  const [hoverId, setHoverId] = useState<string | number | null>(null)
  const [hoverSegment, setHoverSegment] = useState<string | null>(null)
  // Clés (String) des pastilles sélectionnées — alimente la silhouette d'union de
  // l'overlay (`selectedContours` ci-dessous), plus aucun anneau CSS. En REF, pas en
  // state : le pointillé est peint par la passe projection de `SelectionOverlay`, pas
  // par un rendu React, donc une sélection ne doit plus re-rendre les portails.
  // Best-effort : une pastille est éphémère (recompute), donc l'anneau peut disparaître
  // au pan ; la sélection, elle, persiste par les markers enfants (cf. DrawLayer).
  const selectedKeysRef = useRef<ReadonlySet<string>>(new Set())
  // Dernier set de sélection reçu (membres effectifs + clés de groupe) — mémorisé pour
  // RÉÉVALUER quelles pastilles sont sélectionnées après chaque recompute : le zoom
  // recrée les pastilles (nouvelles clés) sans repasser par `setSelected`, et une pastille
  // qui vient d'absorber des markers sélectionnés doit en hériter (union sur la pastille).
  const appliedIdsRef = useRef<ReadonlySet<string | number>>(new Set())
  const [rev, signature] = useEntriesSignature()

  const clusterSize = size ?? Math.round(theme.markers.size * theme.clusters.sizeRatio)
  const latest = useRef({ chrome, clustering, config, theme, clusterSize, grounded })
  latest.current = { chrome, clustering, config, theme, clusterSize, grounded }
  // Ref pour le provider de sélection : garder ses deps stables ([engine, leavesOf])
  // tout en lisant des libellés à jour au moment (froid) où l'info d'un cluster est lue.
  const labelsRef = useRef(labels)
  labelsRef.current = labels

  // Couche DOM dédiée aux pastilles : les markers gardent la leur (cf. `useOverlayLayer`).
  const { layerRef: coreRef, nodes: els } = useOverlayLayer(
    useCallback((core: CoreMarkerLayer) => {
      core.leaderLine = true
    }, []),
    // Ces nœuds sont des PASTILLES, pas des markers : les compter comme des markers
    // ferait annoncer au panneau un contenu que la carte n'a pas.
    'clusters',
  )

  /**
   * Visite les markers feuilles d'un jeu d'entrées géo — UNIQUE implémentation
   * (placement, infobulle, index de nœuds visuels). Ne lit que des refs.
   *
   * Visite plutôt que rend un tableau : le placement l'appelle pour CHAQUE pastille à
   * chaque recompute (~11 Hz en mouvement), et n'a besoin que de parcourir. Seuls
   * l'éventail et l'infobulle — rares, et déclenchés par un geste — matérialisent.
   */
  const forEachLeaf = useCallback((ges: readonly ClusterEntry[], visit: (p: ClusterPoint) => void): void => {
    for (const ge of ges) {
      if (ge.kind === 'marker') {
        const p = byUidRef.current.get(String(ge.markerId))
        if (p) visit(p)
      } else {
        for (const uid of engineRef.current?.leafMarkerIds(ge.clusterId) ?? []) {
          const p = byUidRef.current.get(String(uid))
          if (p) visit(p)
        }
      }
    }
  }, [])

  const leavesOf = useCallback(
    (ges: readonly ClusterEntry[]): ClusterPoint[] => {
      const out: ClusterPoint[] = []
      forEachLeaf(ges, (p) => out.push(p))
      return out
    },
    [forEachLeaf],
  )

  // Recalcule les pastilles sélectionnées depuis le dernier set de sélection : une pastille
  // l'est si sa CLÉ est sélectionnée (cluster cliqué) OU si l'un de ses markers feuilles
  // l'est (markers absorbés au dézoom → la pastille hérite). Appelé sur changement de
  // sélection ET après chaque recompute (le regroupement change hors cycle de sélection).
  const markSelectedClusters = useCallback(() => {
    const ids = appliedIdsRef.current
    const next = new Set<string>()
    if (ids.size > 0) {
      for (const [key, node] of nodesRef.current) {
        const k = String(key)
        if (ids.has(k)) {
          next.add(k)
          continue
        }
        // Un seul membre feuille sélectionné suffit — visite SANS matérialiser le tableau
        // des feuilles (`leavesOf` allouerait un tableau par pastille à chaque recompute).
        let hit = false
        forEachLeaf(node.members, (p) => {
          if (!hit && ids.has(p.owner.idOf(p.marker))) hit = true
        })
        if (hit) next.add(k)
      }
    }
    // Ref (pas un state) : l'affecter ne re-rend rien, donc pas de garde `sameSet`.
    selectedKeysRef.current = next
  }, [forEachLeaf])

  const recompute = useCallback(() => {
    const core = coreRef.current
    if (!core) return
    const index = engineRef.current
    const nodes = new Map<string | number, Node>()
    const placements = new Map<
      ClusterContributor,
      { absorbed: Set<string | number>; moved: Map<string | number, LatLng> }
    >()
    const placementOf = (owner: ClusterContributor) => {
      let p = placements.get(owner)
      if (!p) {
        p = { absorbed: new Set(), moved: new Map() }
        placements.set(owner, p)
      }
      return p
    }

    const items: OverlayItem[] = []
    if (index) {
      const view = engine.getView()
      const atGround = latest.current.grounded
      /**
       * Au ras du sol, on demande un cran AU-DELÀ de `maxZoom` : supercluster rend alors tous
       * les points individuellement, et seul le déclutter écran décide (cf. `grounded`).
       *
       * Explicite, et non plus par accident : le zoom du piéton dépassait `maxZoom` de
       * lui-même tant qu'il dérivait de l'altitude (24,5 à hauteur d'homme). Depuis qu'il suit
       * l'échelle réellement perçue, il retombe à ~18,3 — assez pour que supercluster se
       * remette à regrouper au sol, ce qu'on ne veut pas ici.
       */
      const geo = index.getClusters(WORLD_BOUNDS, atGround ? latest.current.clustering.maxZoom + 1 : view.zoom)

      // Déclutter ÉCRAN : le regroupement géographique n'empêche pas deux nœuds de se
      // SUPERPOSER en vue oblique (l'un derrière l'autre → illisible). On projette, on
      // trie du plus PROCHE au plus lointain, et on fusionne tout ce qui tombe dans le
      // même disque écran dans le nœud de DEVANT → aucune info cachée en arrière-plan.
      const cam = engine.threeCamera
      const proj = engine.projection
      const mergePx = latest.current.clustering.radius
      const r2 = mergePx * mergePx
      /**
       * Portée de vue au ras du sol — la même borne que `MarkerLayer`, et pour une raison
       * qui lui est propre : sans elle, un point hors de portée qui se projette sur un point
       * proche entrerait dans son bin, et la pastille compterait ce que personne ne voit.
       */
      const range = atGround ? latest.current.config.pedestrian.viewDistanceMeters : 0
      const projected: { entry: ClusterEntry; sx: number; sy: number; z: number }[] = []
      for (const entry of geo) {
        // Distance mesurée sur l'ellipsoïde, avant tout raycast : la borne est kilométrique,
        // les quelques dizaines de mètres du relief ne la font pas basculer.
        const flat = proj.latLngToWorld(entry.position)
        if (!isWithinViewDistance(cam.position.distanceToSquared(flat), range)) continue
        // Hauteur RÉELLE seulement en vue rasante : le marker est posé au sol (cf.
        // `MarkerLayer.settle`), et l'écart avec l'ellipsoïde y pèse plusieurs écrans — le
        // déclutter fusionnait des points qui ne se superposent pas. Vu du ciel il vaut
        // quelques pixels sur un disque de 60, et ne vaut pas un raycast par point et par
        // recompute.
        // `sampleGroundHeightCached` et non `resolveAnchorHeight` : la MÊME source que
        // `MarkerLayer.settle`, sinon le déclutter projetterait le point sur le toit pendant
        // que la couche le pose dans la rue. Gratuit sous fournisseur interne, où le niveau
        // de rue est analytique (cf. `Projection.setGroundPlane`) ; sous tuiles photoréalistes
        // c'est neuf raycasts BVH par point, et ce recompute revient à chaque mouvement de
        // caméra — soit exactement la boucle que la mémoïsation dégage, partagée en prime
        // avec les markers, qui interrogent les mêmes cellules.
        const world = atGround
          ? proj.latLngToWorld(entry.position, undefined, proj.sampleGroundHeightCached(entry.position) ?? 0)
          : flat
        const sp = proj.worldToScreen(world, cam)
        projected.push({ entry, sx: sp.sx, sy: sp.sy, z: sp.z })
      }
      projected.sort((a, b) => a.z - b.z)

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

      const spiderfy = latest.current.config.interaction.spiderfy
      // Jamais au ras du sol : l'éventail y écarterait de quelques centimètres (cf. `grounded`).
      const explode = !atGround && view.zoom >= latest.current.clustering.maxZoom - spiderfy.zoomEpsilon
      for (const bin of bins) {
        const solo = bin.members.length === 1 ? bin.members[0]! : null
        // Un marker seul dans son disque n'est PAS un regroupement : sa couche le pose
        // elle-même, avec son icône, son menu et ses gestes.
        if (solo && solo.kind === 'marker') continue

        // AUTO-éventail : au-delà de l'arrêt du regroupement géographique, tout nœud
        // encore fusionné est un CHEVAUCHEMENT ÉCRAN. On le décolle plutôt que de
        // l'afficher en pastille — chaque marker retrouve sa couche et son chrome.
        // Seul ce cas matérialise les feuilles, et il ne survient qu'au zoom maximal.
        if (explode) {
          const leaves = leavesOf(bin.members)
          if (leaves.length >= 2) {
            const slots = spiderfyLayout(leaves.length, bin.position, view.zoom, latest.current.clusterSize, spiderfy)
            leaves.forEach((p, i) => placementOf(p.owner).moved.set(p.owner.idOf(p.marker), slots[i]!.position))
            continue
          }
        }

        // Clé stable : celle du membre de DEVANT. Elle survit à la rotation tant qu'il
        // reste le plus proche → le nœud DOM persiste, seul son contenu se met à jour.
        const key = solo ? solo.key : `grp:${bin.members[0]!.key}`
        items.push({ id: key, position: bin.position, animateEnter: solo ? undefined : false })
        nodes.set(key, { cluster: clusterInfoFromCounts(bin.counts, bin.position), members: bin.members })
        forEachLeaf(bin.members, (p) => placementOf(p.owner).absorbed.add(p.owner.idOf(p.marker)))
      }
    }

    nodesRef.current = nodes
    visualIndexRef.current = null
    core.setItems(items)
    // Le registre ne notifie qu'une couche dont le placement a RÉELLEMENT changé.
    engine.clusters.place(placements)

    // Pendant un pan où le regroupement ne change pas, le recompute à ~11 Hz ne
    // re-rend AUCUN portail — et la détection elle-même n'alloue rien.
    signature.begin(dataRevRef.current)
    for (const [k, n] of nodes) signature.add(k, n.cluster.total)
    signature.end()

    // Les pastilles viennent d'être recréées (clés neuves) : réappliquer la sélection,
    // sinon une pastille qui absorbe des markers sélectionnés au dézoom perdrait l'anneau.
    markSelectedClusters()
  }, [coreRef, engine, forEachLeaf, leavesOf, markSelectedClusters, signature])

  // Index supercluster : reconstruit quand les DONNÉES d'une couche changent.
  useEffect(() => {
    if (!enabled) {
      engineRef.current = null
      // Les couches doivent reprendre la main sur tous leurs points.
      engine.clusters.place(new Map())
      recompute()
      return
    }
    const rebuild = () => {
      // Révision des DONNÉES, graine de la signature (cf. `useEntriesSignature`) : sans
      // elle, la signature ne pesait que `total` par clé, et deux compositions
      // différentes de même clé et même effectif — 8 agents + 2 véhicules devenus 5 + 5 —
      // étaient indiscernables. Le camembert de répartition et l'infobulle, eux, sont
      // rendus depuis les MEMBRES : ils restaient sur l'ancienne composition.
      dataRevRef.current++
      const points = engine.clusters.allPoints()
      const byUid = new Map<string, ClusterPoint>()
      const uidByMarker = new Map<MarkerData, string>()
      for (const p of points) {
        byUid.set(p.uid, p)
        uidByMarker.set(p.marker, p.uid)
      }
      byUidRef.current = byUid
      const index = new ClusterEngine({
        radius: clustering.radius,
        minPoints: clustering.minPoints,
        maxZoom: clustering.maxZoom,
        levelQuantization: clustering.levelQuantization,
      })

      // L'index ne connaît que la clé GLOBALE : deux couches peuvent porter le même
      // id métier, et supercluster n'en garderait qu'un. Les markers sont passés TELS
      // QUELS, avec un accesseur d'id : les recopier pour ne changer qu'un champ
      // allouait un objet large par point, aussitôt jeté (supercluster n'en retient
      // que l'id, la position et le type).
      index.load(
        (function* () {
          for (const p of points) yield p.marker
        })(),
        (m) => uidByMarker.get(m) ?? m.id,
      )
      engineRef.current = index
      recompute()
    }
    // Reconstruire coûte un balayage de TOUTES les couches et un index supercluster
    // en O(n log n). K couches qui signalent un changement dans le même tick — leur
    // montage, ou un tick de données commun — ne doivent le payer qu'UNE fois. La
    // microtâche coalesce sans retarder d'une frame.
    let pending = false
    let disposed = false
    const schedule = () => {
      if (pending) return
      pending = true
      queueMicrotask(() => {
        pending = false
        if (!disposed) rebuild()
      })
    }
    // Premier index SYNCHRONE : la carte ne doit pas s'afficher un tick sans pastilles.
    rebuild()
    const off = engine.clusters.onItemsChanged(schedule)
    return () => {
      disposed = true
      off()
    }
  }, [engine, enabled, clustering, recompute])

  // L'entrée et la sortie du mode piéton changent les règles du regroupement (portée,
  // hauteur de projection, éventail) sans passer par les données ni par `clustering` : on
  // refait le calcul tout de suite, sans attendre le prochain mouvement de caméra.
  useEffect(() => {
    if (enabled) recompute()
  }, [enabled, grounded, recompute])

  // Regroupement recalculé au déplacement caméra, THROTTLÉ : les pastilles restent
  // ancrées en 3D et suivent la carte à 60 fps, seul le RE-groupement tourne moins
  // souvent. Un appel de traîne garantit l'état final une fois la caméra immobile.
  useEffect(() => {
    if (!enabled) return
    const MIN_INTERVAL = config.performance.markerRecomputeMs
    let lastRun = 0
    let trailing = 0
    const run = () => {
      trailing = 0
      lastRun = performance.now()
      recompute()
    }
    const off = engine.on('camera', () => {
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
    })
    return () => {
      off()
      if (trailing) clearTimeout(trailing)
    }
  }, [engine, enabled, recompute, config.performance.markerRecomputeMs])

  // Nœud VISUEL d'un marker : la pastille qui l'agrège, ou rien (il est posé seul).
  // Les relations s'en servent pour accrocher un lien à ce qui est réellement affiché,
  // sans jamais éclater le cluster ni toucher au zoom. Index inverse construit à la
  // demande : sans consommateur, il ne coûte rien.
  useEffect(() => {
    return engine.markers.register({
      // Ni inventaire ni résolution de donnée : la surface ne connaît aucune source,
      // seulement quelle pastille agrège quoi.
      visualNodeOf: (id) => {
        let index = visualIndexRef.current
        if (!index) {
          index = new Map()
          for (const [key, node] of nodesRef.current) {
            const leaves = leavesOf(node.members)
            const memberIds = leaves.map((p) => p.owner.idOf(p.marker))
            const visual: VisualNode = { key: String(key), position: node.cluster.position, memberIds }
            for (const memberId of memberIds) index.set(memberId, visual)
          }
          visualIndexRef.current = index
        }
        return index.get(id) ?? null
      },
    })
  }, [engine, leavesOf])

  // Provider du registre de sélection : chaque pastille est un item POINT ; son
  // `info` porte un GROUPE (ses markers enfants résolus au moment de l'appel, donc
  // vivants) — l'outil sélection l'aplatit alors en enfants (rangée pliable des badges).
  useEffect(() => {
    return engine.selectables.register({
      screenItems: () => {
        const out: SelectableScreenItem[] = []
        // Scratch partagés (chemin froid, synchrone, lecture immédiate) — pas d'alloc par pastille.
        for (const [key, node] of nodesRef.current) {
          const world = engine.projection.latLngToWorld(node.cluster.position, clusterScratchVec)
          const s = engine.projection.worldToScreen(world, engine.threeCamera, clusterScratchScreen)
          if (s.z > 1) continue
          out.push({ id: String(key), kind: 'cluster', x: s.sx, y: s.sy, radiusPx: latest.current.clusterSize / 2 })
        }
        return out
      },
      setSelected: (ids) => {
        appliedIdsRef.current = ids
        markSelectedClusters()
      },
      // Silhouettes (cercles) des pastilles sélectionnées → pointillé d'UNION de l'overlay.
      // Reprojection à la demande (chemin par frame tant qu'une pastille est sélectionnée),
      // scratches partagés — pas d'alloc par pastille. Rayon = celui de l'ex-anneau CSS :
      // pastille custom (`clusterSize`) ou donut par défaut, plus le gap thémé de chaque côté.
      selectedContours: () => {
        const keys = selectedKeysRef.current
        if (keys.size === 0) return []
        const { clusterSize: cs, theme: th, chrome: ch } = latest.current
        const out: SelectableGeometry[] = []
        // Itère les seuls SÉLECTIONNÉS (petit set) plutôt que toutes les pastilles.
        for (const key of keys) {
          const node = nodesRef.current.get(key)
          if (!node) continue
          const world = engine.projection.latLngToWorld(node.cluster.position, clusterScratchVec)
          const s = engine.projection.worldToScreen(world, engine.threeCamera, clusterScratchScreen)
          if (s.z > 1) continue
          const ringR = ch.icon ? cs / 2 : defaultClusterRadius(node.cluster.total, th)
          // La pastille est RELEVÉE du leader line (comme un marker) : cercler le badge
          // visible, pas l'ancre au sol — sinon décalage vertical.
          out.push({ kind: 'circle', cx: s.sx, cy: s.sy - LEADER_LIFT_PX, r: ringR + th.clusters.selectedGapPx })
        }
        return out
      },
      hasSelectedContours: () => selectedKeysRef.current.size > 0,
      // Les clés de nœuds sont des chaînes (`pt:`/`cl:`/`grp:`) : lookup direct O(1).
      info: (id) => {
        const node = nodesRef.current.get(id)
        if (!node) return null
        const memberIds = leavesOf(node.members).map((p) => p.owner.idOf(p.marker))
        const l = labelsRef.current
        const label = formatCount(l.clusters.labelSingular, l.clusters.label, node.cluster.total, l.plural)
        // `counts` (répartition par type) → mini-camembert dans les badges de sélection.
        return { kind: 'cluster', type: 'cluster', group: { label, memberIds, counts: { ...node.cluster.counts } } }
      },
    })
  }, [engine, leavesOf, markSelectedClusters])

  // Relève la pastille survolée au-dessus des voisins (le CSS2DRenderer trie le
  // z-index inline par renderOrder) — sinon son infobulle, enfant de l'ancre de la
  // pastille, passe SOUS une pastille/marker voisin plus proche de la caméra, et
  // devient illisible. Même levier que `<MarkerLayer>` : renderOrder est le seul
  // respecté par le tri z. `els` en dep : un recompute recrée les nœuds DOM, il faut
  // ré-affirmer le relèvement sur le nœud reconstruit.
  useEffect(() => {
    coreRef.current?.setRaised(hoverId)
  }, [coreRef, hoverId, els])

  /** Markers d'une pastille, résolus à la demande (infobulle). */
  const membersOf = useCallback(
    (key: string | number): MarkerData[] => leavesOf(nodesRef.current.get(key)?.members ?? []).map((p) => p.marker),
    [leavesOf],
  )

  // Clic sur une pastille : outil sélection actif ⇒ la pastille alimente la
  // multi-sélection (ses markers enfants), le consumer prime sur le zoom. Sinon on
  // ZOOME, on n'ouvre rien : vers le zoom d'éclatement réel quand le nœud est
  // séparable, sinon juste au-delà de l'arrêt du regroupement — où l'auto-éventail
  // prend le relais. Toujours borné : jamais de zoom infini.
  const handleClick = useCallback(
    (key: string | number, cluster: ClusterInfo, ev: ReactMouseEvent | ReactKeyboardEvent) => {
      const consumer = engine.selectables.consumer
      if (consumer) {
        consumer.pick(String(key), ev)
        return
      }
      const { clustering: cfg, config: c, theme: th } = latest.current
      const members = nodesRef.current.get(key)?.members ?? []
      const solo = members.length === 1 && members[0]!.kind === 'cluster' ? members[0] : null
      const expansion = solo ? (engineRef.current?.expansionZoom(solo.clusterId) ?? Infinity) : Infinity
      const openZoom = c.interaction.clusterOpenZoom
      const target = Math.min(
        expansion <= cfg.maxZoom ? expansion + openZoom.expansion : cfg.maxZoom + openZoom.max,
        cfg.spiderfyZoom,
      )
      engine.camera.flyTo(
        { lat: cluster.position.lat, lng: cluster.position.lng, altitude: altitudeForZoom(target) },
        { duration: th.animations.clusterOpen },
      )
    },
    [engine],
  )

  const portals = useMemo(() => {
    const out: ReactNode[] = []
    // Boîte et centrage sont en CSS (`.m3d-marker-img`) : un seul objet de style pour
    // toutes les pastilles, seule la taille varie.
    const imgStyle = { '--m3d-sprite': `${clusterSize}px` } as CSSProperties
    for (const [key, el] of els) {
      const node = nodesRef.current.get(key)
      if (!node) continue
      const content = chrome.icon ? (
        <img
          className="m3d-marker-img"
          src={svgToDataUri(chrome.icon(node.cluster))}
          style={imgStyle}
          draggable={false}
          alt=""
        />
      ) : (
        <DefaultCluster
          cluster={node.cluster}
          theme={theme}
          typeIcon={chrome.typeIcon}
          typeLabel={chrome.typeLabel}
          satelliteTip={!chrome.tooltip}
          onSegmentHover={chrome.tooltip ? setHoverSegment : undefined}
        />
      )
      const hovered = hoverId === key
      const segment = hovered ? hoverSegment : null
      const tip =
        hovered && chrome.tooltip
          ? segment == null
            ? chrome.tooltip(node.cluster, membersOf(key))
            : chrome.tooltip(
                node.cluster,
                membersOf(key).filter((m) => m.type === segment),
                segment,
              )
          : null
      // Ancrage de l'infobulle : au-dessus du VISUEL réel — donut par défaut (rayon
      // dépendant du total) ou pastille custom.
      const tipLift =
        (chrome.icon ? clusterSize / 2 : defaultClusterRadius(node.cluster.total, theme)) + theme.markers.tipGapPx
      out.push(
        createPortal(
          <>
            <MarkerContent
              isMarker={false}
              draggable={false}
              repositionable={false}
              leaderLine
              layer={coreRef.current}
              markerId={key}
              nodeKey={key}
              markerData={null}
              // Une pastille ne se saisit pas : `ghost` ne servirait à personne.
              ghost={null}
              // Ce que le lecteur d'écran annonce : le compte, seul contenu réel de la
              // pastille (le camembert n'est qu'une répartition, déjà dans l'infobulle).
              label={formatCount(
                labels.clusters.labelSingular,
                labels.clusters.label,
                node.cluster.total,
                labels.plural,
              )}
              onClick={(e) => handleClick(key, node.cluster, e)}
              onHoverEnter={chrome.tooltip ? () => setHoverId(key) : undefined}
              onHoverLeave={
                chrome.tooltip
                  ? () => {
                      setHoverId((cur) => (cur === key ? null : cur))
                      setHoverSegment(null)
                    }
                  : undefined
              }
            >
              {content}
            </MarkerContent>
            {hasTipContent(tip) && (
              <MarkerTip
                title={tip?.title}
                content={tip?.content}
                style={{ '--m3d-tiplift': `${tipLift}px` } as CSSProperties}
              />
            )}
          </>,
          el,
          String(key),
        ),
      )
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    els,
    rev,
    theme,
    labels,
    hoverId,
    hoverSegment,
    clusterSize,
    chrome.icon,
    chrome.typeIcon,
    chrome.typeLabel,
    chrome.tooltip,
    membersOf,
    handleClick,
  ])

  return <>{portals}</>
}

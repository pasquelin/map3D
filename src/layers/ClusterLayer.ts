import { defaultConfig } from '../config/defaultConfig'
import type { InteractionConfig } from '../config/types'
import Supercluster from 'supercluster'
import type { Bounds, LatLng } from '../shared'
import { offsetLatLng } from '../core/geodesy'
import { clamp, metersPerPixelAtZoom, RAD2DEG } from '../core/math'
import type { MarkerData } from '../data/types'

export type ClusterInfo = {
  total: number
  counts: Record<string, number>
  /** Types présents, triés par compte décroissant (dominant en premier). */
  types: string[]
  position: LatLng
}

/**
 * Résume un `Record<type, compte>` en `ClusterInfo` : total, types triés par
 * compte décroissant, position. Partagé entre le clustering géo (core) et le
 * déclutter écran (composant React) pour un résumé identique des deux côtés.
 */
export function clusterInfoFromCounts(counts: Record<string, number>, position: LatLng): ClusterInfo {
  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  const types = Object.keys(counts).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
  return { total, counts, types, position }
}

export type ClusterEntry =
  | { kind: 'marker'; key: string; markerId: string | number; position: LatLng; type: string }
  | { kind: 'cluster'; key: string; clusterId: number; position: LatLng; cluster: ClusterInfo }

/** Clé de nœud d'un marker individuel en mode clustering — UNIQUE point de vérité
 *  du format (la multi-sélection traduit id marker ↔ id nœud avec). */
export const markerEntryKey = (id: string | number): string => `pt:${id}`

export type SpiderfySlot = { position: LatLng; angleDeg: number; radiusPx: number }

/**
 * Layout d'éventail (spiderfy) : répartit `count` markers en cercle autour de
 * `center`. Rayon en px écran (pastilles sans chevauchement) converti en offsets
 * GÉO au zoom courant — au zoom max, l'écart réel reste de l'ordre de ~10 m.
 */
export function spiderfyLayout(
  count: number,
  center: LatLng,
  zoom: number,
  ringPx: number,
  /** Géométrie de l'éventail — cf. `interaction.spiderfy`. */
  cfg: InteractionConfig['spiderfy'] = defaultConfig.interaction.spiderfy,
): SpiderfySlot[] {
  // Une PAIRE : décalage MINIMAL (les deux markers juste séparés, côte à côte), pas
  // une couronne — au zoom max il s'agit seulement de « décoller » deux markers
  // confondus. Au-delà, couronne dimensionnée pour éviter tout chevauchement.
  const radiusPx =
    count === 2
      ? ringPx * cfg.pairRadiusRatio
      : Math.max(ringPx * cfg.minRingRatio, (count * (ringPx + cfg.gapPx)) / (2 * Math.PI))
  const meters = radiusPx * metersPerPixelAtZoom(zoom, center.lat)
  // Paire à l'horizontale (côte à côte) ; au-delà, premier satellite en haut (−90°).
  const base = count === 2 ? 0 : -Math.PI / 2
  const slots: SpiderfySlot[] = []
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count + base
    // `offsetLatLng` : identique bit à bit à l'ancien calcul inline (même garde cos,
    // même ordre d'opérations), et la corrige au voisinage d'un pôle (division par
    // ≈0 auparavant non gardée ici).
    slots.push({
      position: offsetLatLng(center, -Math.sin(angle) * meters, Math.cos(angle) * meters),
      angleDeg: angle * RAD2DEG,
      radiusPx,
    })
  }
  return slots
}

type LeafProps = { markerId: string | number; mType: string }

export type ClusterOptions = {
  radius: number
  minPoints: number
  maxZoom: number
  /**
   * Pas de quantification du zoom (cf. `clustering.levelQuantization`) : `1` = paliers
   * entiers, `2` = un palier sur deux — moins de recompositions pendant un zoom continu.
   * Défaut `1`.
   */
  levelQuantization?: number
}

/**
 * Clustering en **espace géographique** via supercluster. Le zoom entier fait
 * office de palier discret : à zoom constant, `getClusters` renvoie des clusters
 * stables (même `cluster_id`) → clés DOM stables, aucun clignotement.
 *
 * Les comptes par type sont calculés depuis les **feuilles réelles** (`getLeaves`),
 * PAS via un `reduce` custom : le reduce sur un objet imbriqué partage des
 * références entre niveaux de zoom et gonfle les comptes (total > nb réel).
 */
export class ClusterEngine {
  private index: Supercluster<LeafProps> | null = null
  /** Feuilles par cluster, mémoïsées — l'index est immuable entre deux `load()`. */
  private readonly leafCache = new Map<number, (string | number)[]>()

  constructor(private options: ClusterOptions) {}

  /**
   * `idOf` permet à l'appelant d'indexer sous une clé qui n'est pas `m.id` — le
   * regroupement commun préfixe la sienne par la couche d'origine, deux couches
   * pouvant porter le même id métier.
   *
   * `markers` est un ITÉRABLE, pas un tableau : le regroupement commun tient ses
   * points dans une structure qui en porte plus (couche d'origine, uid), et le
   * convertir en tableau n'allouait qu'un intermédiaire jeté à la ligne suivante.
   */
  load(markers: Iterable<MarkerData>, idOf: (m: MarkerData) => string | number = (m) => m.id): void {
    const index = new Supercluster<LeafProps>({
      radius: this.options.radius,
      minPoints: this.options.minPoints,
      maxZoom: this.options.maxZoom,
    })
    // Type pris à `load` plutôt qu'au namespace global `GeoJSON` : il suit la version
    // de supercluster installée, sans dépendre d'un typage ambiant.
    const features: Parameters<typeof index.load>[0] = []
    for (const m of markers) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [m.position.lng, m.position.lat] },
        properties: { markerId: idOf(m), mType: m.type },
      })
    }
    index.load(features)
    this.index = index
    this.leafCache.clear()
  }

  /** Compte FIABLE par type des feuilles d'un cluster (via `getLeaves`). */
  private leafCounts(clusterId: number): Record<string, number> {
    if (!this.index) return {}
    const counts: Record<string, number> = {}
    for (const leaf of this.index.getLeaves(clusterId, Infinity)) {
      const t = (leaf.properties as LeafProps).mType
      counts[t] = (counts[t] ?? 0) + 1
    }
    return counts
  }

  /** Zoom auquel le cluster éclate — points confondus → au-delà du maxZoom. */
  expansionZoom(clusterId: number): number {
    if (!this.index) return Infinity
    return this.index.getClusterExpansionZoom(clusterId)
  }

  /** Ids des markers feuilles d'un cluster (mémoïsés — appelé à ~11 Hz au zoom
   *  max par l'auto-éventail, et au survol par l'infobulle de cluster). */
  leafMarkerIds(clusterId: number): (string | number)[] {
    if (!this.index) return []
    let ids = this.leafCache.get(clusterId)
    if (!ids) {
      ids = this.index.getLeaves(clusterId, Infinity).map((leaf) => (leaf.properties as LeafProps).markerId)
      this.leafCache.set(clusterId, ids)
    }
    return ids
  }

  getClusters(bounds: Bounds, zoom: number): ClusterEntry[] {
    if (!this.index) return []
    const q = Math.max(1, Math.round(this.options.levelQuantization ?? 1))
    const z = clamp(Math.round(zoom / q) * q, 0, this.options.maxZoom + 1)

    const bbox: [number, number, number, number] = [bounds.west, bounds.south, bounds.east, bounds.north]
    const features = this.index.getClusters(bbox, z)
    const out: ClusterEntry[] = []
    for (const f of features) {
      const lng = f.geometry.coordinates[0]!
      const lat = f.geometry.coordinates[1]!
      const position: LatLng = { lat, lng }
      const props = f.properties as Partial<LeafProps> & {
        cluster?: boolean
        cluster_id?: number
        point_count?: number
      }
      if (props.cluster) {
        // Comptes FIABLES depuis les feuilles (le total = nb réel de feuilles).
        const counts = this.leafCounts(props.cluster_id!)
        out.push({
          kind: 'cluster',
          key: `cl:${props.cluster_id}`,
          clusterId: props.cluster_id!,
          position,
          cluster: clusterInfoFromCounts(counts, position),
        })
      } else {
        out.push({
          kind: 'marker',
          key: markerEntryKey(props.markerId!),
          markerId: props.markerId!,
          position,
          type: props.mType!,
        })
      }
    }
    return out
  }
}

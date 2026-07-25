import Supercluster from 'supercluster'
import type { Bounds, LatLng } from '../shared'
import { clamp, DEG2RAD, M_PER_DEG, metersPerPixelAtZoom, RAD2DEG } from '../core/math'
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

/** Étalement géo (mètres) d'un ensemble de points — diagonale du bbox. Sert à
 *  détecter les points (quasi) confondus, jamais séparables par le zoom. */
export function geoSpreadMeters(points: ReadonlyArray<{ position: LatLng }>): number {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const p of points) {
    if (p.position.lat < minLat) minLat = p.position.lat
    if (p.position.lat > maxLat) maxLat = p.position.lat
    if (p.position.lng < minLng) minLng = p.position.lng
    if (p.position.lng > maxLng) maxLng = p.position.lng
  }
  const midLat = (minLat + maxLat) / 2
  return Math.hypot((maxLat - minLat) * M_PER_DEG, (maxLng - minLng) * M_PER_DEG * Math.cos(midLat * DEG2RAD))
}

export type SpiderfySlot = { position: LatLng; angleDeg: number; radiusPx: number }

/**
 * Layout d'éventail (spiderfy) : répartit `count` markers en cercle autour de
 * `center`. Rayon en px écran (pastilles sans chevauchement) converti en offsets
 * GÉO au zoom courant — au zoom max, l'écart réel reste de l'ordre de ~10 m.
 */
export function spiderfyLayout(count: number, center: LatLng, zoom: number, ringPx: number): SpiderfySlot[] {
  // Une PAIRE : décalage MINIMAL (les deux markers juste séparés, côte à côte), pas
  // une couronne — au zoom max il s'agit seulement de « décoller » deux markers
  // confondus. Au-delà, couronne dimensionnée pour éviter tout chevauchement.
  const radiusPx =
    count === 2 ? ringPx * 0.1 : Math.max(ringPx * 1.15, (count * (ringPx + 8)) / (2 * Math.PI))
  const cosLat = Math.cos(center.lat * DEG2RAD)
  const meters = radiusPx * metersPerPixelAtZoom(zoom, center.lat)
  // Paire à l'horizontale (côte à côte) ; au-delà, premier satellite en haut (−90°).
  const base = count === 2 ? 0 : -Math.PI / 2
  const slots: SpiderfySlot[] = []
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count + base
    slots.push({
      position: {
        lat: center.lat - (Math.sin(angle) * meters) / M_PER_DEG,
        lng: center.lng + (Math.cos(angle) * meters) / (M_PER_DEG * cosLat),
      },
      angleDeg: angle * RAD2DEG,
      radiusPx,
    })
  }
  return slots
}

type LeafProps = { markerId: string | number; mType: string }

export type ClusterOptions = { radius: number; minPoints: number; maxZoom: number }

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

  load(markers: readonly MarkerData[]): void {
    const index = new Supercluster<LeafProps>({
      radius: this.options.radius,
      minPoints: this.options.minPoints,
      maxZoom: this.options.maxZoom,
    })
    index.load(
      markers.map((m) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [m.position.lng, m.position.lat] },
        properties: { markerId: m.id, mType: m.type },
      })),
    )
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
    const z = clamp(Math.round(zoom), 0, this.options.maxZoom + 1)
    const bbox: [number, number, number, number] = [
      bounds.west,
      bounds.south,
      bounds.east,
      bounds.north,
    ]
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

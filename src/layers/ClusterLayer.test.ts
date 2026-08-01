import { describe, expect, it } from 'vitest'
import { WORLD_BOUNDS } from '../core/bounds'
import { DEG2RAD, M_PER_DEG, metersPerPixelAtZoom } from '../core/math'
import type { MarkerData } from '../data/types'
import { ClusterEngine, clusterInfoFromCounts, spiderfyLayout } from './ClusterLayer'

const AT = { lat: 48.86, lng: 2.34 }

describe('clusterInfoFromCounts', () => {
  it('totalise et trie les types par compte décroissant', () => {
    const info = clusterInfoFromCounts({ agent: 1, alert: 3, defib: 2 }, AT)
    expect(info.total).toBe(6)
    // L'ordre EST l'ordre des parts du camembert : le type dominant en premier.
    expect(info.types).toEqual(['alert', 'defib', 'agent'])
  })
})

describe('ClusterEngine', () => {
  const marker = (id: string, type: string, lat: number): MarkerData => ({
    id,
    type,
    position: { lat, lng: 2.34 },
    data: null,
  })

  it('compte le décor comme n’importe quel type', () => {
    // `static` ne concerne que le seuil de zoom (le filtrage est fait en amont, par
    // `MarkerLayer`) : ce qui ARRIVE ici est visible, donc segmenté comme le reste.
    const engine = new ClusterEngine({ radius: 60, minPoints: 2, maxZoom: 18 })
    engine.load([
      marker('a', 'alert', 48.86),
      marker('b', 'alert', 48.8601),
      marker('c', 'symbol', 48.8602),
      marker('d', 'defib', 48.8603),
    ])
    const entries = engine.getClusters(WORLD_BOUNDS, 10)
    expect(entries).toHaveLength(1)
    const entry = entries[0]!
    if (entry.kind !== 'cluster') throw new Error('attendu : un cluster')
    expect(entry.cluster.total).toBe(4)
    expect(entry.cluster.counts).toEqual({ alert: 2, symbol: 1, defib: 1 })
    expect(entry.cluster.types).toEqual(['alert', 'symbol', 'defib'])
  })

  it('rend un marker isolé plutôt qu’un cluster au zoom max', () => {
    const engine = new ClusterEngine({ radius: 60, minPoints: 2, maxZoom: 18 })
    engine.load([marker('solo', 'defib', 48.86)])
    const entry = engine.getClusters(WORLD_BOUNDS, 18)[0]!
    expect(entry.kind).toBe('marker')
    if (entry.kind !== 'marker') return
    expect(entry.type).toBe('defib')
  })
})

// `spiderfyLayout` calculait son décalage lat/lng inline, sans garde cos anti-pôle.
// Migré vers `offsetLatLng` (cf. `core/geodesy.ts`) : cette suite fige l'identité
// bit à bit avec l'ancienne formule aux latitudes non polaires, et son unique
// changement toléré — un résultat fini au pôle, là où l'ancien calcul divergeait.
describe('spiderfyLayout', () => {
  /** Reproduction exacte de la formule PRÉ-migration (`center.lat ± sin/cos × meters / M_PER_DEG`). */
  function oldSpiderfyLat(center: { lat: number; lng: number }, zoom: number, ringPx: number, count: number) {
    const cfg = { pairRadiusRatio: 0.1, minRingRatio: 1.15, gapPx: 8, zoomEpsilon: 0.05 }
    const radiusPx =
      count === 2
        ? ringPx * cfg.pairRadiusRatio
        : Math.max(ringPx * cfg.minRingRatio, (count * (ringPx + cfg.gapPx)) / (2 * Math.PI))
    const cosLat = Math.cos(center.lat * DEG2RAD)
    const meters = radiusPx * metersPerPixelAtZoom(zoom, center.lat)
    const base = count === 2 ? 0 : -Math.PI / 2
    const out: { lat: number; lng: number }[] = []
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count + base
      out.push({
        lat: center.lat - (Math.sin(angle) * meters) / M_PER_DEG,
        lng: center.lng + (Math.cos(angle) * meters) / (M_PER_DEG * cosLat),
      })
    }
    return out
  }

  it.each([
    [{ lat: 0, lng: 0 }, 3],
    [{ lat: 48.86, lng: 2.34 }, 5],
    [{ lat: -33.9, lng: 151.2 }, 2],
    [{ lat: 60, lng: -73.5 }, 8],
  ] as const)('identique bit à bit à l’ancien calcul inline — centre %o, count=%i', (center, count) => {
    const zoom = 19
    const ringPx = 24
    const expected = oldSpiderfyLat(center, zoom, ringPx, count)
    const got = spiderfyLayout(count, center, zoom, ringPx)
    expect(got).toHaveLength(count)
    got.forEach((slot, i) => {
      expect(slot.position.lat).toBe(expected[i]!.lat)
      expect(slot.position.lng).toBe(expected[i]!.lng)
    })
  })

  it('reste fini au voisinage immédiat du pôle (corrige la division par ≈0 non gardée)', () => {
    const slots = spiderfyLayout(4, { lat: 90, lng: 0 }, 19, 24)
    for (const s of slots) {
      expect(Number.isFinite(s.position.lat)).toBe(true)
      expect(Number.isFinite(s.position.lng)).toBe(true)
    }
  })
})

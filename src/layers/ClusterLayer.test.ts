import { describe, expect, it } from 'vitest'
import { WORLD_BOUNDS } from '../core/bounds'
import type { MarkerData } from '../data/types'
import { ClusterEngine, clusterInfoFromCounts } from './ClusterLayer'

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

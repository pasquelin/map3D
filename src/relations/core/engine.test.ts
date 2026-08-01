import { describe, expect, it, vi } from 'vitest'
import type { MatrixEntry, ProviderRoute, RoutingProvider } from '../providers/RoutingProvider'
import { RelationEngine } from './engine'
import type { MapPoint, RelationRule } from './types'

// Le moteur est HEADLESS : ni Three, ni React, ni fetch. On le pilote avec un provider
// factice pour figer ses garanties de domaine — celles dont dépend l'UX (réponse immédiate
// au clic), la facture (réutilisation du cache) et la propreté mémoire (annulation en vol).

const source: MapPoint = { id: 'src', lat: 0, lng: 0, tags: ['src'] }
const a: MapPoint = { id: 'a', lat: 0, lng: 0.01, tags: ['target'] }
const b: MapPoint = { id: 'b', lat: 0, lng: 0.02, tags: ['target'] }
const c: MapPoint = { id: 'c', lat: 0, lng: 0.03, tags: ['target'] }
const candidates = [a, b, c]

const rule = (over: Partial<RelationRule> = {}): RelationRule => ({
  id: 'r',
  label: 'R',
  from: { any: ['src'] },
  to: { any: ['target'] },
  mode: 'DRIVE',
  selection: { mode: 'fastest', count: 3, maxMeters: 1e7 },
  limit: { compute: 10, render: 10 },
  ...over,
})

/** Provider qui renvoie les durées fournies par id (et une entrée `error` par défaut). */
const matrixProvider = (durations: Record<string, number | 'error'>, spy?: (n: number) => void): RoutingProvider => {
  let calls = 0
  return {
    matrix: async (origins) => {
      spy?.(++calls)
      return origins.map<MatrixEntry>((o) => {
        const d = durations[o.id]
        if (d === undefined || d === 'error') return { toId: o.id, error: true }
        return { toId: o.id, distanceMeters: d * 10, durationSeconds: d }
      })
    },
    route: async () => [{ distanceMeters: 100, durationSeconds: 60, path: [source, a] } satisfies ProviderRoute],
  }
}

describe('RelationEngine.open', () => {
  it('émet les liens en `pending` AVANT tout appel réseau (la carte répond au clic)', async () => {
    const engine = new RelationEngine(matrixProvider({ a: 300, b: 100, c: 900 }))
    const p = engine.open(source, rule(), candidates)
    // Synchrone, avant le premier await interne : tous pending, rien de chiffré.
    const pending = engine.snapshotFor(source.id)!
    expect(pending.links.length).toBe(3)
    expect(pending.links.every((l) => l.status === 'pending' && l.durationSeconds === null)).toBe(true)
    await p
  })

  it('classe par durée réelle et attribue les rangs après la matrice', async () => {
    const engine = new RelationEngine(matrixProvider({ a: 300, b: 100, c: 900 }))
    await engine.open(source, rule(), candidates)
    const links = engine.snapshotFor(source.id)!.links
    // b (100) < a (300) < c (900) ; rangs 1,2,3.
    expect(links.map((l) => l.to.id)).toEqual(['b', 'a', 'c'])
    expect(links.map((l) => l.rank)).toEqual([1, 2, 3])
    expect(links.map((l) => l.durationSeconds)).toEqual([100, 300, 900])
  })

  it('écarte les liens au-delà du cutoff', async () => {
    const engine = new RelationEngine(matrixProvider({ a: 300, b: 100, c: 900 }))
    await engine.open(source, rule({ cutoffSeconds: 500 }), candidates)
    const links = engine.snapshotFor(source.id)!.links
    // c (900) dépasse 500 → retiré ; b, a conservés.
    expect(links.map((l) => l.to.id)).toEqual(['b', 'a'])
  })

  it('isole un échec partiel : le lien en erreur devient `unavailable`, les autres restent classés', async () => {
    const engine = new RelationEngine(matrixProvider({ a: 300, b: 'error', c: 900 }))
    await engine.open(source, rule(), candidates)
    const links = engine.snapshotFor(source.id)!.links
    const bad = links.find((l) => l.to.id === 'b')!
    expect(bad.status).toBe('unavailable')
    expect(bad.rank).toBeNull()
    // a et c gardent des rangs consécutifs, sans trou dû au lien mort.
    expect(links.filter((l) => l.status === 'ready').map((l) => l.rank)).toEqual([1, 2])
  })

  it('réutilise le cache : une seconde ouverture identique n’appelle plus la matrice', async () => {
    const spy = vi.fn()
    const engine = new RelationEngine(matrixProvider({ a: 300, b: 100, c: 900 }, spy))
    await engine.open(source, rule(), candidates)
    await engine.open(source, rule(), candidates)
    // Tout est en cache au 2ᵉ tour → aucun nouvel appel facturé.
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('RelationEngine.syncPositions', () => {
  it('retire un lien dont la cible a disparu et signale un déplacement', async () => {
    const engine = new RelationEngine(matrixProvider({ a: 300, b: 100, c: 900 }))
    await engine.open(source, rule(), candidates)
    const alive = new Map<string, MapPoint>([
      [source.id, source],
      [a.id, a],
      [c.id, c],
    ]) // b supprimé
    const res = engine.syncPositions((id) => alive.get(id) ?? null)
    expect(res.moved).toBe(true)
    expect(engine.snapshotFor(source.id)!.links.some((l) => l.to.id === 'b')).toBe(false)
  })

  it('la source disparue emporte toute la relation', async () => {
    const engine = new RelationEngine(matrixProvider({ a: 300, b: 100, c: 900 }))
    await engine.open(source, rule(), candidates)
    engine.syncPositions(() => null)
    expect(engine.snapshotFor(source.id)).toBeNull()
    expect(engine.snapshots).toEqual([])
  })
})

describe('RelationEngine.clear', () => {
  it('avorte la matrice en vol et vide l’état (pas de requête facturée en fuite)', () => {
    let captured: AbortSignal | undefined
    const provider: RoutingProvider = {
      matrix: (_o, _d, _m, signal) => {
        captured = signal
        return new Promise<MatrixEntry[]>(() => undefined) // ne se résout jamais
      },
      route: async () => [],
    }
    const engine = new RelationEngine(provider)
    void engine.open(source, rule(), candidates)
    expect(captured).toBeDefined()
    engine.clear(source.id)
    expect(captured!.aborted).toBe(true)
    expect(engine.snapshots).toEqual([])
  })
})

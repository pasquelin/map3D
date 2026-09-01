import { describe, expect, it, vi } from 'vitest'
import { intersectsView, type Tile, TileDeferred, tileId, TileQueue, tileRange, tileRing } from './TileQueue'

import { latToTileY, lngToTileX } from './googleTiles'

const BUDGET = {
  maxTiles: 4,
  maxBytes: 0,
  maxInflight: 2,
  maxAttempts: 3,
  retryDelays: [0],
  evictEvery: 1,
  evictSlack: 0,
  mountPerFrame: 8,
  errorTtlMs: 0,
  staleFrames: 1_000_000,
}


type TestTile = Tile & { payload: string | null }

/**
 * File de test : `fetch` rend ce que le scénario a posé pour la clé, et l'on garde trace
 * de ce qui a été monté puis libéré. Aucun three.js, aucun réseau.
 */
function makeQueue(overrides: Partial<typeof BUDGET> = {}) {
  const results = new Map<string, Promise<string>>()
  // Les tuiles montées sont retenues par IDENTITÉ, pas par clé : c'est précisément ce que
  // le défaut d'origine confondait.
  const mounted: TestTile[] = []
  const released: string[] = []
  const bytesOf = new Map<string, number>()
  const queue = new TileQueue<TestTile, string>({
    budget: () => ({ ...BUDGET, ...overrides }),
    make: (base) => ({ ...base, payload: null }),
    fetch: (t) => results.get(t.key) ?? Promise.resolve(`data:${t.key}`),
    commit: (t, result) => {
      t.payload = result
      t.bytes = bytesOf.get(t.key) ?? 0
      mounted.push(t)
    },
    release: (t) => {
      if (t.payload) released.push(t.key)
      t.payload = null
    },
  })
  const ensure = (z: number, x: number, y: number) => queue.ensure(z, x, y, 0, 1, 1, 0)
  return { queue, results, mounted, released, bytesOf, ensure }
}

/** Laisse les promesses en vol se résoudre, sans dépendre d'un timer. */
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('TileQueue — identité des tuiles', () => {
  it('ne monte PAS le résultat d’une tuile évincée puis redemandée sous la même clé', async () => {
    const { queue, results, mounted, ensure } = makeQueue()
    let release!: (v: string) => void
    results.set('14/1/1', new Promise<string>((r) => (release = r)))

    queue.beginFrame()
    const first = ensure(14, 1, 1)
    queue.pump()
    expect(first.state).toBe('loading')

    // La tuile sort de la vue et se fait évincer pendant son chargement, puis revient :
    // `ensure` fabrique alors un OBJET NEUF sous la même clé.
    queue.clear()
    queue.beginFrame()
    const second = ensure(14, 1, 1)
    expect(second).not.toBe(first)

    release('data:14/1/1')
    await settle()
    queue.beginFrame()

    /**
     * ⚠️ C'est le défaut d'origine : la garde testait la présence de la CLÉ, que la
     * nouvelle tuile occupait. Le chargement de l'ancienne se croyait donc vivant et
     * montait son mesh sur un objet hors du cache — jamais masqué, jamais évincé, jamais
     * libéré. Un bâtiment fantôme et sa mémoire, à chaque occurrence.
     */
    expect(first.payload).toBeNull()
    expect(mounted).not.toContain(first)
    // La tuile REDEMANDÉE, elle, se charge et se monte normalement : c'est bien l'objet
    // orphelin qu'on écarte, pas la clé.
    expect(second.payload).toBe('data:14/1/1')
    expect(mounted).toEqual([second])
  })

  it('monte le résultat quand la tuile est toujours la sienne', async () => {
    const { queue, mounted, ensure } = makeQueue()
    queue.beginFrame()
    const t = ensure(14, 1, 1)
    queue.pump()
    await settle()
    queue.beginFrame()
    expect(mounted).toEqual([t])
  })
})

describe('TileQueue — budget mémoire', () => {
  it('évince sur les OCTETS, même très en dessous du plafond de tuiles', async () => {
    const { queue, bytesOf, released, ensure } = makeQueue({ maxTiles: 100, maxBytes: 250 })
    for (let x = 0; x < 3; x++) bytesOf.set(`14/${x}/0`, 100)

    queue.beginFrame()
    for (let x = 0; x < 3; x++) ensure(14, x, 0)
    queue.pump()
    await settle()
    queue.beginFrame()
    expect(queue.usedBytes).toBe(300)

    // Trois tuiles seulement, très loin des 100 autorisées : c'est le poids qui déborde.
    // La frame suivante n'en redemande aucune, elles deviennent donc toutes candidates.
    queue.beginFrame()
    queue.evict()
    expect(queue.usedBytes).toBeLessThanOrEqual(250)
    expect(released.length).toBeGreaterThan(0)
  })

  it('n’évince jamais une tuile vue dans la frame courante', async () => {
    const { queue, bytesOf, ensure } = makeQueue({ maxTiles: 1, maxBytes: 0 })
    for (let x = 0; x < 3; x++) bytesOf.set(`14/${x}/0`, 10)
    queue.beginFrame()
    for (let x = 0; x < 3; x++) ensure(14, x, 0)
    queue.pump()
    await settle()
    // Toutes redemandées cette frame : rien n'est évinçable, même au-dessus du plafond.
    queue.beginFrame()
    for (let x = 0; x < 3; x++) ensure(14, x, 0)
    queue.evict()
    expect(queue.size).toBe(3)
  })

  it('épargne les tuiles épinglées — le niveau de base est le filet anti-trou', async () => {
    // C'est ainsi que le fond raster protège `baseZoom` : sans lui, un pan soutenu pouvait
    // évincer le seul niveau qui couvre le globe, et découvrir des trous.
    const queue = new TileQueue<TestTile, string>({
      budget: () => ({ ...BUDGET, maxTiles: 1 }),
      make: (base) => ({ ...base, payload: null }),
      fetch: () => Promise.resolve('x'),
      commit: (t, r) => (t.payload = r),
      release: () => {},
      pinned: (t) => t.z === 2,
    })
    queue.beginFrame()
    const base = queue.ensure(2, 0, 0, 0, 1, 1, 0)
    queue.ensure(14, 0, 0, 0, 1, 1, 0)
    queue.pump()
    await settle()
    queue.beginFrame()
    queue.beginFrame()
    queue.evict()
    expect([...queue.values()]).toContain(base)
  })
})

describe('TileQueue — montage étalé', () => {
  it('ne monte que `mountPerFrame` tuiles par frame', async () => {
    const { queue, mounted, ensure } = makeQueue({ mountPerFrame: 1 })
    queue.beginFrame()
    for (let x = 0; x < 2; x++) ensure(14, x, 0)
    queue.pump()
    await settle()

    // Les deux chargements ont abouti, mais une seule tuile se monte par frame : c'est ce
    // qui empêche d'additionner leurs coûts (couleurs, arbre de collision) dans la même.
    queue.beginFrame()
    expect(mounted).toHaveLength(1)
    queue.beginFrame()
    expect(mounted).toHaveLength(2)
  })
})

/**
 * Le rendu à la demande (`performance.renderOnDemand`) ne peint que ce qui a changé, et
 * une tuile qui arrive change l'image sans que personne d'autre ne le signale. `busy` est
 * ce que le moteur interroge pour ça : il doit couvrir les TROIS temps du chargement —
 * en file, en vol, et monté en attente de frame — sinon la dernière tuile d'une vue
 * n'apparaît qu'au prochain mouvement de caméra.
 */
describe('TileQueue — travail en cours', () => {
  it('se déclare occupée de la mise en file au montage', async () => {
    const { queue, ensure } = makeQueue({ mountPerFrame: 0 })
    expect(queue.busy).toBe(false)

    queue.beginFrame()
    ensure(14, 0, 0)
    // En file, pas encore partie.
    expect(queue.busy).toBe(true)
    queue.pump()
    expect(queue.busy).toBe(true)

    // Chargement abouti, mais `mountPerFrame: 0` le retient : le travail n'est PAS fini,
    // et c'est le cas que le compte des chargements en vol ne voyait pas.
    await settle()
    queue.beginFrame()
    expect(queue.busy).toBe(true)
  })

  it('redevient disponible une fois la tuile montée', async () => {
    const { queue, mounted, ensure } = makeQueue()
    queue.beginFrame()
    ensure(14, 0, 0)
    queue.pump()
    await settle()
    queue.beginFrame()
    expect(mounted).toHaveLength(1)
    expect(queue.busy).toBe(false)
  })
})

describe('TileQueue — annulation', () => {
  it('abandonne le chargement d’une tuile évincée', async () => {
    const seen: AbortSignal[] = []
    const queue = new TileQueue<TestTile, string>({
      budget: () => BUDGET,
      make: (base) => ({ ...base, payload: null }),
      fetch: (_t, signal) => {
        seen.push(signal)
        return new Promise<string>(() => {})
      },
      commit: () => {},
      release: () => {},
    })
    queue.beginFrame()
    queue.ensure(14, 1, 1, 0, 1, 1, 0)
    queue.pump()
    expect(seen).toHaveLength(1)
    expect(seen[0]!.aborted).toBe(false)

    queue.clear()
    // Ni le réseau ni le worker n'ont plus de raison de finir : une navigation rapide
    // laissait sinon la file entièrement occupée à produire des tuiles hors de la vue.
    expect(seen[0]!.aborted).toBe(true)
  })
})

describe('TileQueue — file et backoff', () => {
  it('respecte la concurrence maximale', () => {
    const started: string[] = []
    const q = new TileQueue<TestTile, string>({
      budget: () => ({ ...BUDGET, maxInflight: 2 }),
      make: (base) => ({ ...base, payload: null }),
      fetch: (t) => {
        started.push(t.key)
        return new Promise<string>(() => {})
      },
      commit: () => {},
      release: () => {},
    })
    q.beginFrame()
    for (let x = 0; x < 5; x++) q.ensure(14, x, 0, 0, 1, 1, 0)
    q.pump()
    expect(started).toHaveLength(2)
    // La file reste utilisable : les trois autres attendent leur tour.
    expect(q.size).toBe(5)
  })

  it('ne tourne pas à l’infini quand toute la file est en attente de réessai', async () => {
    const { queue, results, ensure } = makeQueue({ retryDelays: [10_000], maxAttempts: 5 })
    results.set('14/0/0', Promise.reject(new Error('boom')))
    queue.beginFrame()
    ensure(14, 0, 0)
    queue.pump()
    await settle()
    // Le backoff repousse la tuile en queue : `pump` doit rendre la main, pas boucler.
    const spy = vi.fn(() => queue.pump())
    spy()
    expect(spy).toHaveReturned()
  })
})

describe('helpers de tuiles', () => {
  it('intersectsView compare bien les deux emprises', () => {
    const t = { west: 0, east: 1, north: 1, south: 0 } as Tile
    expect(intersectsView(t, { west: 0.5, east: 2, north: 2, south: 0.5 })).toBe(true)
    expect(intersectsView(t, { west: 2, east: 3, north: 2, south: 1.5 })).toBe(false)
  })

  it('tileRange borne la plage au globe', () => {
    const r = tileRange({ west: -180, east: 180, north: 85, south: -85 }, 1, 0, lngToTileX, latToTileY)
    expect(r).toEqual({ x0: 0, x1: 1, y0: 0, y1: 1 })
  })

  it('tileRing centre un anneau impair sur le point visé', () => {
    const r = tileRing({ lat: 0, lng: 0 }, 4, 3, lngToTileX, latToTileY)
    expect(r.x1 - r.x0).toBe(2)
    expect(r.y1 - r.y0).toBe(2)
  })

  it('tileRing se réduit à une tuile pour un côté de 1', () => {
    const r = tileRing({ lat: 48.85, lng: 2.35 }, 14, 1, lngToTileX, latToTileY)
    expect(r.x0).toBe(r.x1)
    expect(r.y0).toBe(r.y1)
  })
})

describe('TileQueue — erreur périssable, priorité et montage protégé', () => {
  it('redemande une tuile en erreur une fois `errorTtlMs` écoulé, si elle est encore vue', async () => {
    vi.useFakeTimers()
    try {
      const { queue, results, ensure } = makeQueue({ maxAttempts: 1, errorTtlMs: 1000 })
      results.set('3/1/1', Promise.reject(new Error('503')))
      queue.beginFrame()
      const t = ensure(3, 1, 1)
      queue.pump()
      await vi.advanceTimersByTimeAsync(0)
      expect(t.state).toBe('error')
      // Toujours vue avant le délai : rien ne bouge.
      queue.beginFrame()
      ensure(3, 1, 1)
      expect(t.state).toBe('error')
      // Délai passé : la tuile repart en file, compteur d'essais remis à zéro.
      results.set('3/1/1', Promise.resolve('ok'))
      vi.advanceTimersByTime(1001)
      queue.beginFrame()
      ensure(3, 1, 1)
      expect(t.state).toBe('queued')
      expect(t.attempts).toBe(0)
      queue.pump()
      await vi.advanceTimersByTimeAsync(0)
      queue.beginFrame()
      expect(t.state).toBe('ready')
    } finally {
      vi.useRealTimers()
    }
  })

  it('un échec différé (`TileDeferred`) ne consomme pas d’essai et replanifie à la date donnée', async () => {
    vi.useFakeTimers()
    try {
      const { queue, results, ensure } = makeQueue({ maxAttempts: 1 })
      const retryAt = Date.now() + 5000
      results.set('3/2/2', Promise.reject(new TileDeferred(retryAt)))
      queue.beginFrame()
      const t = ensure(3, 2, 2)
      queue.pump()
      await vi.advanceTimersByTimeAsync(0)
      expect(t.state).toBe('queued')
      expect(t.attempts).toBe(0)
      expect(t.retryAt).toBe(retryAt)
    } finally {
      vi.useRealTimers()
    }
  })

  it('sert d’abord les tuiles vues cette frame, et laisse tomber celles d’une vue quittée', async () => {
    const { queue, ensure, mounted } = makeQueue({ maxInflight: 1, staleFrames: 2 })
    queue.beginFrame()
    const old = ensure(5, 0, 0)
    // Trois frames sans revoir `old` : elle est périmée.
    queue.beginFrame()
    queue.beginFrame()
    queue.beginFrame()
    const fresh = ensure(5, 9, 9)
    queue.pump()
    expect(fresh.state).toBe('loading')
    expect(old.state).toBe('queued')
    await settle()
    queue.beginFrame()
    queue.pump()
    // `old` n'a pas été chargée : sortie de la file, pas de téléchargement pour une vue quittée.
    expect(old.state).toBe('queued')
    expect(mounted.map((t) => t.key)).toEqual(['5/9/9'])
    // Revue, elle reprend sa place.
    ensure(5, 0, 0)
    queue.pump()
    expect(old.state).toBe('loading')
  })

  it('un `commit` qui lève ne fige pas la tuile et ne sort pas de la frame', async () => {
    const released: string[] = []
    let boom = true
    const queue = new TileQueue<TestTile, string>({
      budget: () => ({ ...BUDGET, maxAttempts: 2, retryDelays: [0] }),
      make: (base) => ({ ...base, payload: null }),
      fetch: (t) => Promise.resolve(`data:${t.key}`),
      commit: (t, result) => {
        if (boom) throw new Error('géométrie invalide')
        t.payload = result
      },
      release: (t) => {
        released.push(t.key)
      },
    })
    queue.beginFrame()
    const t = queue.ensure(4, 1, 1, 0, 1, 1, 0)
    queue.pump()
    await settle()
    expect(() => queue.beginFrame()).not.toThrow()
    expect(t.state).toBe('queued')
    expect(released).toEqual(['4/1/1'])
    boom = false
    queue.pump()
    await settle()
    queue.beginFrame()
    expect(t.state).toBe('ready')
  })

  it('`clear` oublie aussi les résultats en attente de montage', async () => {
    const { queue, ensure } = makeQueue()
    queue.beginFrame()
    ensure(2, 1, 1)
    queue.pump()
    await settle()
    expect(queue.pending).toBe(1)
    queue.clear()
    expect(queue.pending).toBe(0)
    expect(queue.busy).toBe(false)
  })

  it('indexe par clé numérique et retrouve une tuile par sa clé lisible', () => {
    const { queue, ensure } = makeQueue()
    queue.beginFrame()
    const t = ensure(14, 8300, 5640)
    expect(t.key).toBe('14/8300/5640')
    expect(queue.get('14/8300/5640')).toBe(t)
    expect(queue.get('14/8300/5641')).toBeUndefined()
    expect(tileId(14, 8300, 5640)).not.toBe(tileId(14, 8300, 5641))
  })
})

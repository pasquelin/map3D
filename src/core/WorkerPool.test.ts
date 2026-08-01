import { describe, expect, it, vi } from 'vitest'
import { type PoolMessage, type PoolWorker, WorkerPool } from './WorkerPool'

type Req = PoolMessage & { n: number }
type Res = PoolMessage & { out: number }

/**
 * Worker simulé : il n'exécute rien de lui-même. Le test décide QUAND chaque demande
 * répond — c'est le seul moyen d'observer une file, une répartition ou un abandon, qui
 * n'existent qu'entre l'envoi et la réponse.
 */
class FakeWorker implements PoolWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  /** Demandes reçues, dans l'ordre. */
  readonly seen: Req[] = []
  /** Abandons reçus (`cancelMessage`). */
  readonly cancels: number[] = []
  terminated = false

  postMessage(message: unknown): void {
    const m = message as Req & { cancel?: true }
    if (m.cancel) this.cancels.push(m.id)
    else this.seen.push(m)
  }

  terminate(): void {
    this.terminated = true
  }

  /** Répond à la demande de rang `at` (par défaut la dernière reçue). */
  reply(at = this.seen.length - 1): void {
    const req = this.seen[at]
    if (!req) throw new Error('aucune demande à ce rang')
    this.onmessage?.({ data: { id: req.id, out: req.n * 2 } } as MessageEvent)
  }

  /** Nombre de demandes reçues et non encore soldées par le test. */
  get pending(): number {
    return this.seen.length
  }
}

function makePool(size: number, spawn?: () => PoolWorker | null) {
  const workers: FakeWorker[] = []
  const fallback = vi.fn(async (req: Req): Promise<Res> => ({ id: req.id, out: -req.n }))
  const pool = new WorkerPool<Req, Res>({
    spawn:
      spawn ??
      (() => {
        const w = new FakeWorker()
        workers.push(w)
        return w
      }),
    size: () => size,
    cancelMessage: (id) => ({ id, cancel: true }),
    fallback,
  })
  return { pool, workers, fallback }
}

const never = new AbortController().signal

describe('WorkerPool', () => {
  it('répartit les tâches sur plusieurs workers plutôt que de les sérialiser', () => {
    const { pool, workers } = makePool(3)
    void pool.run({ id: 0, n: 1 }, never)
    void pool.run({ id: 0, n: 2 }, never)
    void pool.run({ id: 0, n: 3 }, never)
    expect(workers).toHaveLength(3)
    expect(workers.map((w) => w.pending)).toEqual([1, 1, 1])
  })

  it('met en file au-delà du nombre de workers, et sert dès qu’un se libère', () => {
    const { pool, workers } = makePool(2)
    for (const n of [1, 2, 3]) void pool.run({ id: 0, n }, never)
    // La troisième attend : aucun worker n'a reçu deux demandes.
    expect(workers.map((w) => w.pending)).toEqual([1, 1])
    workers[0]!.reply()
    expect(workers[0]!.pending).toBe(2)
  })

  it('donne la tâche au premier worker LIBRE, pas à tour de rôle', () => {
    const { pool, workers } = makePool(2)
    void pool.run({ id: 0, n: 1 }, never)
    void pool.run({ id: 0, n: 2 }, never)
    // Le second se libère ; la tâche suivante doit lui revenir, pas au premier.
    workers[1]!.reply()
    void pool.run({ id: 0, n: 3 }, never)
    expect(workers[0]!.pending).toBe(1)
    expect(workers[1]!.pending).toBe(2)
  })

  it('résout chaque demande avec SA réponse, quel que soit l’ordre d’arrivée', async () => {
    const { pool, workers } = makePool(2)
    const a = pool.run({ id: 0, n: 10 }, never)
    const b = pool.run({ id: 0, n: 20 }, never)
    // Le second répond d'abord : l'appariement se fait par identifiant, pas par ordre.
    workers[1]!.reply()
    workers[0]!.reply()
    await expect(a).resolves.toEqual({ id: 1, out: 20 })
    await expect(b).resolves.toEqual({ id: 2, out: 40 })
  })

  it('abandonne une tâche en attente sans jamais l’envoyer', async () => {
    const { pool, workers } = makePool(1)
    void pool.run({ id: 0, n: 1 }, never)
    const ctl = new AbortController()
    const queued = pool.run({ id: 0, n: 2 }, ctl.signal)
    ctl.abort()
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' })
    // Le worker se libère : la tâche abandonnée ne doit pas ressurgir.
    workers[0]!.reply()
    expect(workers[0]!.pending).toBe(1)
  })

  it('prévient le worker qui détient la tâche abandonnée, et lui seul', async () => {
    const { pool, workers } = makePool(2)
    void pool.run({ id: 0, n: 1 }, never)
    const ctl = new AbortController()
    const running = pool.run({ id: 0, n: 2 }, ctl.signal)
    ctl.abort()
    await expect(running).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers[0]!.cancels).toEqual([])
    expect(workers[1]!.cancels).toEqual([2])
  })

  it('ne rend le worker disponible qu’à sa réponse, même après un abandon', async () => {
    const { pool, workers } = makePool(1)
    const ctl = new AbortController()
    const running = pool.run({ id: 0, n: 1 }, ctl.signal)
    ctl.abort()
    await expect(running).rejects.toMatchObject({ name: 'AbortError' })
    // Le worker calcule encore : lui poster une tâche de plus la ferait patienter derrière.
    void pool.run({ id: 0, n: 2 }, never)
    expect(workers[0]!.pending).toBe(1)
    // Il répond (réponse jetée) : il est alors réellement libre.
    workers[0]!.reply()
    expect(workers[0]!.pending).toBe(2)
  })

  it('survit à un worker qui NE RÉPOND PAS pendant un abandon', async () => {
    /**
     * ⚠️ Le test qui manquait, et le défaut qu'il a laissé passer.
     *
     * `FakeWorker.reply()` répond toujours ; le vrai worker, lui, avait été écrit pour se
     * TAIRE quand sa tâche était abandonnée. Comme le slot n'est rendu qu'à la réponse, il
     * restait occupé À VIE : au bout de `workerPoolSize` abandons — un seul dézoom, via
     * `TileQueue.clear()` — le pool entier était figé et plus aucune tuile n'arrivait.
     *
     * Le contrat côté worker est donc DUR : une demande, une réponse, toujours. Ce test
     * vérifie que le pool repart bien une fois la réponse (même vide) reçue.
     */
    const { pool, workers } = makePool(1)
    const ctl = new AbortController()
    const abandoned = pool.run({ id: 0, n: 1 }, ctl.signal)
    ctl.abort()
    await expect(abandoned).rejects.toMatchObject({ name: 'AbortError' })

    // Le worker solde sa tâche abandonnée, comme le vrai le fait désormais.
    workers[0]!.reply()

    // Le pool doit pouvoir servir la suivante : c'est exactement cela qui était cassé.
    const next = pool.run({ id: 0, n: 5 }, never)
    expect(workers[0]!.pending).toBe(2)
    workers[0]!.reply()
    await expect(next).resolves.toEqual({ id: 2, out: 10 })
  })

  it('borne un réglage de taille non fini plutôt que de vider le pool', () => {
    // `workerPoolSize` vient d'un merge de config hôte. `NaN` rendait les deux boucles de
    // `resize` fausses, le pool restait vide, et TOUT partait sur le thread principal —
    // plusieurs centaines de ms par tuile, sans que rien ne le signale.
    const pool = new WorkerPool<Req, Res>({
      spawn: () => new FakeWorker(),
      size: () => Number.NaN,
      cancelMessage: (id) => ({ id, cancel: true }),
      fallback: async (req) => ({ id: req.id, out: -req.n }),
    })
    void pool.run({ id: 0, n: 1 }, never)
    expect(pool.size).toBeGreaterThanOrEqual(1)
  })

  it('remplace un worker mort et lui reprend sa tâche', async () => {
    const { pool, workers } = makePool(1)
    const task = pool.run({ id: 0, n: 7 }, never)
    workers[0]!.onerror?.(new Error('worker interrompu'))
    expect(workers[0]!.terminated).toBe(true)
    // Un worker neuf a pris la place, et la tâche orpheline lui a été redonnée.
    expect(workers).toHaveLength(2)
    expect(workers[1]!.seen.map((r) => r.n)).toEqual([7])
    workers[1]!.reply()
    await expect(task).resolves.toEqual({ id: 1, out: 14 })
  })

  it('bascule au repli quand aucun worker ne peut naître', async () => {
    const { pool, fallback } = makePool(2, () => null)
    await expect(pool.run({ id: 0, n: 5 }, never)).resolves.toEqual({ id: 0, out: -5 })
    expect(fallback).toHaveBeenCalledOnce()
    expect(pool.size).toBe(0)
  })

  it('solde la file au repli quand le dernier worker meurt sans remplaçant', async () => {
    let allow = true
    const born: FakeWorker[] = []
    const { pool, fallback } = makePool(1, () => {
      if (!allow) return null
      const w = new FakeWorker()
      born.push(w)
      return w
    })
    void pool.run({ id: 0, n: 1 }, never)
    const queued = pool.run({ id: 0, n: 2 }, never)
    allow = false
    born[0]!.onerror?.(new Error('mort'))
    // Sans repli, cette promesse ne serait jamais résolue et figerait la file de tuiles.
    // L'identifiant rendu est celui de l'APPELANT : le repli ignore la numérotation interne.
    await expect(queued).resolves.toEqual({ id: 0, out: -2 })
    expect(fallback).toHaveBeenCalled()
  })

  it('réduit le pool à chaud sans interrompre une tâche en vol', () => {
    let want = 3
    const workers: FakeWorker[] = []
    const pool = new WorkerPool<Req, Res>({
      spawn: () => {
        const w = new FakeWorker()
        workers.push(w)
        return w
      },
      size: () => want,
      cancelMessage: (id) => ({ id, cancel: true }),
      fallback: async (req) => ({ id: req.id, out: -req.n }),
    })
    void pool.run({ id: 0, n: 1 }, never)
    expect(pool.size).toBe(3)
    want = 1
    void pool.run({ id: 0, n: 2 }, never)
    // Seuls les OISIFS sont terminés — le worker occupé est celui qui reste, et sa tâche
    // n'est pas interrompue pour respecter un réglage baissé à chaud.
    expect(pool.size).toBe(1)
    expect(workers[0]!.terminated).toBe(false)
    expect(workers[1]!.terminated).toBe(true)
    expect(workers[2]!.terminated).toBe(true)
    // Le pool étant réduit à son unique worker occupé, la seconde tâche attend son tour.
    expect(workers[0]!.pending).toBe(1)
  })

  it('rejette tout ce qui reste au démontage', async () => {
    const { pool, workers } = makePool(1)
    const running = pool.run({ id: 0, n: 1 }, never)
    const queued = pool.run({ id: 0, n: 2 }, never)
    pool.dispose()
    await expect(running).rejects.toThrow('pool démonté')
    await expect(queued).rejects.toThrow('pool démonté')
    expect(workers[0]!.terminated).toBe(true)
    await expect(pool.run({ id: 0, n: 3 }, never)).rejects.toThrow('pool démonté')
  })
})

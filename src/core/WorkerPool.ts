// Gestionnaire de workers : plusieurs fils de calcul derrière une seule promesse.
//
// Un worker unique suffit tant qu'il ne porte que le décodage d'une tuile (~19 ms). Il ne
// suffit plus dès qu'il porte aussi l'arbre de collision (~41 ms de plus) : les demandes
// s'y sérialisent, et une vue qui en réclame trente les paie l'une après l'autre. Mesuré
// sur 24 tuiles z14 denses : 1430 ms à un worker, 587 ms à trois, 559 ms à quatre — puis
// plus rien, et une RÉGRESSION à huit (591 ms). D'où un plafond, et non « autant que de
// cœurs ».
//
// Sans three.js ni DOM : le pool se teste seul, avec un worker simulé.

/** Toute demande porte son numéro — c'est lui qui apparie la réponse à sa promesse. */
export type PoolMessage = { id: number }

/**
 * Le worker vu par le pool. `Worker` du DOM le satisfait ; un test fournit un objet.
 *
 * Réduit au strict nécessaire plutôt que d'exiger `Worker` : la lib se construit avec
 * `lib.dom`, mais un test n'a pas à fabriquer un vrai worker pour vérifier une file.
 */
export type PoolWorker = {
  postMessage(message: unknown, transfer?: Transferable[]): void
  terminate(): void
  onmessage: ((e: MessageEvent) => void) | null
  onerror: ((e: unknown) => void) | null
}

export type WorkerPoolOptions<Req extends PoolMessage, Res extends PoolMessage> = {
  /**
   * Fabrique un worker, ou `null` si l'environnement le refuse (CSP sans
   * `worker-src blob:`). SYNCHRONE : l'appelant a déjà résolu son import dynamique — le
   * pool ne connaît ni module ni URL.
   */
  spawn(): PoolWorker | null
  /** Taille visée, relue à chaque demande : le réglage est modifiable à chaud. */
  size(): number
  /** Message d'abandon posté au worker qui détient la tâche. */
  cancelMessage(id: number): unknown
  /**
   * Chemin sans worker : environnement qui n'en a pas, ou pool entièrement en panne.
   *
   * Reçoit la demande TELLE QUE FOURNIE — le pool ne lui impose pas sa numérotation
   * interne, qui n'existe que pour apparier une réponse de worker à sa promesse.
   */
  fallback(req: Req, signal: AbortSignal): Promise<Res>
  /**
   * Remplacements de worker qu'une MÊME tâche peut consommer avant d'être rejetée (défaut
   * `1`). Une tuile qui tue son worker de façon déterministe (OOM du worker, blob refusé)
   * relançait sinon `error → terminate → spawn → dispatch` sans fin, et sa promesse ne se
   * réglait jamais — le créneau `inflight` de la file de tuiles restait consommé pour de bon.
   */
  taskRetries?: number
  /**
   * Morts consécutives sans aucune réponse réussie au-delà desquelles le pool cesse de
   * recréer des workers et passe au repli (défaut `3`) : un environnement où les workers
   * meurent tous aussitôt ne mérite pas d'en créer un par tâche.
   */
  consecutiveDeaths?: number
}

/** Défauts des bornes de résilience — cf. `WorkerPoolOptions`. */
const DEFAULT_TASK_RETRIES = 1
const DEFAULT_CONSECUTIVE_DEATHS = 3

/** Worker mort sur une tâche qui a épuisé ses remplacements — réessayable côté file de tuiles. */
export class PoolCrashError extends Error {
  constructor() {
    super('worker mort pendant la tâche')
    this.name = 'PoolCrashError'
  }
}

/** Abandon demandé par l'appelant — distinct d'un échec, cf. `TileQueue.retryOrFail`. */
export class PoolAbortError extends Error {
  constructor() {
    super('tâche abandonnée')
    this.name = 'AbortError'
  }
}

type Task<Req, Res> = {
  id: number
  req: Req
  resolve: (res: Res) => void
  reject: (err: Error) => void
  /** Détache l'écoute de l'abandon quand la tâche se solde, quelle qu'en soit l'issue. */
  release: () => void
  /** Workers morts en la traitant — cf. `taskRetries`. */
  crashes: number
}

type Slot<Req, Res> = {
  worker: PoolWorker
  /** Tâche que ce worker traite, `null` s'il est libre. */
  busy: Task<Req, Res> | null
}

/**
 * Plafond dur, indépendant du réglage : au-delà, la mesure montre une régression (les
 * workers se disputent la mémoire et le ramasse-miettes, et chaque tuile en vol retient
 * plusieurs mégaoctets). Un hôte peut descendre sous ce plafond, jamais le franchir.
 */
const MAX_WORKERS = 6

/** Cœurs annoncés par la machine, `4` si l'environnement ne le dit pas (Node, SSR). */
function hardwareThreads(): number {
  const n = globalThis.navigator?.hardwareConcurrency
  return typeof n === 'number' && n > 0 ? n : 4
}

export class WorkerPool<Req extends PoolMessage, Res extends PoolMessage> {
  private readonly slots: Slot<Req, Res>[] = []
  /** Tâches en attente d'un worker libre — servies dans l'ordre d'arrivée. */
  private readonly queue: Task<Req, Res>[] = []
  /**
   * Tâches dont on attend encore une réponse. Une tâche ABANDONNÉE en sort aussitôt, mais
   * son worker reste occupé jusqu'à sa réponse : c'est en la retrouvant absente d'ici qu'on
   * sait qu'il faut la jeter plutôt que la résoudre.
   */
  private readonly inflight = new Map<number, Task<Req, Res>>()
  private seq = 0
  private disposed = false
  /** Aucun worker n'a pu naître : tout passe au repli, et on cesse d'essayer. */
  private spawnFailed = false
  /** Morts de worker depuis la dernière réponse réussie — cf. `consecutiveDeaths`. */
  private deaths = 0

  constructor(private readonly opts: WorkerPoolOptions<Req, Res>) {}

  /** Workers vivants — lu par les tests et le diagnostic. */
  get size(): number {
    return this.slots.length
  }

  /**
   * Poste une tâche et rend sa réponse. `signal` l'abandonne : en attente, elle quitte la
   * file ; en vol, son worker en est informé.
   */
  run(req: Req, signal: AbortSignal): Promise<Res> {
    if (this.disposed) return Promise.reject(new Error('pool démonté'))
    if (signal.aborted) return Promise.reject(new PoolAbortError())
    this.resize()
    // Aucun worker (environnement sans `Worker`, CSP, panne totale) : le repli porte le
    // calcul. Il gèle le thread principal, mais il RÉPOND — cf. `BuildingsSource`.
    if (this.slots.length === 0) return this.opts.fallback(req, signal)

    const id = ++this.seq
    return new Promise<Res>((resolve, reject) => {
      const onAbort = (): void => this.abort(id)
      signal.addEventListener('abort', onAbort, { once: true })
      const task: Task<Req, Res> = {
        id,
        req,
        resolve,
        reject,
        release: () => signal.removeEventListener('abort', onAbort),
        crashes: 0,
      }

      this.inflight.set(id, task)
      const free = this.slots.find((s) => s.busy === null)
      // Premier worker LIBRE, jamais un tour de rôle : les tuiles vont du simple au double
      // (542 Ko à 1,17 Mo mesurés sur trois tuiles parisiennes), et un tour de rôle aveugle
      // laisserait trois workers oisifs pendant que le quatrième finit une tuile lourde.
      if (free) this.dispatch(free, task)
      else this.queue.push(task)
    })
  }

  /** Ajuste le nombre de workers au réglage courant — à la hausse comme à la baisse. */
  private resize(): void {
    if (this.spawnFailed) return
    // `Number.isFinite` d'abord : un réglage d'hôte qui arrive à `NaN` rendait `want`
    // NaN, les deux boucles fausses, et le pool restait vide — donc TOUT sur le thread
    // principal, plusieurs centaines de ms par tuile, sans que rien ne le signale.
    const asked = Math.trunc(this.opts.size())
    const wanted = Number.isFinite(asked) ? asked : 1
    const want = Math.max(1, Math.min(wanted, MAX_WORKERS, hardwareThreads() - 1))
    while (this.slots.length < want) {
      const worker = this.opts.spawn()
      if (!worker) {
        // Premier échec de création : inutile de réessayer à chaque tâche. Les workers déjà
        // nés continuent de servir ; c'est seulement la croissance qui s'arrête.
        this.spawnFailed = true
        return
      }
      this.slots.push(this.wire(worker))
    }
    // On ne retire QUE des workers libres : interrompre une tâche en vol pour respecter un
    // réglage baissé à chaud coûterait le travail déjà fait.
    for (let i = this.slots.length - 1; i >= 0 && this.slots.length > want; i--) {
      const slot = this.slots[i]!
      if (slot.busy) continue
      slot.worker.terminate()
      this.slots.splice(i, 1)
    }
  }

  /** Branche les deux écoutes d'un worker neuf. */
  private wire(worker: PoolWorker): Slot<Req, Res> {
    const slot: Slot<Req, Res> = { worker, busy: null }
    worker.onmessage = (e: MessageEvent) => this.settle(slot, e.data as Res)
    worker.onerror = () => this.replace(slot)
    return slot
  }

  private dispatch(slot: Slot<Req, Res>, task: Task<Req, Res>): void {
    slot.busy = task
    slot.worker.postMessage({ ...task.req, id: task.id })
  }

  /**
   * Réponse d'un worker. Le slot est libéré ICI et pas à l'abandon : le worker traite encore
   * sa tâche abandonnée (seul son téléchargement s'interrompt, pas son calcul), et le croire
   * libre lui vaudrait une seconde tâche qu'il ferait patienter derrière la première.
   */
  private settle(slot: Slot<Req, Res>, res: Res): void {
    if (slot.busy?.id !== res.id) return
    const task = slot.busy
    slot.busy = null
    // Une réponse prouve que les workers vivent : la série de morts repart de zéro.
    this.deaths = 0

    const live = this.inflight.get(res.id)
    if (live) {
      this.inflight.delete(res.id)
      task.release()
      task.resolve(res)
    }
    // Abandonnée entre-temps : la réponse est jetée, mais le worker, lui, est bien libre.
    this.pump(slot)
  }

  /** Donne à un worker libre la tâche suivante, s'il y en a une qui tient toujours. */
  private pump(slot: Slot<Req, Res>): void {
    while (this.queue.length > 0) {
      const next = this.queue.shift()!
      // Abandonnée pendant l'attente : elle a déjà été rejetée, on passe à la suivante.
      if (!this.inflight.has(next.id)) continue
      this.dispatch(slot, next)
      return
    }
  }

  /**
   * Abandonne une tâche. En vol, le worker en est prévenu — son téléchargement s'interrompt
   * et il cède sa place plus tôt. En attente, elle ne partira jamais.
   */
  private abort(id: number): void {
    const task = this.inflight.get(id)
    if (!task) return
    this.inflight.delete(id)
    task.release()
    const holder = this.slots.find((s) => s.busy?.id === id)
    if (holder) holder.worker.postMessage(this.opts.cancelMessage(id))
    task.reject(new PoolAbortError())
  }

  /**
   * Remplace un worker mort.
   *
   * Un worker qui meurt ne se répare pas, mais il n'emporte PAS le pool : sa tâche repart
   * en file, un worker neuf prend sa place, et les autres n'ont rien vu. Le comportement
   * précédent — un seul worker, donc toute la carte basculée sur le thread principal à la
   * première erreur — n'avait pas d'autre choix.
   */
  private replace(slot: Slot<Req, Res>): void {
    const orphan = slot.busy
    slot.busy = null
    slot.worker.terminate()
    const i = this.slots.indexOf(slot)
    if (i >= 0) this.slots.splice(i, 1)
    this.deaths++
    if (orphan && this.inflight.has(orphan.id)) {
      orphan.crashes++
      if (orphan.crashes > (this.opts.taskRetries ?? DEFAULT_TASK_RETRIES)) {
        // La tâche elle-même tue les workers : la rejeter rend la main à la file de tuiles
        // (backoff, puis abandon), au lieu de lui faire consommer un worker par tentative.
        this.inflight.delete(orphan.id)
        orphan.release()
        orphan.reject(new PoolCrashError())
      } else {
        // Remise en TÊTE : la tâche attend déjà depuis un tour complet.
        this.queue.unshift(orphan)
      }
    }
    if (this.disposed) return
    const giveUp = this.deaths >= (this.opts.consecutiveDeaths ?? DEFAULT_CONSECUTIVE_DEATHS)
    const fresh = giveUp ? null : this.opts.spawn()
    if (fresh) {
      const next = this.wire(fresh)
      this.slots.push(next)
      this.pump(next)
      return
    }
    // Plus aucun worker ne naît (ou ils meurent tous aussitôt). Ce qui attend part au repli
    // plutôt que de rester en suspens — une promesse jamais résolue gèlerait la file de
    // tuiles pour de bon.
    this.spawnFailed = true
    if (this.slots.length === 0) this.drainToFallback()
  }

  /** Solde la file par le chemin sans worker (pool entièrement mort). */
  private drainToFallback(): void {
    const waiting = this.queue.splice(0)
    for (const task of waiting) {
      if (!this.inflight.has(task.id)) continue
      this.inflight.delete(task.id)
      task.release()
      // `AbortSignal` déjà consommé par `run` : le repli reçoit un signal neuf, jamais
      // abandonné — la tâche a survécu à la panne, elle n'a pas à être annulée avec elle.
      this.opts.fallback(task.req, new AbortController().signal).then(task.resolve, task.reject)
    }
  }

  /** Termine tous les workers et rejette ce qui attendait. */
  dispose(): void {
    this.disposed = true
    for (const slot of this.slots) slot.worker.terminate()
    this.slots.length = 0
    this.queue.length = 0
    for (const task of this.inflight.values()) {
      task.release()
      task.reject(new Error('pool démonté'))
    }
    this.inflight.clear()
  }
}

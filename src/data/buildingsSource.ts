// Façade du worker d'extrusion : `BuildingsLayer` demande une tuile, reçoit des tampons.
//
// Le worker est créé À LA PREMIÈRE TUILE réellement demandée, par import dynamique : un
// hôte qui garde le volume photoréaliste ne télécharge ni le worker ni le décodeur MVT.
// Là où `Worker` n'existe pas (rendu serveur, jsdom des tests), le MÊME pipeline tourne
// sur le thread principal — c'est le seul repli, et il partage le code, donc il ne peut
// pas se comporter autrement.
//
// ⚠️ Prérequis CSP : le worker est monté depuis un `Blob` (`worker-src blob:`). Sous une
// politique qui l'interdit, la création échoue et tout bascule sur le thread principal —
// silencieusement, d'où l'avertissement de développement ci-dessous.

import type { BuildingsConfig } from '../config/types'
import type { BuildRequest, BuildResponse } from './buildingsWorker'
import type { ExtrudedTile, Shading, TileFrame } from './mvt'

/** `null` = rien à extruder ici (404, ou tuile sans bâtiment). */
export type BuiltTile = ExtrudedTile | null

type Pending = {
  resolve: (tile: BuiltTile) => void
  reject: (err: Error) => void
  /** Détache l'écoute de l'annulation quand la demande se solde. */
  release: () => void
}

export class BuildingsSource {
  private ready: Promise<Worker | null> | null = null
  private readonly pending = new Map<number, Pending>()
  private seq = 0
  private disposed = false

  /**
   * Télécharge et extrude une tuile. Rejette sur échec réseau ou décodage — la file
   * d'attente de `BuildingsLayer` décide alors du réessai.
   *
   * `signal` porte l'abandon : une tuile évincée pendant son chargement n'a plus de raison
   * d'occuper le réseau ni le worker, qui traite les demandes une par une. Sans lui, une
   * navigation rapide laissait la file entièrement occupée à extruder des tuiles déjà
   * sorties de la vue.
   */
  async build(
    url: string,
    cfg: BuildingsConfig,
    frame: TileFrame,
    shading: Shading,
    signal: AbortSignal,
  ): Promise<BuiltTile> {
    const worker = await this.ensureWorker()
    if (this.disposed) return null
    if (signal.aborted) throw new AbortError()
    if (!worker) return buildOnMainThread(url, cfg, frame, shading, signal)

    const id = ++this.seq
    const request: BuildRequest = { id, url, cfg, frame, shading }
    return new Promise<BuiltTile>((resolve, reject) => {
      const onAbort = () => {
        this.pending.delete(id)
        // Le worker abandonne à son tour : son `fetch` est annulable, et une extrusion
        // déjà commencée cède au moins sa place à la suivante.
        worker.postMessage({ id, cancel: true } satisfies BuildRequest)
        reject(new AbortError())
      }
      signal.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, {
        resolve,
        reject,
        release: () => signal.removeEventListener('abort', onAbort),
      })
      worker.postMessage(request)
    })
  }

  private ensureWorker(): Promise<Worker | null> {
    // Garde unique : `dispose` n'a plus à remettre `ready` à zéro — ce qui RÉARMAIT la
    // création, un `build()` tardif reconstruisant un worker sur une carte démontée.
    if (this.disposed) return Promise.resolve(null)
    this.ready ??= (async () => {
      if (typeof Worker === 'undefined') return null
      try {
        // `?worker&inline` : Vite empaquette le worker en blob autonome AU BUILD DE LA
        // LIB. Le paquet publié ne demande donc aucune configuration au bundler de
        // l'hôte, et aucune URL d'asset à servir.
        const mod = await import('./buildingsWorker?worker&inline')
        const worker = new mod.default()
        worker.onmessage = (e: MessageEvent<BuildResponse>) => this.settle(e.data)
        // Un worker mort ne se répare pas : on solde les demandes en vol, et les
        // suivantes repartent sur le thread principal plutôt que de rester en attente.
        worker.onerror = () => {
          this.failAll(new Error('worker de bâtiments interrompu'))
          this.ready = Promise.resolve(null)
          warnMainThreadFallback('le worker a été interrompu')
          worker.terminate()
        }
        return worker
      } catch {
        // Cause la plus probable : une CSP sans `worker-src blob:`. Le repli fonctionne,
        // mais il extrude sur le thread principal — plusieurs centaines de millisecondes
        // par tuile, indiscernables d'une machine lente si personne ne le dit.
        warnMainThreadFallback('sa création a échoué (CSP `worker-src blob:` ?)')
        return null
      }
    })()
    return this.ready
  }

  private settle(msg: BuildResponse): void {
    if ('cancel' in msg) return
    const p = this.pending.get(msg.id)
    if (!p) return
    this.pending.delete(msg.id)
    p.release()
    if (!msg.ok) p.reject(new Error(msg.error))
    else if (msg.empty) p.resolve(null)
    else {
      const { positions, positionScale, indices, colorIndex, shade, palette } = msg
      p.resolve({ positions, positionScale, indices, colorIndex, shade, palette })
    }
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) {
      p.release()
      p.reject(err)
    }
    this.pending.clear()
  }

  dispose(): void {
    this.disposed = true
    this.failAll(new Error('carte démontée'))
    void this.ready?.then((w) => w?.terminate())
  }
}

/**
 * Abandon demandé par l'appelant. Distinct d'un échec : la file ne doit pas le compter
 * comme une tentative ratée — la tuile a simplement cessé d'être utile.
 */
export class AbortError extends Error {
  constructor() {
    super('tuile abandonnée')
    this.name = 'AbortError'
  }
}

/** Dit UNE fois que l'extrusion a basculé sur le thread principal, et pourquoi. */
let warned = false
function warnMainThreadFallback(reason: string): void {
  if (warned || typeof console === 'undefined') return
  warned = true
  console.warn(
    `[map3d] extrusion des bâtiments sur le thread principal : ${reason}. ` +
      'Chaque tuile y gèle la carte plusieurs centaines de millisecondes.',
  )
}

/**
 * Repli sans `Worker` : même pipeline, même résultat, mais sur le thread principal.
 *
 * `./mvt` est chargé en IMPORT DYNAMIQUE, et lui seul tire le décodeur MVT : un hôte resté
 * sur le volume photoréaliste ne télécharge donc jamais ni le worker ni ses dépendances.
 */
async function buildOnMainThread(
  url: string,
  cfg: BuildingsConfig,
  frame: TileFrame,
  shading: Shading,
  signal: AbortSignal,
): Promise<BuiltTile> {
  const { fetchAndExtrude } = await import('./mvt')
  return fetchAndExtrude(url, cfg, frame, shading, signal)
}

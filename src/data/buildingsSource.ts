// Façade du pool d'extrusion : `BuildingsLayer` demande une tuile, reçoit des tampons.
//
// Les workers sont créés À LA PREMIÈRE TUILE réellement demandée, par import dynamique : un
// hôte qui garde le volume photoréaliste ne télécharge ni les workers ni le décodeur MVT.
// Là où `Worker` n'existe pas (rendu serveur, jsdom des tests), le MÊME pipeline tourne
// sur le thread principal — c'est le seul repli, et il partage le code (`buildTile`), donc
// il ne peut pas se comporter autrement.
//
// ⚠️ PLUSIEURS workers, et non plus un seul. Depuis que l'arbre de collision se construit
// côté worker (cf. `buildTile`), une tuile dense y coûte ~60 ms au lieu de ~19 : un fil
// unique les sérialiserait et ferait apparaître les bâtiments plus lentement qu'avant,
// alors même que le thread principal ne gèle plus. Mesuré sur 24 tuiles z14 parisiennes :
// 1430 ms à un worker, 587 ms à trois, 559 ms à quatre — et une RÉGRESSION à huit. Le
// nombre se règle par `providers.buildings.workerPoolSize`.
//
// ⚠️ Prérequis CSP : les workers sont montés depuis un `Blob` (`worker-src blob:`). Sous une
// politique qui l'interdit, la création échoue et tout bascule sur le thread principal —
// silencieusement, d'où l'avertissement de développement ci-dessous.

import type { BuildingsConfig } from '../config/types'
import { type PoolWorker, WorkerPool } from '../core/WorkerPool'
import type { BuildRequest, BuildResponse } from './buildingsWorker'
import type { BuiltTile } from './buildTile'
import type { Shading, TileFrame } from './mvt'

/** Une demande telle que l'appelant la pose — le pool lui attribue ensuite son numéro. */
type BuildInput = Extract<BuildRequest, { url: string }>

export class BuildingsSource {
  private ready: Promise<WorkerPool<BuildInput, BuildResponse>> | null = null
  private disposed = false
  /**
   * Pool résolu, pour les lectures SYNCHRONES (diagnostic). `ready` est une promesse :
   * l'attendre pour afficher un compteur ferait dépendre le panneau d'un `await`, et
   * `0` avant la première tuile est la réponse juste — aucun worker ne vit encore.
   */
  private live: WorkerPool<BuildInput, BuildResponse> | null = null

  /** Workers vivants. `0` avant la première tuile, ou en repli sur le thread principal. */
  get workerCount(): number {
    return this.live?.size ?? 0
  }

  /**
   * `poolSize` est un ACCESSEUR et non une valeur : le réglage est relu à chaque demande,
   * donc modifiable à chaud, comme les autres budgets de la file de tuiles.
   */
  constructor(private readonly poolSize: () => number = () => 1) {}

  /**
   * Télécharge et extrude une tuile. Rejette sur échec réseau ou décodage — la file
   * d'attente de `BuildingsLayer` décide alors du réessai.
   *
   * `signal` porte l'abandon : une tuile évincée pendant son chargement n'a plus de raison
   * d'occuper le réseau ni un worker. Sans lui, une navigation rapide laissait le pool
   * entièrement occupé à extruder des tuiles déjà sorties de la vue.
   */
  async build(
    url: string,
    cfg: BuildingsConfig,
    frame: TileFrame,
    shading: Shading,
    signal: AbortSignal,
  ): Promise<BuiltTile> {
    const pool = await this.ensurePool()
    if (this.disposed) return null
    const res = await pool.run({ id: 0, url, cfg, frame, shading }, signal)
    if (!res.ok) throw new Error(res.error)
    if (res.empty) return null
    const { positions, positionScale, indices, colorIndex, shade, palette, buildings, bvh } = res
    return { positions, positionScale, indices, colorIndex, shade, palette, buildings, bvh }
  }

  /**
   * Le pool, créé une seule fois. L'import dynamique est résolu ICI, AVANT lui : le pool
   * exige une fabrique synchrone, seule façon pour lui de remplacer un worker mort sans
   * laisser la tâche de celui-ci en suspens le temps d'un `await`.
   */
  private ensurePool(): Promise<WorkerPool<BuildInput, BuildResponse>> {
    this.ready ??= (async () => {
      const spawn = await workerFactory()
      const pool = new WorkerPool<BuildInput, BuildResponse>({
        spawn,
        size: this.poolSize,
        cancelMessage: (id) => ({ id, cancel: true }) satisfies BuildRequest,
        // ⚠️ Enveloppé pour que le repli reste ANNONCÉ. Le worker unique prévenait quand il
        // mourait ; avec le pool, une bascule (pas de `Worker`, CSP, ou dernier worker mort)
        // se serait faite en silence — plusieurs centaines de ms par tuile, indiscernables
        // d'une machine lente. La garde `warned` rend l'avertissement unique.
        fallback: (req, signal) => {
          warnMainThreadFallback('aucun worker disponible')
          return runOnMainThread(req, signal)
        },
      })
      this.live = pool
      return pool
    })()
    return this.ready
  }

  dispose(): void {
    this.disposed = true
    this.live = null
    // Le pool peut encore être en cours de création : on l'attend pour le démonter, sinon
    // ses workers naîtraient sur une carte déjà partie.
    void this.ready?.then((p) => p.dispose())
  }
}

/**
 * Fabrique de workers — ou une fabrique qui rend toujours `null` si l'environnement les
 * refuse. Le module n'est importé qu'UNE fois : c'est le même blob qui sert tout le pool.
 */
async function workerFactory(): Promise<() => PoolWorker | null> {
  if (typeof Worker === 'undefined') return () => null
  try {
    // `?worker&inline` : Vite empaquette le worker en blob autonome AU BUILD DE LA
    // LIB. Le paquet publié ne demande donc aucune configuration au bundler de
    // l'hôte, et aucune URL d'asset à servir.
    const mod = await import('./buildingsWorker?worker&inline')
    return () => {
      try {
        return new mod.default() as unknown as PoolWorker
      } catch {
        // Échec APRÈS coup (mémoire, quota de workers du navigateur) : le pool cesse de
        // croître et se contente de ceux qui vivent déjà.
        return null
      }
    }
  } catch {
    // Cause la plus probable : une CSP sans `worker-src blob:`. Le repli fonctionne,
    // mais il extrude sur le thread principal — plusieurs centaines de millisecondes
    // par tuile, indiscernables d'une machine lente si personne ne le dit.
    warnMainThreadFallback('leur création a échoué (CSP `worker-src blob:` ?)')
    return () => null
  }
}

/**
 * Repli sans worker : même pipeline, même résultat, mais sur le thread principal.
 *
 * `./buildTile` est chargé en IMPORT DYNAMIQUE, et lui seul tire le décodeur MVT : un hôte
 * resté sur le volume photoréaliste ne télécharge donc jamais ni les workers ni leurs
 * dépendances. La réponse est mise en forme comme celle d'un worker — c'est ce qui laisse
 * à `build` un seul chemin de lecture.
 */
async function runOnMainThread(req: BuildInput, signal: AbortSignal): Promise<BuildResponse> {
  const { buildTile } = await import('./buildTile')
  try {
    const out = await buildTile(req.url, req.cfg, req.frame, req.shading, signal)
    return out ? { id: req.id, ok: true, empty: false, ...out } : { id: req.id, ok: true, empty: true }
  } catch (err) {
    return { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) }
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

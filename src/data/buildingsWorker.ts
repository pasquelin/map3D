// Worker d'extrusion des bâtiments : télécharge la tuile vectorielle, la décode, la
// transforme en tampons de géométrie et l'indexe, hors du thread principal.
//
// Ce qu'il déplace n'est pas anecdotique : une tuile z14 parisienne porte 52 000 sommets
// d'anneaux, soit ~131 000 triangles et ~231 000 sommets à écrire. Fait sur le thread
// principal — ce qu'il faisait — chaque tuile qui arrivait gelait la carte plusieurs
// centaines de millisecondes, et une vue en réclame plusieurs d'un coup.
//
// ⚠️ Il construit AUSSI l'arbre de collision (cf. `buildTile`), et connaît donc three —
// ce qui n'était pas le cas. La crainte d'y « embarquer le moteur entier » a été mesurée
// plutôt que supposée : le blob pèse ~48 Ko gzip, three-mesh-bvh compris, parce que le
// tree-shaking ne retient que `BufferGeometry`, `BufferAttribute` et leurs dépendances.
// En regard, l'arbre coûtait ~41 ms de gel par tuile sur le thread principal — 97 % du
// coût de montage, que `mountPerFrame` ne pouvait qu'étaler.
//
// Plusieurs instances de ce worker tournent en parallèle derrière `WorkerPool` : le
// pipeline complet pèse ~60 ms par tuile dense, et un seul fil les sérialiserait.

import type { BuildingsConfig } from '../config/types'
import { type BuiltTile, buildTile, transferablesOf } from './buildTile'
import type { Shading, TileFrame } from './mvt'

export type BuildRequest =
  | {
      /** Corrélation demande ↔ réponse : le worker traite dans l'ordre, pas forcément. */
      id: number
      url: string
      cfg: BuildingsConfig
      frame: TileFrame
      /** Soleil de convention du thème — l'ombrage est cuit dans les couleurs de sommets. */
      shading: Shading
    }
  /** La tuile n'intéresse plus personne (évincée) : abandonner ce qui peut l'être. */
  | { id: number; cancel: true }

export type BuildResponse =
  | ({ id: number; ok: true; empty: false } & NonNullable<BuiltTile>)
  /** Rien à extruder ici : 404 (mer, zone non couverte) ou tuile sans bâtiment. */
  | { id: number; ok: true; empty: true }
  | { id: number; ok: false; error: string }

/**
 * `lib` contient DOM et WebWorker à la fois (la lib sert les deux) : `self` y est typé
 * pour la fenêtre. On rétablit localement le contrat réel du worker, plutôt que de
 * scinder le tsconfig pour un seul fichier.
 */
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<BuildRequest>) => void) | null
  postMessage(message: BuildResponse, transfer?: Transferable[]): void
}

/** Abandons en cours, par identifiant de demande — le `fetch` de chacun s'y raccroche. */
const inflight = new Map<number, AbortController>()

ctx.onmessage = async (e: MessageEvent<BuildRequest>): Promise<void> => {
  const msg = e.data
  if ('cancel' in msg) {
    inflight.get(msg.id)?.abort()
    inflight.delete(msg.id)
    return
  }
  const { id, url, cfg, frame, shading } = msg
  const abort = new AbortController()
  inflight.set(id, abort)
  try {
    const out = await buildTile(url, cfg, frame, shading, abort.signal)
    // Abandonnée pendant le téléchargement : plus personne n'attend la réponse, et
    // l'émettre ferait traverser des mégaoctets pour rien.
    if (abort.signal.aborted) return
    if (!out) {
      ctx.postMessage({ id, ok: true, empty: true })
      return
    }
    ctx.postMessage({ id, ok: true, empty: false, ...out }, transferablesOf(out))
  } catch (err) {
    if (abort.signal.aborted) return
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  } finally {
    inflight.delete(id)
  }
}

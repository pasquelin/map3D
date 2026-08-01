// Pipeline complet d'une tuile de bâtiments : téléchargement, décodage, extrusion, arbre
// de collision. Un SEUL chemin, partagé par le worker (`buildingsWorker`) et par le repli
// synchrone de `BuildingsSource` — c'est ce qui garantit qu'un environnement sans `Worker`
// obtient exactement la même tuile, et non une variante qui pourrait diverger.
//
// ⚠️ Contrairement à `./mvt`, ce module CONNAÎT three : il construit l'arbre de collision.
// C'est délibéré et c'est ce qui a changé — cf. `packTileBVH`. Le prix est mesuré : le blob
// du worker passe de 13 à 71 Ko gzip (+58 Ko, chargés une fois, et seulement par un hôte
// qui utilise le volume interne). Il achète ~41 ms de gel du thread principal PAR TUILE.

import { packedBVHTransferables, packTileBVH, type PackedBVH } from '../core/bvh'
import type { BuildingsConfig } from '../config/types'
import { fetchAndExtrude, type ExtrudedTile, type Shading, type TileFrame } from './mvt'

/** Tuile prête à monter : géométrie ET arbre. `null` = rien à extruder ici. */
export type BuiltTile = (ExtrudedTile & { bvh: PackedBVH }) | null

/**
 * Télécharge, extrude et indexe une tuile.
 *
 * L'arbre est construit ICI, au bout du pipeline, et non au montage : c'est le poste le
 * plus lourd de la tuile (~41 ms contre ~19 ms pour tout le reste), et le seul qui restait
 * sur le thread principal. Le monter revient désormais à relire des tampons (~0,05 ms).
 */
export async function buildTile(
  url: string,
  cfg: BuildingsConfig,
  frame: TileFrame,
  shading: Shading,
  signal?: AbortSignal,
): Promise<BuiltTile> {
  const out = await fetchAndExtrude(url, cfg, frame, shading, signal)
  if (!out) return null
  // Dernier point de sortie : l'arbre coûte plus que tout ce qui précède, et une tuile
  // évincée pendant son téléchargement n'a plus personne pour le lire.
  if (signal?.aborted) return null
  return { ...out, bvh: packTileBVH(out.positions, out.indices) }
}

/**
 * Tampons CÉDÉS (et non copiés) au thread principal : plusieurs mégaoctets par tuile
 * dense qui changent de propriétaire sans traverser le sérialiseur.
 *
 * Extrait en fonction pour être testable : un tampon listé deux fois fait échouer
 * `postMessage` à l'exécution, et rien dans le typage ne l'empêche.
 */
export function transferablesOf(tile: NonNullable<BuiltTile>): Transferable[] {
  return [
    tile.positions.buffer,
    tile.colorIndex.buffer,
    tile.shade.buffer,
    tile.indices.buffer,
    tile.buildings.vStart.buffer,
    tile.buildings.featureIds.buffer,
    tile.buildings.heights.buffer,
    ...packedBVHTransferables(tile.bvh),
  ]
}

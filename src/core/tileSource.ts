// Contrat commun aux fournisseurs de tuiles 2D. `TiledGlobeLayer` ne voit que ça :
// la session signée (Google) ou son absence (serveur interne) ne le concerne pas.

import type { TilesConfig } from '../config/types'
import { GoogleTileSource } from './googleTiles'
import { InternalTileSource } from './internalTiles'

export type TileSource = {
  /** URL d'une tuile — la session, pour un fournisseur qui en a une, doit être établie. */
  tileUrl(z: number, x: number, y: number): string
  /** Établit ce dont `tileUrl` a besoin ; ne fait rien si le fournisseur ne signe pas. */
  ensureSession(traffic: boolean): Promise<void>
  /**
   * Réglages à chaud (cf. `MapEngine.setConfig`). `origin` est celle du serveur interne
   * (`providers.internal.origin`), ignorée par une source qui n'en a pas l'usage.
   */
  setConfig(cfg: TilesConfig, origin: string): void
  /** Le calque trafic est une propriété de la tuile Google : faux partout ailleurs. */
  readonly supportsTraffic: boolean
}

/**
 * Source correspondant à `cfg.provider`, ou `null` quand le fournisseur n'a rien pour
 * servir : pas de clé en `'external'`, pas d'origine en `'internal'`.
 *
 * Ce `null` porte une décision : il vaut mieux n'exposer AUCUN fond 2D — donc aucun
 * bouton pour y aller — qu'un fond qui répondrait 403 à chaque tuile.
 */
export function createTileSource(cfg: TilesConfig, origin: string, apiKey?: string): TileSource | null {
  if (cfg.provider === 'internal') {
    return origin && cfg.internalTileUrl ? new InternalTileSource(cfg, origin) : null
  }
  return apiKey ? new GoogleTileSource(apiKey, cfg) : null
}

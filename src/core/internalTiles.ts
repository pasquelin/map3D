// Tuiles d'un serveur auto-hébergé : de simples URLs XYZ, sans session, sans clé,
// sans quota. Le pendant de `GoogleTileSource`, dont elle partage le contrat
// (`TileSource`) sans en partager la machinerie d'identité.

import { defaultConfig } from '../config/defaultConfig'
import type { TilesConfig } from '../config/types'

/** `{origin}/styles/…` ne doit pas produire `//styles/…` si l'hôte a laissé un `/`. */
export function trimSlash(origin: string): string {
  return origin.replace(/\/+$/, '')
}

export class InternalTileSource {
  /**
   * Le calque trafic est une propriété de la tuile Google (`layerTypes` demandé à la
   * session), pas une surcouche transparente : il n'a pas d'équivalent ici. Le moteur
   * s'en sert pour ne pas proposer un bouton inerte.
   */
  readonly supportsTraffic = false

  /**
   * Promesse résolue partagée. `ensureSession` est appelé UNE FOIS PAR TUILE : une
   * méthode `async` allouerait une promesse par tuile pour n'attendre rien.
   */
  private static readonly READY = Promise.resolve()

  /**
   * Gabarit dont `{origin}`, `{style}` et `{r}` sont DÉJÀ substitués — seuls `z`/`x`/`y`
   * varient ensuite. Résolu une fois par changement de config et non par tuile
   * (`tileUrl` est appelé jusqu'à `maxRequest` fois par changement de niveau de zoom).
   */
  private template = ''

  constructor(
    cfg: TilesConfig = defaultConfig.providers.tiles,
    /** Origine du serveur, partagée avec le volume — cf. `providers.internal`. */
    private origin: string = defaultConfig.providers.internal.origin,
  ) {
    this.setConfig(cfg, origin)
  }

  /** Réglages à chaud (cf. `MapEngine.setConfig`). */
  setConfig(cfg: TilesConfig, origin: string = this.origin): void {
    this.origin = origin
    this.template = cfg.internalTileUrl
      .replace('{origin}', trimSlash(origin))
      .replace('{style}', cfg.style)
      .replace('{r}', cfg.retina ? '@2x' : '')
  }

  /** Rien à établir : le serveur interne ne signe pas les requêtes. */
  ensureSession(): Promise<void> {
    return InternalTileSource.READY
  }

  tileUrl(z: number, x: number, y: number): string {
    return this.template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
  }
}

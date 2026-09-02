import type { MapConfig } from '../config/types'

/** Couches 3D dont l'empilement est réglable — cf. `config.style.renderOrder`. */
export type RenderOrderKey = 'shapes' | 'paths' | 'links' | 'relations' | 'drawings'

/**
 * `renderOrder` three.js d'une couche, lu dans `config.style.renderOrder`.
 *
 * ⚠️ TRANSITOIRE : le bloc `renderOrder` arrive dans `src/config` par une autre branche
 * (types + défauts `{ shapes: 1, paths: 1, links: 1, relations: 2, drawings: 4 }`). En
 * attendant la fusion, la lecture est tolérante et `fallback` porte la valeur actuelle
 * de chaque couche. À la fusion : lire `config.style.renderOrder[key]` directement et
 * retirer ce module.
 */
export const renderOrderOf = (config: MapConfig, key: RenderOrderKey, fallback: number): number =>
  (config.style as { renderOrder?: Partial<Record<RenderOrderKey, number>> }).renderOrder?.[key] ?? fallback

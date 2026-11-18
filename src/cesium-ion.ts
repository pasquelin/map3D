// Entrée À PART du paquet (`@pasquelin/map3d/cesium-ion`), et la SEULE à importer le
// greffon Cesium ion. Rien du cœur ne l'importe : un hôte qui ne s'en sert pas n'embarque
// ni le greffon ni l'adresse `api.cesium.com`. Ne rien importer d'ici depuis `src/index.ts`.

import { CesiumIonAuthPlugin } from '3d-tiles-renderer/plugins'
import type { Tileset3dSource } from './core/tileset3d'

export type { Tileset3dSource }

/** Asset Cesium ion servi quand `assetId` est omis : Google Photorealistic 3D Tiles. */
export const CESIUM_ION_DEFAULT_ASSET_ID = '2275207'

export type CesiumIonOptions = {
  /** Jeton d'accès Cesium ion. */
  token: string
  /** Asset à servir. Défaut : `CESIUM_ION_DEFAULT_ASSET_ID`. */
  assetId?: string
}

/**
 * Source de tuiles 3D photoréalistes servie par Cesium ion, à passer à `<Map tileset3d>`
 * (ou à `MapEngineOptions.tileset3d`) :
 *
 * ```tsx
 * import { Map } from '@pasquelin/map3d'
 * import { cesiumIon } from '@pasquelin/map3d/cesium-ion'
 *
 * <Map center={PARIS} zoom={14} tileset3d={cesiumIon({ token: CESIUM_ION_TOKEN })} />
 * ```
 *
 * L'appel en ligne est sans risque : la carte ne se remonte que si le jeton ou l'asset
 * change (cf. `Tileset3dSource.key`).
 */
export function cesiumIon({ token, assetId = CESIUM_ION_DEFAULT_ASSET_ID }: CesiumIonOptions): Tileset3dSource {
  return {
    key: `cesium-ion:${assetId}:${token}`,
    attach: (tiles) => {
      tiles.registerPlugin(new CesiumIonAuthPlugin({ apiToken: token, assetId, autoRefreshToken: true }))
    },
  }
}

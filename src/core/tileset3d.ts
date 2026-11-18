// Source du tileset 3D photoréaliste — le pendant, pour le volume, du contrat `TileSource`
// du fond 2D. Le cœur n'en connaît qu'UNE par lui-même (Google, par clé) : toute autre
// arrive de l'hôte, déjà construite.

import type { TilesRenderer } from '3d-tiles-renderer'
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins'

/**
 * Source de tuiles 3D photoréalistes fournie par l'hôte (`<Map tileset3d>`,
 * `MapEngineOptions.tileset3d`).
 *
 * Le cœur n'importe aucun fournisseur pour elle : ce qui authentifie et sert le tileset
 * vit dans une entrée À PART du paquet, que seul l'hôte qui s'en sert importe — son
 * bundler n'embarque donc rien de ce fournisseur sinon. `cesiumIon()`, de
 * `@pasquelin/map3d/cesium-ion`, en est une ; un hôte peut écrire la sienne.
 */
export type Tileset3dSource = {
  /**
   * Identité de la source. `<Map>` remonte le moteur quand elle change, et seulement
   * alors : une source reconstruite à chaque render (appel en ligne dans le JSX) ne
   * recharge donc rien tant que sa clé reste la même.
   *
   * ⚠️ Elle peut porter un jeton : ne jamais l'afficher ni la journaliser.
   */
  key: string
  /**
   * Enregistre sur le `TilesRenderer` du moteur ce qui authentifie et sert le tileset.
   * Appelé une fois, à la construction du moteur — avant le premier `update`, donc avant
   * toute requête.
   */
  attach(tiles: TilesRenderer): void
}

/**
 * Branche la source 3D retenue au montage, et dit s'il y en a une.
 *
 * La source de l'hôte prime sur la clé Google, qui ne sert alors plus que le reste (fond
 * 2D, trafic, lieux, routage) : c'est le cas des comptes EEA, pour qui les Photorealistic
 * 3D Tiles en direct sont bloquées. Sans l'une ni l'autre, le `TilesRenderer` reste vide
 * et l'appelant monte son globe de repli.
 */
export function attachTileset3d(
  tiles: TilesRenderer,
  source: Tileset3dSource | undefined,
  googleMapsApiKey: string | undefined,
): boolean {
  if (source) source.attach(tiles)
  else if (googleMapsApiKey)
    tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: googleMapsApiKey, autoRefreshToken: true }))
  else return false
  return true
}

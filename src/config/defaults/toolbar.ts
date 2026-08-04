import type { DrawToolbarConfig } from '../types'

/** Défauts de la barre de dessin : elle ne montre que les outils qui ont un objet.
 *  `minZoom` reprend la valeur de l'ancien `interaction.drawToolbarMinZoom`. */
export const toolbarDefaults: DrawToolbarConfig = {
  minZoom: 11,
  autoHide: { erase: true },
}

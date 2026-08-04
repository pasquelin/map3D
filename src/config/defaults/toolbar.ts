import type { DrawToolbarConfig } from '../types'

/** Défauts de la barre de dessin : elle ne montre que les outils qui ont un objet.
 *  `minZoom` reprend la valeur de l'ancien `interaction.drawToolbarMinZoom`. */
export const toolbarDefaults: DrawToolbarConfig = {
  minZoom: 11,
  // ⚠️ `history` change le comportement d'origine : les deux flèches étaient GRISÉES tant
  // qu'il n'y avait rien à défaire (cf. `DrawToolbarAutoHide`).
  autoHide: { erase: true, history: true },
}

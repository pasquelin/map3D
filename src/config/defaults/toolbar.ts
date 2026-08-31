import type { DrawToolbarConfig } from '../types'

/** Défauts de la barre de dessin : elle ne montre que les outils qui ont un objet. */
export const toolbarDefaults: DrawToolbarConfig = {
  // ⚠️ 11 → 5 (l'ancien `interaction.drawToolbarMinZoom`) : à 11, la barre disparaissait dès
  // qu'on quittait l'échelle de la rue, alors qu'on trace aussi des emprises régionales. Le
  // repli ne protège plus que de la vue globe, où dessiner n'a effectivement aucun sens.
  minZoom: 5,
  // ⚠️ `history` change le comportement d'origine : les deux flèches étaient GRISÉES tant
  // qu'il n'y avait rien à défaire (cf. `DrawToolbarAutoHide`).
  autoHide: { erase: true, history: true },
}

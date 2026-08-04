/**
 * Outils que la barre de dessin retire d'elle-même quand ils n'ont **rien sur quoi
 * agir** (`config.toolbar.autoHide`).
 *
 * Un seul principe : ne montrer que ce qui sert. « Tout effacer » sur une carte vierge
 * et une gomme sans rien à effacer ne sont pas des commandes désactivées — ce sont des
 * commandes sans objet, et la barre est plus lisible sans elles.
 *
 * ⚠️ Les deux clés n'observent PAS le même jeu d'objets, parce que les deux commandes
 * n'agissent pas sur le même :
 * — `clear` ne voit que les formes POSSÉDÉES par la lib, visibles et non verrouillées
 *   (c'est exactement ce que `clear()` retire) ;
 * — `erase` voit en plus les objets HÔTE effaçables (`PathLayer`/`ShapeLayer`), et
 *   filtre le tout par `config.erase.targets` — une catégorie interdite à la gomme ne
 *   peut pas justifier son bouton.
 */
export type DrawToolbarAutoHide = {
  /** Retirer « Tout effacer » tant qu'aucune forme effaçable n'est à l'écran. */
  clear: boolean
  /** Retirer la gomme tant qu'aucune de ses cibles autorisées n'est à l'écran. */
  erase: boolean
}

/**
 * Barre d'outils de dessin (`<Toolbar>`) — le pendant « réglages » de ses props.
 *
 * Ce qui appartient à la BARRE vit ici ; ce qui appartient aux OUTILS reste dans son
 * domaine (`config.erase.targets` pour la politique de la gomme,
 * `config.interaction.shortcuts.draw` pour les touches, qui agissent sans barre montée).
 */
export type DrawToolbarConfig = {
  /** Zoom sous lequel la barre se replie — dessiner suppose la vue proche. */
  minZoom: number
  /** Outils retirés faute d'objet sur quoi agir — cf. `DrawToolbarAutoHide`. */
  autoHide: DrawToolbarAutoHide
}

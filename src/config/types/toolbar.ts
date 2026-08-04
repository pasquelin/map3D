/**
 * Outils que la barre de dessin retire d'elle-même quand ils n'ont **rien sur quoi
 * agir** (`config.toolbar.autoHide`).
 *
 * Un seul principe : ne montrer que ce qui sert. Une gomme sans rien à effacer n'est pas
 * un outil indisponible — c'est un outil sans emploi, et la barre est plus lisible sans
 * lui. « Tout effacer » n'a pas sa propre clé : la rangée vit dans le sous-menu de la
 * gomme et partage exactement son périmètre, donc elle paraît et disparaît avec elle.
 */
export type DrawToolbarAutoHide = {
  /** Retirer la gomme — et sa rangée « Tout effacer » — tant qu'aucune cible autorisée
   *  n'est à l'écran. */
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

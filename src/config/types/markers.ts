// ⑤ markers — seuils de lisibilité.

export type MarkersConfig = {
  /**
   * Zoom en dessous duquel les markers `static` (symboles posés, défibrillateurs)
   * disparaissent de la carte. `0` désactive le masquage.
   *
   * Ils restent dans la RECHERCHE et la loupe : ce seuil dit ce qui est lisible, pas
   * ce que l'utilisateur a choisi de masquer — c'est le rôle du filtre de tags.
   * Chercher « défibrillateur » doit le trouver et y voler quel que soit le zoom.
   *
   * Défaut 13 : en dessous, la vue cadre une région entière et un pictogramme de
   * 40 px n'y est ni lisible ni cliquable.
   *
   * C'est le seuil PAR DÉFAUT : un marker qui déclare `static: { minZoom }` impose le
   * sien — tout le décor ne se lit pas à la même distance.
   */
  staticMinZoom: number
}

// watermark — signature « map3D » (attribution PolyForm-Noncommercial).

export type WatermarkConfig = {
  /**
   * Affiche la signature « map3D » en bas à droite : marque peinte dans le canvas WebGL
   * (non masquable en CSS/DOM) doublée d'un lien vers le dépôt et sa licence.
   *
   * Défaut `true`. La passer à `false` est réservé aux clients disposant d'une **licence
   * commerciale** de map3D : sous la licence PolyForm-Noncommercial par défaut, retirer
   * l'attribution viole la licence.
   */
  enabled: boolean
}

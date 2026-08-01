/**
 * Regroupement des markers proches — paramètres de l'**algorithme** (supercluster).
 *
 * ⚠️ Ils vivaient dans `MapTheme`, du mauvais côté de la ligne que pose le préambule
 * de ce fichier : personne ne change le rayon de regroupement ni le nombre minimal de
 * points pour une charte graphique, mais on le fait pour une densité de données. Ce
 * qui relève bien du thème — rayon du donut, arc, contour — reste dans
 * `theme.clusters`, à ne pas confondre.
 */
export type ClusteringConfig = {
  /** Rayon de regroupement, en pixels écran. */
  radius: number
  /** En deçà, les points restent individuels. */
  minPoints: number
  /** Zoom au-delà duquel le regroupement géographique s'arrête. */
  maxZoom: number
  /** Quantification du zoom pour la stabilité des paliers de cluster. */
  levelQuantization: number
  /**
   * Zoom à partir duquel un cluster inséparable (points confondus) éclate en
   * éventail au clic — le zoom max UTILE de la caméra, au-delà duquel elle entre
   * dans le bâti 3D. `19` ≈ 76 m d'altitude.
   */
  spiderfyZoom: number
}

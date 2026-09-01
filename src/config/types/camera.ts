/**
 * Limites de navigation et pas des commandes de caméra.
 *
 * ⚠️ Ce bloc vivait dans `MapTheme`. Rien de ce qu'il contient ne se VOIT : ce sont
 * des bornes (zoom, inclinaison, distance, garde au sol) et des pas de geste. On les
 * change pour un support tactile, un tileset non terrestre ou une contrainte de
 * couverture de tuiles — jamais pour une charte graphique. Le signe le plus net était
 * `minGroundClearance`, séparé de `performance.groundHeightRange` qui traite du même
 * sujet, dans deux arbres différents.
 *
 * `fov` fait exception et reste **lu à la construction** : toutes les conversions
 * mètres↔pixels de la lib en dérivent et sont mémoïsées.
 */
export type CameraConfig = {
  /**
   * Zoom minimal atteignable (dézoom maximal).
   *
   * ⚠️ Ce réglage n'était **branché nulle part** : c'est `maxDistanceFactor` qui bornait
   * seul l'éloignement, en rayons terrestres. Les deux disent la même chose en deux
   * unités ; le plus contraignant des deux gagne désormais, au lieu que l'un soit ignoré.
   */
  minZoom: number
  /**
   * Zoom maximal atteignable **en mode plan** — le plancher de descente.
   *
   * ⚠️ Lui non plus n'était branché nulle part, alors qu'il annonçait « au-delà la caméra
   * entre dans le bâti 3D ». Le seul garde-fou réel sur la molette était le `cameraRadius`
   * de `GlobeControls`, jamais réglé : **5 mètres**. On pouvait donc descendre au ras du
   * pavé, nez contre une façade, sans plus rien voir.
   */
  maxZoom: number
  /**
   * Zoom maximal en 3D — le pendant de `maxZoom`, comme `maxTilt3d` l'est de `maxTilt2d`.
   *
   * Distinct parce que les deux modes n'ont pas la même contrainte : une carte plate se
   * lit d'autant mieux qu'on s'en approche (noms de rue, numéros), alors qu'en volume,
   * passer sous la hauteur du bâti met la caméra DANS la rue — un mur occupe l'écran et
   * l'on ne se repère plus. La borne s'exprime en zoom, donc en hauteur au-dessus du sol :
   * `altitude = circonférence / 2^zoom`.
   */
  maxZoom3d: number
  /** Inclinaison maximale générale (rad depuis le nadir). */
  maxTilt: number

  /** Champ de vision vertical (degrés). Lu à la construction du moteur seulement. */
  fov: number
  /** Inclinaison max en 3D (rad depuis le nadir) — au-delà, la vue bascule. */
  maxTilt3d: number
  /** Inclinaison max en 2D (rad depuis le nadir). Par défaut alignée sur `maxTilt3d` (~79°) ;
   *  la resserrer borne la couverture de tuiles (une carte plate inclinée vers l'horizon en
   *  demande de plus en plus loin) et remonte l'angle où le graticule s'efface. */
  maxTilt2d: number
  /** Pas d'inclinaison par clic du bouton dédié (rad). */
  tiltStep: number
  /** Facteurs d'altitude par cran de zoom (bouton +/−). */
  zoomFactor: { in: number; out: number }
  /** Distance max caméra↔centre Terre, en rayons terrestres (limite de dézoom). */
  maxDistanceFactor: number
  /** Altitude max des vols, en rayons terrestres. */
  maxAltitudeFactor: number
  /** Garde-fou : hauteur minimale (m) au-dessus du sol RÉEL, tuiles comprises. */
  minGroundClearance: number
  /**
   * Déplacement au clavier (cf. `interaction.shortcuts.navigate`).
   *
   * `speed` est une FRACTION de la hauteur au-dessus du sol parcourue par seconde, et non
   * une vitesse absolue : la carte défile alors à la même allure à l'écran qu'on soit à
   * 150 m ou à 100 km. C'est le principe de `dragSpeed` pour la souris, et celui du mode
   * vol de `GlobeControls`, dont la vitesse est déjà mise à l'échelle de l'altitude.
   */
  keyPan: {
    /** Hauteurs-sol par seconde. `0.8` ≈ un écran par seconde en vue au nadir. */
    speed: number
    /** Multiplicateur tant que le modificateur d'accélération est maintenu. */
    boost: number
  }
  /** Bornes d'altitude (m) du mode suivi. */
  followAltitude: { min: number; max: number }
  /** Défauts de cadrage (`fitBounds`) — surchargeables appel par appel. */
  fitBounds: { margin: number; minAltitude: number; maxAltitude: number }
}

/** Corps du piéton — capsule approximée par des rayons palpeurs (aucun BVH). */
export type PedestrianCollisionConfig = {
  /** Demi-largeur du corps (m) : distance en deçà de laquelle un mur repousse. */
  radiusMeters: number
  /** Nombre de rayons horizontaux lancés en éventail autour de la direction de marche. */
  feelers: number
  /** Longueur des palpeurs EN PLUS du rayon (m) — de quoi voir le mur avant de l'atteindre. */
  feelerMarginMeters: number
  /** Montée franchissable d'un pas (m) : trottoir, marche. Au-delà, c'est un mur. */
  maxStepHeightMeters: number
}

/** Choix du point d'entrée en mode piéton — cf. `isGroundPlacement`. */
export type PedestrianPlacementConfig = {
  /**
   * Écart maximal (m) entre la surface visée et le niveau de rue de la couronne. Au-delà,
   * le point est un toit et le clic est refusé.
   */
  maxRoofDeltaMeters: number
  /** Rayon de la couronne d'échantillonnage du sol (m) — cf. `sampleGroundHeight`. */
  ringRadiusMeters: number
  /**
   * Période minimale (ms) entre deux validations du curseur pendant le placement.
   *
   * Chaque validation coûte une dizaine de raycasts (le rayon d'écran, plus la couronne de
   * sol). `pointermove` tire beaucoup plus vite que ça : sans cette limite, viser une rue
   * suffisait à saturer la boucle de rendu.
   */
  refreshMs: number
  /** Déplacement (px) en deçà duquel la validation précédente est réutilisée telle quelle. */
  refreshSlopPx: number
}

/** Balancement de la marche — un effet, désactivé par défaut. */
export type PedestrianHeadBobConfig = {
  enabled: boolean
  amplitudeMeters: number
  /** Oscillations par seconde (Hz) à vitesse de marche nominale. */
  frequency: number
}

/** Durées (ms) de la plongée à l'entrée et de la remontée à la sortie. */
export type PedestrianTransitionsConfig = {
  enterMs: number
  exitMs: number
}

/**
 * Mode piéton / première personne — cf. le guide PEDESTRIAN.md.
 *
 * ⚠️ Tout ce qui suit est de la CONFIG et non du thème : rien ne s'y voit directement.
 * L'apparence du curseur de placement et du réticule vit dans `theme.colors.pedestrian`.
 */
export type PedestrianConfig = {
  /** Hauteur de l'œil au-dessus du sol (m). */
  eyeHeightMeters: number
  /** Vitesse de marche (m/s) — INDÉPENDANTE de l'altitude, contrairement au vol orbital. */
  walkSpeed: number
  /** Multiplicateur appliqué tant que la touche `boost` est maintenue. */
  sprintFactor: number
  /** Sensibilité du regard : degrés de rotation par pixel de souris. */
  lookSpeed: number
  /**
   * Inverse l'axe vertical du regard.
   *
   * ⚠️ Le défaut suit la convention du CLIQUER-GLISSER de la carte (« attraper la scène » :
   * tirer vers le bas relève la vue), et non celle d'un FPS — c'est le même geste que le
   * pan de `GlobeControls`, et deux conventions opposées dans la même vue désorientent. Le
   * MÊME réglage vaut en immersion totale (Pointer Lock) : le regard s'y compose à
   * l'identique, sans bouton — un adepte de la convention FPS passe `invertY: false`.
   */
  invertY: boolean
  /** Inverse l'axe horizontal du regard. */
  invertX: boolean
  /** Borne du regard vertical (°) — à 90° la base du repère dégénère. */
  pitchMaxDeg: number
  /**
   * Distance de vue (m) : borne le `far` de la caméra, donc le frustum culling, donc les
   * tuiles que le `TilesRenderer` demande. C'est le levier de performance n°1 de la vue
   * rasante — la baisser coûte de l'horizon et rend de la fluidité.
   *
   * Elle borne AUSSI les markers et les pastilles de regroupement : un overlay DOM garde sa
   * taille écran quelle que soit la distance, si bien qu'une alerte à 700 km s'affichait sur
   * la ligne d'horizon au même gabarit que celle d'en face. Un marker cesse donc d'être
   * affiché là où le décor cesse de l'être, jamais au-dessus du vide.
   */
  viewDistanceMeters: number
  /** Début du brouillard (m). Il finit toujours à `viewDistanceMeters` — cf. `pedestrianView`. */
  fogStartMeters: number
  /** Plan proche de la caméra (m) en mode piéton. */
  nearMeters: number
  /**
   * Portée (m) du rayon qui cherche le sol sous les pieds, à chaque frame de marche.
   *
   * ⚠️ Court par nécessité : `sampleGroundHeight` part de 12 km d'altitude et porte sur
   * 40 km — à hauteur d'homme, ce rayon traverse toute la scène pour mesurer deux mètres.
   * C'était le poste le plus cher de la boucle de marche. Il borne aussi la chute : au-delà,
   * le sol est réputé introuvable et la hauteur précédente est conservée.
   */
  groundProbeMeters: number
  /**
   * Distance de référence (m) du niveau de détail des tuiles pendant la marche.
   *
   * ⚠️ Le détail se déduit d'ordinaire de la distance caméra→sol. À hauteur d'homme elle
   * vaut 1,70 m : le calcul réclame alors le zoom MAXIMAL sur toute la distance de vue,
   * soit des dizaines de milliers de tuiles pour une rue. On raisonne donc sur la distance
   * à laquelle on regarde réellement, pas sur celle de ses pieds.
   *
   * Baisser = plus net de près et plus lourd ; monter = plus léger et plus grossier.
   */
  tileDetailDistanceMeters: number
  /**
   * Période minimale (ms) entre deux mises à jour de la couverture de tuiles en marche.
   *
   * ⚠️ Chaque passage reconstruit la cascade de niveaux — un anneau par cran, du plus fin
   * au niveau de base — puis parcourt tout le cache. À hauteur d'homme le niveau le plus fin
   * est élevé, donc la cascade est longue, et la refaire soixante fois par seconde ne sert
   * à rien : à 3 m/s le décor a bougé de cinq centimètres.
   */
  tileRefreshMs: number
  /**
   * Constante de temps (SECONDES) du lissage vertical de l'œil. Trop fort → sensation de
   * flottement ; trop faible → sautillement quand les tuiles se raffinent.
   */
  groundSmoothing: number
  collision: PedestrianCollisionConfig
  placement: PedestrianPlacementConfig
  headBob: PedestrianHeadBobConfig
  transitions: PedestrianTransitionsConfig
}

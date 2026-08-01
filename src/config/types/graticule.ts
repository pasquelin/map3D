import type { CoordFormat } from '../../core/graticule'

/**
 * Grille de coordonnées géographiques — cf. le guide GRATICULE.md.
 *
 * ⚠️ Tout ce qui suit est de la CONFIG et non du thème : ce qui se VOIT (les quatre
 * couleurs) vit dans `theme.colors.graticule`. La règle qui tranche : une valeur qu'on
 * change pour un écran plus dense ou une machine plus faible est de la config ; une valeur
 * qu'on change pour une charte graphique est du thème.
 */
export type GraticuleConfig = {
  /**
   * État de DÉPART.
   *
   * ⚠️ Ce n'est PAS la source de vérité courante : elle vit dans le moteur
   * (`engine.setGraticuleVisible`). Le sous-menu « Mesures », le bouton des contrôles de vue
   * et le raccourci clavier la pilotent tous les trois, et deux copies d'état auraient
   * divergé — le défaut même que `buildingpickmode` corrige.
   */
  enabled: boolean
  /** Lignes visées à l'écran — c'est ce nombre qui choisit la maille. */
  targetLines: number
  /**
   * Bande morte du changement de maille, en fraction de densité.
   *
   * ⚠️ Pas un confort visuel : sans elle, un zoom arrêté pile sur une frontière de palier
   * rebascule d'une frame à l'autre, et chaque bascule reconstruit toute la géométrie.
   */
  levelHysteresis: number
  /** Bornes de l'échelle (degrés) — `[x, x]` fige la maille. `null` = échelle libre. */
  levelRangeDeg: readonly [number, number] | null
  /** Segments par ligne : c'est cette densification qui fait ÉPOUSER la courbure du globe. */
  segmentsPerLine: number
  /** Plafond dur de lignes par axe — garde-fou mémoire, indépendant du calcul de maille. */
  maxLines: number
  /** Largeur de l'emprise construite, en écrans. En sortir déclenche une reconstruction. */
  bandScreens: number
  /** Latitude d'arrêt des méridiens : au-delà ils se rejoignent et la densité explose. */
  latLimitDeg: number
  /** Décalage vertical du drapage (m) au-dessus de la surface visible. */
  heightOffsetMeters: number
  /** Dérive de hauteur de drapage tolérée (m) avant reconstruction. */
  heightToleranceMeters: number
  /** Opacité des lignes ordinaires. */
  opacity: number
  /** Opacité des lignes remarquables — volontairement plus soutenue. */
  remarkableOpacity: number
  /** Pointillé, en unités MONDE (mètres) comme le reste de la lib. `null` = trait plein. */
  dash: { dash: number; gap: number } | null
  /**
   * Lignes toujours tracées quelle que soit la maille, avec leur clé de libellé (résolue
   * dans `labels.graticule.remarkable`).
   *
   * ⚠️ En config et non en constantes : l'obliquité de l'écliptique (23,4363°) dérive
   * lentement, et un tileset non terrestre n'a ni tropiques ni cercles polaires.
   */
  remarkable: {
    enabled: boolean
    parallels: readonly { lat: number; labelKey: string }[]
    meridians: readonly { lng: number; labelKey: string }[]
  }
  /**
   * Bande de fondu à l'inclinaison, en **fractions du plafond du mode courant**
   * (`camera.maxTilt3d` ou `camera.maxTilt2d`).
   *
   * ⚠️ Des fractions et non des degrés : le plafond vaut 79,2° en 3D mais 36° en mode plan,
   * donc une bande écrite « 60° → 75° » ne se déclencherait JAMAIS à plat. Aux défauts :
   * 59,4°→75,2° en 3D, 27,0°→34,2° en plan.
   */
  tiltFade: { start: number; end: number }
  /** Constante de temps du fondu (ms) — c'est elle qui donne la douceur. */
  fadeMs: number
  /** Fondu croisé au changement de maille (ms) — `0` le supprime (bascule sèche). */
  levelFadeMs: number
  labels: {
    enabled: boolean
    /**
     * `'center-cross'` : latitudes le long du méridien le plus proche du centre, longitudes
     * le long du parallèle le plus proche — c'est ce qui plafonne naturellement le nombre
     * d'étiquettes quel que soit le zoom. `'edges'` les colle aux bords du viewport, ce qui
     * ne recouvre jamais le contenu regardé.
     */
    placement: 'center-cross' | 'edges'
    /** Plafond dur d'étiquettes affichées. */
    maxLabels: number
    /** Écart minimal (px) entre deux étiquettes d'une même chaîne. */
    spacingPx: number
    /** Orienter l'étiquette dans le sens de sa ligne. */
    rotate: boolean
    /** `'auto'` suit la maille : ≥ 1° → `45°N`, minutes → `45°11′N`, secondes → `45°11′25″N`. */
    format: CoordFormat
    /** Afficher le nom des lignes remarquables (« Équateur », « Tropique du Cancer »…). */
    remarkableNames: boolean
    /**
     * Opacité au repos. Les étiquettes se font oublier tant qu'on ne les cherche pas, et
     * redeviennent pleinement opaques sous le pointeur. `1` supprime l'effet.
     */
    idleOpacity: number
    /**
     * Marge (px) autour d'une étiquette pour la juger survolée.
     *
     * ⚠️ Le survol est calculé GÉOMÉTRIQUEMENT, sur la position écran que la couche connaît
     * déjà — les étiquettes restent en `pointer-events: none`. Les rendre survolables en CSS
     * leur ferait intercepter les gestes de la carte : commencer un déplacement sur une
     * étiquette n'aurait plus déplacé la carte.
     */
    hoverPaddingPx: number
  }
}

// ② interaction — seuils de geste.

/**
 * Tolérances du pointeur, en pixels écran.
 *
 * Elles forment un ensemble : les régler une par une produit une carte qui répond
 * différemment selon l'objet visé. Un support tactile veut typiquement tout élargir
 * d'un coup — c'est la raison d'être du bloc.
 */
export type InteractionConfig = {
  /** Tolérance de clic autour du trait d'une forme dessinée. */
  shapeHitTolerancePx: number
  /** Tolérance de clic autour du trait d'un lien de relation. */
  linkHitTolerancePx: number
  /** Aimant de fermeture d'un polygone (dessin et marquee). */
  closeSnapPx: number
  /** Déplacement au-delà duquel un clic devient un glissé (sélection). */
  clickSlopPx: number
  /** Idem pour la saisie d'un marker vers une zone de dépôt. */
  dragSlopPx: number
  /** Idem pour le repositionnement d'un objet sur la carte. */
  repositionSlopPx: number
  /** Déplacement toléré avant qu'un clic carte ne compte plus comme un clic. */
  cleanClickPx: number
  /** Décimation du tracé au lasso. */
  lassoMinStepPx: number
  /** Décalage bas-droite appliqué aux clones d'une duplication. */
  duplicateOffsetPx: number
  /** Appui maintenu avant d'armer une saisie (tactile). */
  longPressMs: number
  /** Facteur d'échelle plancher d'une transformation (anti-écrasement). */
  minScale: number
  /** Inertie des contrôles de navigation. */
  damping: boolean
  lens: {
    /** Glissé minimal pour créer une zone de loupe. */
    minDragPx: number
    /** Côté minimal d'une zone au redimensionnement. */
    minSizePx: number
  }
  history: {
    /** Fenêtre pendant laquelle une rafale d'actions ne fait qu'une entrée d'undo. */
    coalesceMs: number
    /** Profondeur de la pile d'annulation. */
    depth: number
  }
  menu: {
    /** Survol maintenu avant ouverture d'un sous-menu. */
    hoverIntentMs: number
    /** Délai de grâce avant fermeture d'un sous-panneau quitté. */
    submenuCloseMs: number
  }
  /** Outil « sélectionner un bâtiment » (volume interne uniquement). */
  buildingPick: {
    /**
     * Curseur du canvas pendant que l'outil est actif. Curseur **système** — la
     * convention du projet exclut les images de curseur. Posé en style inline sur le
     * canvas, qui l'emporte sur le `grab` de la feuille injectée.
     */
    cursor: string
  }
  /** Tolérance de clic autour du socle d'une relation (le trait, lui, a la sienne). */
  hubHitTolerancePx: number
  /**
   * Cible cliquable du point au sol d'un marker repositionnable.
   *
   * Le point mesure 7 px : sans élargissement, l'attraper relève de l'adresse. La
   * valeur vivait dans la feuille de styles (`::before`), donc hors de ce bloc alors
   * qu'elle en est exactement — une tolérance de pointeur qu'un support tactile veut
   * élargir avec les autres.
   */
  repositionHitPx: number
  /**
   * Filet temporel après un geste : durée pendant laquelle le `click` synthétique qui
   * suit est avalé. Couplé à `longPressMs` — un contexte tactile qui allonge l'un
   * doit pouvoir allonger l'autre.
   */
  clickSuppressMs: number
  /** Décimation du tracé au crayon (plancher, en px). Pendant de `lassoMinStepPx`. */
  freehandMinStepPx: number
  /** Zoom du vol « Cibler » depuis un inventaire ou une liste. */
  targetZoom: number
  /** Zoom du vol au clic sur un favori du dock. */
  pinnedFlyZoom: number
  /** Plancher de compactage d'une barre avant qu'elle ne passe en colonnes. */
  barMinScale: number
  /** Infobulle de cluster, en pixels écran. */
  tooltip: {
    /** Sous cette hauteur de fenêtre, l'infobulle bascule au-dessous du pointeur. */
    flipBelowPx: number
    /** Demi-largeur estimée, pour le clamp horizontal aux bords. */
    clampMarginPx: number
    /** Décalage vertical quand elle s'ouvre vers le bas. */
    offsetBelowPx: number
    /** Idem vers le haut. */
    offsetAbovePx: number
  }
  /** Éclatement en éventail d'un groupe de markers confondus. */
  spiderfy: {
    /** Rayon d'une PAIRE, en fraction du rayon de pastille (décollement minimal). */
    pairRadiusRatio: number
    /** Rayon plancher de la couronne, en multiples du rayon de pastille. */
    minRingRatio: number
    /** Espacement entre deux pastilles sur la couronne. */
    gapPx: number
    /** Hystérésis de zoom du déclenchement automatique. */
    zoomEpsilon: number
  }
  clusterOpenZoom: {
    /** Marge ajoutée au zoom d'éclatement du cluster (séparation nette). */
    expansion: number
    /** Marge ajoutée quand le zoom d'éclatement dépasse déjà `clustering.maxZoom`. */
    max: number
  }
  /** Symboles tactiques posés sur la carte. */
  symbols: {
    /** Taille écran (px) d'un symbole posé. */
    sizePx: number
    /** Taille des vignettes de la grille de la palette. */
    previewSizePx: number
  }
  shortcuts: ShortcutsConfig
}

/**
 * Raccourcis clavier. `false` désactive une commande, une autre touche la remappe.
 *
 * ⚠️ Une trentaine de touches étaient figées dans le code — deux tables
 * `DEFAULT_SHORTCUTS` distinctes, plus les combinaisons à modificateur écrites en
 * `if` dans le gestionnaire, plus le `'x'` de la loupe. Aucune n'était atteignable
 * autrement que par une prop, et les combinaisons ne l'étaient pas du tout : une
 * application dont un raccourci entrait en conflit avec le sien n'avait aucun
 * recours. C'est aussi le premier obstacle d'une carte utilisée sur un clavier
 * non-AZERTY/QWERTY.
 *
 * Les clés sont volontairement listées ici plutôt qu'importées de `layers/DrawLayer` :
 * ce module décrit des réglages et ne doit rien devoir aux couches. Une assertion au
 * point d'usage garantit que les deux ensembles ne divergent pas.
 */
export type ControlShortcuts = {
  /** Réoriente au nord et remet la vue du dessus. */
  north: string | false
  /** Zoom avant d'un cran. */
  zoomIn: string | false
  /** Zoom arrière d'un cran. */
  zoomOut: string | false
  /** Bascule l'inclinaison de la caméra. */
  tilt: string | false
  /** Recul en vue globe. */
  globe: string | false
  /**
   * Bascule de la grille de coordonnées.
   *
   * ⚠️ ICI et non dans `draw`, bien que la grille ait aussi une rangée dans le sous-menu
   * « Mesures » : c'est une commande de VUE, et son bouton des contrôles fonctionne sans
   * aucune couche de dessin montée. Rangée sous `draw`, la touche mourait avec `<DrawLayer>`
   * pendant que l'infobulle du bouton continuait de l'annoncer.
   *
   * `'g'` — le choix évident pour « grille » — est déjà `globe`, d'où le défaut `'k'`.
   * Les échanger tient en une ligne : `{ controls: { graticule: 'g', globe: 'k' } }`.
   */
  graticule: string | false
  /** Ouvre le panneau « Couches » (filtre par tag). */
  layers: string | false
  /** Ouvre le panneau « Catalogue ». Sans source déclarée, la touche est inactive. */
  catalog: string | false
  /** Plein écran. */
  fullscreen: string | false
  /** Bascule 3D photoréaliste ↔ plan 2D. */
  basemap: string | false
  /** Calque trafic — le bouton n'existe qu'en mode plan. */
  traffic: string | false
  /** Entrer / quitter le mode piéton — le bouton n'existe qu'en 3D photoréaliste externe. */
  pedestrian: string | false
}

/** Outils de dessin et modes de sélection — une touche simple chacun. */
export type DrawToolShortcuts = {
  /** Outil sélection. */
  select: string | false
  /** Sélection au rectangle. */
  selectRect: string | false
  /** Sélection au polygone. */
  selectPoly: string | false
  /**
   * Sélection d'un **bâtiment** du volume interne — une ligne du même sélecteur, mais pas
   * un mode de sélection de dessin : elle arme un outil du moteur, et quitte le dessin.
   */
  selectBuilding: string | false
  /** Sélection au lasso. */
  selectLasso: string | false
  /** Ligne. */
  line: string | false
  /** Polygone. */
  polygon: string | false
  /** Rectangle. */
  rect: string | false
  /** Cercle. */
  circle: string | false
  /** Crayon (tracé libre). */
  freehand: string | false
  /** Flèche. */
  arrow: string | false
  /** Règle de mesure. */
  measure: string | false
  /** Gomme. */
  erase: string | false
  /** Gomme ponctuelle (sous-mode) — défaut désactivé, la gomme s'active par `erase`. */
  erasePoint: string | false
  /** Gomme sélection / marquee (sous-mode) — défaut désactivé. */
  eraseSelect: string | false
  /** Palette de symboles tactiques. */
  symbol: string | false
}

/**
 * Commandes d'édition à modificateur. Elles étaient écrites en dur dans la cascade de
 * `keydown` — donc ni remappables ni désactivables, alors que `⌘A` et `⌘D` entrent
 * couramment en conflit avec ceux de l'application hôte.
 *
 * `key` est comparée en minuscule ; `mod` vaut `ctrl`/`meta` indifféremment (`'mod'`),
 * ou l'un des deux explicitement.
 */
export type EditShortcut = { key: string; mod?: 'mod' | 'ctrl' | 'meta'; shift?: boolean } | false

export type EditShortcuts = {
  /** Annuler. */
  undo: EditShortcut
  /** Rétablir. */
  redo: EditShortcut
  /** Variante Windows (`Ctrl+Y`) — historiquement en plus de `Ctrl+Maj+Z`. */
  redoAlt: EditShortcut
  /** Tout sélectionner — n'agit que si un outil de la carte est actif. */
  selectAll: EditShortcut
  /** Dupliquer la sélection. */
  duplicate: EditShortcut
  /** Suppression de la sélection ; les deux touches usuelles par défaut. */
  delete: readonly string[]
  /** Fermeture du polygone en cours. */
  closePolygon: string | false
  /** Déplacement au clavier de la sélection, en pixels écran. */
  nudgePx: number
  /** Idem avec Maj — le pas « rapide ». */
  nudgeFastPx: number
}

/**
 * Touches de DÉPLACEMENT continu sur la carte — les seules du lot qui agissent tant
 * qu'elles sont maintenues, et non au moment de la frappe.
 *
 * Plusieurs touches par direction : les flèches, universelles, et une famille de lettres
 * qui dépend de la disposition du clavier (ZQSD en AZERTY, WASD en QWERTY). Une
 * application internationale pose la sienne sans toucher au code.
 *
 * ⚠️ Ces liaisons servent AUSSI au futur mode vol : c'est le modèle de déplacement qui
 * changera (déplacement libre dans l'axe du regard, altitude comprise), pas les touches.
 */
export type NavigateShortcuts = {
  forward: readonly string[]
  backward: readonly string[]
  left: readonly string[]
  right: readonly string[]
  /** Modificateur d'accélération, maintenu (cf. `camera.keyPan.boost`). */
  boost: readonly string[]
}

/**
 * Mode piéton. L'ENTRÉE dans le mode est un bouton de la barre de navigation : sa touche
 * vit donc dans `controls.pedestrian`, avec les neuf autres. Ne reste ici que ce qui n'a
 * pas de bouton de barre.
 *
 * `immersion` est à `false` par défaut, comme `controls.traffic` : la
 * bascule ne vaut QUE mode piéton actif, et Échap en sort déjà (relâchement natif du
 * Pointer Lock). Brûler une lettre globale pour ça serait déroutant.
 */
export type PedestrianShortcuts = {
  /** Bascule exploration ↔ immersion totale. */
  immersion: string | false
}

export type ShortcutsConfig = {
  controls: ControlShortcuts
  navigate: NavigateShortcuts
  pedestrian: PedestrianShortcuts
  draw: DrawToolShortcuts
  edit: EditShortcuts
  lens: {
    /** Bascule de l'outil loupe. */
    toggle: string | false
  }
}

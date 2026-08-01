// ③ performance — budgets de calcul et d'échantillonnage.

import type { StatField, StatThreshold } from '../../core/viewStats'

/**
 * Arbitrages coût/qualité. Ils dépendent de la machine cliente et de la densité de
 * données de l'application, pas de la lib — d'où leur présence ici.
 */
/**
 * Seuil de « la caméra a bougé », partagé par tous ceux qui ouvrent une fenêtre de
 * re-échantillonnage.
 *
 * Il était écrit **trois fois** avec deux valeurs différentes — `MapEngine.hasMoved`
 * (1e-7 / 1e-4), `HeightResettle.note` et `MarkerLayer.noteCamera` (1e-6 / 1e-3) —
 * pour exactement la même question. Le moteur jugeait donc la caméra en mouvement là
 * où les couches la jugeaient immobile.
 */
export type CameraMoveEpsilon = {
  /** Écart de latitude/longitude (degrés) au-delà duquel la caméra a bougé. */
  deg: number
  /** Écart d'altitude, en fraction de l'altitude courante. */
  altitudeRatio: number
  /** Plancher absolu du précédent (m) — près du sol, un ratio seul ne déclenche jamais. */
  altitudeMinMeters: number
}

/**
 * Échantillonnage de la hauteur du sol réel (raycasts sur les tuiles). Chaque appel
 * coûte `1 + samples` raycasts BVH : c'est le poste de calcul le plus sensible de la
 * pose des objets au sol.
 */
export type GroundSampleConfig = {
  /** Durée de validité d'un échantillon mémoïsé. */
  ttlMs: number
  /** Quantification spatiale du cache (degrés) — `1e-4` ≈ 11 m. `0` retire la mémoïsation. */
  cellDeg: number
  /**
   * Cellules retenues avant purge du cache de niveau de rue (`sampleGroundHeightCached`).
   * Borne la mémoire d'une session qui parcourt beaucoup de terrain.
   */
  cacheMaxCells: number
  /** Altitude d'où part le rayon descendant. */
  rayOriginMeters: number
  /** Portée du rayon. Doit rester cohérente avec `rayOriginMeters`. */
  rayFarMeters: number
  /** Rayon de la couronne d'échantillons « niveau de la rue » (min local sous le toit). */
  radiusMeters: number
  /** Nombre de tirs sur cette couronne. */
  samples: number
}

export type PerformanceConfig = {
  /**
   * Device pixel ratio du rendu. `1` force un rendu non-retina : deux fois moins de
   * pixels à remplir, un globe plus doux sur écran haute densité.
   */
  pixelRatio: number
  /**
   * Anticrénelage du contexte WebGL. Arbitrage qualité/charge GPU du même ordre que
   * `pixelRatio`, qui lui était exposé — celui-ci ne l'était pas.
   *
   * ⚠️ Lu à la **création** du contexte : le changer à chaud n'a pas d'effet.
   */
  antialias: boolean
  /**
   * Arbitrage GPU demandé au navigateur à la création du contexte.
   *
   * `'high-performance'` réclame le GPU dédié : sur un portable à double carte, le défaut
   * du navigateur (`'default'`) laisse volontiers une carte 3D plein écran sur le circuit
   * intégré. `'low-power'` fait le choix inverse, batterie d'abord.
   *
   * ⚠️ Lu à la **création** du contexte : le changer à chaud n'a pas d'effet.
   */
  powerPreference: 'default' | 'high-performance' | 'low-power'
  /**
   * Résolution de rendu qui s'adapte à la charge : sous la cadence visée, le canvas est
   * peint à moins de pixels (le CSS le rétablit à la taille du conteneur), et remonte dès
   * que la carte respire. C'est le seul levier qui rende du temps GPU en proportion —
   * diviser le ratio par deux, c'est diviser par quatre les pixels à remplir.
   *
   * Le plancher (`minRatio`) borne la perte de netteté ; le plafond reste `pixelRatio`.
   */
  adaptiveResolution: {
    enabled: boolean
    /** Cadence visée (ms/frame). Au-delà, la résolution descend. */
    targetFrameMs: number
    /** Plancher du ratio, en fraction de `pixelRatio` (0.5 = moitié moins large). */
    minRatio: number
    /** Pas de descente/remontée, en fraction de `pixelRatio`. */
    step: number
    /** Frames consécutives hors cadence avant d'agir — ignore les à-coups isolés. */
    sampleFrames: number
  }
  /**
   * Filtrage anisotrope des textures de tuiles. `0` = maximum du matériel, `1` = aucun.
   *
   * ⚠️ Décisif en vue RASANTE. Sans lui, une texture regardée sous un angle faible est
   * échantillonnée par un mipmap trop grossier dans une direction et trop fin dans l'autre :
   * il en sort un moiré en éventail qui se recalcule à chaque frame, si bien que le sol
   * semble grouiller alors que rien ne bouge. Invisible vu du ciel, insupportable à hauteur
   * d'homme — c'est le mode piéton qui l'a révélé.
   */
  textureAnisotropy: number
  /**
   * Plage de profondeur (m) dans laquelle un overlay DOM reste projeté.
   *
   * Volontairement bien plus large que celle du rendu 3D, que `GlobeControls` resserre
   * pour la précision de profondeur : le `CSS2DRenderer` masque tout ce qui en sort, si
   * bien qu'un marker lointain vu en oblique disparaissait. Ces bornes n'agissent QUE sur
   * le z de clipping des overlays — jamais sur leur position à l'écran, ni sur la 3D.
   */
  overlayDepth: {
    nearMeters: number
    farMeters: number
  }
  /**
   * Ne peindre que ce qui a changé.
   *
   * La boucle de frame tourne toujours (les couches avancent, les tuiles arrivent, les
   * gestes répondent) : ce qui est sauté, c'est le RENDU — la passe WebGL et celle des
   * overlays DOM. Carte immobile, elles reproduisent pourtant une image identique, 60 fois
   * par seconde, pendant des heures sur un poste qui garde la carte ouverte.
   *
   * Une frame est peinte dès que quoi que ce soit le demande : caméra qui bouge, tuile qui
   * arrive, marker qui glisse, geste, changement de réglage… Une couche le signale par
   * `ctx.invalidate()`, l'hôte par `MapEngine.invalidate()`.
   */
  renderOnDemand: {
    enabled: boolean
    /**
     * Frames peintes APRÈS la dernière demande. Un fondu ou une transition qui se termine
     * en deux frames n'a pas à se déclarer à chaque pas.
     */
    idleFrames: number
    /**
     * Délai (ms) au-delà duquel une frame est peinte même sans demande.
     *
     * Filet de sécurité, pas un rafraîchissement : il borne le prix d'un mouvement que
     * personne n'aurait signalé (couche tierce, plugin) à « saccadé » au lieu de « figé ».
     * `0` le retire.
     */
    maxIdleMs: number
  }
  cameraMoveEpsilon: CameraMoveEpsilon
  groundSample: GroundSampleConfig
  /**
   * Marge (px écran) au-delà du cadre au-delà de laquelle un marker est masqué
   * (`display:none`) : le navigateur cesse d'en calculer style, layout et
   * composition. `0` désactive le cull.
   */
  markerCullMarginPx: number
  /**
   * Hystérésis autour d'un seuil d'apparition de markers `static` (`useZoomGate`).
   * Sans elle, une molette arrêtée pile sur la valeur fait clignoter le décor : le zoom
   * oscille de quelques millièmes au ralentissement de l'inertie, et chaque oscillation
   * traverserait le seuil. Même rôle que `relations.zoomBand`, appliqué ici à
   * l'apparition de markers entiers.
   */
  markerZoomBand: number
  /** Côté de la grille de raycasts qui déduit les bounds visibles (`n²` par frame). */
  boundsPickGrid: number
  /**
   * Élargissement de la bbox émise par `onViewportChange`.
   * **Pilote directement le volume de données que l'application charge.**
   */
  boundsMargin: number
  /** Frames d'immobilité avant d'émettre l'événement `viewport`. */
  viewportSettleFrames: number
  /** Intervalle minimal entre deux recalculs de clusters pendant un pan. */
  markerRecomputeMs: number
  /**
   * Intervalle minimal entre deux écritures du bloc de lecture de la vue
   * (`<CameraReadout>`), en ms.
   *
   * L'événement `camera` est émis à la frame : recopier ses valeurs telles quelles
   * ferait quatre écritures DOM par frame pour un texte que l'œil ne peut pas suivre.
   * La dernière valeur est TOUJOURS écrite, cadence ou pas — un bloc figé sur
   * l'avant-dernière position serait pire que rafraîchi trop souvent.
   */
  readoutRefreshMs: number
  /**
   * Bornes de confort du panneau de diagnostic, par grandeur — ce qui décide de la
   * couleur verte, jaune ou rouge.
   *
   * Le SENS de chaque seuil se déduit de l'ordre de ses bornes (cf. `StatThreshold`) :
   * `{ ok: 60, warn: 30 }` pour une cadence (grand = bon), `{ ok: 400, warn: 1200 }` pour
   * un compte de markers (petit = bon). Aucun drapeau à tenir en accord avec les valeurs.
   *
   * Une grandeur ABSENTE de cette table s'affiche sans couleur : c'est le défaut pour tout
   * ce qui n'a pas de « bon » ou de « mauvais » universel — une latitude, un cap, une
   * altitude ne se jugent pas. N'y mettre que ce dont l'excès coûte vraiment.
   *
   * Ces valeurs dépendent de la machine visée : les défauts sont calibrés sur un budget de
   * 16,6 ms (60 Hz). Un hôte qui vise des postes modestes les resserre.
   */
  statThresholds: Partial<Record<StatField, StatThreshold>>
  resettle: {
    /** Éléments re-échantillonnés par passe (budget de raycasts). */
    batch: number
    /** Cadence de retentative des ancres non résolues (zone non chargée). */
    retryFrames: number
    /** Hystérésis de résolution avant reconstruction d'épaisseur (1.25 = ±25 %). */
    mppBand: number
    /** Longueur de la fenêtre ouverte par un mouvement caméra (frames). */
    windowFrames: number
    /**
     * Longueur de la fenêtre ouverte à la création d'un objet (frames). Plus longue
     * que la précédente : les tuiles sous un objet qui vient d'apparaître n'ont
     * souvent pas fini de se raffiner.
     */
    spawnWindowFrames: number
    /** Une passe traite un lot toutes les N frames — amortit le coût des raycasts. */
    everyNFrames: number
  }
  relations: {
    /** Plafond de subdivision d'un arc drapé. */
    maxSteps: number
    /** Pas d'échantillonnage d'un arc drapé. */
    stepMeters: number
    /** Au-delà de N liens, l'éventail se replie en trait agrégé (seuil de lisibilité). */
    fanMaxLegs: number
    /** Bande d'hystérésis de zoom avant recalcul du regroupement visuel. */
    zoomBand: number
  }
  /** Densité de polygonisation d'un cercle — rendu **et** prédicats géométriques. */
  circleSegments: number
  /**
   * Intervalle d'altitude accepté pour un échantillon de surface. Hors de ces
   * bornes, l'échantillon est jugé aberrant et ignoré. À élargir pour un tileset
   * non terrestre (maquette, intérieur, aérien).
   */
  groundHeightRange: readonly [number, number]
}

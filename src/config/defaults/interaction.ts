import type { InteractionConfig } from '../types'

export const interactionDefaults: InteractionConfig = {
  shapeHitTolerancePx: 14,
  linkHitTolerancePx: 12,
  closeSnapPx: 16,
  clickSlopPx: 4,
  dragSlopPx: 8,
  repositionSlopPx: 4,
  cleanClickPx: 6,
  lassoMinStepPx: 3,
  duplicateOffsetPx: 12,
  longPressMs: 150,
  minScale: 0.02,
  damping: true,
  lens: { minDragPx: 4, minSizePx: 28 },
  history: { coalesceMs: 800, depth: 50 },
  menu: { hoverIntentMs: 150, submenuCloseMs: 140 },
  buildingPick: { cursor: 'crosshair' },
  // ⚠️ Nouveaux : tolérances et seuils qui vivaient dans les composants, voire dans
  // la feuille de styles pour `repositionHitPx`. Valeurs reprises à l'identique.
  hubHitTolerancePx: 12,
  repositionHitPx: 22,
  clickSuppressMs: 400,
  freehandMinStepPx: 2,
  targetZoom: 17,
  pinnedFlyZoom: 16,
  barMinScale: 0.85,
  tooltip: { flipBelowPx: 76, clampMarginPx: 78, offsetBelowPx: 18, offsetAbovePx: 14 },
  spiderfy: { pairRadiusRatio: 0.1, minRingRatio: 1.15, gapPx: 8, zoomEpsilon: 0.05 },
  clusterOpenZoom: { expansion: 0.3, max: 0.5 },
  symbols: { sizePx: 40, previewSizePx: 34 },
  // ⚠️ Nouveaux : les touches vivaient dans deux tables `DEFAULT_SHORTCUTS` et,
  // pour les combinaisons, dans la cascade de `keydown` elle-même. Valeurs
  // reprises à l'identique.
  shortcuts: {
    controls: {
      north: 'n',
      zoomIn: '+',
      zoomOut: '-',
      tilt: 'i',
      globe: 'g',
      layers: 't',
      // 'c' pour catalogue — libre, et voisin de 't' (Couches) avec qui il partage
      // son groupe dans la barre.
      catalog: 'c',
      fullscreen: 'f',
      basemap: 'b',
      // 'k' faute de mieux : 'g' (grille) est pris par `globe`, et aucune autre lettre
      // mnémonique n'était libre. À échanger en une ligne si l'hôte préfère 'g'.
      graticule: 'k',
      // Le bouton n'existe qu'en mode plan : un raccourci global serait déroutant.
      traffic: false,
      // 'w' : les lettres voisines sont prises (ZQSD navigue, 'p' est le polygone), et
      // 'w' est la convention FPS (walk).
      pedestrian: 'w',
    },
    // Déplacement CONTINU : ces touches agissent tant qu'elles sont maintenues. Les
    // flèches marchent partout ; ZQSD suit la disposition AZERTY, une application
    // QWERTY pose WASD à la place sans toucher au code.
    navigate: {
      forward: ['arrowup', 'z'],
      backward: ['arrowdown', 's'],
      left: ['arrowleft', 'q'],
      right: ['arrowright', 'd'],
      boost: ['shift'],
    },
    // L'ENTRÉE dans le mode piéton est un bouton de barre : sa touche vit dans
    // `controls.pedestrian`. Ne reste ici que ce qui n'a pas de bouton.
    pedestrian: {
      immersion: false,
    },
    draw: {
      select: 'v',
      selectRect: '1',
      selectPoly: '2',
      selectLasso: '3',
      // '4' : à la suite des trois modes de sélection, dont il partage le sélecteur.
      selectBuilding: '4',
      line: 'l',
      polygon: 'p',
      rect: 'r',
      circle: 'c',
      // ⚠️ Était 'd', désormais pris par le déplacement au clavier (ZQSD). 'h' vient de
      // l'ancien nom de l'outil (« main levée », rebaptisé « Crayon ») et il était libre ;
      // 'c' est pris par le cercle. À rebasculer sur 'd' par la config si l'application
      // n'active pas les lettres de navigation.
      freehand: 'h',
      arrow: 'a',
      measure: 'm',
      erase: 'e',
      // Sous-modes de la gomme : pas de touche dédiée (la gomme s'active par `erase`, le
      // sous-mode se choisit dans le flyout). Remappables par l'hôte si besoin.
      erasePoint: false,
      eraseSelect: false,
      symbol: 'y',
    },
    edit: {
      undo: { key: 'z', mod: 'mod' },
      redo: { key: 'z', mod: 'mod', shift: true },
      redoAlt: { key: 'y', mod: 'ctrl' },
      selectAll: { key: 'a', mod: 'mod' },
      duplicate: { key: 'd', mod: 'mod' },
      delete: ['Delete', 'Backspace'],
      closePolygon: 'Enter',
      nudgePx: 1,
      nudgeFastPx: 10,
    },
    lens: { toggle: 'x' },
  },
}

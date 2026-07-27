// Valeurs par défaut de `MapConfig` — la base du merge.
//
// Chaque feuille est renseignée : la lib ne doit jamais dépendre d'une config
// fournie. Sauf mention `⚠️` ci-dessous, chaque valeur reprend à l'identique celle
// qui était codée en dur avant l'introduction de ce module, pour que `<Map />` sans
// prop `config` se comporte exactement comme auparavant.

import { CAMERA_FOV } from '../core/math'
import type { MapConfig } from './types'

export const defaultConfig: MapConfig = {
  providers: {
    tiles: {
      // ⚠️ Était 'fr-FR' / 'FR' en dur : la carte parlait français quelle que soit
      // la locale de l'application hôte.
      language: 'auto',
      region: 'auto',
      mapType: 'roadmap',
      layerTypes: ['layerTraffic'],
      sessionUrl: 'https://tile.googleapis.com/v1/createSession',
      tileUrl: 'https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}',
      backoffAuthMs: 5 * 60_000,
      backoffTransientMs: 10_000,
      maxTiles: 500,
      maxInflight: 12,
      margin: 1,
      maxRequest: 140,
      maxAttempts: 3,
      retryDelays: [1000, 4000],
    },

    routing: {
      matrixUrl: 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
      routesUrl: 'https://routes.googleapis.com/directions/v2:computeRoutes',
      matrixFields: 'originIndex,destinationIndex,duration,distanceMeters,condition',
      routeFields: 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
      routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      languageCode: 'auto',
      regionCode: 'auto',
      alternatives: false,
      // ⚠️ Nouveaux : aucun timeout ni retry n'existait, une requête sans réponse
      // restait pendante indéfiniment.
      timeoutMs: 10_000,
      retries: 2,
      backoffMs: 300,
      cache: { ttlMs: 60_000, cellMeters: 150, maxEntries: 500 },
      // ⚠️ Nouveaux : ces quatre valeurs pilotaient déjà la facture, mais depuis le
      // code — `DEFAULT_FASTEST_OVERSAMPLE` dans `relations/core/selection`, les deux
      // seuils dans les props de `<RelationLayer>`, les paliers dans `relationMenu`.
      // Un hôte ne pouvait ni les voir ni les borner.
      fastestOversample: 3,
      staleMeters: 150,
      refreshIntervalMs: 15_000,
      presets: { fastest: [3, 5, 10], radius: [500, 1000, 3000] },
    },

    places: {
      url: 'https://places.googleapis.com/v1/places:searchText',
      fields: 'places.displayName,places.formattedAddress,places.location,places.viewport',
      pageSize: 6,
      pageSizeRange: [1, 20],
      languageCode: 'auto',
      regionCode: 'auto',
      // ⚠️ Nouveaux, cf. routing. Budget plus serré qu'en routage : la recherche est
      // relancée à la frappe et l'utilisateur ATTEND devant une liste vide. Trois
      // tentatives de 10 s le laissaient 30 s sans réponse ni moyen de comprendre, et
      // facturaient trois appels Places pour chaque saisie tombée sur un incident.
      timeoutMs: 5_000,
      retries: 1,
      backoffMs: 300,
    },

    // ⚠️ Nouveau : l'identifiant vivait dans `MapEngine` (`?? '2275207'`) et dans
    // deux blocs de doc. Surchargeable par la prop `cesiumIonAssetId`, qui prime.
    tiles3d: { cesiumIonAssetId: '2275207' },

    // ⚠️ Nouveau : le cache de vignettes n'avait ni plafond ni éviction.
    symbols: { cacheMaxEntries: 200 },
  },

  interaction: {
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
    // ⚠️ Nouveaux : tolérances et seuils qui vivaient dans les composants, voire dans
    // la feuille de styles pour `repositionHitPx`. Valeurs reprises à l'identique.
    hubHitTolerancePx: 12,
    repositionHitPx: 22,
    clickSuppressMs: 400,
    freehandMinStepPx: 2,
    targetZoom: 17,
    pinnedFlyZoom: 16,
    drawToolbarMinZoom: 11,
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
        // N (nord) fait déjà la vue du dessus — pas de 2e touche par défaut.
        topDown: false,
        globe: 'g',
        layers: 't',
        fullscreen: 'f',
        basemap: 'b',
        // Le bouton n'existe qu'en mode plan : un raccourci global serait déroutant.
        traffic: false,
      },
      draw: {
        select: 'v',
        selectRect: '1',
        selectPoly: '2',
        selectLasso: '3',
        line: 'l',
        polygon: 'p',
        rect: 'r',
        circle: 'c',
        freehand: 'd',
        arrow: 'a',
        measure: 'm',
        erase: 'e',
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
  },

  performance: {
    pixelRatio: 1,
    antialias: true,
    boundsPickGrid: 5,
    boundsMargin: 0.15,
    viewportSettleFrames: 4,
    markerRecomputeMs: 90,
    // Unifié sur la valeur des COUCHES (1e-6 / 1e-3), pas sur celle du moteur
    // (1e-7 / 1e-4) : c'est elle qui décidait réellement des re-échantillonnages, et
    // la plus fine faisait rouvrir la fenêtre pour un mouvement de ~1 cm.
    cameraMoveEpsilon: { deg: 1e-6, altitudeRatio: 1e-3, altitudeMinMeters: 1 },
    groundSample: {
      ttlMs: 2_000,
      cellDeg: 1e-4,
      rayOriginMeters: 12_000,
      rayFarMeters: 40_000,
      radiusMeters: 18,
      samples: 8,
    },
    markerCullMarginPx: 200,
    // ⚠️ `windowFrames`/`spawnWindowFrames` : 90 et 150 coexistaient dans le même
    // fichier (`MarkerLayer.noteCamera` et la création d'un marker) sans qu'aucune
    // intention ne distingue les deux cas. Elles sont conservées telles quelles, mais
    // nommées — la différence est maintenant lisible et réglable.
    resettle: { batch: 4, retryFrames: 30, mppBand: 1.25, windowFrames: 90, spawnWindowFrames: 150, everyNFrames: 3 },
    relations: { maxSteps: 256, stepMeters: 200, fanMaxLegs: 5, zoomBand: 0.3 },
    // Unifié sur la valeur HAUTE des trois littéraux qui coexistaient (48 pour les
    // liens et les cercles dessinés, 64 pour les zones) : aligner vers le bas aurait
    // aplati les zones, ce qui se voit. Le surcoût est de quelques sommets par cercle.
    circleSegments: 64,
    groundHeightRange: [-500, 9000],
  },

  // ⚠️ Nouveau : l'échelle d'empilement, jusqu'ici éparpillée dans la feuille de
  // styles. Valeurs reprises à l'identique.
  style: {
    zIndex: {
      relationBar: 6,
      editOverlay: 15,
      floatingHud: 20,
      markerSelected: 80,
      tooltip: 90,
      listMenu: 96,
      dock: 998,
      ui: 999,
      menu: 9999,
    },
  },

  // ⚠️ Déplacé depuis `theme.camera` : bornes de navigation et pas de geste, pas
  // d'apparence. Valeurs reprises à l'identique.
  camera: {
    minZoom: 2,
    maxZoom: 21,
    maxTilt: 1.05,
    zoomStep: 0.5,
    dragSpeed: { min: 0.002, max: 0.35 },
    fov: CAMERA_FOV,
    maxTilt3d: Math.PI * 0.44,
    // ~36° : la vue ne plonge pas vers l'horizon, donc la couverture de tuiles 2D
    // reste bornée (le défaut de GlobeControls est 0.45π).
    maxTilt2d: Math.PI * 0.2,
    tiltStep: Math.PI * 0.11,
    zoomFactor: { in: 0.5, out: 2 },
    maxDistanceFactor: 2.5,
    maxAltitudeFactor: 1.5,
    minGroundClearance: 20,
    followAltitude: { min: 200, max: 2_000_000 },
    fitBounds: { margin: 1.35, minAltitude: 350, maxAltitude: 6_000_000 },
  },

  // ⚠️ Déplacé depuis `theme.clustering` : paramètres d'algorithme, pas d'apparence.
  // Valeurs reprises à l'identique.
  clustering: { radius: 60, minPoints: 2, maxZoom: 18, levelQuantization: 1, spiderfyZoom: 19 },

  markers: { staticMinZoom: 13 },

  data: {
    viewportDebounceMs: 500,
    positionSaveDebounceMs: 400,
    storageKeys: {
      tagFilter: 'm3d:tag-filter',
      drawSettings: 'm3d:draw-settings',
      searchHistory: 'm3d:search-history',
    },
    search: {
      minQuery: 2,
      debounceMs: 250,
      limitPerGroup: 6,
      historySize: 8,
      flyAltitude: 2_500,
      fitPadding: 60,
      resolveLimit: 20,
    },
  },

  startup: {
    introDuration: 3.0,
    introMaxWaitMs: 8_000,
    readyMaxWaitMs: 8_000,
    // ⚠️ Nouveaux : le fondu vivait dans le CSS, l'altitude et la taille de repli
    // dans le code. Valeurs reprises à l'identique.
    introFadeMs: 500,
    introAltitudeFactor: 1,
    fallbackSize: [800, 600],
  },
}

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
    // Serveur auto-hébergé, partagé par le fond 2D ET le volume (raster, bâtiments).
    // Sa production. À remplacer par la vôtre : cette origine est celle du projet, pas
    // un service public.
    internal: {
      origin: 'https://map.gosecure.site',
      // ⚠️ Était le littéral `1` recopié dans les deux calques. Un mètre : sous la
      // précision du suivi d'altitude, et assez grand pour qu'une reconstruction de cache
      // reste un événement rare (une par bascule de mode, en pratique).
      elevationEpsilon: 1,
    },

    tiles: {
      // ⚠️ Le fond 2D était nécessairement Google, et sa clé obligatoire. Le défaut est
      // désormais le serveur auto-hébergé : une carte tourne sans aucune clé d'API.
      // `'external'` rétablit le fond Google.
      provider: 'internal',
      internalTileUrl: '{origin}/styles/{style}/{z}/{x}/{y}{r}.png',
      style: 'liberty',
      retina: false,
      // ⚠️ Étaient BASE_Z / MAX_Z, deux littéraux dans `TiledGlobeLayer` — donc le
      // plafond de zoom d'un fournisseur, écrit dans le code d'un calque.
      baseZoom: 2,
      maxZoom: 22,
      // ⚠️ Nouveau : le cran de la cascade de détail (cf. son JSDoc). 5 tuiles de côté,
      // soit le quart central déjà couvert par le niveau plus fin et une couronne autour.
      lodRing: 5,
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
      // ⚠️ 500 → 700 : la cascade descend jusqu'au niveau de base, ce qui ajoute un anneau
      // de `lodRing²` tuiles par cran grossier (~375 au total depuis un zoom de rue). Sous
      // l'ancien plafond, ces niveaux se faisaient évincer par les tuiles fines aussitôt
      // demandés — et l'aplat uniforme au loin réapparaissait. Ils sont petits en nombre,
      // couvrent d'immenses surfaces, et ne se renouvellent pas quand on se déplace.
      maxTiles: 700,
      /**
       * ⚠️ Nouveau — un FILET, pas un budget actif. Une tuile raster décodée pèse
       * 256×256×4 = 262 Ko sur le GPU : les 700 du plafond ci-dessus en font 183 Mo, que
       * rien ne bornait. 256 Mio restent donc au-dessus de ce que `maxTiles` autorise, et
       * le défaut ne change RIEN au comportement connu — c'est `maxTiles` qui continue de
       * trancher. Le filet ne se referme que si l'on monte `maxTiles`, ou en `retina`, où
       * une tuile @2x pèse quatre fois plus.
       *
       * Le poser SOUS `maxTiles × 262 Ko` évincerait des niveaux de la cascade de détail,
       * et rouvrirait l'aplat uniforme au loin qu'elle est justement là pour combler.
       */
      maxBytes: 256 * 1024 * 1024,
      // ⚠️ Étaient les littéraux 10 et 200 de `TiledGlobeLayer.evict`.
      evictEvery: 10,
      evictSlack: 200,
      // Une tuile raster se monte en une fraction de milliseconde (une grille de 2×2 à 32×32
      // quads, une texture) : rien à étaler, contrairement au volume.
      mountPerFrame: 8,
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
    // ⚠️ Le volume venait NÉCESSAIREMENT des tuiles photoréalistes dès qu'un token ou une
    // clé était fourni. Il vient désormais du serveur interne (bâtiments extrudés) ;
    // `'external'` rétablit les tuiles photoréalistes.
    tiles3d: { provider: 'internal', cesiumIonAssetId: '2275207' },

    // Volume du fournisseur interne. Les noms d'attributs sont ceux du schéma
    // OpenMapTiles ; ils se règlent pour un serveur qui en publierait d'autres.
    buildings: {
      tileUrl: '{origin}/data/openmaptiles/{z}/{x}/{y}.pbf',
      sourceLayer: 'building',
      heightField: 'render_height',
      minHeightField: 'render_min_height',
      hideField: 'hide_3d',
      colorField: 'colour',
      defaultHeight: 6,
      // ⚠️ Nouveau. La Burj Khalifa fait 828 m : au-delà, ce n'est plus un bâtiment mais
      // une erreur de saisie — et `height=99999` est une faute courante dans OSM, qui
      // produisait un volume de cent kilomètres.
      maxHeight: 1000,
      // Résolution de ~4 cm sur l'étendue d'une tuile, pour deux fois moins d'octets que
      // `'float32'` sur le plus gros tampon. Cf. le JSDoc du type pour le repli.
      positionPrecision: 'int16',
      // 14 = maxzoom des données OpenMapTiles : au-delà, la tuile 14 est réutilisée.
      zoom: 14,
      // 13 et non 14 : le zoom d'une vue INCLINÉE est plus bas que celui demandé à la
      // caméra (l'emprise s'élargit), donc un seuil à 14 laissait une carte à `zoom={14}`
      // sans le moindre bâtiment. Le budget `maxRequest` borne ce que ce niveau réclame.
      minViewZoom: 13,
      margin: 0,
      // ⚠️ Étaient 64 / 4 / 24, calqués sur les budgets du raster — sans rapport avec ce
      // que pèse une tuile de VOLUME (~131 000 triangles pour une tuile z14 parisienne).
      //
      // `maxRequest: 25` = les 5×5 tuiles autour du point REGARDÉ, soit ~8 km de portée à
      // cette latitude (une tuile z14 y fait 1,6 km). C'est un arbitrage assumé, pas une
      // couverture : une vue inclinée à 79° porte à des dizaines de kilomètres, et aucune
      // couronne z14 ne l'atteindrait — le niveau z13 des données, lui, ne porte AUCUNE
      // hauteur (vérifié sur le serveur), donc il n'existe pas de LOD lointain à moindre
      // coût. Au-delà de la couronne, le fond raster reste seul : c'est visible, et c'est
      // la limite de la donnée.
      //
      // `maxTiles` doit rester nettement au-dessus de `maxRequest`, sinon un pan évince ce
      // qu'il vient de demander et la file repart en boucle.
      maxTiles: 36,
      /**
       * ⚠️ Nouveau — un FILET, pas un budget actif. Une tuile z14 dense pèse ~1,5 Mo de
       * positions (en `int16`), 780 Ko de couleurs, 1,9 Mo d'indices et ~0,7 Mo d'arbre de
       * collision, soit ~4,9 Mo ; les 36 du plafond ci-dessus en font ~175 Mo, que rien ne
       * bornait — de quoi faire perdre son contexte WebGL à un GPU intégré. En rase
       * campagne, les mêmes 36 tuiles pèsent 2 Mo : le compte de tuiles ne dit donc rien
       * de ce qui est retenu.
       *
       * 256 Mio restent au-dessus du pire cas des 36 tuiles : le défaut ne retire aucun
       * bâtiment de l'écran, et la borne n'agit que si l'on monte `maxTiles`. C'est
       * ELLE qu'il faut baisser pour protéger une machine modeste — le panneau de
       * l'exemple la règle en direct, et l'éviction se voit à l'œil.
       */
      maxBytes: 256 * 1024 * 1024,
      // ⚠️ Étaient les littéraux 10 et 16 de `BuildingsLayer.evict`. Marge plus serrée que
      // celle du raster : une tuile de volume coûte vingt fois plus qu'une texture.
      evictEvery: 10,
      evictSlack: 16,
      // ⚠️ Nouveau, et c'est UNE tuile : son montage coûte une vingtaine de millisecondes
      // (couleurs développées, arbre de collision construit). Deux dans la même frame — ce
      // que `maxInflight` autorise — faisaient un gel franc de 50 ms, chaque fois qu'une
      // vue nouvelle arrivait. Étalées, la carte perd une frame au lieu de trois.
      mountPerFrame: 1,
      maxInflight: 2,
      maxRequest: 25,
      maxAttempts: 3,
      retryDelays: [1000, 4000],
      // Vide : un attribut demandé traverse le worker pour CHAQUE emprise de CHAQUE tuile
      // (~2 300 par tuile dense). L'hôte qui en affiche un le nomme, les autres ne coûtent
      // rien — `height`, `minHeight` et l'identifiant sont là de toute façon.
      pickFields: [],
    },

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
    buildingPick: { cursor: 'crosshair' },
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
        // ⚠️ Était 'd', désormais pris par le déplacement au clavier (ZQSD). 'h' comme
        // « main levée », et il était libre. À rebasculer sur 'd' par la config si
        // l'application n'active pas les lettres de navigation.
        freehand: 'h',
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
    // ⚠️ `minZoom` et `maxZoom` étaient inertes (cf. leur JSDoc). Valeurs inchangées :
    // `minZoom: 2` (~10 000 km) reste moins contraignant que `maxDistanceFactor`, donc le
    // dézoom que vous connaissez ne bouge pas — les deux réglages cessent seulement de se
    // contredire.
    minZoom: 2,
    maxZoom: 21,
    // ⚠️ Nouveau. ~153 m au-dessus du sol (40 075 016 / 2^18) : on voit un pâté de maisons
    // entier, chaque bâtiment reste identifiable, et la caméra n'entre jamais dans la rue.
    // Un immeuble haussmannien fait ~20 m — la marge est large, y compris sur les tours.
    maxZoom3d: 18,
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
    // ⚠️ Nouveau : déplacement au clavier. 0,8 hauteur-sol par seconde ≈ un écran par
    // seconde au nadir, ce qui reste lisible ; Maj triple.
    keyPan: { speed: 0.8, boost: 3 },
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

  sky: {
    enabled: true,
    // Ciel clair et franc par défaut : turbidité basse, bleu de Rayleigh soutenu.
    turbidity: 2,
    rayleigh: 1.2,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.8,
    // Couverture modérée, nuages statiques (pas d'animation temporelle).
    clouds: { coverage: 0.35, density: 0.4, scale: 0.0002, elevation: 0.5 },
    // Fondu haut dans la descente : au-delà de 500 km, espace étoilé pur ; sous 90 km,
    // ciel plein. La bande couvre toute l'entrée en atmosphère sans jamais toucher la
    // vue globe (altitude ≈ rayon terrestre).
    fade: { start: 500_000, end: 90_000 },
    // 0 = heure de montage, figée (cf. SkyConfig.date).
    date: 0,
  },

  pedestrian: {
    eyeHeightMeters: 1.7,
    // 3 m/s : la marche réelle (1,4) donne l'impression de faire du surplace dans un décor
    // à l'échelle. Un pas plus vif se lit mieux, et `sprintFactor` reste là pour couvrir
    // du terrain. À ramener à 1,4 pour une vitesse fidèle.
    walkSpeed: 3,
    sprintFactor: 3,
    lookSpeed: 0.15,
    // Convention du glisser de carte : tirer la souris vers le BAS relève la vue, comme le
    // pan de `GlobeControls`. Passer à `false` donne la convention FPS.
    invertY: true,
    invertX: false,
    pitchMaxDeg: 89,
    // 1000 m : au-delà, la vue rasante fait demander des milliers de tuiles pour un
    // horizon que le brouillard cache de toute façon.
    viewDistanceMeters: 1000,
    fogStartMeters: 700,
    nearMeters: 0.1,
    groundProbeMeters: 5,
    // 120 m : le détail se cale sur ce qu'on regarde en marchant (le bout de la rue), et
    // non sur la distance à ses propres pieds — qui réclamerait le zoom maximal partout.
    tileDetailDistanceMeters: 120,
    groundSmoothing: 0.25,
    collision: {
      radiusMeters: 0.3,
      feelers: 6,
      feelerMarginMeters: 0.2,
      maxStepHeightMeters: 0.4,
    },
    placement: {
      maxRoofDeltaMeters: 2,
      // 20 m, et non 4 : la couronne doit SORTIR de l'emprise du bâtiment visé pour
      // trouver la rue en contrebas. À 4 m elle restait sur le toit, qui devenait donc
      // son propre « niveau de rue » — un toit se validait alors comme une chaussée.
      // Même ordre de grandeur que `performance.groundSample.radiusMeters` (18 m), écrit
      // pour exactement ce problème.
      ringRadiusMeters: 20,
      // ~30 Hz : le curseur reste vif à l'œil, et la dizaine de raycasts par validation
      // cesse de suivre la cadence d'un `pointermove`.
      refreshMs: 33,
      refreshSlopPx: 3,
    },
    headBob: { enabled: false, amplitudeMeters: 0.05, frequency: 1.8 },
    transitions: { enterMs: 800, exitMs: 600 },
  },
}

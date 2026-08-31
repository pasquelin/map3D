import type { ProvidersConfig } from '../types'

export const providersDefaults: ProvidersConfig = {
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
    // ⚠️ Nouveau : sans lui, la calotte de ±85° à ±90° laissait voir la sphère de repli
    // — le disque bleu nuit au centre de l'Antarctique et de l'Arctique.
    fillPoles: true,
    maxZoom: 22,
    // ⚠️ Nouveau : le cran de la cascade de détail (cf. son JSDoc). 5 tuiles de côté,
    // soit le quart central déjà couvert par le niveau plus fin et une couronne autour.
    lodRing: 5,
    // ⚠️ Était 'fr-FR' / 'FR' en dur : la carte parlait français quelle que soit
    // la locale de l'application hôte.
    language: 'auto',
    region: 'auto',
    mapType: 'roadmap',
    // ⚠️ Nouveau. En interne, le trafic n'était pas proposé DU TOUT, clé Google ou non :
    // le calque est gravé dans la tuile Google, donc l'offrir suppose de changer de
    // fournisseur le temps qu'il est allumé. `false` rétablit ce refus.
    trafficViaExternal: true,
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
    // ⚠️ 140 → 200 : en vue du dessus, le fond demande UN niveau unique sur toute la vue
    // (cf. `uniformDetail`). 200 laisse ce niveau atteindre celui des bâtiments (~z14) sur
    // une vue d'agglomération avant de retomber sur du plus grossier. maxTiles=700 borne.
    maxRequest: 200,
    maxAttempts: 3,
    retryDelays: [1000, 4000],
    // Un seul niveau sur toute l'emprise (pas de boîte de détail au centre), à plat comme
    // incliné. Cascade gardée seulement en marche (piéton).
    uniformDetail: true,
    // ⚠️ Nouveau. Le niveau uniforme est celui qu'impose le point le plus LOINTAIN de
    // l'emprise, et le premier plan en hérite : sans cette bascule, une vue rasante près du
    // sol (mesuré : 73 m d'altitude, 73° d'inclinaison) tombait sur des tuiles de 805 m,
    // onze fois la hauteur de l'œil. `1` tolère un cran — invisible — et rend la main à la
    // cascade au-delà, là où elle est de toute façon le comportement attendu.
    uniformMaxSpread: 1,
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
  tiles3d: {
    provider: 'internal',
    cesiumIonAssetId: '2275207',
    hideVolumeWhenClamped: true,
    volumeFadeMs: 250,
  },

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
    // Seuil d'affichage en MÈTRES au-dessus du sol, et non plus en zoom de vue : le zoom
    // divisait par la hauteur du viewport, donc le même réglage laissait les bâtiments
    // affichés jusqu'à 15 km sur une fenêtre de 700 px et 31 km sur 1 440 px.
    maxViewAltitude: 1000,
    // Téléchargement dès 1,5 km pour un affichage à 1 km : ~500 m de descente pour que la
    // tuile ait le temps d'arriver. ⚠️ Ce que cette bande absorbe a changé de nature : le
    // montage ne coûte plus ~20 ms (l'arbre est construit côté worker) mais ~1 ms — c'est
    // désormais la LATENCE du pipeline, téléchargement et extrusion compris.
    requestAltitudeFactor: 1.5,
    // RAYON du disque de couverture (cf. `MapEngine.volumeBounds`), et non plus portée d'un
    // trapèze : le volume ne bouge donc plus du tout quand on tourne la caméra.
    //
    // 5 km tient dans les budgets existants — le disque couvre 360°, là où l'ancien carré
    // 7×7 se concentrait devant. Mesuré (pire cas parisien) : 64 tuiles z14 pour le carré
    // circonscrit, mais 32 une fois les coins écartés (cf. `BuildingsLayer.requestLevel`),
    // soit ~157 Mo — sous `maxRequest: 49`, `maxTiles: 80` et `maxBytes`. Le coût est en
    // n² : 6 km demanderait déjà 47 tuiles, ras le budget de requêtes.
    maxViewDistance: 5000,
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
    // ⚠️ 36 → 80 : couvre le carré 7×7 élargi (`maxRequest: 49`) plus la marge de pan.
    // Reste « nettement au-dessus » de `maxRequest`.
    maxTiles: 80,
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
    // ⚠️ 256 → 448 Mio : suit l'élargissement du carré (80 tuiles denses ≈ 392 Mo). C'est
    // ELLE qu'il faut BAISSER sur une machine modeste (perte de contexte WebGL sinon).
    maxBytes: 448 * 1024 * 1024,
    // ⚠️ Étaient les littéraux 10 et 16 de `BuildingsLayer.evict`. Marge plus serrée que
    // celle du raster : une tuile de volume coûte vingt fois plus qu'une texture.
    evictEvery: 10,
    evictSlack: 16,
    // ⚠️ 1 → 2. Le montage d'une tuile dense coûtait une quarantaine de millisecondes,
    // presque entièrement l'arbre de collision — construit côté worker depuis. Il ne
    // reste que ~1 ms de couleurs développées et la pose de l'arbre (~0,05 ms), plus un
    // upload GPU non mesuré : d'où un doublement, et non une ouverture en grand.
    mountPerFrame: 2,
    // ⚠️ 2 → 4, aligné sur `workerPoolSize`. La file ne lance pas plus de téléchargements
    // que ça : laissé à 2, il aurait affamé le pool, dont deux workers sur quatre
    // seraient restés oisifs quelle que soit la vue.
    maxInflight: 4,
    // Plateau mesuré sur 24 tuiles z14 parisiennes (1430 ms à un worker, 559 ms à
    // quatre) ; au-delà le gain s'annule et finit par s'inverser. Le pool se borne
    // lui-même au nombre de cœurs moins un, donc une machine modeste en aura moins.
    workerPoolSize: 4,
    // ⚠️ 25 → 49 : carré 7×7 (~11 km à Paris) au lieu de 5×5 (~8 km), pour que le volume
    // remplisse davantage la vue inclinée au lieu d'un petit bloc. Chaque tuile dense pesant
    // ~4,9 Mo, monter ce budget se paie en RAM (cf. `maxTiles`/`maxBytes`, relevés d'autant).
    maxRequest: 49,
    maxAttempts: 3,
    retryDelays: [1000, 4000],
    // Vide : un attribut demandé traverse le worker pour CHAQUE emprise de CHAQUE tuile
    // (~2 300 par tuile dense). L'hôte qui en affiche un le nomme, les autres ne coûtent
    // rien — `height`, `minHeight` et l'identifiant sont là de toute façon.
    pickFields: [],
  },

  // ⚠️ Nouveau : le cache de vignettes n'avait ni plafond ni éviction.
  symbols: { cacheMaxEntries: 200 },

  // Gestionnaire de templates. Défauts non optionnels (l'onglet Config de l'exemple
  // n'affiche pas les clés purement optionnelles). `baseUrl:''` = localStorage seul.
  templates: {
    baseUrl: '',
    headers: {},
    fetch: { timeoutMs: 10_000, retries: 1, backoffMs: 300 },
    categories: ['shapes', 'freehand', 'symbols'],
    defaultCategories: ['shapes', 'freehand', 'symbols'],
    defaultApply: 'merge',
    allowExport: true,
    // ⚠️ Nouveau : la vue mémorisée. Proposée mais DÉCOCHÉE d'avance — un template
    // reste d'abord un dessin, et rejouer un cadrage qu'on n'a pas demandé serait la
    // pire surprise possible. Rejouée en revanche dès qu'un template en porte une,
    // sans quoi la sauvegarder n'aurait aucun effet visible.
    saveView: true,
    defaultSaveView: false,
    applyView: true,
    viewFlyDuration: 1.2,
  },
}

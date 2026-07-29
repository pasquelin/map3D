# `MapConfig` — référence

**Français** · [English](../en/CONFIG.md) · [↑ Index](README.md)

Toutes les valeurs réglables de la carte, leur rôle et leur défaut.

Généré depuis `src/config/defaultConfig.ts` (valeurs) et `src/config/types.ts`
(descriptions) — les défauts ci-dessous sont ceux que la lib applique réellement.

```tsx
<Map config={{ performance: { antialias: false } }} />
```

Un override est **partiel et profond** : ne fournir que ce qui change, `mergeConfig`
complète le reste. Les tableaux et tuples, eux, se remplacent en bloc — un tuple
partiel est une erreur de compilation.

> **Essayer avant d'écrire.** `pnpm dev:example` monte, à droite de la carte, un banc
> de réglages (Tweakpane) qui expose CETTE table en entier, en direct. Son bouton
> « Copier le `PartialConfig` » rend l'écart aux défauts sous la forme exacte à coller
> dans `config={{ … }}`. Les réglages marqués ❄ y sont lus à la construction du moteur :
> ils ne prennent effet qu'au remontage de la carte.

💰 = impact facturation Google · 🌍 = impact locale/i18n

## `providers` — Fournisseurs tiers, réseau, caches

| Clé | Description | Défaut |
|---|---|---|
| `providers.internal.origin` | Origine du serveur auto-hébergé (schéma + hôte + port, sans `/` final), substituée à `{origin}` dans TOUS les gabarits internes — fond 2D **et** volume, qui sortent du même serveur. ⚠️ Le défaut désigne le serveur du projet : un hôte tiers **doit** y mettre le sien, ou choisir les fournisseurs `'external'`. Vide, les fournisseurs `'internal'` restent sans effet. | `'https://map.gosecure.site'` |
| `providers.internal.elevationEpsilon` | Écart d'altitude du sol (m) en deçà duquel le fond raster et les volumes ne sont PAS reconstruits. L'altitude est intégrée à la géométrie des deux calques : la suivre au centimètre rejouerait tout le cache à chaque frame. Réglage commun, les deux devant partager la même référence. ⚠️ Était un littéral recopié dans les deux calques. | `1` |
| `providers.tiles.provider` | Fournisseur des tuiles du fond de carte : `'external'` (Google Map Tiles, session + clé, trafic disponible) ou `'internal'` (serveur auto-hébergé, simples URLs XYZ, sans clé ni quota, **sans trafic**). Cf. [TILES.md](TILES.md). | `'internal'` |
| `providers.tiles.internalTileUrl` | Gabarit d'URL d'une tuile raster interne — `{origin}`, `{style}`, `{z}`, `{x}`, `{y}` et `{r}` sont substitués. Aucune query n'est ajoutée : le serveur interne ne signe rien. | `'{origin}/styles/{style}/{z}/{x}/{y}{r}.png'` |
| `providers.tiles.style` | Nom du style rendu par le serveur interne, substitué à `{style}`. | `'liberty'` |
| `providers.tiles.retina` | Demander les tuiles internes en double densité (`{r}` → `@2x`). Défaut `false` : le canvas suit `performance.pixelRatio` (1 par défaut), où une tuile @2x quadruple les octets sans rien ajouter à l'écran. | `false` |
| `providers.tiles.baseZoom` | Niveau de base, toujours chargé, qui couvre le globe entier — c'est lui qui garantit l'absence de trou pendant que les niveaux fins arrivent. ⚠️ Était codé en dur (2). | `2` |
| `providers.tiles.maxZoom` | Zoom de tuile maximal demandé. ⚠️ Était codé en dur (22, plafond de Google roadmap) : un serveur interne dont le style s'arrête plus tôt réclamait des niveaux inexistants. | `22` |
| `providers.tiles.lodRing` | Côté (en tuiles) de l'anneau demandé à chaque niveau **intermédiaire** de la cascade de détail, autour du point visé. ⚠️ Nouveau : le calque ne connaissait que deux niveaux, si bien qu'en vue inclinée le lointain tombait d'un coup sur le niveau de base — un aplat uniforme. Chaque cran porte deux fois plus loin que le précédent. | `5` |
| `providers.tiles.language` | Langue des libellés gravés dans les tuiles. `'auto'` suit le navigateur. ⚠️ Codé en dur sur `'fr-FR'` jusqu'ici : la carte affichait des noms français quelle que soit la locale de l'application. | `'auto'` |
| `providers.tiles.region` | Biais régional (tracé des frontières contestées, toponymie). `'auto'` laisse le fournisseur déduire. ⚠️ Codé en dur sur `'FR'` jusqu'ici. | `'auto'` |
| `providers.tiles.mapType` | Fond de carte 2D demandé au fournisseur. | `'roadmap'` |
| `providers.tiles.layerTypes` | Calques additionnels demandés à la session de tuiles. | `["layerTraffic"]` |
| `providers.tiles.sessionUrl` | Endpoint de création de session de tuiles. | `'https://tile.googleapis.com/v1/createSession'` |
| `providers.tiles.tileUrl` | Gabarit d'URL de tuile — `{z}`, `{x}`, `{y}` et `{session}` sont substitués. | `'https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}'` |
| `providers.tiles.backoffAuthMs` | Attente après un refus d'identité (clé invalide, quota) avant de réessayer. | `300000` |
| `providers.tiles.backoffTransientMs` | Attente après une panne transitoire (5xx, réseau). | `10000` |
| `providers.tiles.maxTiles` | Plafond du cache de textures (mémoire GPU). ⚠️ 500 → 700 : la cascade de détail descend jusqu'au niveau de base, ce qui ajoute un anneau de `lodRing²` tuiles par cran grossier. Sous l'ancien plafond, ces niveaux se faisaient évincer par les tuiles fines aussitôt demandés, et l'aplat uniforme au loin réapparaissait. | `700` |
| `providers.tiles.maxBytes` | Plafond de la mémoire retenue par les tuiles montées (octets, `0` = illimité). ⚠️ Nouveau : une tuile raster décodée pèse 256×256×4 = 262 Ko, donc les 700 du plafond ci-dessus en font 183 Mo que rien ne bornait. | `268435456` |
| `providers.tiles.evictEvery` | Une frame sur N déclenche le tri d'éviction, qui alloue et coûte O(n log n). ⚠️ Était un littéral (10). | `10` |
| `providers.tiles.evictSlack` | Dépassement (en tuiles) au-delà duquel l'éviction est forcée sans attendre son tour, pour borner le pic de mémoire. ⚠️ Était un littéral (200). | `200` |
| `providers.tiles.mountPerFrame` | Tuiles montées dans la scène par frame au plus. Une tuile raster se monte en une fraction de milliseconde : rien à étaler, contrairement au volume. | `8` |
| `providers.tiles.maxInflight` | Téléchargements simultanés. | `12` |
| `providers.tiles.margin` | Anneau de tuiles préchargées autour du viewport. | `1` |
| `providers.tiles.maxRequest` | Budget de tuiles demandées pour le niveau de zoom cible. | `140` |
| `providers.tiles.maxAttempts` | Essais par tuile avant abandon définitif. | `3` |
| `providers.tiles.retryDelays` | Backoff entre deux essais d'une même tuile. | `[1000, 4000]` |
| `providers.routing.matrixUrl` | Endpoint `computeRouteMatrix` — à viser sur un proxy serveur en production. | `'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'` |
| `providers.routing.routesUrl` | Endpoint `computeRoutes`. | `'https://routes.googleapis.com/directions/v2:computeRoutes'` |
| `providers.routing.matrixFields` | FieldMask de la matrice — 💰 conditionne directement la facturation Google. | `'originIndex,destinationIndex,duration,distanceMeters,condition'` |
| `providers.routing.routeFields` | FieldMask d'un itinéraire — 💰 idem. | `'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'` |
| `providers.routing.routingPreference` | Qualité de routage demandée — 💰 `TRAFFIC_AWARE_OPTIMAL` est le palier le plus cher. | `'TRAFFIC_AWARE_OPTIMAL'` |
| `providers.routing.languageCode` | 🌍 Langue des textes renvoyés. `'auto'` suit le navigateur. | `'auto'` |
| `providers.routing.regionCode` | 🌍 Biais régional. `'auto'` laisse le fournisseur déduire. | `'auto'` |
| `providers.routing.alternatives` | Demander plusieurs itinéraires (seul le plus rapide est tracé aujourd'hui). | `false` |
| `providers.routing.timeoutMs` | Abandon d'une requête sans réponse. `0` = pas de limite (comportement d'origine). | `10000` |
| `providers.routing.retries` | Réessais après échec réseau ou 5xx. `0` = aucun. | `2` |
| `providers.routing.backoffMs` | Attente avant le premier réessai, doublée à chaque tour, avec une part aléatoire. `0` = réessai immédiat. | `300` |
| `providers.routing.headers` | En-têtes supplémentaires, prioritaires sur les nôtres. Requis pour viser un **proxy serveur** plutôt que d'exposer la clé Google côté client. | *(absent)* |
| `providers.routing.units` | Système d'unités des textes renvoyés (`'METRIC'` / `'IMPERIAL'`). Absent = déduit de `languageCode`. | *(absent)* |
| `providers.routing.cache.ttlMs` | Durée de vie d'une réponse de routage. | `60000` |
| `providers.routing.cache.cellMeters` | Quantification des positions dans la clé de cache (tolérance de dérive). | `150` |
| `providers.routing.cache.maxEntries` | Plafond d'entrées avant éviction LRU. | `500` |
| `providers.routing.fastestOversample` | Candidats interrogés par lien affiché, en multiple du nombre demandé. 💰 **Multiplie directement la matrice facturée** : demander les 5 plus rapides en interroge 15. Le sur-échantillonnage sert à ce que les N plus rapides *en temps* soient choisis parmi assez de candidats *en distance* — le plus… | `3` |
| `providers.routing.staleMeters` | Dérive (m) d'une extrémité au-delà de laquelle temps et tracé sont refaits. 💰 Plus la valeur est basse, plus on rappelle le fournisseur. | `150` |
| `providers.routing.refreshIntervalMs` | Intervalle minimal entre deux recalculs d'une même relation. 💰 Plafond de débit. | `15000` |
| `providers.routing.presets.fastest` | « Les N plus rapides » ; chaque palier coûte `N × fastestOversample` cases de matrice. | `[3, 5, 10]` |
| `providers.routing.presets.radius` | Rayons de sélection, **en mètres** — l'unité de base, comme partout. Ils sont AFFICHÉS via `labels.measure`, donc un jeu impérial les rend en miles sans rien changer ici. Mais les paliers eux-mêmes restent métriques : 500 m, 1 km, 3 km donnent « 0.3 mi », « 0.6 mi », « 1.9 mi » — exacts mais… | `[500, 1000, 3000]` |
| `providers.places.url` | Endpoint `places:searchText`. | `'https://places.googleapis.com/v1/places:searchText'` |
| `providers.places.fields` | FieldMask — 💰 conditionne la facturation Places. | `'places.displayName,places.formattedAddress,places.location,places.viewport'` |
| `providers.places.pageSize` | Nombre de résultats demandés (borné à `pageSizeRange` par le fournisseur). | `6` |
| `providers.places.pageSizeRange` | Bornes acceptées par l'API pour `pageSize`. | `[1, 20]` |
| `providers.places.languageCode` | 🌍 Langue des résultats. `'auto'` suit le navigateur. | `'auto'` |
| `providers.places.regionCode` | 🌍 Biais régional des résultats. | `'auto'` |
| `providers.places.timeoutMs` | Abandon d'une requête sans réponse. `0` = pas de limite. Plus serré qu'en routage : l'utilisateur attend devant une liste vide. | `5000` |
| `providers.places.retries` | Réessais après échec réseau ou 5xx. `0` = aucun. 💰 La recherche étant relancée à la frappe, chaque réessai est un appel Places facturé de plus. | `1` |
| `providers.places.backoffMs` | Attente avant le premier réessai, doublée à chaque tour, avec une part aléatoire. `0` = réessai immédiat. | `300` |
| `providers.places.headers` | En-têtes supplémentaires, prioritaires sur les nôtres — mêmes usage et priorité que `providers.routing.headers`. | *(absent)* |
| `providers.tiles3d.provider` | Fournisseur du volume (mode `'3d'`) : `'external'` (tuiles 3D photoréalistes, selon le token Ion / la clé passés à `<Map>`) ou `'internal'` (relief et bâtiments du serveur auto-hébergé). Indépendant de `providers.tiles.provider`. Modifiable à chaud ; sur `'internal'` le tileset photoréaliste est gelé, donc **n'émet aucune requête**. Cf. [TILES.md](TILES.md). | `'internal'` |
| `providers.buildings.tileUrl` | Gabarit d'URL d'une tuile vectorielle — `{origin}`, `{z}`, `{x}`, `{y}` substitués. | `'{origin}/data/openmaptiles/{z}/{x}/{y}.pbf'` |
| `providers.buildings.sourceLayer` | Couche du schéma OpenMapTiles portant les emprises. | `'building'` |
| `providers.buildings.heightField` | Attribut de hauteur totale (m au-dessus du sol). | `'render_height'` |
| `providers.buildings.minHeightField` | Attribut de hauteur de base — un porche, un bâtiment sur pilotis ne partent pas de 0. | `'render_min_height'` |
| `providers.buildings.hideField` | Attribut booléen excluant une emprise de l'extrusion. | `'hide_3d'` |
| `providers.buildings.colorField` | Attribut de couleur propre à l'emprise ; à défaut, le thème décide. | `'colour'` |
| `providers.buildings.defaultHeight` | Hauteur (m) retenue quand l'attribut manque — une emprise sans hauteur reste visible. | `6` |
| `providers.buildings.maxHeight` | Hauteur (m) maximale retenue ; au-delà, l'emprise y est ramenée. ⚠️ Nouveau : la hauteur venait BRUTE de la donnée, et `height=99999` (faute de saisie courante dans OSM) produisait un bâtiment de cent kilomètres — volume englobant démesuré, tuile visible en permanence, caméra arrêtée sur un fantôme. | `1000` |
| `providers.buildings.positionPrecision` | Format des positions envoyées au GPU : `'int16'` (entiers normalisés sur l'étendue de la tuile, ~4 cm de résolution, **deux fois moins d'octets**) ou `'float32'` (repli, pour un cas d'usage exigeant mieux que le centimètre). | `'int16'` |
| `providers.buildings.zoom` | Zoom des tuiles demandées : le `maxzoom` des données (14 en OpenMapTiles). | `14` |
| `providers.buildings.minViewZoom` | Zoom de vue en dessous duquel aucune tuile n'est demandée. Vus de haut, les bâtiments ne couvrent que quelques pixels. **13 et non 14** : le zoom d'une vue inclinée est plus bas que celui demandé à la caméra. | `13` |
| `providers.buildings.margin` | Anneau de tuiles préchargées autour du viewport. | `0` |
| `providers.buildings.maxTiles` | Plafond du cache de tuiles extrudées (mémoire GPU). Une tuile z14 dense pèse ~131 000 triangles : ce plafond n'a rien à voir avec celui du fond raster. À garder nettement au-dessus de `maxRequest`, sinon un pan évince ce qu'il vient de demander. | `36` |
| `providers.buildings.maxBytes` | Plafond de la mémoire retenue par les volumes montés (octets, `0` = illimité). ⚠️ Nouveau, et c'est **lui** qui borne réellement la mémoire : une tuile z14 dense pèse ~4,9 Mo (positions, couleurs, index, arbre de collision), donc les 36 du plafond ci-dessus en faisaient 175 Mo — de quoi faire perdre son contexte WebGL à un GPU intégré. En rase campagne, les mêmes 36 tuiles pèsent 2 Mo : le compte de tuiles ne dit rien de ce qui est retenu. | `268435456` |
| `providers.buildings.evictEvery` | Une frame sur N déclenche le tri d'éviction. ⚠️ Était un littéral (10). | `10` |
| `providers.buildings.evictSlack` | Dépassement (en tuiles) au-delà duquel l'éviction est forcée. ⚠️ Était un littéral (16). | `16` |
| `providers.buildings.mountPerFrame` | Tuiles montées dans la scène par frame au plus. ⚠️ Nouveau, et c'est **une** : le montage (couleurs développées, arbre de collision construit) coûte une vingtaine de millisecondes et reste sur le thread principal. Deux tuiles qui aboutissaient dans la même frame — ce que `maxInflight` autorise — additionnaient leur coût en un gel franc. | `1` |
| `providers.buildings.maxInflight` | Tuiles simultanément en cours de téléchargement **et d'extrusion** dans le worker. | `2` |
| `providers.buildings.maxRequest` | Budget de tuiles demandées pour une vue : les N×N tuiles autour du point **regardé** (le sol sous le centre de l'écran, pas sous la caméra). `25` = 5×5, soit ~8 km de portée à Paris. Au-delà, le fond raster reste seul — cf. [TILES.md § 5](TILES.md). | `25` |
| `providers.buildings.maxAttempts` | Essais par tuile avant abandon définitif. | `3` |
| `providers.buildings.retryDelays` | Backoff entre deux essais d'une même tuile. | `[1000, 4000]` |
| `providers.buildings.pickFields` | Attributs MVT remontés par le pick de bâtiment (`buildingMenu`). **Vide par défaut** : la donnée en porte des dizaines par emprise, et les transporter toutes coûterait, par tuile, plus que toute la géométrie. L'hôte demande ce qu'il affiche. | `[]` |
| `providers.tiles3d.cesiumIonAssetId` | Asset Cesium Ion servi par défaut (Google Photorealistic 3D Tiles). ⚠️ L'identifiant était écrit dans le moteur et répété dans DEUX blocs de documentation : trois copies d'une valeur qui désigne un fournisseur, seule de son espèce à vivre hors de `providers`. | `'2275207'` |
| `providers.symbols.cacheMaxEntries` | Plafond du cache de vignettes rendues. ⚠️ Non borné jusqu'ici. | `200` |

## `interaction` — Seuils de geste, tolérances de pointeur, raccourcis

| Clé | Description | Défaut |
|---|---|---|
| `interaction.shapeHitTolerancePx` | Tolérance de clic autour du trait d'une forme dessinée. | `14` |
| `interaction.linkHitTolerancePx` | Tolérance de clic autour du trait d'un lien de relation. | `12` |
| `interaction.closeSnapPx` | Aimant de fermeture d'un polygone (dessin et marquee). | `16` |
| `interaction.clickSlopPx` | Déplacement au-delà duquel un clic devient un glissé (sélection). | `4` |
| `interaction.dragSlopPx` | Idem pour la saisie d'un marker vers une zone de dépôt. | `8` |
| `interaction.repositionSlopPx` | Idem pour le repositionnement d'un objet sur la carte. | `4` |
| `interaction.cleanClickPx` | Déplacement toléré avant qu'un clic carte ne compte plus comme un clic. | `6` |
| `interaction.lassoMinStepPx` | Décimation du tracé au lasso. | `3` |
| `interaction.duplicateOffsetPx` | Décalage bas-droite appliqué aux clones d'une duplication. | `12` |
| `interaction.longPressMs` | Appui maintenu avant d'armer une saisie (tactile). | `150` |
| `interaction.minScale` | Facteur d'échelle plancher d'une transformation (anti-écrasement). | `0.02` |
| `interaction.damping` | Inertie des contrôles de navigation. | `true` |
| `interaction.lens.minDragPx` | Glissé minimal pour créer une zone de loupe. | `4` |
| `interaction.lens.minSizePx` | Côté minimal d'une zone au redimensionnement. | `28` |
| `interaction.history.coalesceMs` | Fenêtre pendant laquelle une rafale d'actions ne fait qu'une entrée d'undo. | `800` |
| `interaction.history.depth` | Profondeur de la pile d'annulation. | `50` |
| `interaction.menu.hoverIntentMs` | Survol maintenu avant ouverture d'un sous-menu. | `150` |
| `interaction.menu.submenuCloseMs` | Délai de grâce avant fermeture d'un sous-panneau quitté. | `140` |
| `interaction.buildingPick.cursor` | Curseur du canvas pendant que l'outil « sélectionner un bâtiment » est actif. Curseur **système** — la convention du projet exclut les images de curseur. Posé en style inline sur le canvas, qui l'emporte sur le `grab` de la feuille injectée. | `'crosshair'` |
| `interaction.hubHitTolerancePx` | Tolérance de clic autour du socle d'une relation (le trait, lui, a la sienne). | `12` |
| `interaction.repositionHitPx` | Cible cliquable du point au sol d'un marker repositionnable. Le point mesure 7 px : sans élargissement, l'attraper relève de l'adresse. La valeur vivait dans la feuille de styles (`::before`), donc hors de ce bloc alors qu'elle en est exactement — une tolérance de pointeur qu'un support tactile… | `22` |
| `interaction.clickSuppressMs` | Filet temporel après un geste : durée pendant laquelle le `click` synthétique qui suit est avalé. Couplé à `longPressMs` — un contexte tactile qui allonge l'un doit pouvoir allonger l'autre. | `400` |
| `interaction.freehandMinStepPx` | Décimation du tracé main levée (plancher, en px). Pendant de `lassoMinStepPx`. | `2` |
| `interaction.targetZoom` | Zoom du vol « Cibler » depuis un inventaire ou une liste. | `17` |
| `interaction.pinnedFlyZoom` | Zoom du vol au clic sur un favori du dock. | `16` |
| `interaction.drawToolbarMinZoom` | Zoom sous lequel la barre de dessin se replie — dessiner suppose la vue proche. | `11` |
| `interaction.barMinScale` | Plancher de compactage d'une barre avant qu'elle ne passe en colonnes. | `0.85` |
| `interaction.tooltip.flipBelowPx` | Sous cette hauteur de fenêtre, l'infobulle bascule au-dessous du pointeur. | `76` |
| `interaction.tooltip.clampMarginPx` | Demi-largeur estimée, pour le clamp horizontal aux bords. | `78` |
| `interaction.tooltip.offsetBelowPx` | Décalage vertical quand elle s'ouvre vers le bas. | `18` |
| `interaction.tooltip.offsetAbovePx` | Idem vers le haut. | `14` |
| `interaction.spiderfy.pairRadiusRatio` | Rayon d'une PAIRE, en fraction du rayon de pastille (décollement minimal). | `0.1` |
| `interaction.spiderfy.minRingRatio` | Rayon plancher de la couronne, en multiples du rayon de pastille. | `1.15` |
| `interaction.spiderfy.gapPx` | Espacement entre deux pastilles sur la couronne. | `8` |
| `interaction.spiderfy.zoomEpsilon` | Hystérésis de zoom du déclenchement automatique. | `0.05` |
| `interaction.clusterOpenZoom.expansion` | Marge ajoutée au zoom d'éclatement du cluster (séparation nette). | `0.3` |
| `interaction.clusterOpenZoom.max` | Marge ajoutée quand le zoom d'éclatement dépasse déjà `clustering.maxZoom`. | `0.5` |
| `interaction.symbols.sizePx` | Taille écran (px) d'un symbole posé. | `40` |
| `interaction.symbols.previewSizePx` | Taille des vignettes de la grille de la palette. | `34` |
| `interaction.shortcuts.controls.north` | Réoriente au nord et remet la vue du dessus. | `'n'` |
| `interaction.shortcuts.controls.zoomIn` | Zoom avant d'un cran. | `'+'` |
| `interaction.shortcuts.controls.zoomOut` | Zoom arrière d'un cran. | `'-'` |
| `interaction.shortcuts.controls.tilt` | Bascule l'inclinaison de la caméra. | `'i'` |
| `interaction.shortcuts.controls.topDown` | Vue du dessus (le raccourci `north` la fait déjà). | `false` |
| `interaction.shortcuts.controls.globe` | Recul en vue globe. | `'g'` |
| `interaction.shortcuts.controls.layers` | Ouvre le panneau « Couches » (filtre par tag). | `'t'` |
| `interaction.shortcuts.controls.fullscreen` | Plein écran. | `'f'` |
| `interaction.shortcuts.controls.basemap` | Bascule 3D photoréaliste ↔ plan 2D. | `'b'` |
| `interaction.shortcuts.controls.traffic` | Calque trafic — le bouton n'existe qu'en mode plan. | `false` |
| `interaction.shortcuts.navigate.forward` | Avancer — maintenu. Plusieurs touches : les flèches, universelles, et une famille de lettres qui dépend de la disposition du clavier. | `['arrowup', 'z']` |
| `interaction.shortcuts.navigate.backward` | Reculer. | `['arrowdown', 's']` |
| `interaction.shortcuts.navigate.left` | Dériver à gauche. | `['arrowleft', 'q']` |
| `interaction.shortcuts.navigate.right` | Dériver à droite. | `['arrowright', 'd']` |
| `interaction.shortcuts.navigate.boost` | Modificateur d'accélération, maintenu. | `['shift']` |
| `interaction.shortcuts.draw.select` | Outil sélection. | `'v'` |
| `interaction.shortcuts.draw.selectRect` | Sélection au rectangle. | `'1'` |
| `interaction.shortcuts.draw.selectPoly` | Sélection au polygone. | `'2'` |
| `interaction.shortcuts.draw.selectBuilding` | Sélection d'un **bâtiment** du volume interne — une ligne du même sélecteur, mais pas un mode de sélection de dessin : elle arme un outil du moteur, et quitte le dessin. | `'4'` |
| `interaction.shortcuts.draw.selectLasso` | Sélection au lasso. | `'3'` |
| `interaction.shortcuts.draw.line` | Ligne. | `'l'` |
| `interaction.shortcuts.draw.polygon` | Polygone. | `'p'` |
| `interaction.shortcuts.draw.rect` | Rectangle. | `'r'` |
| `interaction.shortcuts.draw.circle` | Cercle. | `'c'` |
| `interaction.shortcuts.draw.freehand` | Tracé main levée. ⚠️ Était `'d'`, désormais pris par le déplacement au clavier (ZQSD). | `'h'` |
| `interaction.shortcuts.draw.arrow` | Flèche. | `'a'` |
| `interaction.shortcuts.draw.measure` | Règle de mesure. | `'m'` |
| `interaction.shortcuts.draw.erase` | Gomme. | `'e'` |
| `interaction.shortcuts.draw.symbol` | Palette de symboles tactiques. | `'y'` |
| `interaction.shortcuts.edit.undo.key` | Annuler. | `'z'` |
| `interaction.shortcuts.edit.undo.mod` | Annuler. | `'mod'` |
| `interaction.shortcuts.edit.redo.key` | Rétablir. | `'z'` |
| `interaction.shortcuts.edit.redo.mod` | Rétablir. | `'mod'` |
| `interaction.shortcuts.edit.redo.shift` | Rétablir. | `true` |
| `interaction.shortcuts.edit.redoAlt.key` | Variante Windows (`Ctrl+Y`) — historiquement en plus de `Ctrl+Maj+Z`. | `'y'` |
| `interaction.shortcuts.edit.redoAlt.mod` | Variante Windows (`Ctrl+Y`) — historiquement en plus de `Ctrl+Maj+Z`. | `'ctrl'` |
| `interaction.shortcuts.edit.selectAll.key` | Tout sélectionner — n'agit que si un outil de la carte est actif. | `'a'` |
| `interaction.shortcuts.edit.selectAll.mod` | Tout sélectionner — n'agit que si un outil de la carte est actif. | `'mod'` |
| `interaction.shortcuts.edit.duplicate.key` | Dupliquer la sélection. | `'d'` |
| `interaction.shortcuts.edit.duplicate.mod` | Dupliquer la sélection. | `'mod'` |
| `interaction.shortcuts.edit.delete` | Suppression de la sélection ; les deux touches usuelles par défaut. | `["Delete", "Backspace"]` |
| `interaction.shortcuts.edit.closePolygon` | Fermeture du polygone en cours. | `'Enter'` |
| `interaction.shortcuts.edit.nudgePx` | Déplacement au clavier de la sélection, en pixels écran. | `1` |
| `interaction.shortcuts.edit.nudgeFastPx` | Idem avec Maj — le pas « rapide ». | `10` |
| `interaction.shortcuts.lens.toggle` | Bascule de l'outil loupe. | `'x'` |

## `performance` — Budgets de calcul et d'échantillonnage

| Clé | Description | Défaut |
|---|---|---|
| `performance.pixelRatio` | Device pixel ratio du rendu. `1` force un rendu non-retina : deux fois moins de pixels à remplir, un globe plus doux sur écran haute densité. | `1` |
| `performance.antialias` | Anticrénelage du contexte WebGL. Arbitrage qualité/charge GPU du même ordre que `pixelRatio`, qui lui était exposé — celui-ci ne l'était pas. ⚠️ Lu à la **création** du contexte : le changer à chaud n'a pas d'effet. | `true` |
| `performance.boundsPickGrid` | Côté de la grille de raycasts qui déduit les bounds visibles (`n²` par frame). | `5` |
| `performance.boundsMargin` | Élargissement de la bbox émise par `onViewportChange`. **Pilote directement le volume de données que l'application charge.** | `0.15` |
| `performance.viewportSettleFrames` | Frames d'immobilité avant d'émettre l'événement `viewport`. | `4` |
| `performance.markerRecomputeMs` | Intervalle minimal entre deux recalculs de clusters pendant un pan. | `90` |
| `performance.cameraMoveEpsilon.deg` | Écart de latitude/longitude (degrés) au-delà duquel la caméra a bougé. | `1e-06` |
| `performance.cameraMoveEpsilon.altitudeRatio` | Écart d'altitude, en fraction de l'altitude courante. | `0.001` |
| `performance.cameraMoveEpsilon.altitudeMinMeters` | Plancher absolu du précédent (m) — près du sol, un ratio seul ne déclenche jamais. | `1` |
| `performance.groundSample.ttlMs` | Durée de validité d'un échantillon mémoïsé. | `2000` |
| `performance.groundSample.cellDeg` | Quantification spatiale du cache (degrés) — `1e-4` ≈ 11 m. | `0.0001` |
| `performance.groundSample.rayOriginMeters` | Altitude d'où part le rayon descendant. | `12000` |
| `performance.groundSample.rayFarMeters` | Portée du rayon. Doit rester cohérente avec `rayOriginMeters`. | `40000` |
| `performance.groundSample.radiusMeters` | Rayon de la couronne d'échantillons « niveau de la rue » (min local sous le toit). | `18` |
| `performance.groundSample.samples` | Nombre de tirs sur cette couronne. | `8` |
| `performance.markerCullMarginPx` | Marge (px écran) au-delà du cadre au-delà de laquelle un marker est masqué (`display:none`) : le navigateur cesse d'en calculer style, layout et composition. `0` désactive le cull. | `200` |
| `performance.resettle.batch` | Éléments re-échantillonnés par passe (budget de raycasts). | `4` |
| `performance.resettle.retryFrames` | Cadence de retentative des ancres non résolues (zone non chargée). | `30` |
| `performance.resettle.mppBand` | Hystérésis de résolution avant reconstruction d'épaisseur (1.25 = ±25 %). | `1.25` |
| `performance.resettle.windowFrames` | Longueur de la fenêtre ouverte par un mouvement caméra (frames). | `90` |
| `performance.resettle.spawnWindowFrames` | Longueur de la fenêtre ouverte à la création d'un objet (frames). Plus longue que la précédente : les tuiles sous un objet qui vient d'apparaître n'ont souvent pas fini de se raffiner. | `150` |
| `performance.resettle.everyNFrames` | Une passe traite un lot toutes les N frames — amortit le coût des raycasts. | `3` |
| `performance.relations.maxSteps` | Plafond de subdivision d'un arc drapé. | `256` |
| `performance.relations.stepMeters` | Pas d'échantillonnage d'un arc drapé. | `200` |
| `performance.relations.fanMaxLegs` | Au-delà de N liens, l'éventail se replie en trait agrégé (seuil de lisibilité). | `5` |
| `performance.relations.zoomBand` | Bande d'hystérésis de zoom avant recalcul du regroupement visuel. | `0.3` |
| `performance.circleSegments` | Densité de polygonisation d'un cercle — rendu **et** prédicats géométriques. | `64` |
| `performance.groundHeightRange` | Intervalle d'altitude accepté pour un échantillon de surface. Hors de ces bornes, l'échantillon est jugé aberrant et ignoré. À élargir pour un tileset non terrestre (maquette, intérieur, aérien). | `[-500, 9000]` |

## `style` — Empilement des surfaces

| Clé | Description | Défaut |
|---|---|---|
| `style.zIndex.relationBar` | Barre d'état d'une relation, posée sur la carte. | `6` |
| `style.zIndex.editOverlay` | Overlay SVG de sélection (poignées de transformation). | `15` |
| `style.zIndex.floatingHud` | HUD flottant (sélection, loupe). | `20` |
| `style.zIndex.markerSelected` | Marker sélectionné — au-dessus de ses voisins, sous les surfaces d'UI. | `80` |
| `style.zIndex.tooltip` | Infobulles (marker et barres). | `90` |
| `style.zIndex.listMenu` | Menu d'actions d'une ligne de liste. | `96` |
| `style.zIndex.dock` | Dock des favoris — volontairement SOUS les barres. | `998` |
| `style.zIndex.ui` | Barres, panneaux, boîte de recherche : le plan des surfaces d'UI. | `999` |
| `style.zIndex.menu` | Menus contextuels et ghosts de glisser-déposer : au sommet. | `9999` |

## `camera` — Limites de navigation et pas des commandes

| Clé | Description | Défaut |
|---|---|---|
| `camera.minZoom` | Zoom minimal atteignable (dézoom maximal). Borne le même éloignement que `maxDistanceFactor`, en zoom plutôt qu'en rayons terrestres : le plus contraignant des deux gagne. | `2` |
| `camera.maxZoom` | Zoom maximal atteignable **en mode plan** — le plancher de descente. Une carte plate se lit d'autant mieux qu'on s'en approche. | `21` |
| `camera.maxZoom3d` | Zoom maximal **en 3D**, pendant de `maxZoom` comme `maxTilt3d` l'est de `maxTilt2d`. Sous la hauteur du bâti, la caméra se retrouve DANS la rue : un mur occupe l'écran. Hauteur au-dessus du sol = `40 075 016 / 2^zoom` — ~153 m à 18, ~76 m à 19, ~19 m à 21. | `18` |
| `camera.maxTilt` | Inclinaison maximale générale (rad depuis le nadir). | `1.05` |
| `camera.zoomStep` | Pas de zoom d'un cran de molette. | `0.5` |
| `camera.dragSpeed.min` | Vitesse de déplacement au ras du sol. | `0.002` |
| `camera.dragSpeed.max` | Vitesse de déplacement en vue globe. | `0.35` |
| `camera.fov` | Champ de vision vertical (degrés). Lu à la construction du moteur seulement. | `60` |
| `camera.maxTilt3d` | Inclinaison max en 3D (rad depuis le nadir) — au-delà, la vue bascule. | `1.382300767579509` |
| `camera.maxTilt2d` | Inclinaison max en 2D : plus basse, pour borner la couverture de tuiles. | `0.6283185307179586` |
| `camera.tiltStep` | Pas d'inclinaison par clic du bouton dédié (rad). | `0.34557519189487723` |
| `camera.zoomFactor.in` | Facteurs d'altitude par cran de zoom (bouton +/−). | `0.5` |
| `camera.zoomFactor.out` | Facteurs d'altitude par cran de zoom (bouton +/−). | `2` |
| `camera.maxDistanceFactor` | Distance max caméra↔centre Terre, en rayons terrestres (limite de dézoom). | `2.5` |
| `camera.maxAltitudeFactor` | Altitude max des vols, en rayons terrestres. | `1.5` |
| `camera.minGroundClearance` | Garde-fou : hauteur minimale (m) au-dessus du sol RÉEL, tuiles et bâtiments compris. S'applique aux vols programmés **et** à la molette. | `20` |
| `camera.keyPan.speed` | Déplacement au clavier : hauteurs-sol parcourues par seconde. Une FRACTION de la hauteur, pas une vitesse absolue — la carte défile alors à la même allure à l'écran à toute altitude. `0.8` ≈ un écran par seconde au nadir. | `0.8` |
| `camera.keyPan.boost` | Multiplicateur tant que le modificateur d'accélération est maintenu. | `3` |
| `camera.followAltitude.min` | Bornes d'altitude (m) du mode suivi. | `200` |
| `camera.followAltitude.max` | Bornes d'altitude (m) du mode suivi. | `2000000` |
| `camera.fitBounds.margin` | Défauts de cadrage (`fitBounds`) — surchargeables appel par appel. | `1.35` |
| `camera.fitBounds.minAltitude` | Défauts de cadrage (`fitBounds`) — surchargeables appel par appel. | `350` |
| `camera.fitBounds.maxAltitude` | Défauts de cadrage (`fitBounds`) — surchargeables appel par appel. | `6000000` |

## `clustering` — Algorithme de regroupement des markers

| Clé | Description | Défaut |
|---|---|---|
| `clustering.radius` | Rayon de regroupement, en pixels écran. | `60` |
| `clustering.minPoints` | En deçà, les points restent individuels. | `2` |
| `clustering.maxZoom` | Zoom au-delà duquel le regroupement géographique s'arrête. | `18` |
| `clustering.levelQuantization` | Quantification du zoom pour la stabilité des paliers de cluster. | `1` |
| `clustering.spiderfyZoom` | Zoom à partir duquel un cluster inséparable (points confondus) éclate en éventail au clic — le zoom max UTILE de la caméra, au-delà duquel elle entre dans le bâti 3D. `19` ≈ 76 m d'altitude. | `19` |

## `markers` — Seuils de lisibilité

| Clé | Description | Défaut |
|---|---|---|
| `markers.staticMinZoom` | Zoom en dessous duquel les markers `static` (symboles posés, défibrillateurs) disparaissent de la carte. `0` désactive le masquage. Ils restent dans la RECHERCHE et la loupe : ce seuil dit ce qui est lisible, pas ce que l'utilisateur a choisi de masquer — c'est le rôle du filtre de tags. C'est le seuil PAR DÉFAUT : un marker qui déclare `static: { minZoom }` impose le sien. | `13` |

## `data` — Cadence de chargement, stockage, recherche

| Clé | Description | Défaut |
|---|---|---|
| `data.viewportDebounceMs` | Anti-rebond entre l'arrêt de la caméra et la demande de données. | `500` |
| `data.positionSaveDebounceMs` | Anti-rebond de la sauvegarde de la position caméra (`positionStorageKey`). | `400` |
| `data.storageKeys.tagFilter` | Sélection du filtre « Couches ». | `'m3d:tag-filter'` |
| `data.storageKeys.drawSettings` | Réglages de style par outil de dessin. | `'m3d:draw-settings'` |
| `data.storageKeys.searchHistory` | Historique de la boîte de recherche. | `'m3d:search-history'` |
| `data.storageKeys.plugins` | État des plugins (activation + config), cf. [PLUGINS.md § 8](PLUGINS.md#8-le-hub-et-la-config-utilisateur). | `'m3d:plugins'` |
| `data.search.minQuery` | Longueur minimale de saisie avant d'interroger les fournisseurs. | `2` |
| `data.search.debounceMs` | Anti-rebond de la frappe. 💰 Le levier le plus direct sur le nombre d'appels. | `250` |
| `data.search.limitPerGroup` | Résultats affichés par rubrique. | `6` |
| `data.search.historySize` | Entrées conservées dans l'historique. | `8` |
| `data.search.flyAltitude` | Altitude (m) du vol vers un résultat sans emprise connue. | `2500` |
| `data.search.fitPadding` | Respiration (px) du cadrage d'un résultat qui a une emprise. | `60` |
| `data.search.resolveLimit` | Plafond de re-résolution d'une entrée d'historique avant le vol. | `20` |

## `startup` — Intro et disponibilité

| Clé | Description | Défaut |
|---|---|---|
| `startup.introDuration` | Durée du vol d'introduction (globe → position initiale), en secondes. | `3` |
| `startup.introMaxWaitMs` | Attente maximale des tuiles avant de lancer l'intro malgré tout. | `8000` |
| `startup.readyMaxWaitMs` | Attente maximale avant d'émettre `ready` de force. | `8000` |
| `startup.introFadeMs` | Fondu de l'overlay à la fin de l'intro. Pendant de `introDuration`, qui était exposé alors que son fondu de sortie vivait dans la feuille de styles. | `500` |
| `startup.introAltitudeFactor` | Altitude de départ de l'intro, en rayons terrestres (vue globe). | `1` |
| `startup.fallbackSize` | Taille de repli (px) quand le conteneur n'est pas encore mesuré au montage — conteneur masqué, hydratation SSR, layout différé. ⚠️ Ce n'est pas cosmétique : ce couple fixe le premier `aspect` de la caméra, donc la première projection, avant que le `ResizeObserver` ne rende la main. Il était… | `[800, 600]` |

## `sky` — Ciel atmosphérique procédural

Ciel calculé (modèle de Preetham + nuages), **révélé en fondu quand on descend vers le sol en 3D**. En vue globe (haute altitude) il est invisible : seuls les étoiles et le fond d'espace restent — la vue depuis l'espace n'est jamais altérée. Le soleil est le vrai point subsolaire calculé pour `sky.date`, et le lieu vient du centre visé : voyager d'un continent à l'autre change le jour et la nuit. Aucune couleur ici — le ciel est calculé physiquement à partir de ces paramètres.

| Clé | Description | Défaut |
|---|---|---|
| `sky.enabled` | Active le ciel. `false` = étoiles + fond de couleur seuls (comportement d'avant). | `true` |
| `sky.turbidity` | Voile atmosphérique : `1` = ciel limpide, `~10` = brumeux/laiteux. | `2` |
| `sky.rayleigh` | Diffusion de Rayleigh — intensité du bleu du ciel. | `1.2` |
| `sky.mieCoefficient` | Diffusion de Mie — force du halo autour du soleil. | `0.005` |
| `sky.mieDirectionalG` | Directionnalité de Mie (0..1) — concentration du halo solaire. | `0.8` |
| `sky.clouds.coverage` | Couverture nuageuse : `0` = ciel dégagé, `1` = couvert. | `0.35` |
| `sky.clouds.density` | Opacité des nuages (0..1). | `0.4` |
| `sky.clouds.scale` | Échelle du motif de nuages (plus petit = nuages plus grands). | `0.0002` |
| `sky.clouds.elevation` | Élévation apparente de la couche (0..1). | `0.5` |
| `sky.fade.start` | Altitude caméra (m) au-dessus de laquelle le ciel est invisible (vue globe intacte). | `500000` |
| `sky.fade.end` | Altitude caméra (m) en dessous de laquelle le ciel est plein. `start` doit être > `end`. | `90000` |
| `sky.date` | Instant (ms epoch, comme `Date.now()`) qui fixe la position du soleil. `0` = l'heure de montage de la carte, figée. Une valeur > 0 fige un instant précis (déterministe). | `0` |

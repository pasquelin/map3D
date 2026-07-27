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
| `providers.tiles.language` | Langue des libellés gravés dans les tuiles. `'auto'` suit le navigateur. ⚠️ Codé en dur sur `'fr-FR'` jusqu'ici : la carte affichait des noms français quelle que soit la locale de l'application. | `'auto'` |
| `providers.tiles.region` | Biais régional (tracé des frontières contestées, toponymie). `'auto'` laisse le fournisseur déduire. ⚠️ Codé en dur sur `'FR'` jusqu'ici. | `'auto'` |
| `providers.tiles.mapType` | Fond de carte 2D demandé au fournisseur. | `'roadmap'` |
| `providers.tiles.layerTypes` | Calques additionnels demandés à la session de tuiles. | `["layerTraffic"]` |
| `providers.tiles.sessionUrl` | Endpoint de création de session de tuiles. | `'https://tile.googleapis.com/v1/createSession'` |
| `providers.tiles.tileUrl` | Gabarit d'URL de tuile — `{z}`, `{x}`, `{y}` et `{session}` sont substitués. | `'https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}'` |
| `providers.tiles.backoffAuthMs` | Attente après un refus d'identité (clé invalide, quota) avant de réessayer. | `300000` |
| `providers.tiles.backoffTransientMs` | Attente après une panne transitoire (5xx, réseau). | `10000` |
| `providers.tiles.maxTiles` | Plafond du cache de textures (mémoire GPU). | `500` |
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
| `interaction.shortcuts.draw.select` | Outil sélection. | `'v'` |
| `interaction.shortcuts.draw.selectRect` | Sélection au rectangle. | `'1'` |
| `interaction.shortcuts.draw.selectPoly` | Sélection au polygone. | `'2'` |
| `interaction.shortcuts.draw.selectLasso` | Sélection au lasso. | `'3'` |
| `interaction.shortcuts.draw.line` | Ligne. | `'l'` |
| `interaction.shortcuts.draw.polygon` | Polygone. | `'p'` |
| `interaction.shortcuts.draw.rect` | Rectangle. | `'r'` |
| `interaction.shortcuts.draw.circle` | Cercle. | `'c'` |
| `interaction.shortcuts.draw.freehand` | Tracé main levée. | `'d'` |
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
| `camera.minZoom` | Zoom minimal atteignable (dézoom maximal). | `2` |
| `camera.maxZoom` | Zoom maximal atteignable — au-delà la caméra entre dans le bâti 3D. | `21` |
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
| `camera.minGroundClearance` | Garde-fou : hauteur minimale (m) au-dessus du sol RÉEL, tuiles comprises. | `20` |
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

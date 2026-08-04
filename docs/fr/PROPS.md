# Props des composants — référence

**Français** · [English](../en/PROPS.md) · [↑ Index](README.md)

Ce que chaque composant accepte, ce que ça fait, et son défaut.

Un défaut noté `config.x` ou `theme.x` signifie que la prop **surcharge** ce
réglage pour cette instance : ne rien passer suit la carte, passer une valeur
prend la main localement.

Généré depuis les types et les défauts réels des composants.

💰 = impact facturation Google

## `<Map>`

Racine — monte le moteur et toutes les surfaces.

| Prop | Description | Défaut |
|---|---|---|
| `center` **(requis)** | Position initiale. Une position mémorisée (`positionStorageKey`) la remplace. | — |
| `zoom` **(requis)** | Zoom initial (échelle Web Mercator : 0 = monde, ~21 = niveau rue). | — |
| `googleMapsApiKey` | Clé Google Maps Platform → Photorealistic 3D Tiles en direct (prioritaire sur Ion). | — |
| `cesiumIonToken` | Token Cesium Ion → Google Photorealistic 3D Tiles via Cesium. | — |
| `cesiumIonAssetId` | Asset Cesium Ion (défaut 2275207 = Google Photorealistic 3D Tiles). | — |
| `mapMode` | Type de carte au démarrage. Défaut : `'plan'` dès qu'un fond 2D est servable — clé Google **ou** `providers.internal.origin` d'un serveur interne (cf. [TILES.md](TILES.md)) — sinon `'3d'`. `'3d'` explicite pour démarrer sur le volume. Lu à la **construction** : la bascule ensuite passe par le bouton de la barre ou `MapHandle`. | — |
| `fallbackGlobe` | Globe ellipsoïde uni de repli quand aucune tuile n'est disponible (défaut: true). | — |
| `errorTarget` | Erreur d'écran cible (qualité/perf). | — |
| `intro` | Intro façon Google Earth : vue globe puis descente animée vers center/zoom (défaut: true). | — |
| `positionStorageKey` | Clé localStorage de la dernière position caméra (absent = pas de persistance). Une position mémorisée remplace `center`/`zoom` au montage et coupe l'intro. | — |
| `resetStoredPosition` | Efface la position mémorisée au montage → intro et `center`/`zoom` normaux (défaut: false). | — |
| `tagStorageKey` | Clé localStorage du filtre « Couches » (`null` = pas de persistance ; une clé distincte par carte si plusieurs `<Map>` cohabitent). Défaut : `m3d:tag-filter`. | — |
| `pluginStorageKey` | Clé localStorage de l'état des plugins (`null` = pas de persistance). Défaut : `config.data.storageKeys.plugins`. | — |
| `interactive` | Interactivité (défaut `true`). `'view'` fige la caméra en gardant markers et sélection vivants ; `false` rend la carte inerte. Dans les deux cas figés les outils (dessin, loupe) sont neutralisés. Overlays, markers, formes et tracés restent RENDUS — c'est… | `true` |
| `onReady` | La carte est **exploitable** : la projection résout des hauteurs, un `fitBounds` vise le sol réel. Appelé une seule fois, et immédiatement si la carte l'était déjà. Pour simplement récupérer le moteur, `useMap()` suffit — il est disponible dès le montage,… | — |
| `onViewportChange` | Cadre visible après stabilisation de la caméra — à brancher sur un refetch. | — |
| `onCameraChange` | Position caméra à chaque mouvement (haute fréquence : ne pas y faire de réseau). | — |
| `className` | Classe du conteneur racine, en plus de `m3d-root`. | — |
| `style` | Styles du conteneur racine. La carte remplit 100 % de son parent. | — |
| `ref` | Poignée impérative de la carte (cf. `MapHandle`) : de quoi cadrer, dessiner ou interroger **depuis l'extérieur**, sans écrire de composant enfant pour atteindre un hook. | — |
| `theme` | Thème : un thème unique, un couple `{ light, dark }`, ou rien (thème neutre). Déclaré ici, la carte monte sa propre racine de thème — pas de `<MapProvider>` à poser autour. | — |
| `colorScheme` | `'auto'` (défaut) suit `prefers-color-scheme` et se met à jour en direct. | — |
| `labels` | Traductions (merge profond sur `defaultLabels`) — cf. LABELS.md. | — |
| `config` | Réglages : fournisseurs tiers (endpoints, langue, quotas), seuils de geste, budgets de calcul, cadence de chargement. Merge profond sur `defaultConfig` — ne fournir que ce qui change. Cf. `MapConfig`. ```tsx <Map config={{ providers: { tiles: { language:… | — |
| `capture` | Injection hôte de la capture d'image (`CaptureProps`) : `rasterizeOverlay` (rasteriseur des overlays DOM markers/labels — ex. `html-to-image`, sinon capture 3D seule), `onCapture` (trace à chaque capture, pour un log / envoi API) et `onMail` (livraison de l'action « mail »). Sa présence **active** la ligne « Prendre une photo » du menu ⚙. Les défauts (format, qualité, échelle, fond) se règlent dans `config.capture`. | — |

### Poignée impérative — `MapHandle` (`ref`) et `useCapture()`

`ref` expose `MapHandle`. Au-delà de `camera` / `drawing` / `lens` / `relations` / `pedestrian`, la poignée porte **`capture(opts?): Promise<Blob>`** : rendu synchrone de la carte en image, overlays DOM composés si un `rasterizeOverlay` est fourni via `capture`, sinon 3D seule. `opts` (`CaptureOptions`) surcharge par appel les défauts de `config.capture` (`format`, `quality`, `scale`, `background`, plus `overlay` et `rasterizeOverlay`). Le cœur `engine.capture()` fait de même sans injection ; le hook **`useCapture()`** est le pendant pour un composant sous `<Map>`. À utiliser pour tracer une image en cas d'action (log, envoi vers une API).

### Surfaces de `<Map>`

En plus des props ci-dessus, `<Map>` accepte les surfaces déclaratives de
`MapSurfaces` : elles montent barre, contrôles, recherche, dock, dessin, relations,
couches et regroupement **dans le bon ordre d'imbrication**.

| Prop | Description | Défaut |
|---|---|---|
| `toolbar` | Barre d'outils de dessin, **loupe comprise** (`toolbar.lens`). `false` = pas de barre — et pas de loupe. | *(défauts)* |
| `controls` | Contrôles de navigation. `false` = aucun contrôle. | *(défauts)* |
| `search` | Recherche unifiée : `true` pour les défauts, un objet pour la régler. Absente = pas de boîte. | *(absent)* |
| `readout` | Bloc de lecture de la vue (altitude, coordonnées, zoom), sur une ligne : `true` pour les défauts — coin haut droit —, un objet pour le régler (`corner`, `fields`, `refreshMs`). Absent, il n'existe pas. Cf. [CAMERA.md](CAMERA.md). | *(absent)* |
| `dock` | Dock des favoris — sa présence l'active (et rend les markers saisissables). | *(absent)* |
| `templates` | Gestionnaire de templates : sauvegardes nommées du dessin. Le bouton vit DANS la barre de contrôles, sous « Couches » — il faut donc `controls` actif. `false`/absent le retire ; un objet le règle (provider API, catégories…). Agit sur le dessin via `engine.templates.drawPort` (posé par `draw`). Cf. [TEMPLATES.md](TEMPLATES.md). | *(absent)* |
| `draw` | Couche de dessin (+ `selectionBadges`). `false` retire le dessin ET la barre. | *(défauts)* |
| `relations` | Moteur de relations par tags (+ `statusBar`) — sa présence l'active. | *(absent)* |
| `layers` | Couches de données, dans l'ordre de rendu (`markersLayer`, `shapesLayer`, `pathsLayer`). | `[]` |
| `plugins` | Plugins à rendre disponibles ([PLUGINS.md](PLUGINS.md)). Registre alimenté au montage ; l'utilisateur active/config via le hub. | `[]` |
| `cluster` | Surface de regroupement de la carte (cf. `<ClusterSurface>`). `false` coupe le regroupement. | *(défauts)* |
| `markerMenu` | Menu d'un marker, **partagé** par la carte, la loupe et le panneau de sélection. | *(absent)* |
| `buildingMenu` | Menu d'un **bâtiment** du volume interne, ouvert au clic quand l'outil « Sélectionner un bâtiment » est actif. Reçoit un [`BuildingInfo`](BUILDINGS.md#4-buildinginfo). Sans cette prop, l'outil surligne au survol mais le clic n'ouvre rien. | *(absent)* |
| `children` | Vos composants montés dans la carte (`useMap()`, panneaux maison…). | *(absent)* |

## `<ClusterSurface>`

Regroupement **de la carte** — montée par `<Map cluster>`. Elle tient l'index unique
alimenté par toutes les couches (`engine.clusters`) et rend les pastilles ; chaque
couche continue de rendre ses propres markers.

| Prop | Description | Défaut |
|---|---|---|
| `enabled` | Coupe le regroupement pour toute la carte. | `true` |
| `size` | Diamètre (px) d'une pastille. | `theme.markers.size × 1.18` |
| `icon` | Icône **SVG** (markup) d'une pastille, à la place du camembert. | — |
| `typeIcon` | Icône d'un type (fragment SVG viewBox `0 0 24 24`, `currentColor`) dans sa part. | — |
| `typeLabel` | Nom lisible d'un type, pour l'infobulle d'une part. | — |
| `tooltip` | Infobulle d'une pastille — `(cluster, members, segmentType?)`. `segmentType` est renseigné quand le survol porte sur UNE part. `null` = pas d'infobulle. | — |

L'algorithme (rayon, seuils, éventail) se règle à part, dans `config.clustering`.

## `<MapProvider>`

Fournit thème, libellés et config à un sous-arbre.

| Prop | Description | Défaut |
|---|---|---|
| `theme` | Thème unique, couple { light, dark }, ou rien (thème neutre par défaut). | `defaultTheme` |
| `colorScheme` | 'auto' suit `prefers-color-scheme` (et se met à jour en direct). | `'auto'` |
| `labels` | Overrides de libellés (traduction) — merge profond sur `defaultLabels`, voir LABELS.md. | — |
| `config` | Overrides de réglages — merge profond sur `defaultConfig`, cf. `MapConfig`. | — |
| `children` **(requis)** | Sous-arbre qui reçoit thème, libellés et config. | — |

## `<MarkerLayer>`

Markers, clustering, sélection, drag.

| Prop | Description | Défaut |
|---|---|---|
| `points` | Markers à afficher. Exclusif avec `source`, qui les charge selon la vue. | — |
| `source` | Source viewport-driven (rechargée au déplacement, gate `minZoom`). | — |
| `getId` | Clé stable d'un marker (défaut `p.id`) : elle décide de l'identité, donc du tween. | `((p: MarkerData<T>) => p.id)` |
| `cluster` | `{ enabled: boolean }` — participation de CETTE couche au regroupement de la carte (défaut : elle participe). L'algorithme se règle dans `config.clustering`, l'apparence sur `<Map cluster>` : un cluster est une propriété de la carte, pas d'une couche. | `{ enabled: true }` |
| `icon` | Icône **SVG** (markup) d'un marker, rendue en `<img>` DOM ancrée à la carte. | — |
| `typeLabel` | Libellé lisible d'un type (`'agent'` → « Agents ») : **nom de rubrique dans la recherche** et sous-titre des lignes de liste. Un type se nomme ici, une fois. Le nom d'un type dans une **pastille** de cluster vient de `<Map cluster={{ typeLabel }}>` — une pastille peut agréger plusieurs couches. | — |
| `tooltip` | Infobulle au survol d'un marker : `title` et `content` acceptent tout ReactNode (texte, HTML, composants — avatar, badges…). `null` = pas d'infobulle pour ce marker. L'info vit AU SURVOL — le clic est réservé aux actions (menu contextuel, sélection).… | — |
| `menu` | Menu contextuel d'un marker (clic droit, et bouton « … » des listes). | — |
| `selectedId` | Marker sélectionné — **contrôlé** : la couche ne le change jamais d'elle-même. | — |
| `followId` | Marker suivi par la caméra ; elle reste centrée dessus tant qu'il est fourni. | — |
| `onSelect` | Sélection changée. La règle est uniforme : **tout clic qui ne sélectionne pas un marker rend `null`** — carte nue comme cluster. `selectedId` étant contrôlé, la couche ne peut pas le vider elle-même : elle signale, l'application décide. Sans traiter le cas… | — |
| `size` | Diamètre (px) du marker (défaut: `theme.markers.size`). | — |
| `selectionRing` | Diamètre (px) de l'anneau de multi-sélection (défaut: `size + 4`). À régler quand l'icône SVG occupe moins que sa boîte (ex. pastille à 58/80 du sprite) pour que l'anneau reste collé au visuel. | — |
| `draggable` | Rend les markers **saisissables au long-press** pour le drag-and-drop (ex. dépôt dans `<PinnedDock>`). `true` active tous les markers ; une fonction cible sélectivement. Le clic normal (sélection/menu) reste préservé ; le ghost accroché au curseur… | — |
| `repositionable` | Markers **repositionnables** : appui + déplacement les fait suivre la surface, le relâchement livre la nouvelle position à `onReposition`. Le cas normal est de laisser cette prop vide et de porter le drapeau sur la DONNÉE (`MarkerData.repositionable`) :… | — |
| `onReposition` | Nouvelle position au relâchement — à répercuter dans vos données. | — |
| `onRepositionMove` | Position suivie en continu pendant le geste (aperçu live, champ de formulaire). | — |
| `leaderLine` | Tige verticale + point au sol, le contenu étant soulevé au-dessus de la position (défaut `true`) : un badge d'alerte reste lisible sans masquer le point qu'il marque. À passer à `false` quand l'icône DOIT coïncider avec sa coordonnée — c'est le cas des… | — |
| `cullMargin` | Marge (px écran) au-delà du cadre au-delà de laquelle un marker est **masqué** (`display:none`) : le navigateur cesse d'en calculer le style, la mise en page et la composition. Défaut : 200 px. `0` désactive le cull. Un marker déjà affiché n'est pas… | — |
| `staticMinZoom` | Zoom en deçà duquel les markers `static` de CETTE couche disparaissent, à la place de `config.markers.staticMinZoom` — une couche de décor et une couche d'alertes n'ont pas le même horizon de lisibilité. Un marker qui déclare `static: { minZoom }`… | `config.markers.staticMinZoom` |

## `<DrawLayer>`

Outils de dessin et symboles.

| Prop | Description | Défaut |
|---|---|---|
| `tools` | Outils autorisés (défaut : tous). Filtre aussi ce que `setTool` accepte. | — |
| `shortcuts` | Raccourci par outil/action — `false` pour en désactiver un, autre touche pour remapper. | — |
| `defaults` | Style d'une forme nouvellement tracée, avant tout réglage utilisateur. | — |
| `presets` | Paliers proposés par les palettes de style (épaisseurs, opacités, rayons d'angle). Fusionnés sur les défauts : ne fournir que ce qu'on change. | — |
| `settingsStorage` | Persistance des réglages par outil : localStorage (défaut) ou aucune. | — |
| `settingsStorageKey` | Clé localStorage des réglages par outil. Défaut `m3d:draw-settings`. À distinguer dès que DEUX cartes cohabitent sur le même origin : sans clé propre, elles écrivent au même endroit et la dernière à changer un réglage l'impose à l'autre. Même précaution… | — |
| `value` | Collection **contrôlée** (GeoJSON) : fournie, elle fait autorité sur le dessin. | — |
| `onChange` | Collection entière après chaque mutation, coalescée à 1×/frame. | — |
| `onSelectionChange` | Notifiée à chaque changement de sélection : `(ids des formes, ids des markers à plat, ids des tracés)` — les tracés forment une **population distincte**, jamais mêlée aux markers. | — |
| `onShapeAdd` | Events **par forme** — pour une app qui fait du CRUD par identité (une mutation par zone). Émis au moment du changement, sans la coalescence de `onChange` qui sérialise toute la collection 1×/frame. Les deux peuvent cohabiter. | — |
| `onShapeUpdate` | Forme modifiée (déplacement, redimensionnement, style). | — |
| `onShapeDelete` | Forme supprimée. | — |
| `onErase` | La gomme a effacé des objets (`EraseResult` : `shapes` lib retirés + ids `paths`/`hostShapes` hôte à retirer de votre state). | — |
| `onShapeEdit` | Double-clic sur une forme : intention d'ouvrir une fiche — rien n'a changé. | — |
| `constraints` | Règles métier du dessin **utilisateur** : périmètres autorisés, aire maximale. Les mutations programmatiques n'y sont pas soumises. | — |
| `onReject` | Forme refusée — à brancher sur votre toast (la lib n'affiche rien d'elle-même). | — |
| `symbols` | Outil **Symboles** de la barre : actif par défaut avec le catalogue MIL-STD-2525D et son renderer (SDK chargé en import dynamique à la première ouverture de la palette). `enabled: false` retire l'outil ; `catalog`/`renderer` remplacent la symbologie… | — |
| `children` | Monté dans le contexte de dessin — y placer barre et panneaux. | — |

## `<RelationLayer>`

Liens routés entre markers. 💰

| Prop | Description | Défaut |
|---|---|---|
| `rules` **(requis)** | Règles de relation — c'est ici que l'application injecte son vocabulaire. | — |
| `provider` **(requis)** | Fournisseur de routage (Google Routes, ou un proxy serveur, ou un factice). Doit être STABLE d'un rendu à l'autre (`useMemo`) : il détermine l'identité du moteur, donc le passer construit en ligne (`provider={createX({…})}`) le recréerait à chaque rendu et… | — |
| `width` | Épaisseur du trait des liens, en pixels écran. | `8` |
| `defaultColor` | Dernier repli de couleur : sert aux relations dont NI la règle ni le marker source ne donnent de couleur (source hors registre, type absent du thème). Jaune, lisible sur satellite comme sur plan. L'ordre est `rule.color` → couleur du marker source → ce… | `'#ffd400'` |
| `linkDash` | Pointillé défilant des traits de RECHERCHE — l'équivalent 3D du marching-ants de la sélection. Longueurs et vitesse en pixels écran (`speed` = px/s vers la cible). `false` pour un trait plein. `gapOpacity` : ce qui subsiste entre deux tirets, en fraction… | `DEFAULT_DASH` |
| `routeColor` | Couleur de l'itinéraire réel : distincte des liens, c'est un autre objet. Violet façon navigation plutôt qu'un bleu — sur imagerie satellite un tracé bleu se confond avec les fleuves et les bassins qu'il longe. | `'#7c4dff'` |
| `hoverDarken` | Facteur d'assombrissement du trait survolé (< 1 = plus sombre). On assombrit la couleur de la famille plutôt que d'en imposer une autre : la teinte porte le sens (quelle famille de tags), le survol ne doit pas le brouiller. | `0.72` |
| `hubRadius` | Rayon du socle posé à plat sous le marker source, en pixels écran. C'est lui qui matérialise la relation et porte la croix qui l'efface : trop petit, la commande devient un jeu d'adresse. | `26` |
| `casingWidth` | Contour sombre sous le trait (lisibilité sur imagerie satellite). 0 pour l'ôter. | `3` |
| `casingColor` | Couleur du contour (défaut : celle des tracés du thème). | — |
| `minOpacity` | Opacité du lien le moins bien classé — plancher de lisibilité du dégradé de rang. | `1` |
| `staleMeters` | Dérive d'une extrémité au-delà de laquelle temps et itinéraires sont refaits. En dessous, le trait suit le marker mais les chiffres restent : un agent qui avance de 20 m ne justifie pas un appel de routage. 0 pour ne jamais relancer. | `routing.staleMeters` |
| `refreshIntervalMs` | Intervalle minimal entre deux recalculs d'une même relation. Combiné à `staleMeters`, il plafonne le débit d'appels : un véhicule rapide ne peut pas déclencher plus d'un appel par intervalle, quelle que soit sa vitesse. | `routing.refreshIntervalMs` |
| `menuPresets` | Paliers proposés par le menu d'une famille (« les 3 plus rapides », « dans 500 m »). Choix métier : la bonne échelle dépend de ce qu'on relie. | — |
| `fanMaxLegs` | Au-delà de ce nombre de liens, l'éventail se replie en un trait agrégé — au-delà il devient illisible. Défaut 5. | — |
| `fastestOversample` | 💰 Candidats interrogés par lien affiché en mode « les plus rapides » (défaut 3). Le plus proche à vol d'oiseau n'est pas le plus rapide — sens uniques, fleuve à contourner. On en interroge donc plusieurs et la DURÉE tranche. Chaque unité multiplie la… | `routing.fastestOversample` |
| `children` | Enfants montés dans le contexte de relations. La forme FONCTION reçoit l'API directement : greffer l'entrée de menu sur une couche marker déclarée au même niveau n'oblige alors pas à extraire un composant juste pour `useRelations()`. | — |

## `<LensLayer>`

Outil loupe (inventaire d'une zone).

| Prop | Description | Défaut |
|---|---|---|
| `getId` | Clé stable d'un marker (défaut : `m.id`). | `defaultGetId` |
| `renderItem` | Rendu d'une ligne (défaut : pastille de type + avatar + id). | — |
| `actions` | Actions du menu déroulant d'une ligne, en plus de « Cibler » (extensible). | — |
| `menu` | Menu d'une ligne, dans la MÊME forme que `<MarkerLayer menu>` — c'est ce qui rend le bouton « … » de l'inventaire identique au menu du marker sur la carte. Prime sur `actions`. Renseigné par `<Map markerMenu>` quand la loupe n'en fournit pas. | — |
| `markerTypeLabel` | Libellé lisible d'un type de marker (récap par type). | — |
| `shortcut` | Raccourci clavier d'activation (lettre unique, insensible à la casse). Défaut `x`. `null` = aucun. | — |
| `targetZoom` | Zoom du vol « Cibler » d'une ligne (défaut 17). | — |

## `<ShapeLayer>`

Zones géographiques.

| Prop | Description | Défaut |
|---|---|---|
| `shapes` **(requis)** | Zones à afficher (cercles, rectangles, polygones), drapées sur le relief. | — |

## `<PathLayer>`

Tracés.

| Prop | Description | Défaut |
|---|---|---|
| `paths` **(requis)** | Tracés à afficher, drapés sur le relief. | — |
| `animateHead` | Pulsation du point courant, en tête du tracé (défaut `true`). | `true` |

## `<SearchBox>`

Recherche unifiée carte + lieux. 💰

| Prop | Description | Défaut |
|---|---|---|
| `onSelect` | Notifié au choix d'un résultat (la caméra s'y rend déjà d'elle-même). | — |
| `search` | Géocodeur de la rubrique « Lieux ». Défaut : Google Places avec la clé de `<Map googleMapsApiKey>` ; `false` retire la rubrique. Ne concerne QUE les lieux : les rubriques carte (markers, zones, dessins, symboles) viennent des couches elles-mêmes via… | — |
| `placeholder` | Défaut : `labels.search.placeholder`. | — |
| `flyAltitude` | Altitude caméra (m) de repli quand le résultat n'a pas d'emprise. | `searchCfg.flyAltitude` |
| `historyStorageKey` | Clé localStorage de l'historique — `null` pour le désactiver. | `config.data.storageKeys.searchHistory` |
| `historySize` | Nombre max d'entrées d'historique. | `searchCfg.historySize` |
| `limitPerGroup` | Résultats affichés par rubrique (défaut 6) — l'en-tête annonce le total réel. | `searchCfg.limitPerGroup` |
| `scope` | Sélecteur de portée collé au champ (défaut `true`). `false` = toutes rubriques. | `true` |
| `groupOrder` | Ordre des rubriques CARTE (`['marker:agent', 'marker:alert']`) ; celles qui n'y figurent pas suivent par ordre alphabétique. « Lieux » est hors classement : il ouvre toujours la liste, chercher une ville étant le geste de cadrage le plus courant. | — |
| `minQuery` | Longueur minimale de la saisie avant d'interroger quoi que ce soit (défaut 2). À abaisser à 1 pour un jeu de données dont les libellés sont courts (codes, numéros de tournée) ; à relever pour épargner un fournisseur facturé à l'appel. | `searchCfg.minQuery` |
| `debounceMs` | Anti-rebond de la frappe, en ms (défaut 250). Chaque saisie déclenche un appel au fournisseur de lieux : le relever réduit directement la facture. | `searchCfg.debounceMs` |

## `<Toolbar>`

Barre d'outils de dessin.

| Prop | Description | Défaut |
|---|---|---|
| `position` | Côté d'ancrage de la barre. | `'left'` |
| `minZoom` | Zoom minimal d'affichage — dessiner n'a de sens qu'en vue rapprochée ; en deçà la barre glisse hors écran. | `config.toolbar.minZoom` |
| `tools` | Outils affichés, dans l'ordre (`'select'` inclus — défaut : tous). | `DEFAULT_DRAW_TOOLS` |
| `selectModes` | Modes proposés par le flyout de sélection (défaut : les 3) ; un seul = pas de flyout. | — |
| `eraseModes` | Modes proposés par le flyout de la gomme (défaut : ponctuelle + sélection) ; un seul = pas de flyout. | — |
| `measureTools` | Rangées proposées par le bouton « Mesures » — une seule (`measure`) existe aujourd'hui, donc le sous-menu ne s'ouvre pas : le bouton agit directement. La grille de coordonnées a rejoint les contrôles de vue (`<MapControls>`, `config.graticule`) ; le châssis du sous-menu reste en place pour une rangée future. | — |
| `components` | Masque (`false`) ou remplace (ReactNode) chaque section — défaut : tout affiché. | `{}` |
| `extraTools` | Outils **de l'application** rendus en items principaux de la barre, après les outils natifs (dessin, symboles, loupe) : ils prennent le langage visuel de la barre au lieu de flotter dans un coin de la carte. Ils pilotent leur propre état, la barre ne les… | — |

## `<MapControls>`

Barre de navigation.

| Prop | Description | Défaut |
|---|---|---|
| `position` | Côté d'ancrage de la barre. | `'right'` |
| `components` | Grain GROUPE : masquer (`false`) ou remplacer (ReactNode) un groupe entier de la barre. | `{}` |
| `buttons` | Grain BOUTON : `false` masque un bouton précis (ex. `{ rotate: false, zoomOut: false }`). Un groupe dont tous les boutons sont masqués disparaît, et le raccourci clavier d'un bouton masqué est désactivé avec lui. | `{}` |
| `shortcuts` | Raccourcis clavier par action — `false` pour en désactiver un, une autre touche pour le remapper si elle est déjà prise ailleurs dans l'app. Lettres SEULES (pas de ⌘/Ctrl : les navigateurs réservent ⌘T/⌘N/⌘W…), identiques Mac/PC, affichées dans les… | — |
| `tagLabel` | Libellé lisible d'un tag dans le panneau « Couches » (défaut : le tag brut). | — |
| `templates` | Gestionnaire de templates (bouton sous « Couches », même structure). `false`/absent le retire ; un objet le règle (provider API, catégories…). Fourni par `<Map templates>`. | — |
| `target` | Point de référence de l'écran (l'alerte consultée, l'événement en cours…) : fournir cette prop ajoute un bouton **« revenir à la cible »** à la barre ; l'omettre le retire. La carte n'a pas à savoir ce que la cible représente, seulement où elle est. | — |

## `<GraticuleLayer>`

Grille de coordonnées géographiques — cf. [GRATICULE.md](GRATICULE.md). **Montée automatiquement
par `<Map>`** : ne la montez pas vous-même (deux grilles se superposeraient). **Sans prop** :
elle se règle par `config.graticule`, se thème par `theme.colors.graticule`, et se bascule par
`useGraticule()`, le sous-menu « Mesures » ou le bouton `graticule` de `<MapControls>`.

Elle ne coûte rien tant que la grille est éteinte. Le composant reste exporté pour les cartes
construites sans `<Map>` (montage impératif complet).

## `<MeasureToolButton>`

Bouton « Mesures » de la barre + son sous-menu. Monté par `<Toolbar>` — ces exports ne servent
qu'à un montage manuel (barre maison).

| Prop | Description | Défaut |
|---|---|---|
| `position` | Côté d'ancrage, pour l'ouverture du sous-menu. | — |
| `tools` | Rangées affichées ; une seule = pas de sous-menu — l'état actuel, une seule rangée (`measure`) existant. | *(l'unique rangée existante)* |

## `<PinnedDock>`

Dock de favoris.

| Prop | Description | Défaut |
|---|---|---|
| `items` **(requis)** | Éléments épinglés (dérivés des ids stockés côté consommateur). | — |
| `onPin` **(requis)** | Un marker a été **déposé** dans la dock : le consommateur ajoute l'id à son stockage. | — |
| `onUnpin` **(requis)** | Un épinglé a été **retiré** (croix, ou glissé hors de la dock). | — |
| `onReorder` | Nouvel ordre après qu'un épinglé a été glissé À L'INTÉRIEUR de la dock. Reçoit la liste complète des ids dans l'ordre voulu — à répercuter dans votre stockage, la dock restant contrôlée. Absent : les pastilles ne se réordonnent pas. | — |
| `onPinClick` | Clic sur une pastille — émis **en plus** de l'action par défaut (flyTo). | — |
| `flyOnClick` | `flyTo` vers l'élément au clic (défaut `true`). `false` = seul `onPinClick` est émis. | — |
| `flyZoom` | Zoom cible du `flyTo` au clic (défaut 16). Ignoré si `flyAltitude` est fourni. | — |
| `flyAltitude` | Altitude cible du `flyTo` (m au-dessus de l'ellipsoïde) — prioritaire sur `flyZoom`. | — |
| `accept` | Charges recevables. Défaut : `payload.type === 'marker'`. | — |
| `renderPin` | Rendu custom d'une pastille (défaut : carré avatar/icône coloré par le type). | — |
| `tooltip` | Infobulle au survol d'une pastille (title/content ReactNode), affichée au-dessus — même langage que l'infobulle des markers. `null` = pas d'infobulle. | — |
| `zoneId` | Id de la zone de dépôt (distinct si plusieurs docks cohabitent). Défaut `m3d-pinned`. | `'m3d-pinned'` |
| `size` | Côté (px) des carrés. Défaut 64. | `64` |
| `defaultCollapsed` | Dock repliée au montage (l'utilisateur la redéploie d'un clic). Défaut `false`. | — |

## `<MarkerList>`

Liste de markers réutilisable.

| Prop | Description | Défaut |
|---|---|---|
| `markers` **(requis)** | Markers listés, dans l'ordre fourni. | — |
| `getId` **(requis)** | Clé stable d'une ligne. Requise ici — la liste ne suppose rien de la forme des données. | — |
| `renderItem` | Rendu du **titre** (1ʳᵉ ligne) — défaut : `MarkerData.title`, sinon l'id. | — |
| `renderSubtitle` | Rendu du **sous-titre** (2ᵉ ligne, plus petit) — défaut : le type via `markerTypeLabel`. | — |
| `markerTypeLabel` | Libellé lisible d'un type (sous-titre par défaut). | — |
| `onRemove` | Croix de retrait par ligne (masquée si absent) : désélectionne / retire. | — |
| `onTarget` | Clic sur la ligne / action « Cibler ». Défaut : vol caméra vers le marker. | — |
| `targetZoom` | Zoom du vol « cibler » (défaut 17). | — |
| `actions` | Actions du menu déroulant, en plus de « Cibler ». | — |
| `menu` | Menu d'une ligne, dans la MÊME forme que `<MarkerLayer menu>` : c'est ce qui permet au bouton « … » d'une ligne d'offrir exactement le menu du marker sur la carte, sous-menus et séparateurs compris. Fourni, il l'emporte sur `actions`. « Cibler » reste… | — |

## `<TemplatesPanel>`

Bouton de barre + panneau du gestionnaire de templates (sauvegardes de dessin). Accepte
en plus toutes les options de [`useTemplates`](HOOKS.md) ci-dessous. Détail dans
[TEMPLATES.md](TEMPLATES.md).

| Prop | Description | Défaut |
|---|---|---|
| `provider` | Backend des templates. Absent = cache localStorage seul. Présent = il fait autorité (sa liste écrase la vue au montage, les mutations passent par lui). | — |
| `categories` | Catégories offertes à la sauvegarde. | `config.providers.templates.categories` |
| `defaultCategories` | Catégories cochées par défaut dans le formulaire « Sauver ». | `config.providers.templates.defaultCategories` |
| `defaultApply` | Mode d'application par défaut au clic (`'merge'` \| `'replace'`). | `config.providers.templates.defaultApply` |
| `allowExport` | Autorise l'export/import de fichiers `.m3dt`. | `config.providers.templates.allowExport` |
| `saveView` | Offre la case « Vue » à la sauvegarde (mémorise pose caméra, fond de carte, couches, piéton). | `config.providers.templates.saveView` |
| `defaultSaveView` | Case « Vue » cochée d'avance. Sans effet si `saveView` est faux. | `config.providers.templates.defaultSaveView` |
| `applyView` | Rejoue la vue d'un template à son chargement, quand il en porte une. | `config.providers.templates.applyView` |
| `viewFlyDuration` | Durée (s) du trajet vers la vue chargée ; `0` = instantané. | `config.providers.templates.viewFlyDuration` |
| `position` | Côté de la barre hôte : le panneau s'ouvre du côté opposé. | `'right'` |
| `tipId` | id du `<Tooltip>` partagé de la barre hôte (MapControls). | — |
| `shortcut` | Touche (lettre seule) qui ouvre/ferme le panneau. `false` = aucun raccourci. | — |
| `grouped` | Rendu SANS sa propre carte `.m3d-controls-group` — pour un groupe partagé (avec « Couches »). | — |

## `<CatalogControl>`

Bouton de barre + panneau « Catalogue » : parcourt des référentiels distants (zones,
villes, départements…) et pose leurs géométries sur la carte. Les sources viennent du
registre `engine.catalog`, pas des props. Détail dans [CATALOG.md](CATALOG.md).

**Sans source déclarée, le composant ne rend rien** — un bouton qui n'ouvrirait qu'une
liste vide est pire qu'un bouton absent. Il est déjà monté par `<MapControls>` (bouton
`catalog`, dans le groupe de « Couches ») : ne l'instancier soi-même que pour le placer
dans une barre custom.

| Prop | Description | Défaut |
|---|---|---|
| `position` | Côté de la barre hôte : le panneau s'ouvre du côté opposé. | `'right'` |
| `tipId` | id du `<Tooltip>` partagé de la barre hôte (MapControls). | — |
| `shortcut` | Touche (lettre seule) qui ouvre/ferme le panneau. `false` = aucun raccourci. Monté par `<MapControls>`, il reçoit `interaction.shortcuts.controls.catalog` ; sans défaut propre en montage manuel. | — |
| `grouped` | Rendu SANS sa propre carte `.m3d-controls-group` — pour cohabiter avec « Couches ». | — |

## `<Confirm>`

Dialogue modal de confirmation (au-dessus de tout, `style.zIndex.modal`). Se referme sur
Entrée (confirmer), Échap, la croix ou un clic hors dialogue.

| Prop | Description | Défaut |
|---|---|---|
| `message` **(requis)** | Message affiché (déjà formaté). | — |
| `confirmLabel` **(requis)** | Libellé du bouton de confirmation. | — |
| `cancelLabel` **(requis)** | Libellé du bouton d'annulation. | — |
| `danger` | Action destructive : le bouton de confirmation passe en rouge. | — |
| `onConfirm` **(requis)** | Appelé à la confirmation. | — |
| `onCancel` **(requis)** | Appelé à l'annulation (croix, Échap, clic extérieur). | — |

## `<TemplateThumb>`

Vignette SVG d'aperçu du contenu d'un template — géométries projetées et auto-cadrées,
aucun three.js ni GPU.

| Prop | Description | Défaut |
|---|---|---|
| `draw` **(requis)** | FeatureCollection GeoJSON du dessin à prévisualiser. | — |
| `size` | Côté du carré de rendu (px). | `40` |

## `<StatsPanel>`

Panneau de diagnostic, déjà monté en ligne « Infos » du menu « Réglages ». À rendre soi-même pour le poser dans une autre surface — cf. [CAMERA.md](CAMERA.md).

| Prop | Type | Défaut | Rôle |
| --- | --- | --- | --- |
| `sections` | `readonly StatsSection[]` | les quatre | Sections affichées, dans l'ordre du panneau : `'camera'`, `'content'`, `'render'`, `'tiles'`. |
| `refreshMs` | `number` | `config.performance.readoutRefreshMs` | Cadence maximale d'écriture. C'est aussi la cadence à laquelle les compteurs des couches sont interrogés — le panneau ne coûte rien fermé. |

## `pathsLayer({ paths, animateHead })`

Couche de **tracés drapés** (parcours, itinéraires), à poser dans `layers` comme `shapesLayer`.

| Prop | Type | Défaut | Rôle |
| --- | --- | --- | --- |
| `paths` | `PathData[]` | — | Tracés affichés. Chacun porte ses points, et peut surcharger `color`, `width`, `casing`. |
| `animateHead` | `boolean` | `true` | Pulsation du point courant, en tête du tracé. |
| `id` | `string` | — | Clé de la couche (comme `markersLayer`/`shapesLayer`) — à fournir dès que `layers` peut être réordonnée ou filtrée. |

L'épaisseur est en **mètres monde** : un tracé grossit au zoom, contrairement aux traits de la couche de dessin qui restent à épaisseur écran constante. Pour un itinéraire **calculé** (trafic, temps de parcours), voir [RELATIONS.md](RELATIONS.md).

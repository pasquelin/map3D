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
| `onLoadingChange` | Un chargement de `source` est-il en vol ? Appelé à chaque transition, jamais en boucle de frame. Sans objet avec `points`, que l'hôte charge lui-même. La couche connaît cet état — c'est elle qui tient le `ViewportController` — mais un indicateur de chargement vit dans l'interface de l'hôte, pas sur la carte. | — |
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

## `<DefaultMarker>`

Rendu de marker par défaut : pastille dégradée + anneau + halo radar optionnel. C'est ce que
`<MarkerLayer>` rend sans `icon`. **Présentationnel** : il est le CONTENU d'un nœud de marker
qui porte déjà `role="button"`, `tabIndex` et son `aria-label` — ne pas l'envelopper d'un
second bouton.

| Prop | Description | Défaut |
|---|---|---|
| `marker` **(requis)** | Marker rendu (`MarkerData`) — sa couleur vient de `theme.colors.marker[type]` (sinon `default`). | — |
| `theme` **(requis)** | Thème résolu (`MapTheme`) : taille, dégradé, gloss et halo y sont lus. | — |
| `label` | Texte court rendu au centre de la pastille. | — |

## `<DefaultCluster>`

Cluster par défaut, en **donut** : un cœur portant le **nombre total** (couleur propre au
cluster, sans icône) entouré d'un **anneau segmenté par type** (parts égales ≤ 4 types,
proportionnelles au-delà). Chaque part porte, le long de l'arc, l'icône du type + son compte,
et une **infobulle stylée** au survol (clampée aux bords de la fenêtre). Rendu par
`<ClusterSurface>` sans `icon`.

| Prop | Description | Défaut |
|---|---|---|
| `cluster` **(requis)** | Cluster rendu (`ClusterInfo` : `total`, `counts`, `types`). | — |
| `theme` **(requis)** | Thème résolu (`MapTheme`) — la géométrie du donut vit dans `theme.clusters`. | — |
| `typeIcon` | Icône d'un type, en fragment SVG (viewBox `0 0 24 24`, `currentColor`) — affichée dans le segment. | — |
| `typeLabel` | Libellé lisible d'un type, pour l'infobulle au survol. | — |
| `satelliteTip` | Infobulle interne par satellite — coupée quand l'hôte fournit `clusterTooltip` (sinon deux infobulles se superposeraient au survol). | `true` |
| `onSegmentHover` | Notifie le type de la part survolée (`null` : cœur ou sortie) — permet à l'hôte une infobulle par segment distincte de l'infobulle globale. | — |

## `<DrawLayer>`

Outils de dessin et symboles.

| Prop | Description | Défaut |
|---|---|---|
| `tools` | Outils autorisés. Filtre aussi ce que `setTool` accepte. Non fourni sur `<Map>`, retombe sur `toolbar.tools` ; à défaut, tous. | `toolbar.tools` |
| `selectModes` | Modes de sélection autorisés (défaut : tous). Filtre aussi `setSelectMode`, clavier compris. Non fourni sur `<Map>`, retombe sur `toolbar.selectModes`. | `toolbar.selectModes` |
| `eraseModes` | Modes de gomme autorisés (défaut : tous). Filtre aussi `setEraseMode`, clavier compris. Non fourni sur `<Map>`, retombe sur `toolbar.eraseModes`. | `toolbar.eraseModes` |
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
| `symbols` | Outil **Symboles** de la barre : actif par défaut avec le catalogue MIL-STD-2525D et son renderer (SDK chargé en import dynamique à la première ouverture de la palette). `enabled: false` retire l'outil ; `catalog`/`renderer` remplacent la symbologie fournie par la vôtre ; `cluster` et `minZoom` sont transmis à [`<SymbolMarkers>`](#symbolmarkers) ; `defaultVariant` choisit la variante posée par défaut (défaut : première clé de `catalog.variantColors`, `friendly` pour MIL-STD ; un catalogue sans variante ne transmet plus de `variant` au renderer). <!-- audit: à vérifier à la fusion (React) --> Les textes (bouton, catégories, affiliations) ne passent PAS par ici : ils sont dans `labels.symbols`. | — |
| `markerMenu` | Menu contextuel des symboles posés — **parité stricte avec les markers**. Reçoit le menu de `<Map markerMenu>` **déjà lié aux relations** par la surface (comme les markers de données, la loupe et le panneau de sélection), pour qu'un symbole ouvre au clic le même menu qu'un marker. La lib y ajoute d'office « Supprimer » en tête. Câblé par `<Map>` ; une application qui monte `<DrawLayer>` à la main fournit ici un menu déjà lié. | `<Map markerMenu>` |
| `children` | Monté dans le contexte de dessin — y placer barre et panneaux. | — |

## `<SelectionBadges>`

Panneau de sélection (haut-droite par défaut, monté dans `<DrawLayer>`). TOUT le contenu —
formes, tracés, clusters, markers — est rendu par DEUX briques partagées : `SelectionGroup`
(en-tête pliable) et `SelectionRow` (via `SelectionList` / `MarkerList`). Une ligne a partout
la MÊME structure `[icône] titre/sous-titre · « … » · ✕` ; seul le contenu (icône, menu) varie
par type. Déplaçable par sa poignée. Se règle par `<Map draw={{ selectionBadges }}>`
(`false` le retire) ; ne le monter soi-même qu'avec un `<DrawLayer>` monté à la main.

| Prop | Description | Défaut |
|---|---|---|
| `markerTypeLabel` | Libellé lisible d'un type de marker (défaut : le type brut). | — |
| `shapeKindLabel` | Libellé lisible d'un kind de forme (défaut : `labels.tools[kind]`). | — |
| `renderMarker` | Rendu d'une ligne de marker (défaut : pastille de type + avatar + id). | — |
| `markerActions` | Actions du menu déroulant d'une ligne, en plus de « Cibler ». | — |
| `markerMenu` | Menu d'une ligne, même forme que `<MarkerLayer menu>` — prime sur `markerActions`. Monté par `<Map>`, il reçoit `<Map markerMenu>` déjà lié aux relations. | `<Map markerMenu>` |

## `<SymbolMarkers>`

Rendu des symboles posés, en **markers DOM**. C'est le bon support pour un pictogramme :
toujours face à l'écran et de taille constante, donc lisible à tout zoom et sous toute
inclinaison — là où un quad drapé au sol s'écrase en trait en vue rasante. L'état ne vit PAS
ici : il reste dans la collection de dessin (historique undo/redo, GeoJSON, events par forme).
Monté par `<DrawLayer>` ; exporté pour un rendu custom.

| Prop | Description | Défaut |
|---|---|---|
| `shapes` **(requis)** | Symboles posés (`PlacedSymbolShape[]`), tels que les fournit la couche de dessin. | — |
| `catalog` **(requis)** | Catalogue de symboles (`SymbolCatalog`). | — |
| `renderer` **(requis)** | Renderer de symboles (`SymbolRenderer`). | — |
| `size` | Taille (px) à l'écran — constante, contrairement à une emprise au sol. | `config.interaction.symbols.sizePx` |
| `ready` | Le renderer répond-il ? Bascule à `true` quand son graphisme devient disponible, et c'est ce qui déclenche le recalcul des SVG embarqués : sans ce signal, `render()` ayant rendu `null` avant le chargement, la charge du drag resterait dépourvue de graphisme jusqu'au prochain changement de `shapes`. | — |
| `cluster` | Participation au regroupement COMMUN de la carte (cf. `<Map cluster>`). Les symboles y entrent d'office : posés à la douzaine sur une même zone, ils se recouvrent sans rien dire de ce qu'ils cachent — et ils se regroupent avec les markers de l'application. `{ enabled: false }` les en sort : un marker par symbole, à tout zoom. | — |
| `minZoom` | Zoom en deçà duquel les symboles posés disparaissent — à la place de `config.markers.staticMinZoom`, et lui-même surclassé par le `minZoom` d'une entrée de catalogue. La cascade va du plus général au plus précis : config → couche → genre de symbole. | — |
| `onMove` **(requis)** | Nouvelle position après déplacement du marker. | — |
| `menu` | Menu contextuel au clic — **parité stricte avec les markers** : un symbole posé s'ouvre au clic comme n'importe quel marker (cf. `MarkerLayer.menu`). Construit par `<DrawLayer>` avec « Supprimer » (la lib possède la forme) suivi du `markerMenu` de l'hôte lié aux relations. | — |
| `eraseMode` | Outil **gomme** actif : un clic sur un symbole le supprime (via `onErase`) au lieu d'ouvrir le menu, et le déplacement est neutralisé. | — |
| `onErase` | Suppression d'un symbole par la gomme. | — |

## `<RelationLayer>`

Les défauts visuels des props ci-dessous viennent de `theme.relations` (cf. [THEME.md](THEME.md#relations--défauts-des-liens-de-relation)) ; le palier de zoom initial est lu sur la caméra au montage, plus un `14` en dur. <!-- audit: à vérifier à la fusion (React) -->

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

## `<RelationStatusBar>`

Barres d'état des relations actives : **une par relation**, ancrée au socle de son marker
source. Chaque segment est le point d'entrée pour changer ce qu'il décrit (mode de transport,
famille de tags), et la croix efface la relation. Montée d'office par
`<Map relations>` — `relations={{ statusBar: false }}` la retire, un objet la règle.

| Prop | Description | Défaut |
|---|---|---|
| `nameOf` | Nom lisible d'un point — l'application seule sait le produire (défaut : son id). | — |
| `modes` | Modes de transport proposés, dans l'ordre du menu. Restreindre la liste est un besoin courant — une flotte de véhicules n'a que faire de « à pied » ni des transports en commun. | `['DRIVE', 'WALK', 'BICYCLE', 'TWO_WHEELER', 'TRANSIT']` |

## `LinkLayer` (cœur, hors React)

Couche **impérative** (classe, pas un composant) de liens drapés entre markers — lignes
directes ou itinéraires réels — avec leurs étiquettes. Distincte de `ShapeLayer` : le rang
(donc l'opacité) change à chaque retour de matrice et ne coûte qu'une mutation de matériau,
pas une reconstruction de géométrie ; et un lien porte une étiquette positionnée par frame.
`<RelationLayer>` la monte ; exportée avec ses types (`LinkVisual`, `LinkLayerDefaults`) pour
un moteur de relations maison ou un usage hors React.

Constructeur `new LinkLayer(scene, projection, overlay, defaults, onSlotMount?, onSlotUnmount?, slotHost?)` :

| Paramètre | Description | Défaut |
|---|---|---|
| `scene` **(requis)** | `THREE.Object3D` parent des maillages. | — |
| `projection` **(requis)** | `Projection` du moteur (drapage et projection écran). | — |
| `overlay` **(requis)** | Overlay HTML des étiquettes (même surface que les labels de la règle). | — |
| `defaults` **(requis)** | `LinkLayerDefaults` : `renderOrder`, `casingWidth` (contour sombre sous le trait, 0 pour le désactiver), `casingColor`, `hoverDarken` (facteur < 1 appliqué au trait survolé). Couleur et épaisseur n'y figurent pas : chaque `LinkVisual` les porte. | — |
| `onSlotMount` | Conteneur d'un visuel `slot` monté : cible de portail pour l'hôte. | — |
| `onSlotUnmount` | Le conteneur part (lien retiré, couche démontée) : l'hôte doit s'en détacher. | — |
| `slotHost` | Surface d'accueil des ancres `slot`, quand elle diffère de celle des étiquettes — pour placer l'ancre dans le contexte d'empilement des markers `CSS2DRenderer`. | — |

Méthodes : `setLinks(next: readonly LinkVisual[])` applique un nouveau jeu de liens par DIFF
(un simple changement de rang ne mute que l'opacité) ; `setDefaults(partial)` ;
`hitTest(sx, sy, tolPx)` et `hitTestHub(sx, sy)` renvoient l'id du lien / du socle touché.
Un `LinkVisual` porte `id`, `points` (déjà échantillonnés), `color`, `opacity` (le RANG),
`width` (px écran), `label` (`null` = aucune), et en option `disc` (socle plat à la place
d'un trait), `colors` (tirets alternés quand plusieurs sources partagent le même trait),
`rank`, `slot`, `hovered`, `traced`, `dash` (`DashStyle` : pointillé défilant, sans contour).

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
| `children` | Enfants montés dans le contexte de la loupe (`useLens()`). | — |

## `<LensPanel>`

Panneau d'inventaire de la loupe, ancré à droite de la zone : en-tête fixe (compteur + récap
par type + fermer), corps = `MarkerList` **partagée** avec le panneau de sélection (1 ligne par
marker, pastille couleur, menu « Cibler », croix de retrait). Déplaçable (`useDraggablePanel`).
Monté par `<LensLayer>` ; exporté pour un montage manuel.

| Prop | Description | Défaut |
|---|---|---|
| `markers` **(requis)** | Markers inventoriés. | — |
| `hidden` | Ids masqués par le gate de zoom : leur ligne porte un œil barré (cf. `<MarkerList hidden>`). | — |
| `getId` **(requis)** | Clé stable d'un marker. | — |
| `anchor` **(requis)** | Position par défaut (px conteneur) — le panneau suit la zone tant qu'il n'est pas déplacé. | — |
| `onRemove` **(requis)** | Croix d'une ligne : retire le marker de la liste affichée. | — |
| `onClose` **(requis)** | Fermeture du panneau. | — |
| `renderItem` | Rendu d'une ligne (`LensRenderItem`, défaut : pastille de type + avatar + id). | — |
| `actions` | Actions du menu déroulant d'une ligne (en plus de « Cibler »). | — |
| `menu` | Menu d'une ligne, même forme que `<MarkerLayer menu>` — prime sur `actions`. | — |
| `targetZoom` | Zoom du vol « Cibler » — transmis à `<MarkerList targetZoom>` (défaut 17). | — |
| `markerTypeLabel` | Libellé lisible d'un type de marker (récap par type). | — |

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
| `minZoom` | Zoom minimal d'affichage ; en deçà la barre glisse hors écran, en emportant ses menus. Motivation et défaut : [`config.toolbar.minZoom`](CONFIG.md). | `config.toolbar.minZoom` |
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

## `<CameraReadout>`

Bloc de lecture de la vue : altitude de l'œil, point au sol sous lui, cap, inclinaison et
zoom — sur une ligne, dans le coin demandé. **Il ne re-rend jamais** : il pose sa structure
une fois et confie l'écriture des valeurs à `ReadoutLayer` (React pose le DOM, le moteur
l'anime). Monté par `<Map readout>` ; exporté pour un placement manuel (bandeau maison hors
carte, panneau d'exploitation) — il n'a besoin que du contexte carte. Cf. [CAMERA.md](CAMERA.md).

| Prop | Description | Défaut |
|---|---|---|
| `corner` | Coin d'ancrage (`'top-right'` \| `'top-left'` \| `'bottom-right'` \| `'bottom-left'`) — le défaut est le seul qu'aucune autre surface n'occupe. | `'top-right'` |
| `fields` | Grandeurs affichées, dans l'ordre. Une grandeur retirée n'est pas seulement masquée : elle n'est plus calculée à chaque rafraîchissement. | `['altitude', 'latitude', 'longitude', 'heading', 'tilt', 'zoom']` |
| `refreshMs` | Cadence maximale d'écriture (ms). | `config.performance.readoutRefreshMs` |
| `className` | Classe supplémentaire, en plus de `m3d-readout`. | — |

## `<TagFilterControl>`

Bouton « Couches » : filtre les éléments de la carte (markers, dessins) par tag. Le panneau
liste les tags réellement présents (registre `engine.tags`) avec recherche, checkbox, pastille
couleur (`theme.colors.tags`, sinon palette hashée) et compteur. Un badge sur le bouton
indique le nombre de tags actifs ; la sélection est persistée (localStorage) par `TagFilter`.
Le panneau n'est monté qu'ouvert. Déjà monté par `<MapControls>` (groupe « Couches ») ; à
instancier soi-même pour une barre custom.

| Prop | Description | Défaut |
|---|---|---|
| `position` | Côté de la barre hôte : le panneau s'ouvre du côté opposé. | `'right'` |
| `tipId` | id du `<Tooltip>` partagé de la barre hôte (MapControls). Absent : l'`aria-label` seul porte le nom accessible. | — |
| `shortcut` | Touche (lettre seule) qui ouvre/ferme le panneau — affichée dans le tooltip. `false` = aucun raccourci. | — |
| `tagLabel` | Libellé lisible d'un tag dans le panneau (défaut : le tag brut). | — |
| `grouped` | Rendu SANS sa propre carte `.m3d-controls-group` — pour cohabiter avec un autre contrôle (ex. « Templates ») dans un groupe partagé de la barre. Défaut : `false` (le bouton porte sa carte, usage autonome). | `false` |

## `<GraticuleLayer>`

Grille de coordonnées géographiques — cf. [GRATICULE.md](GRATICULE.md). **Montée automatiquement
par `<Map>`** : ne la montez pas vous-même (deux grilles se superposeraient). **Sans prop** :
elle se règle par `config.graticule`, se thème par `theme.colors.graticule`, et se bascule par
`useGraticule()`, le sous-menu « Mesures » ou le bouton `graticule` de `<MapControls>`.

Elle ne coûte rien tant que la grille est éteinte. Le composant reste exporté pour les cartes
construites sans `<Map>` (montage impératif complet).

## `<DrawStylePanel>`

Bloc de couleurs de la barre à dessin — son **dernier bouton** — et le panneau de style qu'il
ouvre. Monté par `<Toolbar>` ; ces exports ne servent qu'à un montage manuel (barre maison),
où il prend le gabarit d'un bouton de barre.

| Prop | Description | Défaut |
|---|---|---|
| `position` | Côté de la barre qui porte le bouton — le panneau s'ouvre du côté opposé. | `'left'` |
| `tip` | Infobulle de la barre hôte (`useTip(TIP_ID)`). Absente = pas d'infobulle, l'`aria-label` reste posé. | — |

## `<MeasureToolButton>`

Bouton « Mesures » de la barre + son sous-menu. Monté par `<Toolbar>` — ces exports ne servent
qu'à un montage manuel (barre maison).

| Prop | Description | Défaut |
|---|---|---|
| `position` **(requis)** | Côté d'ancrage, pour l'ouverture du sous-menu. | — |
| `tools` | Rangées affichées ; une seule = pas de sous-menu — l'état actuel, une seule rangée (`measure`) existant. | *(l'unique rangée existante)* |

## `<SymbolPaletteButton>`

Outil **Symboles** de la barre de dessin : le bouton se comporte comme les autres outils
(icône, libellé, raccourci, état actif) et ouvre une palette où les entrées du catalogue sont
rangées par catégorie, avec recherche et choix d'affiliation. Aucune configuration : le
catalogue, le renderer et l'affiliation viennent de `useDrawing().symbols` (fournis par
`<DrawLayer>`), et **tous les textes** de `labels.symbols`. Une vignette se **glisse sur la
carte** : le dépôt crée une forme `kind: 'symbol'`. Rendu par `<Toolbar>` ; exporté pour un
placement manuel (barre custom). Ne rend rien si `symbols.enabled` est faux.

| Prop | Description | Défaut |
|---|---|---|
| `position` | Côté de la barre hôte : la palette s'ouvre du côté opposé. | `'left'` |

## `<LensToolButton>`

Bouton de l'outil loupe — item principal de la barre, au même langage visuel que les outils
de dessin. Rendu par `<Toolbar>` elle-même : rien à câbler côté application. Il ne s'affiche
que si la loupe est montée (`toolbar.lens`, le défaut) ; une carte sans loupe le fait
disparaître au lieu de planter. Exporté pour un placement manuel (barre maison) ; il suppose
alors un `<Toolbar>` quelque part, qui fournit le `<Tooltip>` partagé. **Sans prop.**

## `<DrawSettingsButton>`

Bouton engrenage + panneau « Réglages des outils » : chaque outil garde ses propres
couleurs/épaisseur/style de trait/opacités (+ rayon d'angle du rectangle), persistés en
localStorage. L'éditeur d'un outil, le récap des raccourcis, le hub plugins, le catalogue, les
infos, les préférences et la capture s'ouvrent dans un **sous-panneau latéral** (côté opposé
à la barre). Monté par `<Toolbar>` ; exporté pour un montage manuel (barre maison).

| Prop | Description | Défaut |
|---|---|---|
| `position` **(requis)** | Côté de la barre qui porte le bouton — le sous-panneau s'ouvre du côté opposé. | — |
| `tip` **(requis)** | Infobulle de la barre hôte (`BarTip`, la valeur de `useTip(TIP_ID)`). | — |

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
| `menu` | Menu d'une ligne, dans la MÊME forme que `<MarkerLayer menu>` : c'est ce qui permet au bouton « … » d'une ligne d'offrir exactement le menu du marker sur la carte, sous-menus et séparateurs compris. Fourni, il l'emporte sur `actions`. « Cibler » reste ajouté en tête par la liste — ne le remettez pas ici. | — |
| `hidden` | Ids des markers listés mais RETIRÉS de la carte par le gate de zoom (`static` passé sous son seuil). Leur ligne porte un œil barré (`hiddenLabel`) — l'inventaire ne change pas, il s'explique. Fourni par la loupe seule ; la sélection élague ses masqués. | — |

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

## `<ContextMenu>`

Menu contextuel de la lib — celui des markers, des lignes de liste, des segments de relation.
Navigation clavier (↑/↓, → ouvre un sous-menu, ← remonte d'un cran, Entrée/Espace
sélectionne) ; **Échap n'est pas traité ici** — la surface hôte l'écoute et ferme le menu
entier. Sous-menus ouverts au survol avec intention (`config.interaction.menu.hoverIntentMs`),
panneau recalé dans le conteneur. À rendre soi-même pour offrir le même menu depuis une
surface hôte.

| Prop | Description | Défaut |
|---|---|---|
| `items` **(requis)** | Entrées du menu (`MenuItem[]`). | — |
| `header` | En-tête rendu au-dessus des entrées. | — |
| `onClose` **(requis)** | Appelé après la sélection d'un item (clic, Entrée, Espace). | — |
| `className` | Classes en plus de `m3d-menu-panel` (variante d'ancrage : menu de ligne, etc.). | — |
| `style` | Position du panneau. Le défaut CSS l'ancre au curseur ; un menu ouvert sous un bouton précis (liste de markers) fournit ici ses `left`/`top` en px conteneur. | — |
| `panelRef` | Accès au nœud du panneau. Nécessaire à un hôte qui gère lui-même la fermeture au clic extérieur (`useDismiss` teste un `contains`) : sans ce ref, le clic sur un item serait vu comme « dehors » et refermerait le menu avant l'action. | — |

Un `MenuItem` est soit `{ separator: true }`, soit `{ label, icon?, hint?, swatch?, disabled?, danger?, onSelect?, children? }` :
`hint` = texte secondaire aligné à droite ; `swatch` = pastille de couleur dans le slot d'icône ;
`disabled` = item inerte ; `danger` = action destructive rendue en rouge ; `children` = sous-menu,
sous forme de tableau ou de **fonction synchrone** évaluée seulement à l'ouverture du niveau.

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

## `<PreferencesPanel>`

Panneau « Préférences » de l'utilisateur final, ouvert depuis le ⚙ de la barre
(`<DrawSettingsButton>`). Deux sections NON claviers : **Qualité 3D** (presets seuls) et
**Contrôles** au sens du RESSENTI (vitesse de déplacement, inertie). Il n'écrit rien dans le
moteur : chaque geste modifie le store de préférences, que `<MapProvider>` merge par-dessus la
config de l'application et applique à chaud. Tout est persisté. Exporté comme `<StatsPanel>` :
l'accès par le ⚙ exige `<DrawLayer>`, donc un hôte sans dessin le pose dans SA propre surface.
N'exige qu'un `<MapProvider>` (le store) au-dessus — sans lui, le panneau s'efface. **Sans prop.**

## `pathsLayer({ paths, animateHead })`

Couche de **tracés drapés** (parcours, itinéraires), à poser dans `layers` comme `shapesLayer`.

| Prop | Type | Défaut | Rôle |
| --- | --- | --- | --- |
| `paths` | `PathData[]` | — | Tracés affichés. Chacun porte ses points, et peut surcharger `color`, `width`, `casing`. |
| `animateHead` | `boolean` | `true` | Pulsation du point courant, en tête du tracé. |
| `id` | `string` | — | Clé de la couche (comme `markersLayer`/`shapesLayer`) — à fournir dès que `layers` peut être réordonnée ou filtrée. |

L'épaisseur est en **mètres monde** : un tracé grossit au zoom, contrairement aux traits de la couche de dessin qui restent à épaisseur écran constante. Pour un itinéraire **calculé** (trafic, temps de parcours), voir [RELATIONS.md](RELATIONS.md).

## Briques d'interface

Atomes partagés par les surfaces de la lib, exportés pour qu'une barre ou un panneau maison
parle le même langage visuel.

### `<ToolButton>`

Bouton d'une barre d'outils : icône @mdi, état actif, tooltip + `aria-label` porteurs du
raccourci. Source unique du langage des barres (`MapControls`, `Toolbar`, `LensToolButton`,
`TagFilterControl`, `DrawSettingsButton`) — de quoi peupler `extraTools` / `components` de
`<Toolbar>`. Tout attribut de `<button>` non listé est transmis tel quel (`onClick`,
`disabled`, `aria-expanded`, `onPointerEnter`…).

| Prop | Description | Défaut |
|---|---|---|
| `icon` | Chemin d'icône @mdi/js. Absent, le bouton n'affiche que ses `children` — pour celui dont l'aperçu EST la valeur qu'il règle (le bloc de couleurs de la barre à dessin). | — |
| `label` **(requis)** | Libellé accessible — sert d'`aria-label` et de contenu du tooltip. | — |
| `tip` | Tooltip de la barre hôte (`BarTip`, `useTip(TIP_ID)`). Absent = pas d'infobulle, mais l'`aria-label` reste posé (raccourci inclus). | — |
| `shortcut` | Touche affichée à la suite du libellé. `false`/absent = aucune. | — |
| `active` | État enfoncé (`m3d-on`). | — |
| `className` | Classes en PLUS de `m3d-btn` (ex. `m3d-btn-delete`, `m3d-tagbtn`). | — |
| `iconSize` | Taille de l'icône. | `theme.sizing.iconSize` |
| `children` | Contenu additionnel DANS le bouton, après l'icône (ex. badge de compteur). | — |
| `ref` | Le `<button>` lui-même — une barre doit pouvoir publier son bouton actif comme ANCRE : une surface s'ouvre à la hauteur de l'item auquel elle se rapporte. | — |

### `<Swatch>`

Repère visuel d'une ligne de liste, toujours présent : photo > icône > pastille. Partagé par
l'inventaire de la loupe, le panneau de sélection et la recherche — une même entité doit se
reconnaître au même signe, où qu'on la rencontre. Un pictogramme est affiché ENTIER, jamais
rogné en rond : c'est précisément lui qui identifie la ligne.

| Prop | Description | Défaut |
|---|---|---|
| `avatar` | Photo (agent, usager) — recadrée en rond, cerclée de `color`. | — |
| `icon` | Pictogramme (symbole tactique, icône métier) — affiché ENTIER, jamais rogné. | — |
| `color` **(requis)** | Couleur de la pastille de repli, et du cerclage des deux autres formes. | — |

### `<RemoveButton>`

Bouton « supprimer » de la lib — icône, couleur et libellé identiques partout (barre d'état
d'une relation, pastilles du dock, indice de retrait au drag). Le tracé d'icône
(`REMOVE_ICON_PATH`) et les classes viennent de `core/removeButton`. Le `pointerdown` est
stoppé en plus du clic : sans cela le geste démarrerait un drag avant que le clic n'aboutisse.

| Prop | Description | Défaut |
|---|---|---|
| `label` **(requis)** | Libellé : texte visible (si `withText`), infobulle et `aria-label`. | — |
| `withText` | Afficher le libellé à côté de l'icône. Sans lui, le bouton reste une icône seule. | — |
| `className` | Classes supplémentaires, pour le positionnement propre à chaque hôte. | — |
| `onRemove` **(requis)** | Appelé au clic. | — |

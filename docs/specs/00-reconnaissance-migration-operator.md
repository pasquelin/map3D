# Rapport de reconnaissance — migration de la carte Operator vers `map3d`

> Livrable n°1 : pour chaque feature demandée, « existe déjà sous le nom X / partiel /
> n'existe pas », et l'action retenue (exporter / documenter / étendre / créer).
> Établi par lecture de `src/core`, `src/layers`, `src/react`, `src/data`, `src/index.ts`.

Légende des actions : **CRÉER** (rien de réutilisable) · **ÉTENDRE** (brique existante à
enrichir) · **EXPORTER** (existe en interne, à rendre public) · **DOCUMENTER** (couvert,
seul le mapping manque).

---

## 🔴 BLOQUANT 1 — Identité métier + métadonnées + events granulaires (dessin)

| Besoin | Existant | Verdict |
|---|---|---|
| `feature.id` en GeoJSON | `Drawing.id` existe (`draw-N`, `nextId()` `DrawLayer.ts:107`) mais **`toGeoJSON()` ne l'émet pas** (`:1285`) et **`fromGeoJSON()` régénère** (`:1328`) | **partiel** |
| Métadonnées libres | `GeoJSONFeature['properties']` est **fermé** (`:91-102`) : `kind,color,width,fillOpacity,tags?,fillColor?,strokeOpacity?,stroke?,radius?,locked?`. Aucun `meta`/`externalId`/passthrough | **n'existe pas** |
| Events par forme | `onChange(fc)` agrégé + `onSelectionChange(ids, markerIds)` uniquement (`DrawLayerProps:23-25`) | **n'existe pas** |
| API impérative par id | `CoreDrawLayer` a `select`, `deleteSelected`, `setLocked`, `setStyleForSelection`, `duplicateSelected`, `nudgeSelection`, `clear`, `to/fromGeoJSON`. **Aucun `getShape/addShape/updateShape/removeShape` par id.** `DrawingApi` (`context.ts:51-95`) n'expose rien par identité non plus | **n'existe pas** |

Vérifications de nommage faites : `externalId`, `meta`, `properties` passthrough, `upsert`,
`remove by id` — aucun résultat. Le seul index par id est `DrawLayer.byId` (privé, `:179`).

**Action : CRÉER**, avec un point d'attention non anticipé par le prompt — `fromGeoJSON()`
appelle `history.reset()` + `clearAll()` (`:1311-1315`), donc l'identité doit être préservée
*avant* de toucher à cette mécanique, et `selection.prune()` (`:1347`) casse la sélection au
round-trip. `emitChange()` est coalescé à 1×/frame (`:1363`) : les events granulaires devront
être émis **au commit** et non dans le flush, sinon ils sont agrégés eux aussi.

---

## 🔴 BLOQUANT 2 — `fitBounds` / cadrage sur bounds

| Besoin | Existant | Verdict |
|---|---|---|
| Calcul d'altitude cadrante | ✅ **`altitudeForBounds(b)` existe** — `src/react/components/SearchBox.tsx:56`, **privé au fichier**. Gère déjà l'antiméridien (`lngSpanDeg`, `:48`), la marge 1.35× et le clamp `[350 m, 6000 km]` | **existe, non exporté** |
| `fitBounds` public | Aucun. `SearchBox:147` fait le fitBounds implicite `flyTo({lat,lng,altitude: altitudeForBounds(b)})` | **n'existe pas** |
| Agrégation de bounds | `boundsAround(center, radius)` (`relations/core/geo.ts:99`, exporté) fait l'inverse (bounds *autour d'un point*). `boundsOf` (`panelFit.ts:61`) est du **DOM**, sans rapport. Aucun `boundsOfLatLngs/Shapes/Markers` | **n'existe pas** |
| Briques caméra | `camera.flyTo({lat,lng,altitude}, {duration,tag})`, `jumpTo(p, alt)`, `clampAltitude` (plancher sol réel + `maxAltitude`), `altitudeForZoom`/`zoomForAltitude` exportés | **existe** |

**Action : EXPORTER `altitudeForBounds`** (extraction depuis `SearchBox` vers un module
partagé, `SearchBox` le réimporte) **+ CRÉER** `fitBounds` (hook + engine) et les helpers
d'agrégation. Le clamp `[350 m, 6000 km]` de `altitudeForBounds` est un choix « recherche de
lieu » : il devra être paramétrable pour `fitBounds` (une trace GPS de 200 m doit pouvoir
cadrer sous 350 m), sinon régression vs le `fitBounds` Google.

---

## 🔴 BLOQUANT 3 — Carte figée / non-interactive

| Besoin | Existant | Verdict |
|---|---|---|
| Prop `interactive` | Aucune (`MapProps`, `Map.tsx:12-44`) | **n'existe pas** |
| Gel navigation | `setDrawing(active)` **force `this.controls.enabled = true`** (`MapEngine.ts:472-476`) et fige seulement pan/rotation via `freezeControlsPanRotate` en gardant la molette. `setDrawingSuspended` (`:483`) ne touche que le dessin | **partiel, inadapté** |
| Interception pointeur | `inputInterceptor` (slot **unique**, `MapEngine.ts:145`) déjà disputé entre dessin et loupe | **existe, saturé** |

Recherches `interactive`, `locked`, `readonly`, `gesture`, `frozen`, `setEnabled` : rien.

**Action : CRÉER** `engine.setInteractive()` + prop `<Map interactive>`. Attention : le slot
`inputInterceptor` est unique et déjà partagé (cf. commentaire défensif `DrawLayer.tsx:250-255`)
— le mode figé ne doit pas passer par lui mais par `controls.enabled` + un garde en amont de
`emit('click')` (`MapEngine.ts:1073`), sinon il vole le slot à la loupe/au dessin.

---

## 🔴 BLOQUANT 4 — Marker repositionnable

| Besoin | Existant | Verdict |
|---|---|---|
| `draggable` | ✅ existe (`MarkerLayerProps.draggable`) mais branche **`useDraggable` = DnD à payload** (long-press → ghost → `DragRegistry` → `DropZone`, ex. `PinnedDock`). Sémantique « emporter vers ailleurs », pas « déplacer sur la carte » | **existe, autre sémantique** |
| `onDragEnd(latLng)` | Aucun | **n'existe pas** |
| Écran → latLng | ✅ `projection.pickLatLng(clientX, clientY, camera)` (intersection ellipsoïde/tuiles) | **existe** |
| latLng → écran | ✅ `latLngToWorld` + `worldToScreen` (`Projection.ts:145`/`:261`) ; composé dans `MarkerLayer.screenPositions()` (`layers/MarkerLayer.ts:257`) | **existe** |

Recherches `reposition`, `onMove`, `onDragEnd`, `editable`, `pickLatLng` mode édition : rien.

**Action : CRÉER** le mode repositionnement, avec exclusion mutuelle explicite vis-à-vis de
`draggable` (les deux consomment le pointerdown du même nœud DOM). Toutes les briques
géométriques nécessaires sont là.

---

## 🔴 BLOQUANT 5 — Event « carte prête »

| Besoin | Existant | Verdict |
|---|---|---|
| `MapEvents` | `camera`, `viewport`, `click`, `dragmode`, `basemap` (`MapEngine.ts:80-86`). **Pas de `ready`/`load`** | **n'existe pas** |
| Signaux de « prêt » | ✅ Tous présents mais internes : `terrainKnown && tiles.loadProgress >= 1` (`:710`), `INTRO_MAX_WAIT_MS = 8000` (`:677`), `introActive` (getter public, `:634`), `projection.isReady()` (`Projection.ts:102`) | **partiel** |

**Action : CRÉER** l'event, **en réutilisant la condition déjà écrite ligne 710** — c'est
exactement la sémantique « exploitable » (terrain connu + tuiles chargées), avec le même
garde-fou de timeout. Sémantique retenue à documenter : *`ready` = la projection résout des
hauteurs et `fitBounds`/`camera` visent le sol réel* (≠ « moteur créé », déjà couvert par
`useMap()`).

---

## 🟠 IMPORTANT 6 — Contraintes de dessin

| Besoin | Existant | Verdict |
|---|---|---|
| Limites / confinement / anti-collision / aire max | Aucun. `ShapeLayer` est un pur afficheur (`layers/ShapeLayer.ts`), `DrawLayer` ne valide rien | **n'existe pas** |
| Hook de validation | Aucun `onBeforeChange`/`canCommit`/`onReject` | **n'existe pas** |
| Prédicats géométriques | ⚠️ `pointInPolygon`, `segmentsIntersect`, `shapeTouchesSelector` existent — **mais en coordonnées ÉCRAN** (`layers/draw/hitTest.ts`, non exportés). Rien en géodésique. `haversineMeters` existe (`relations/core/geo.ts`). **Aucune fonction d'aire** | **partiel, non réutilisable tel quel** |
| Opacité des limites | `ShapeStyle.fillOpacity` par forme ✅ ; pas de contrôle global de couche | **partiel** |

**Action : CRÉER** les prédicats **géodésiques** (aire sphérique, point-dans-polygone géo,
intersection de polygones) dans `core/geometry.ts` + le système de contraintes. Réutiliser
`hitTest.ts` serait un piège : ses prédicats dépendent de la caméra (une zone jugée « dans
les limites » changerait de verdict au pivot de vue).

---

## 🟠 IMPORTANT 7 — Projection publique + overlay DOM géoréférencé

| Besoin | Existant | Verdict |
|---|---|---|
| `latLngToScreen()` | **La passe existe, composée à 3 endroits** : `MarkerLayer.screenPositions()` (`:257-262`), `DrawLayer.project()` (`:1275-1280`), `LensLayer`. Toutes font `latLngToWorld` → `worldToScreen` → `isAboveHorizon`. **Aucune méthode unique** | **partiel — à factoriser** |
| Overlay DOM ancré | ✅ **Le mécanisme existe déjà** : `CSS2DObject` + `engine.labelRenderer` + `engine.overlayAnchor` (`MapEngine.ts:128-137`) — c'est *exactement* comme les markers sont ancrés (`layers/MarkerLayer.ts:174`). Aucun composant générique ne l'expose | **existe, non exposé** |
| `Layer` custom | ✅ `engine.addLayer(layer)` public, interface `Layer` exportée (`index.ts:32`) | **existe, non documenté** |

**Action : EXPORTER/FACTORISER** `latLngToScreen` sur `Projection` (les 3 sites l'adoptent),
**CRÉER** `<DomOverlay>` par-dessus le mécanisme CSS2D **existant** (pas de nouveau moteur de
positionnement), **DOCUMENTER** l'écriture d'une `Layer` custom. C'est l'item où le prompt
sur-estime le travail : 80 % est déjà là, mal exposé.

---

## 🟠 IMPORTANT 8 — `PathLayer` enrichi

| Besoin | Existant | Verdict |
|---|---|---|
| Ligne + tête animée | ✅ `PathData {id,points,color,width,casing,casingColor}` + `animateHead` | **existe** |
| Markers par point | Aucun. Mais `MarkerLayer` sait déjà tout faire (tooltip, menu, sélection, tags, clustering) | **combinable** |
| Popup au clic | cf. item 9 | **n'existe pas** |
| Métadonnées `before/share/createdAt` | `MarkerData<T>.data: T` est **déjà générique** ✅ ; `PathData` n'a pas de champ libre | **partiel** |
| Cadrage | dépend du BLOQUANT 2 | — |

**Action : DOCUMENTER le pattern `PathLayer + MarkerLayer`** (les points de trace sont des
markers : ils héritent gratuitement du filtrage par tags, du clustering et de la sélection —
les réimplémenter dans `PathLayer` créerait un second système de markers) **+ ÉTENDRE**
`PathData` d'un champ de données libre.

---

## 🟠 IMPORTANT 9 — Popup persistant au clic marker

| Besoin | Existant | Verdict |
|---|---|---|
| Infobulle survol | ✅ `tooltip?: (p) => {title, content} \| null` + `MarkerTip` (contenu `ReactNode` libre) | **existe (survol)** |
| Menu au clic | ✅ `menu?: (p) => MenuItem[]` + `ContextMenu` | **existe (actions)** |
| Popup persistant | Aucun. Le commentaire de `tooltip` **acte le choix inverse** : « L'info vit AU SURVOL — le clic est réservé aux actions » | **n'existe pas** |
| Briques de rendu | ✅ `MarkerTip` (corps), `FloatingPanel` (cadre + fermeture + drag), `useDismiss` (clic-ailleurs/Échap), portail dans `.m3d-root` | **existe** |

**Action : CRÉER** la prop `popup`, **assemblée à partir de `MarkerTip` + `useDismiss` +
l'ancrage CSS2D existants** — aucune primitive nouvelle. À noter : cela infléchit une décision
de design assumée de la lib, donc à documenter comme opt-in explicite.

---

## 🟠 IMPORTANT 10 — Bouton custom dans `MapControls`

| Besoin | Existant | Verdict |
|---|---|---|
| Ajout de bouton | `MapControls` a `components` (masquer/**remplacer** un groupe) et `buttons` (masquer un bouton) — **pas d'ajout** | **n'existe pas** |
| Pattern d'insertion | ✅ **`Toolbar` a `extraTools?: ReactNode`** (`Toolbar.tsx:42`, inséré `:123`) — le pattern est déjà établi dans la lib | **existe ailleurs** |
| Rendu d'un bouton | ✅ `ToolButton` exporté explicitement pour ça (`index.ts:137-140`) | **existe** |
| Décider « hors vue » | ✅ `engine.getView()` (`:756`) + event `viewport` | **existe** |

**Action : ÉTENDRE** `MapControls` avec `extraButtons`/`extraTools` **par symétrie stricte
avec `Toolbar`** (même nom, même sémantique) plutôt qu'inventer une API différente.

---

## 🟢 MINEURS

**11. Couleur des futures zones.** ✅ **Couvert** : `DrawSettings` (store persisté par outil,
`get/set/reset/isCustomized/onChange`) exposé par `useDrawSettings()`, et `DrawingApi.setStyle`
applique « à la sélection si non vide, **sinon aux défauts de l'outil actif** »
(`DrawLayer.tsx:327-336`) = `setZoneColor`. Lecture via `DrawingApi.currentStyle` (`:337-351`)
= `getZoneColor`. → **DOCUMENTER** le mapping. Réserve : `setStyle` sans sélection ne s'applique
qu'à l'outil *actif* ; si l'Operator veut fixer la couleur sans outil actif, il passe par
`useDrawSettings().set('polygon', {color})`. À écrire noir sur blanc.

**12. Recentrages canoniques.** ✅ **Couvert** : `engine.flyToTopDown()`, `engine.flyToGlobe()`,
`<Map positionStorageKey>` + `resetStoredPosition`. → **DOCUMENTER**. Trou mineur : pas de
« retour au `center`/`zoom` initial » (les props ne sont lues qu'au montage) → **petit helper à
créer** si `resetMapPosition` doit être fidèle.

**13. Catégories ↔ tags.** ✅ **Largement couvert** : `TagFilter` + `TagFilterControl` +
`<Map tagStorageKey>` (persistance par clé) + `markerTags()` (défaut `['marker', type]`).
⚠️ **Trou réel confirmé** : `filterExempt` existe (`DrawLayer.ts:222`) **mais seulement pour
les dessins fraîchement commités**. Côté markers, `MarkerLayer` filtre sans exception
(`MarkerLayer.tsx`, `points = allPoints.filter(...)`) → **`selectedId`/`followId` sont masqués
par le filtre**. C'est la régression « focusMarker toujours visible ». → **ÉTENDRE**.

**14. `dragend`.** ✅ **Couvert par `'viewport'`**, émis à `settleFrames === 4`
(`MapEngine.ts:823`), soit ~4 frames après stabilisation = exactement la sémantique `idle` de
Google (et non `dragend`). Pour `ResumeMap` (recharger après déplacement) c'est le bon event,
et même supérieur (couvre zoom/rotation/vol). → **DOCUMENTER l'équivalence**, ne rien ajouter.

**15. Extrusion volumétrique.** `ShapeData` n'a **aucun** champ d'altitude/extrusion ;
`DrapedLayer` drape au sol par construction (plan tangent ENU + hauteur d'ancre unique).
→ **CRÉER si l'effet doit être conservé** — coût réel, ce n'est pas un champ à ajouter : la
géométrie prismatique et le drapage sont deux régimes distincts. **Décision à prendre par toi**
(cf. question en fin de rapport).

**16. Préférences carte.** Correspondances disponibles : `mapTypeId` → `engine.setMapMode('3d'|'2d')`
+ `setTrafficVisible` ; `zoomControl`/`scrollwheel` → `MapControls.buttons` + BLOQUANT 3 ;
`tilt` → `engine.tiltBy()` ; `minZoom`/`maxZoom` → `camera.maxAltitude` / `camera.minGroundClearance`
(+ `altitudeForZoom` pour convertir) ; plus `errorTarget`, `intro`, `positionStorageKey`,
`tagStorageKey`. → **DOCUMENTER** (pas d'implémentation carte, conforme au prompt).

---

## Synthèse

| Action | Items |
|---|---|
| **CRÉER** | 1 (identité/meta/events/API par id), 3 (interactive), 4 (repositionnable), 5 (ready), 6 (contraintes + géométrie géodésique), 9 (popup), 15 (extrusion — *si retenu*) |
| **EXPORTER / FACTORISER** | 2 (`altitudeForBounds`), 7 (`latLngToScreen`, `<DomOverlay>` sur CSS2D existant) |
| **ÉTENDRE** | 8 (`PathData` data libre), 10 (`extraButtons`, calqué sur `Toolbar.extraTools`), 12 (helper reset), 13 (exemption de filtre pour `selectedId`/`followId`) |
| **DOCUMENTER seulement** | 11, 12 (mapping), 13 (mapping), 14, 16 |

**Écarts notables par rapport aux hypothèses du prompt :**

- **Item 7 est bien plus léger qu'annoncé** : l'ancrage DOM géoréférencé existe déjà
  (CSS2D/`overlayAnchor`), il n'est simplement pas exposé. Pas de réécriture MilSym à craindre.
- **Item 14 ne demande aucun code** : `'viewport'` est déjà l'équivalent (et le sur-ensemble) de
  `idle`/`dragend`.
- **Item 6 est plus lourd qu'annoncé** : les prédicats géométriques existants sont en espace
  **écran** et donc inutilisables pour une contrainte métier stable ; il faut une couche
  géodésique neuve.
- **Item 13 cache une vraie régression** non listée comme telle : les markers `selectedId`/
  `followId` disparaissent sous filtre de tags.
- **Item 2 : le clamp à 350 m** d'`altitudeForBounds` doit devenir paramétrable, sinon
  `fitBounds` sur une trace courte régresse par rapport à Google Maps.

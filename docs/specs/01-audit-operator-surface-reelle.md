# Audit de la surface réelle de l'ancienne carte Operator

> Livrable complémentaire au rapport de reconnaissance. Établi par lecture des appels
> réels dans `/Users/pasquelin/Applications/gosecure/operator`, pas d'après la
> description du prompt. Objectif : dimensionner chaque API map3d sur l'usage effectif.

## Périmètre réel

**41 fichiers** consommateurs (le prompt en listait ~15). Vues et modules non mentionnés
par le prompt mais bien consommateurs :

`components/ZonesRestrictions.tsx`, `components/selectZones/{SelectZone,SelectZoneGeographical,SelectZoneGroup}.tsx`,
`views/alerts/individual/{ViewIndividual,ViewIndividualOverview}.tsx`, `views/alerts/intervention/ViewIntervention.tsx`,
`views/alerts/signal/ViewSignal.tsx`, `views/alerts/create/ViewCreate.tsx`,
`views/companyZones/{ViewCreate,ViewEdit}.tsx`, `hooks/{useAgentMarkers,useFollowAgentOnMap,useMapDataLayers}.ts`,
`components/map/{MapPicture,MapMarkerFilter,MapStats}.tsx`.

## `ImperativeHandle` — 24 méthodes, usage mesuré

| Méthode | Sites | Où | Couverture map3d |
|---|---|---|---|
| `setZoom` | **12** | MapAgent, MapNavigationButtons, useFollowAgentOnMap, ResumeMap, alertEvents, parameters (×4) | ❌ à créer |
| `fitBounds` | **9** | MapNavigationButtons ×2, MapTrace ×4, ResumeMap, alertEvents, companyZones | ❌ BLOQUANT 2 |
| `setCenter` | **9** | MapAgent, FieldLatLngMap ×2, ResumeMap ×2, alertEvents, parameters ×3 | ❌ à créer |
| `panTo` | **6** | MapNavigationButtons ×2, useFollowAgentOnMap ×2, map/ViewDetail, parameters | ❌ à créer |
| `getZones` | 5 | selectZones ×5 | ❌ BLOQUANT 1 |
| `extendBoundsWithZones` | 4 | ZonesRestrictions, SelectZone, SelectZoneGeographical, ViewForm | ❌ BLOQUANT 2 |
| `addNewZone` | 2 | SelectZone, SelectZoneGroup | ❌ BLOQUANT 1 |
| `getBounds` (carte) | 5 | MapNavigationButtons, useMapMarkers, useMilSymLayer ×2, useMilSymDragDrop | ✅ `engine.getView().bounds` |
| `getDiv` | 2 | MapNavigationButtons, useMilSymDragDrop | ✅ `useMapContext().overlay` |
| `getZoom` | 2 | useMilSymLayer ×2 | ✅ `zoomForAltitude(...)` |
| `clearZones`, `clearLastZone`, `setZoneColor`, `getZoneColor`, `setOpacityLimitsZones`, `setDrawingMode`, `resetMapPosition` | 1 chacun | **tous dans `MapTools.tsx`** | mixte |
| `disableEditing` | 1 | companyZones/ViewDetail | ❌ à créer |
| `getLastZone` + `setLastZoneOptions` | 1 | companyZones/ViewDetail:94-97 | ❌ **non prévu** |
| `addZones` | 1 | SelectZoneGeographical | ❌ BLOQUANT 1 |
| `removeZone` / `removeZoneUuid` | 1+1 | SelectZoneGroup, SelectZone | ❌ BLOQUANT 1 |
| `getLimitsZones`, `removeZoneId`, `updateZoneUuid`, `replaceZones` | **0** | — | non utilisées |

**Volume dominant non anticipé** : `setZoom`+`setCenter`+`panTo` = **27 appels**, contre 9
pour `fitBounds`. Le prompt centrait le BLOQUANT 2 sur `fitBounds` ; le vrai gros morceau
est le trio de recentrage « façon Google ».

**Flag `withEvent`** : `clearZones(false)`, `addNewZone(zone, true, false)`,
`removeZone(zone, false)`, `removeZoneUuid(uuid, false)`. Les mutations programmatiques
doivent pouvoir être **silencieuses** — sinon boucle avec les mutations GraphQL.
→ Les méthodes du BLOQUANT 1 ont besoin d'un `{ silent?: boolean }`.

**`extendBoundsWithZones` retourne un `LatLng`** (le centre) : `ViewForm.tsx:141` fait
`center.current = map.extendBoundsWithZones(zones, 1)`. Ce n'est pas qu'un cadrage.

**Padding de `fitBounds`** : deux formes réelles — `50`, `1` (nombre) et
`{top:50,right:50,bottom:50,left:50}` (objet, 2 sites). Les deux doivent être acceptées.

## `MapProps` — props réellement passées

| Prop | Sites | Note |
|---|---|---|
| `onMapLoad` | **7** | BLOQUANT 5, la plus utilisée |
| `markersList` | 4 | |
| `addZones` | 4 | |
| `className` | 4 | |
| `traces` | 3 | |
| `latitude`/`longitude`, `focusPosition`, `focusRadius`, `addLimitsZones`, `onZonesUpdate`, `focusMarker`, `slots`, `anchorPosition`/`anchorLabel` | 2 chacun | |
| `staticMap` | **1** | uniquement `ViewDashboardResumeMap` |
| `disabled` | **1** | uniquement `companyZones/ViewDetail` |
| `maxAreaM2`, `editZones`, `clusterConfig`, `categoryFilterCacheKey`, `onViewportChange`, `traffix`, `onZoneAdd/Update/Edit/Delete`, `onShareEditing` | 1 chacun | |
| **`Zones`, `onZoneClick`, `noCollisionAllowed`, `filterVersion`, `strokeColor`, `strokeWeight`** | **0** | **code mort** |

Props Google natives effectivement utilisées : `defaultCenter` (2), `defaultZoom` (1),
`scrollwheel` (1), `minZoom` (1), `key`. Le sous-ensemble Google à couvrir est donc
très étroit — `MapProps extends MapPropsGoogle` n'est pas exploité en pratique.

### Conséquences

- **`noCollisionAllowed` n'est jamais activé** (`Map.tsx:473` `if (noCollisionAllowed && ...)`,
  aucun appelant). L'anti-collision de l'IMPORTANT 6 protège un chemin mort → à ne pas
  porter, ou à porter en option jamais utilisée. Allège nettement l'item 6.
- **`Zones` (mode contrôlé) n'est jamais utilisé** : tout passe par `addZones` + impératif.
- `strokeColor`/`strokeWeight` ne sont passés que **par `Map.tsx` à `MapTrace`** en interne.

## `staticMap` et `disabled` : deux choses distinctes, moins larges qu'annoncé

`staticMap` (`Map.tsx`) : `gestureHandling='none'` (:799), `clickable:!staticMap` sur les
formes (:376), édition coupée (:530), `onViewportChange` coupé (:636-640), `useMapDrawing`
neutralisé. **Un seul consommateur : `ViewDashboardResumeMap`.**

`disabled` : uniquement `if (disabled) return` dans le handler clavier (:716) — coupe
Delete/Backspace. **Un seul consommateur : `companyZones/ViewDetail`.** Aucune API lib
nécessaire.

⚠️ **Le prompt se trompe sur le périmètre du BLOQUANT 3.** Il annonce `ViewDangerOverview`,
`ViewForm` et « tous les affichages Map3D » comme lecture seule. Vérification faite :
`ViewDangerOverview` passe `addZones focusPosition focusRadius traces` sans `staticMap` ;
`ViewForm` passe `addZones onMapLoad scrollwheel`. Ni l'un ni l'autre n'est figé.

## `Map3D` est un composant indépendant

`Map3D.tsx` **n'utilise pas `Map.tsx`** : il monte directement un `Map3DElement`
(`google.maps.importLibrary('maps3d')`, version alpha) dans un `<div>`. Sa seule prop est
`zones`. Trois consommateurs : `VoiceAlertResultDisplay`, `ViewFormConfim`, `ViewDangerMap`.

- Il est **pleinement interactif** (navigation libre) → ne relève pas du BLOQUANT 3.
- Il **extrude réellement** : `altitude: 200` sur tous les sommets, `extruded: true`,
  `AltitudeMode.RELATIVE_TO_GROUND`, `tilt: 60`, `mode: HYBRID`.
- Couleurs **codées en dur par type de zone** : rect `#0000ff80`/`#000080ff`,
  cercle `#ffff0080`/`#ffa500ff`, polygone `#00ff0080`/`#008000ff`.
- Cadrage : `calculateBounds` + `calculateOptimalRange` (`max(5000, maxDiff*150000)`).

→ **C'est le cas de migration le plus simple** (une prop, pas de ref, pas d'events), **à
la seule condition de trancher l'extrusion** (item 15). Sans elle, la régression est
visuellement évidente sur ces 3 vues.

## Type `Marker` (Operator) → `MarkerData` (map3d)

| Champ Operator | map3d | Verdict |
|---|---|---|
| `latitude`/`longitude` | `position: LatLng` | ✅ |
| `icon` / `markerContent` | `icon?: (p) => string` (SVG) | ✅ |
| `html` + `infoHeader` | — | ❌ **IMPORTANT 9 (popup)** |
| `category` | `tags` | ✅ (item 13) |
| `selected` / `selectedColor` | `selectedId` + thème | ✅ / ⚠️ couleur par marker non supportée |
| `onClick` | `onSelect` | ✅ |
| **`zIndex`** | — | ❌ **trou non listé** |

Autres écarts détectés dans `useMapMarkers` :
- clustering `SuperClusterAlgorithm` avec **`maxZoom`** ; map3d a `{enabled, radius, minPoints}`
  → **`maxZoom` manquant**.
- `viewportPadding = 0.5` (filtrage des markers sur viewport élargi) → pas d'équivalent explicite.
- effet sonar sur marker → ✅ couvert par `MarkerData.new` / `.urgent`.

## Events Google réellement écoutés

Sur la **carte** : uniquement `'idle'` (`useMapMarkers:404`, `Map.tsx:641`).
Aucun `dragend`, `zoom_changed`, `center_changed`, `bounds_changed` sur la carte.
→ **Confirme l'item 14** : `'viewport'` de map3d suffit, et le couvre strictement.

Sur les **formes** : `mousedown`, `mouseup`, `click`, `dblclick`, `radius_changed`,
`bounds_changed` (`Map.tsx:533-556`) → relèvent du BLOQUANT 1 (events granulaires).

Sur les **markers** : `gmp-click` et `closeclick` de l'InfoWindow → IMPORTANT 9.

`useMapDrawing.ts` implémente le dessin à la main sur `mousedown/mousemove/mouseup/click/dblclick`
— entièrement remplacé par le `DrawLayer` de map3d, rien à porter.

## Déjà couvert par map3d, à ne pas réimplémenter

- `MapNavigationButtons` teste `bounds.contains()` → **`boundsContains` est déjà exporté**
  (`index.ts:49`).
- `MapTrace` calcule une boîte de `focusRadius` mètres autour d'un point → **`boundsAround(center, radiusMeters)`
  est déjà exporté** (`index.ts:183`).
- `map.getDiv()` → `useMapContext().overlay`.
- `map.getZoom()` → `zoomForAltitude(camera.getState().altitude)`.

## Zones encore non auditées

`MapTools.tsx` (détail UI), `MapDataLayers.tsx`, `MapMarkerFilter.tsx`,
`hooks/milsym/*` en profondeur, `utils/map.ts` (962 lignes de géométrie Google),
et le détail interne de `ViewDashboardResumeMap`. À couvrir avant d'attaquer les
IMPORTANTS 6 et 7.

# Note de migration — ancienne carte Operator → `map3d`

> Livrable final. Objectif : rendre la migration **mécanique**, vue par vue.
>
> Sources : `docs/specs/00-reconnaissance-migration-operator.md` (état de la lib) et
> `docs/specs/01-audit-operator-surface-reelle.md` (usage réel, 41 fichiers).

---

## 1. Périmètre

**41 fichiers** de l'Operator consomment l'ancienne carte, dont 13 que le prompt initial
ne listait pas. Ils se répartissent en cinq familles :

| Famille | Fichiers | Effort |
|---|---|---|
| Affichage simple (traces, focus, zones en lecture) | `ViewShare`, `CardAlertProfile`, `ViewDangerOverview`, `MapPicture` | faible |
| Zones : CRUD par uuid | `companyZones/{ViewDetail,ViewCreate,ViewEdit}`, `map/ViewDetail`, `selectZones/*` (3), `ZonesRestrictions` | **élevé** |
| Markers + dispatch | `ViewDashboardResumeMap`, `ViewAlertOverview`, `ViewAgents`, `alertEvents/ViewDetailOverview`, `MapAgent` | moyen |
| Champ de position | `FieldLatLngMap`, `parameters/ViewDetail` | faible |
| Zones 3D (`Map3D`) | `VoiceAlertResultDisplay`, `ViewFormConfim`, `ViewDangerMap` | faible |

`views/dashboard/ViewDashboardMap3D.tsx` est **déjà migré** : c'est le modèle de l'API
compositionnelle attendue, et `components/map3d/{labels,shapes,theme,icons}.ts` contient
déjà les convertisseurs réutilisables (`zoneToShape`).

---

## 2. Correspondance de l'API impérative

L'ancien `MapRef` (24 méthodes) disparaît : map3d est déclaratif. Les équivalents vivent
sur `engine` (`useMap()`), `useCamera()` et `useDrawing()`.

| Ancien | map3d | Appels réels |
|---|---|---|
| `map.setZoom(z)` | `camera.setZoom(z)` | 12 |
| `map.fitBounds(b, padding)` | `camera.fitBounds(b, { padding })` — nombre **ou** `{top,right,bottom,left}` | 9 |
| `map.setCenter(p)` | `camera.setCenter(p)` (altitude conservée) | 9 |
| `map.panTo(p)` | `camera.panTo(p)` (animé, altitude conservée) | 6 |
| `map.getZones()` | `useDrawing().getShapes()` | 5 |
| `extendBoundsWithZones(shapes, pad)` | `camera.fitBounds(boundsOfShapes(shapes), { padding: pad })` | 4 |
| ↳ sa valeur de retour (le centre) | `centerOfBounds(boundsOfShapes(shapes))` | 1 (`ViewForm:141`) |
| `addNewZone(shape, panTo, withEvent)` | `addShape(shape, { silent: !withEvent })` + `fitBounds` si `panTo` | 2 |
| `map.getBounds()` | `engine.getView().bounds` | 5 |
| `map.getDiv()` | `useMapContext().overlay` | 2 |
| `map.getZoom()` | `camera.getZoom()` | 2 |
| `disableEditing()` | `useDrawing().clearSelection()` | 1 |
| `getLastZone()` + `setLastZoneOptions(o)` | `getLastShape()` + `updateShape(id, { meta, style })` | 1 |
| `addZones(shapes, extendBounds)` | `replaceShapes(shapes)` (+ `fitBounds`) | 1 |
| `removeZone(s)` / `removeZoneUuid(uuid)` | `removeShape(id, { silent })` | 2 |
| `getLimitsZones`, `removeZoneId`, `updateZoneUuid`, `replaceZones` | — | **0 appel, ne pas porter** |
| `clearZones`, `clearLastZone`, `setZoneColor`, `getZoneColor`, `setOpacityLimitsZones`, `setDrawingMode`, `resetMapPosition` | — | **`MapTools` abandonné, cf. §6** |

### Le flag `withEvent`

Quatre appels passent `withEvent: false` pour muter **sans** déclencher leurs propres
events (sinon boucle avec les mutations GraphQL). L'équivalent est `{ silent: true }` :

```ts
map.clearZones(false)                  → replaceShapes([], { silent: true })
map.addNewZone(zone, true, false)      → addShape(zone, { silent: true })
map.removeZone(zone, false)            → removeShape(id, { silent: true })
map.removeZoneUuid(uuid, false)        → removeShape(uuid, { silent: true })
```

---

## 3. Correspondance des props

| Ancien | map3d | Sites |
|---|---|---|
| `onMapLoad(map)` — pour le ref | `useMap()`, disponible dès le montage | 7 |
| `onMapLoad(map)` — pour gater un cadrage | `<Map onReady>` ou `useMapEvents({ onReady })` | |
| `markersList` | `<MarkerLayer points>` | 4 |
| `addZones` | `<ShapeLayer shapes>` (lecture) ou `<DrawLayer value>` (édition) | 4 |
| `traces` | `<PathLayer paths>` + `<MarkerLayer>` pour les points (cf. §5) | 3 |
| `focusPosition` + `focusRadius` | `camera.fitBounds(boundsOfCircle(p, radius))` | 2 |
| `addLimitsZones` | `<DrawLayer constraints={{ limits }}>` **et** `<ShapeLayer shapes={limits}>` pour l'affichage | 2 |
| `onZonesUpdate` | `<DrawLayer onChange>` | 2 |
| `focusMarker` | `<MarkerLayer selectedId>` — **exempté du filtre par tags** | 2 |
| `anchorPosition` + `anchorLabel` | `<MapControls target={{ position, label, onlyWhenOutOfView: true, zoom: 16 }}>` | 2 |
| `slots.top` | enfants de `<Map>` | 2 |
| `staticMap` | `<Map interactive={false}>` (ou `'view'` pour garder les clics markers) | 1 |
| `disabled` | aucune API — l'hôte garde son handler clavier | 1 |
| `maxAreaM2` | `<DrawLayer constraints={{ maxAreaM2 }} onReject>` | 1 |
| `editZones={false}` | ne pas exposer l'outil sélection (`<Toolbar tools={[…]}>`) | 1 |
| `clusterConfig={{ radius, maxZoom }}` | `<MarkerLayer cluster={{ enabled: true, radius, maxZoom }}>` | 1 |
| `categoryFilterCacheKey` | `<Map tagStorageKey>` | 1 |
| `onViewportChange` | `<Map onViewportChange>` (identique) | 1 |
| `traffix` | `engine.setTrafficVisible(true)` / bouton `traffic` de `MapControls` | 1 |
| `onZoneAdd` / `onZoneUpdate` / `onZoneDelete` | `onShapeAdd` / `onShapeUpdate` / `onShapeDelete` | 1 |
| `onZoneEdit` (double-clic) | `onShapeEdit` | 1 |
| `defaultCenter` / `defaultZoom` | `<Map center zoom>` | 2 / 1 |
| `minZoom` | `camera.maxAltitude = altitudeForZoom(minZoom)` | 1 |
| **`Zones`, `onZoneClick`, `noCollisionAllowed`, `filterVersion`, `strokeColor`, `strokeWeight`, `onShareEditing`** | — | **0 appel : code mort, ne rien porter** |
| `scrollwheel` | pas d'équivalent isolé — `interactive` coupe tout ensemble | 1, à trancher |

### Type `Marker` → `MarkerData`

| Ancien | map3d |
|---|---|
| `latitude` / `longitude` | `position: { lat, lng }` |
| `icon` / `markerContent` | `icon: (p) => svg` |
| `html` + `infoHeader` | `tooltip: (p) => ({ content, title })` — ReactNode typé, plus d'`innerHTML` |
| `category` | `tags: string[]` |
| `selected` | `selectedId` sur la couche |
| `selectedColor` | `MarkerData.selectedColor` |
| `zIndex` | `MarkerData.zIndex` |
| `onClick` | `onSelect` |

---

## 4. Correspondance des events

| Ancien | map3d |
|---|---|
| `map.addListener('idle')` | `engine.on('viewport')` — **sur-ensemble** : couvre aussi zoom, rotation et vol |
| `dragend` | idem (aucun appelant ne l'utilisait) |
| `mousedown/mousemove/mouseup/click/dblclick` de `useMapDrawing` | remplacés par `<DrawLayer>` — **rien à porter** |
| `radius_changed`, `bounds_changed` sur les formes | `onShapeUpdate` |
| `gmp-click` sur marker | `onSelect` |
| `closeclick` d'InfoWindow | sans objet (infobulle au survol) |

---

## 5. Traces : le pattern `PathLayer` + `MarkerLayer`

`MapTrace` fait une polyline **plus** un marker par point. En map3d, ce sont deux couches
qui se superposent — les points de trace étant des markers, ils héritent gratuitement du
filtrage par tags, du clustering et de la sélection.

```tsx
const points = trace.map((p, i) => ({
  id: `trace-${i}`,
  type: i === trace.length - 1 ? 'trace-current' : 'trace-point',
  position: { lat: p.latitude, lng: p.longitude },
  zIndex: i === trace.length - 1 ? 10 : 1,   // ancien `zIndex={isLatest ? 10 : 1}`
  data: p,                                    // before / share / createdAt
}))

<PathLayer paths={[{ id: 'trace', points: points.map((p) => p.position) }]} />
<MarkerLayer
  points={points}
  icon={(m) => (m.type === 'trace-current' ? currentSvg() : pointSvg(m.data.before))}
  tooltip={(m) => ({ content: infoContent(m.data) })}   // ancienne InfoWindow
/>
```

Cadrage (ancien auto-fit) : `camera.fitBounds(boundsOfLatLngs(positions))`, ou
`boundsOfCircle(focusPosition, focusRadius)` quand la trace est vide.

---

## 6. Ce qui disparaît

**`MapTools`** est abandonné au profit de la `Toolbar` de map3d. Sept méthodes du ref
n'avaient que lui comme appelant et deviennent donc caduques :

| Méthode | Devenir |
|---|---|
| `setDrawingMode` / `getDrawingMode` | `useDrawing().setTool()` / `.tool` |
| `clearZones` | bouton « Tout effacer » de la `Toolbar` |
| `clearLastZone` | `Ctrl+Z` (undo natif) |
| `setZoneColor` / `getZoneColor` | panneau de style de la `Toolbar`, ou `useDrawSettings().set(tool, { color })` |
| `resetMapPosition` | `engine.flyToTopDown()` / `flyToGlobe()`, ou `<Map positionStorageKey resetStoredPosition>` |
| `setOpacityLimitsZones` | **perte assumée** — le slider d'opacité disparaît ; masquer les limites passe par le filtre « Couches » |

**`useMapDrawing.ts`** (dessin à la main sur les events souris) et **`MapNavigationButtons`**
(remplacé par `MapControls target` + le bouton plein écran natif) n'ont plus lieu d'être.

**`utils/map.ts`** : les prédicats de collision Google (`isShapeOnShape`,
`circlePolygonCollide`…) ne sont plus utiles — `noCollisionAllowed` n'était jamais activé.
`isShapeInLimits` est remplacé par `constraints.limits`. En revanche
`calculateTotalSurface`, `formatArea`, `parsePolygonString` et `isPointInLimit`
**restent** : ils opèrent sur des données brutes, hors carte.

---

## 7. Réglages de `parameters` (ancien `MapConfig` Google)

| Ancien | map3d |
|---|---|
| `mapTypeId` | `engine.setMapMode('3d' \| 'plan')` |
| trafic | `engine.setTrafficVisible(bool)` |
| `zoomControl`, `scrollwheel` | `<MapControls buttons={{ zoomIn, zoomOut }}>` + `<Map interactive>` |
| `tilt` | `engine.tiltBy(rad)` |
| `minZoom` / `maxZoom` | `camera.maxAltitude` / `camera.minGroundClearance` (via `altitudeForZoom`) |
| — | à exposer en plus : `errorTarget` (qualité/perf), `intro`, `positionStorageKey`, `tagStorageKey` |

---

## 8. Ordre de migration conseillé

1. **`ViewShare`** — `traces` + `focusPosition` seulement. Valide le pattern trace de bout
   en bout sur la vue la plus simple.
2. **Les 3 vues `Map3D`** — une seule prop `zones`, `zoneToShape` existe déjà : il ne reste
   qu'à ajouter `extrudeHeight: 200`.
3. **`ViewDangerOverview`, `CardAlertProfile`** — affichage seul.
4. **`FieldLatLngMap`, `parameters/ViewDetail`** — valide `repositionable` / `onReposition`.
5. **`ViewDashboardResumeMap`** — markers, clustering, `staticMap`, filtre par catégories.
6. **`ViewAlertOverview`, `ViewAgents`, `alertEvents/ViewDetailOverview`** — dispatch,
   `MapAgent`, bouton `target`.
7. **`companyZones/ViewDetail` + `selectZones/*` + `map/ViewDetail`** — le CRUD par uuid,
   les contraintes et les limites. **En dernier** : c'est le plus lourd, et il bénéficiera
   de tout ce qui aura été éprouvé avant.

---

## 9. Pièges connus

- **`meta` est remplacée, pas fusionnée** : `updateShape(id, { meta: { ...getShape(id)?.meta, uuid } })`.
- **Les contraintes ne s'appliquent qu'aux gestes utilisateur.** `addShape`, `updateShape`
  et `fromGeoJSON` injectent sans contrôle — c'est voulu.
- **Une édition refusée n'émet pas `onShapeUpdate`** : la forme est restaurée, donc rien
  n'a changé du point de vue de l'hôte. Seul `onReject` prévient.
- **`fitBounds` borne à 350 m par défaut** (héritage « recherche de lieu ») : passer
  `minAltitude` plus bas pour cadrer une trace courte ou un groupe de markers resserré.
- **`onReady` ne tire qu'une fois**, mais un abonné tardif le reçoit quand même.
- **`interactive` fige la carte, pas l'UI** : masquer les boutons devenus inutiles avec
  `MapControls buttons`.
- **`extrudeHeight` ne s'applique qu'aux formes fermées**, et `width` ne s'applique plus à
  une forme extrudée (ses arêtes sont des lignes de 1 px).

---

## 10. Ce qui reste à vérifier avant de s'engager

**Aucune des API livrées n'a été contrôlée dans un navigateur.** Typecheck et build sont
verts, ce qui ne dit rien du rendu ni des gestes. Deux défauts réels ont déjà été trouvés
par capture d'écran (volume flottant au-dessus du sol, menu illisible) — aucun des deux
n'aurait été attrapé autrement.

À éprouver en priorité : le suivi d'un marker repositionnable en vue inclinée, le cadrage
avec padding asymétrique, la règle CSS du mode inerte, le refus de contrainte à l'édition
(la forme « saute » à sa position d'avant), et la stabilité de la base des volumes au pan.

`utils/map.ts` (962 lignes) n'a été audité que par l'usage de ses fonctions, pas ligne à
ligne : les convertisseurs de formes (`parseCircleToData`, `converseShapeMapToShape`,
`getShapeCenter`) sont les candidats les plus probables à un écart de comportement subtil.

# BLOQUANT 2 — Cadrage sur bounds et recentrage caméra

> Statut : implémenté. `pnpm typecheck` vert (lib + exemple).

## Le besoin

L'audit de l'Operator a corrigé la priorité annoncée par le prompt. Le volume réel :

| Méthode | Appels | Sites |
|---|---|---|
| `setZoom` | **12** | MapAgent, MapNavigationButtons, useFollowAgentOnMap, ResumeMap, alertEvents, parameters ×4 |
| `fitBounds` | **9** | MapNavigationButtons ×2, MapTrace ×4, ResumeMap, alertEvents, companyZones |
| `setCenter` | **9** | MapAgent, FieldLatLngMap ×2, ResumeMap ×2, alertEvents, parameters ×3 |
| `panTo` | **6** | MapNavigationButtons ×2, useFollowAgentOnMap ×2, map/ViewDetail, parameters |
| `extendBoundsWithZones` | **4** | ZonesRestrictions, SelectZone, SelectZoneGeographical, ViewForm |

Le trio de recentrage pèse **27 appels**, contre 9 pour `fitBounds`. Le prompt ne
mentionnait que `fitBounds`.

## Ce qui a été livré

### `src/core/bounds.ts` (nouveau)

`altitudeForBounds` et `lngSpanDeg` étaient **privés dans `SearchBox.tsx`**. Extraits
plutôt que réécrits — `SearchBox` importe désormais la version partagée, son
comportement est inchangé (mêmes défauts).

```ts
lngSpanDeg(b): number
centerOfBounds(b): LatLng
altitudeForBounds(b, { margin?, minAltitude?, maxAltitude? }): number
boundsOfLatLngs(points): Bounds | null
unionBounds(list): Bounds | null
boundsOfCircle(center, radiusMeters): Bounds
```

**Les bornes sont devenues paramétrables.** `[350 m, 6000 km]` vient du cas « recherche
de lieu », où descendre sous 350 m n'a pas de sens. Appliqué tel quel à `fitBounds`, une
trace GPS de 200 m resterait cadrée trop haut — une régression face au `fitBounds` de
Google. Les défauts sont conservés, seul l'appelant qui en a besoin les abaisse.

**Antiméridien traité partout.** `boundsOfLatLngs` déroule les longitudes sur un axe
continu depuis le premier point avant de renormaliser : sans ça, deux points de part et
d'autre de ±180° produiraient un cadre faisant le tour du globe. `centerOfBounds` respecte
la même convention (`east < west` = franchissement).

**Coordonnées non finies écartées.** Un seul `NaN` empoisonnerait tout le cadre et la
caméra viserait le néant ; `boundsOfLatLngs` renvoie `null` si rien d'exploitable.

### Agrégateurs, placés près de leurs types

`boundsOfShape` / `boundsOfShapes` dans `layers/ShapeLayer.ts`, `boundsOfMarkers` dans
`data/types.ts` — plutôt que dans `core/bounds.ts`, pour ne pas faire dépendre le core
des couches.

`boundsOfShapes` couvre `extendBoundsWithZones`. Sa contrepartie « retourne le centre »
est `centerOfBounds(boundsOfShapes(zones))` — `ViewForm.tsx:141` en a besoin
(`center.current = map.extendBoundsWithZones(zones, 1)`).

`boundsOfMarkers` accepte `Iterable<{ position: LatLng }>` et **pas** `MarkerData<T>` : le
générique n'apporte rien (seule la position compte) et forçait l'appelant à annoter des
listes hétérogènes dont `T` s'infère mal.

### Caméra

```ts
camera.fitBounds(bounds, { padding?, duration?, margin?, minAltitude?, maxAltitude? })
camera.setCenter(p)                    // instantané, altitude conservée
camera.panTo(p, opts?)                 // animé, altitude conservée
camera.setZoom(zoom, opts?)            // échelle Google (0 = monde, ~20 = rue)
camera.getZoom()
```

Tout est repris dans `useCamera()`.

**`padding` accepte les deux formes réelles** : un nombre (`fitBounds(bounds, 50)` dans
`MapNavigationButtons` et `MapTrace`) et l'objet `{top,right,bottom,left}`
(`ResumeMap:193`, `alertEvents:189`).

Il agit en deux temps :

1. il réduit la surface utile, donc recule la caméra (`zoomOut = max(W/usableW, H/usableH)`) ;
2. quand il est **asymétrique**, il décale le centre visé — le contenu se centre dans la
   zone restée visible, pas dans le viewport entier.

Le décalage se calcule à partir de l'altitude **visée**, pas de la position actuelle : en
vue nadir la hauteur au sol couverte vaut `2·altitude·tan(fov/2)`, ce qui donne la
résolution sans dépendre d'où la caméra se trouve au moment de l'appel.

Les deux sites réels passent un padding symétrique, où ce décalage est nul. Il est
implémenté quand même : l'API promet `{top,right,bottom,left}`, et l'ignorer serait un bug
silencieux le jour où un panneau latéral apparaît.

Un padding plus large que le viewport est ramené à une bande minimale plutôt que de
diviser par ~0.

`fitBounds` passe par `clampAltitude`, donc hérite du plancher « sol réel + garde » et du
plafond `maxAltitude` comme tous les autres mouvements.

## Correspondance avec l'ancienne API

| Ancienne carte | map3d |
|---|---|
| `map.fitBounds(bounds, 50)` | `camera.fitBounds(bounds, { padding: 50 })` |
| `map.fitBounds(bounds, {top,right,bottom,left})` | `camera.fitBounds(bounds, { padding: {…} })` |
| `map.setCenter(p)` | `camera.setCenter(p)` |
| `map.panTo(p)` | `camera.panTo(p)` |
| `map.setZoom(16)` | `camera.setZoom(16)` |
| `map.getZoom()` | `camera.getZoom()` — ou `zoomForAltitude(state.altitude)` |
| `map.getBounds()` | `engine.getView().bounds` |
| `extendBoundsWithZones(shapes, padding)` | `camera.fitBounds(boundsOfShapes(shapes), { padding })` |
| valeur de retour d'`extendBoundsWithZones` | `centerOfBounds(boundsOfShapes(shapes))` |
| `LatLngBoundsShapes(shapes)` (utils/map.ts) | `boundsOfShapes(shapes)` |
| bounds autour d'un point (`focusRadius` de MapTrace) | `boundsOfCircle(p, radiusMeters)` — ou `boundsAround`, déjà exporté |

## Critères d'acceptation

- [x] `fitBounds` cadre markers et formes avec padding, en 3D.
- [x] `SearchBox` continue de fonctionner, sur la version exportée (comportement inchangé).
- [x] `pnpm typecheck` vert.
- [x] Exemple : 4 boutons en bas à gauche — cadrage sur markers (avec `minAltitude`
      abaissé), cadrage sur formes **avec padding asymétrique** simulant un panneau de
      320 px, `setZoom(12)`, `panTo` conservant l'altitude.

## Non vérifié

Le rendu visuel du cadrage n'a pas été contrôlé dans un navigateur — `pnpm dev:example`
n'a pas été lancé. Le décalage asymétrique en particulier mérite un coup d'œil.

# Moteur — le niveau bas

**Français** · [English](../en/ENGINE.md) · [↑ Index](README.md)

Ce que `<Map>` monte, ce que les couches consomment, et par où passer quand l'API
React ne suffit pas.

À lire si vous écrivez une **couche custom**, si vous intégrez map3d **hors React**, ou
si vous voulez comprendre pourquoi certaines API de haut niveau sont faites ainsi.

---

## 1. `MapEngine`

Scène Three, `TilesRenderer` (Google Photorealistic 3D Tiles ou tileset custom),
`GlobeControls` (navigation façon Google Earth), globe ellipsoïde de repli, boucle de
rendu.

Le repère est **géocentrique (ECEF)** : c'est ce qui **ancre** markers et formes à leur
coordonnée géographique, au lieu de les recaler par frame.

```ts
const engine = useMap()   // ou map.current?.engine
```

### Membres publics

| Membre | Rôle |
|---|---|
| `scene`, `threeCamera`, `renderer`, `labelRenderer` | Three brut |
| `tiles`, `controls` | `TilesRenderer` et `GlobeControls` |
| `camera` | le contrôleur `Camera` (vols, cadrage, suivi) — cf. [CAMERA.md](CAMERA.md) |
| `projection` | conversions géo ↔ monde ↔ écran, hauteurs de terrain |
| `overlayAnchor` | groupe parent des overlays DOM ancrés (markers) |
| `annotations` | groupe parent des couches drapées — **hérite du masquage pendant l'intro** |
| `tags` | filtre par tags partagé (`TagFilter`) |
| `search` | registre de recherche (`SearchRegistry`) |
| `markers` | inventaire des markers (`MarkerRegistry`) |
| `clusters` | registre de regroupement (`ClusterRegistry`) — alimenté par les couches, consommé par `<ClusterSurface>` |
| `selectables` | registre des sélectionnables au marquee |
| `drag` | registre du drag-and-drop (`DragRegistry`) |
| `ready` | booléen synchrone (cf. [CAMERA.md § 2](CAMERA.md#2--la-carte-est-prête--ready)) |
| `interactive` | mode courant (`true` \| `'view'` \| `false`) |

### Méthodes

```ts
engine.addLayer(layer) / engine.removeLayer(layer)
engine.setConfig(config)
engine.setInteractive(mode)
engine.setDrawing(active) / engine.setDrawingSuspended(suspended)
engine.setMapMode('3d' | 'plan') / engine.getBasemap() / engine.setTrafficVisible(v)
engine.flyToTopDown() / engine.flyToGlobe() / engine.tiltBy(step)
engine.setDragMode('pan' | 'rotate') / engine.getDragMode()
engine.getView()                                     // { center, zoom, bounds }
engine.pickLatLngAtClient(clientX, clientY, fallbackToEllipsoid?)
engine.terrainHeight
engine.start() / engine.stop() / engine.setSize(w, h) / engine.dispose()
```

`pickLatLngAtClient` est le pont entre un `PointerEvent` et une coordonnée : raycast
sur le terrain, repli optionnel sur l'ellipsoïde si le pointeur sort du globe.

---

## 2. Events

```ts
const off = engine.on('viewport', (view) => refetch(view.bounds))
```

| Event | Charge | Cadence |
|---|---|---|
| `camera` | `CameraState` | **chaque mouvement** — pas de réseau ici |
| `viewport` | `MapView` | après stabilisation |
| `click` | `{ latLng, originalEvent }` | clic sur la carte |
| `dragmode` | `'pan' \| 'rotate'` | changement de mode |
| `basemap` | `{ mode, traffic, canPlan, can3d, trafficAvailable }` | changement de fond **ou de capacités** |
| `ready` | `MapEngine` | **une seule fois**, rejoué pour qui s'abonne après coup |

Version React : `useMapEvents({ onClick, onCameraChange, onViewportChange, onReady })`.

### `BasemapState` — l'état du fond ET ses capacités

`basemap` ne dit pas seulement ce qui est affiché, mais ce qui est **possible** : les
fournisseurs de tuiles n'offrent pas les mêmes options (cf. [TILES.md](TILES.md)). Une UI
lit ces drapeaux plutôt que de redériver la règle — c'est ainsi que `<MapControls>` retire
le bouton trafic là où il n'aurait rien à allumer.

| Champ | Sens |
|---|---|
| `mode` | `'plan'` (carte plate) ou `'3d'` (volume) |
| `traffic` | calque trafic allumé |
| `canPlan` | une carte plate est servable : clé Google en `external`, `origin` en `internal`. Sans elle, le groupe de boutons du fond n'a rien à proposer |
| `can3d` | du volume est servable : tileset photoréaliste en `external`, relief/bâtiments en `internal`. **Informatif** — ne masque aucun bouton |
| `trafficAvailable` | trafic proposable : fournisseur **externe**, fond 2D présent, hors mode 3D |

`engine.supportsBasemap2d` reste disponible : c'est l'alias historique de `canPlan`.
`setMapMode('plan')` sans `canPlan`, comme `setTrafficVisible(true)` sans
`trafficAvailable`, sont **sans effet** — un état accepté sans rien à l'écran vaut moins
qu'un refus net.

---

## 3. Écrire une couche

```ts
interface Layer {
  update(ctx: FrameContext): void    // avance l'état 3D (géométrie)
  project(ctx: FrameContext): void   // écrit les overlays DOM — passe d'ÉCRITURE pure
  dispose(): void
  setConfig?(config: MapConfig): void
  setGrounded?(grounded: boolean): void  // caméra au ras du sol (mode piéton)
}

type FrameContext = {
  camera: THREE.PerspectiveCamera
  cameraState: CameraState
  projection: Projection
  view: MapView
  size: { width: number; height: number }
  dt: number                          // secondes depuis la frame précédente
}
```

La séparation `update` / `project` n'est pas cosmétique : **toutes les lectures de
layout se font en `update`, toutes les écritures en `project`**. Les mélanger provoque
un layout thrashing dès qu'il y a plus d'une poignée d'overlays.

`setConfig` est diffusé **par le moteur** (à l'ajout, puis à chaque `setConfig`), et
non par un wrapper React : câblé côté React, l'effet de l'enfant s'exécuterait avant
celui du parent qui pose la nouvelle config — la couche lirait donc l'ancienne, sans
que sa dépendance rebouge.

`setGrounded` emprunte le même canal, à l'entrée et à la sortie du mode piéton. Ce n'est
pas un réglage mais un **état de vue** : il change avec la caméra, pas avec ce que l'hôte
demande. Une couche qui drape des annotations plates s'en sert pour décider leur test de
profondeur — vue du ciel une forme au sol se dessine par-dessus le relief, sinon elle
serait occluse et invisible ; à hauteur d'homme on est *dedans*, et la même règle lui
ferait recouvrir tout l'écran.

⚠️ Cet état se relit **à chaque construction de géométrie**, jamais une fois pour toutes :
un drape peut être reconstruit à tout instant par le resettle LOD, et il renaîtrait avec
le mauvais réglage. Retoucher les matériaux déjà en scène ne suffit donc pas.

### Le montage React

```tsx
export function MaCouche({ items }: Props) {
  const engine = useMap()
  const layerRef = useRef<MaCoucheCore | null>(null)

  useEffect(() => {
    const layer = new MaCoucheCore(engine.annotations, engine.projection)
    engine.addLayer(layer)
    layerRef.current = layer
    return () => {
      engine.removeLayer(layer)   // `dispose()` est appelé par le moteur
      layerRef.current = null
    }
  }, [engine])

  useEffect(() => {
    layerRef.current?.setItems(items)
  }, [items])

  return null   // une couche ne rend rien : elle pilote la scène
}
```

`engine.addLayer` / `removeLayer` sont le contrat public. `<ShapeLayer>` et
`<PathLayer>` passent en interne par deux helpers (`useLayer`, `useLayerSync`) qui
factorisent ce patron ; ils **ne sont pas exportés** — recopiez les deux effets.

### Si la couche est drapée au sol

En interne, la lib mutualise le protocole dans `DrapedLayer` (mémoïsation des hauteurs,
raffinement LOD par lots, rebuild à la bande d'épaisseur, réapplication des bases au
rebase, purge des drapes invalides) — mais **cette classe n'est pas exportée** : on ne
peut pas en hériter depuis l'extérieur.

Ce qui l'est, et qui en porte le morceau difficile : **`AnchorHeightCache`** — raycast
amorti, retentative des tuiles absentes, invalidation 2D ↔ 3D. Construisez-le avec
`(projection, config.performance.resettle.retryFrames)` et interrogez-le par frame
plutôt que de raycaster vous-même.

---

## 4. `Projection`

| Méthode | Rôle |
|---|---|
| `latLngToWorld(p, out?, height?)` / `worldToLatLng(v)` | géo ↔ monde |
| `worldToScreen(v, camera, out?)` | monde → écran (`{ sx, sy, z }`) |
| `worldNormal(p, out?)` | normale à la surface |
| `pickLatLng(x, y, camera)` / `pickEllipsoidLatLng(x, y, camera)` | écran → géo (terrain / ellipsoïde) |
| `pickHeight(x, y, camera)` / `heightAtWorld(v)` | hauteur sous un point |
| `resolveAnchorHeight(p)` | hauteur d'ancre, `null` si non résolue |
| `sampleGroundHeight(p, radius?)` / `sampleSurfaceHeight(p, maxDrop?)` | échantillonnage du sol |
| `metersPerPixel(p, camera, viewportH, height?)` | résolution — c'est ce qui convertit une épaisseur px → mètres |
| `groundDistance(a, b)` | distance au sol |
| `getENUAxes(...)` / `enuBasis(...)` / `enuBasisFor(anchor, out, height?)` | repère local |
| `isAboveHorizon(worldPos, cameraPos)` | occlusion par le globe |
| `isReady()` | la projection résout des hauteurs |

`EnuFrame` est la façade pratique : `frame.local(latLng)` / `frame.toLatLng(pt)` /
`frame.group()`.

---

## 5. Les registres

Le même patron partout : **une couche s'inscrit comme fournisseur, un consommateur
interroge sans connaître aucune couche.** C'est ce qui permet à des éléments créés à
l'exécution (formes dessinées, symboles posés) d'être cherchables, sélectionnables et
inventoriables sans que `<Map>` ait à les inventorier.

| Registre | Fournisseur | Consommateur |
|---|---|---|
| `engine.tags` | couches (`report(source, counts)`) | panneau « Couches », filtrage |
| `engine.clusters` | couches de markers (`ClusterContributor`) | `<ClusterSurface>` — l'index de regroupement **unique de la carte** |
| `engine.search` | couches (`register` + `report`) | `<SearchBox>` |
| `engine.markers` | couches de markers | outil loupe, moteur de relations |
| `engine.selectables` | couches de markers, couches custom | marquee de l'outil sélection |
| `engine.drag` | `useDraggable` / `useDropZone` | l'état du geste lui-même |

### `MarkerRegistry` (`engine.markers`)

```ts
type MarkerProvider = {
  markersInBounds?(bounds: Bounds): MarkerData[]
  markerById?(id): MarkerData | null
  visualNodeOf?(id): VisualNode | null   // le cluster qui agrège ce marker, ou lui-même
}
```

Les trois méthodes sont **facultatives** : un fournisseur ne déclare que ce qu'il sait.
`<ClusterSurface>` ne connaît aucune donnée source mais est seule à savoir quelle
pastille agrège quoi, et ne déclare donc que `visualNodeOf`.

`visualNodeOf` répond depuis l'état de clustering **déjà calculé** : interroger ne
déclenche aucun recompute et ne change jamais le zoom. C'est ce qui permet aux liens de
relation de viser un cluster sans l'éclater.

### `ClusterRegistry` (`engine.clusters`)

```ts
type ClusterContributor = {
  key: string                              // clé STABLE de la couche (`useId()`)
  points(): readonly MarkerData[]          // ce que la couche afficherait
  idOf(m: MarkerData): string | number     // sa clé, telle que la couche la voit
  place(placement: ClusterPlacement): void // ce qu'elle doit poser, et où
}
```

Le contrat tient en deux gestes : la couche **donne** ses points, et **pose** ce que la
surface lui rend (`absorbed` : agrégés dans une pastille, à ne pas poser ; `moved` :
décollés par l'éventail). Elle ne connaît ni les autres couches, ni les pastilles.

`key` préfixe les uid du registre : deux couches peuvent porter le même id métier, et un
rang attribué à l'inscription changerait à chaque remontage — donc tous les uid, le cache
de feuilles de l'index et les clés DOM des pastilles. `place` n'est appelée que lorsque
le placement de CETTE couche a réellement changé.

### `SelectableRegistry` (`engine.selectables`)

```ts
type SelectableProvider = {
  screenItems(): { id, x, y }[]
  setSelected(ids: ReadonlySet<string | number>): void
  info(id): { type: string } | null
}
```

Branchez-y votre propre couche pour la rendre sélectionnable au marquee.
`itemsChanged()` signale une modification (prune de la sélection).

### `DragRegistry` (`engine.drag`)

Source de vérité du drag-and-drop : zones (`registerZone`), acceptation
(`acceptsAny(payload)`), phase du geste, `onZonesChange`. Piloté par la couche React —
`useDraggable`, `useDropZone`, `useMapDropZone`.

---

## 6. Interception de pointeur

Un outil (dessin, loupe) s'arme en posant un `PointerInterceptor` sur le moteur :

```ts
type PointerInterceptor = (phase: 'down' | 'move' | 'up', event: PointerEvent) => boolean
```

Rendre `true` **consomme** l'événement : la caméra ne bouge pas. C'est ce qui rend le
dessin et la loupe **mutuellement exclusifs** — il n'y a qu'un intercepteur.

`setDrawingSuspended(true)` le neutralise temporairement : c'est ce que fait la barre
espace (pan caméra pendant un tracé, qui reprend exactement où il en était).

En mode figé (`interactive` ≠ `true`), l'intercepteur n'est plus appelé du tout.

### Molette

```html
<div data-m3d-wheel-surface>…</div>
```

`WHEEL_SURFACE_ATTR` marque une **surface carte** : un overlay au-dessus du canvas dont
la molette doit zoomer la carte (markers, marquee, zone de la loupe). Les barres et
panneaux ne le portent pas — leur molette ne zoome pas.

C'est une **donnée portée par l'élément**, pas une liste de classes connue du moteur :
une nouvelle surface se déclare elle-même, sans toucher au core, et renommer une classe
CSS ne casse rien.

---

## 7. Utilitaires transverses

| Export | Rôle |
|---|---|
| `MapMath` | `altitudeForZoom`, `zoomForAltitude`, `clamp`, `metersPerPixelAt`, easings… |
| `CAMERA_FOV`, `TILE_SIZE` | constantes à source unique |
| `fetchWithPolicy(url, init, policy)` / `HttpError` | timeout, réessais, backoff exponentiel **jitteré** |
| `setGeometryWarner(fn \| null)` | rediriger (ou couper) les avertissements de géométrie |
| `injectStyles()`, `themeToVars()`, `configToVars()`, `tilesFilterCss()` | feuille de styles et variables CSS |
| `svgToDataUri(svg)` | SVG → data-URI, idempotent |
| `boundsContains(bounds, p)` | test d'appartenance à un cadre géo |
| `resolveLocale()` / `resolveRegion()` | 🌍 résolution de `'auto'` en locale/région effectives |
| `DEFAULT_STROKE_OPACITY`, `MEASURE_STROKE_OPACITY` | opacités de trait de référence |

**Sur `setGeometryWarner`** : les géométries dont les coordonnées ne sont pas finies
sont écartées et signalées **une fois par origine**. Redirigez-les vers le journal de
votre application, ou coupez-les (`null`) — une lib n'a pas à écrire d'autorité dans la
console de l'application.

**Sur `fetchWithPolicy`** : réessayer sans attendre est ce qu'il ne faut pas faire face
à un serveur en difficulté — les trois tentatives partent dans la même poignée de
millisecondes, frappent l'incident qui n'a pas eu le temps de passer, et n'ont
pratiquement aucune chance de réussir là où la première a échoué, pour trois fois le
coût. D'où le backoff doublé et jitteré (`config.providers.*.fetch`).

---

## 8. Sans React

Le core est utilisable seul : `MapEngine`, `Camera`, `Projection`, `TagFilter`,
`ShapeLayer`, `PathLayer`, `DrawLayer`, `ClusterEngine`, `RelationEngine`,
`ViewportController`, `SearchRegistry`. Aucun de ces modules n'importe React.

Le moteur de relations en particulier est publié **avec son contrat**, pas seulement
son composant : il tourne côté serveur ou en test avec un fournisseur factice (ni
Three, ni React, ni `fetch`).

---

## Voir aussi

- [HOOKS.md](HOOKS.md) — les façades React de tout ceci
- [CAMERA.md](CAMERA.md) — `Camera`, events de vue, fond de carte
- [CONFIG.md](CONFIG.md) — tous les budgets et seuils cités ici
- [ZONES.md](ZONES.md) — `DrapedLayer` en pratique

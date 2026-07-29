# Engine — the low level

[Français](../fr/ENGINE.md) · **English** · [↑ Index](README.md)

What `<Map>` mounts, what the layers consume, and where to go when the React API is not
enough.

Read this if you are writing a **custom layer**, integrating map3d **outside React**, or
want to understand why some of the high-level APIs are shaped the way they are.

---

## 1. `MapEngine`

Three scene, `TilesRenderer` (Google Photorealistic 3D Tiles or a custom tileset),
`GlobeControls` (Google Earth-style navigation), fallback ellipsoid globe, render loop.

The frame is **geocentric (ECEF)**: that is what **anchors** markers and shapes to their
geographic coordinate, instead of re-aligning them every frame.

```ts
const engine = useMap()   // or map.current?.engine
```

### Public members

| Member | Role |
|---|---|
| `scene`, `threeCamera`, `renderer`, `labelRenderer` | raw Three |
| `tiles`, `controls` | `TilesRenderer` and `GlobeControls` |
| `camera` | the `Camera` controller (flights, framing, follow) — see [CAMERA.md](CAMERA.md) |
| `projection` | geo ↔ world ↔ screen conversions, terrain heights |
| `overlayAnchor` | parent group of anchored DOM overlays (markers) |
| `annotations` | parent group of draped layers — **inherits the intro masking** |
| `tags` | shared tag filter (`TagFilter`) |
| `search` | search registry (`SearchRegistry`) |
| `markers` | marker inventory (`MarkerRegistry`) |
| `clusters` | grouping registry (`ClusterRegistry`) — fed by the layers, consumed by `<ClusterSurface>` |
| `selectables` | registry of marquee-selectable items |
| `drag` | drag-and-drop registry (`DragRegistry`) |
| `ready` | synchronous boolean (see [CAMERA.md § 2](CAMERA.md#2-the-map-is-ready-ready)) |
| `interactive` | current mode (`true` \| `'view'` \| `false`) |

### Methods

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

`pickLatLngAtClient` is the bridge between a `PointerEvent` and a coordinate: a raycast
against the terrain, with an optional ellipsoid fallback when the pointer leaves the
globe.

---

## 2. Events

```ts
const off = engine.on('viewport', (view) => refetch(view.bounds))
```

| Event | Payload | Rate |
|---|---|---|
| `camera` | `CameraState` | **every move** — no network here |
| `viewport` | `MapView` | after settling |
| `click` | `{ latLng, originalEvent }` | click on the map |
| `dragmode` | `'pan' \| 'rotate'` | mode change |
| `basemap` | `{ mode, traffic, canPlan, can3d, trafficAvailable }` | basemap **or capability** change |
| `ready` | `MapEngine` | **once only**, replayed for late subscribers |

React version: `useMapEvents({ onClick, onCameraChange, onViewportChange, onReady })`.

### `BasemapState` — basemap state AND capabilities

`basemap` reports not only what is displayed, but what is **possible**: tile providers do
not offer the same options (see [TILES.md](TILES.md)). A UI reads these flags instead of
re-deriving the rule — that is how `<MapControls>` drops the traffic button where it would
have nothing to switch on.

| Field | Meaning |
|---|---|
| `mode` | `'plan'` (flat map) or `'3d'` (volume) |
| `traffic` | traffic layer on |
| `canPlan` | a flat map is servable: Google key with `external`, `origin` with `internal`. Without it the basemap button group has nothing to offer |
| `can3d` | volume is servable: photorealistic tileset with `external`, terrain/buildings with `internal`. **Informational** — hides no button |
| `trafficAvailable` | traffic offerable: **external** provider, 2D basemap present, not in 3D mode |

`engine.supportsBasemap2d` is still available: it is the historical alias of `canPlan`.
`setMapMode('plan')` without `canPlan`, like `setTrafficVisible(true)` without
`trafficAvailable`, are **no-ops** — a state accepted with nothing on screen is worth less
than a clean refusal.

---

## 3. Writing a layer

```ts
interface Layer {
  update(ctx: FrameContext): void    // advances the 3D state (geometry)
  project(ctx: FrameContext): void   // writes the DOM overlays — a pure WRITE pass
  dispose(): void
  setConfig?(config: MapConfig): void
  setGrounded?(grounded: boolean): void  // camera at ground level (pedestrian mode)
}

type FrameContext = {
  camera: THREE.PerspectiveCamera
  cameraState: CameraState
  projection: Projection
  view: MapView
  size: { width: number; height: number }
  dt: number                          // seconds since the previous frame
}
```

The `update` / `project` split is not cosmetic: **all layout reads happen in `update`,
all writes in `project`**. Mixing them causes layout thrashing as soon as there are more
than a handful of overlays.

`setConfig` is broadcast **by the engine** (on add, then on every `setConfig`), not by a
React wrapper: wired React-side, the child's effect would run before the parent's effect
that sets the new config — so the layer would read the old one, without its dependency
ever moving.

`setGrounded` uses the same channel, on entering and leaving pedestrian mode. It is not a
setting but a **view state**: it changes with the camera, not with what the host asks for.
A layer that drapes flat annotations uses it to decide their depth test — seen from above,
a ground-level shape draws over the terrain, otherwise it would be occluded and invisible;
at eye level you are *inside* it, and the same rule would make it cover the whole screen.

⚠️ Read this state **on every geometry build**, never once and for all: a drape can be
rebuilt at any moment by the LOD resettle, and it would come back with the wrong setting.
Patching the materials already in the scene is therefore not enough.

### Mounting it from React

```tsx
export function MyLayer({ items }: Props) {
  const engine = useMap()
  const layerRef = useRef<MyLayerCore | null>(null)

  useEffect(() => {
    const layer = new MyLayerCore(engine.annotations, engine.projection)
    engine.addLayer(layer)
    layerRef.current = layer
    return () => {
      engine.removeLayer(layer)   // `dispose()` is called by the engine
      layerRef.current = null
    }
  }, [engine])

  useEffect(() => {
    layerRef.current?.setItems(items)
  }, [items])

  return null   // a layer renders nothing: it drives the scene
}
```

`engine.addLayer` / `removeLayer` are the public contract. `<ShapeLayer>` and
`<PathLayer>` internally go through two helpers (`useLayer`, `useLayerSync`) that
factor this pattern out; they are **not exported** — copy the two effects.

### If the layer is ground-draped

Internally the library factors the protocol into `DrapedLayer` (height memoisation,
batched LOD refinement, rebuilding on the width hysteresis band, reapplying bases on
rebase, purging stale drapes) — but **that class is not exported**: it cannot be
subclassed from outside.

What *is* exported, and carries the hard part: **`AnchorHeightCache`** — throttled
raycasting, retries for missing tiles, 2D ↔ 3D invalidation. Build it with
`(projection, config.performance.resettle.retryFrames)` and query it per frame instead
of raycasting yourself.

---

## 4. `Projection`

| Method | Role |
|---|---|
| `latLngToWorld(p, out?, height?)` / `worldToLatLng(v)` | geo ↔ world |
| `worldToScreen(v, camera, out?)` | world → screen (`{ sx, sy, z }`) |
| `worldNormal(p, out?)` | surface normal |
| `pickLatLng(x, y, camera)` / `pickEllipsoidLatLng(x, y, camera)` | screen → geo (terrain / ellipsoid) |
| `pickHeight(x, y, camera)` / `heightAtWorld(v)` | height under a point |
| `resolveAnchorHeight(p)` | anchor height, `null` if unresolved |
| `sampleGroundHeight(p, radius?)` / `sampleSurfaceHeight(p, maxDrop?)` | ground sampling |
| `metersPerPixel(p, camera, viewportH, height?)` | resolution — this is what converts a px width into metres |
| `groundDistance(a, b)` | ground distance |
| `getENUAxes(...)` / `enuBasis(...)` / `enuBasisFor(anchor, out, height?)` | local frame |
| `isAboveHorizon(worldPos, cameraPos)` | globe occlusion |
| `isReady()` | the projection resolves heights |

`EnuFrame` is the convenient façade: `frame.local(latLng)` / `frame.toLatLng(pt)` /
`frame.group()`.

---

## 5. The registries

The same pattern everywhere: **a layer registers as a provider, a consumer queries
without knowing any layer.** That is what lets elements created at runtime (drawn
shapes, placed symbols) be searchable, selectable and inventoriable without `<Map>`
having to inventory them.

| Registry | Provider | Consumer |
|---|---|---|
| `engine.tags` | layers (`report(source, counts)`) | “Layers” panel, filtering |
| `engine.clusters` | marker layers (`ClusterContributor`) | `<ClusterSurface>` — the map's **single** grouping index |
| `engine.search` | layers (`register` + `report`) | `<SearchBox>` |
| `engine.markers` | marker layers | lens tool, relation engine |
| `engine.selectables` | marker layers, custom layers | the select tool's marquee |
| `engine.drag` | `useDraggable` / `useDropZone` | the gesture state itself |

### `MarkerRegistry` (`engine.markers`)

```ts
type MarkerProvider = {
  markersInBounds?(bounds: Bounds): MarkerData[]
  markerById?(id): MarkerData | null
  visualNodeOf?(id): VisualNode | null   // the cluster aggregating this marker, or itself
}
```

All three methods are **optional**: a provider only declares what it knows.
`<ClusterSurface>` knows no source data but is the only one that knows which chip
aggregates what, so it declares `visualNodeOf` alone.

`visualNodeOf` answers from the **already computed** clustering state: querying triggers
no recomputation and never changes the zoom. That is what lets relation links target a
cluster without bursting it.

### `ClusterRegistry` (`engine.clusters`)

```ts
type ClusterContributor = {
  key: string                              // STABLE key of the layer (`useId()`)
  points(): readonly MarkerData[]          // what the layer would display
  idOf(m: MarkerData): string | number     // its key, as the layer sees it
  place(placement: ClusterPlacement): void // what it must place, and where
}
```

The contract is two gestures: the layer **gives** its points, and **places** what the
surface hands back (`absorbed`: aggregated into a chip, not to be placed; `moved`:
detached by the fan-out). It knows neither the other layers nor the chips.

`key` prefixes the registry's uids: two layers may carry the same business id, and a rank
assigned at registration would change on every remount — hence every uid, the index's leaf
cache and the chips' DOM keys. `place` is called only when THIS layer's placement actually
changed.

### `SelectableRegistry` (`engine.selectables`)

```ts
type SelectableProvider = {
  screenItems(): { id, x, y }[]
  setSelected(ids: ReadonlySet<string | number>): void
  info(id): { type: string } | null
}
```

Plug your own layer in to make it marquee-selectable. `itemsChanged()` signals a change
(pruning the selection).

### `DragRegistry` (`engine.drag`)

The drag-and-drop source of truth: zones (`registerZone`), acceptance
(`acceptsAny(payload)`), gesture phase, `onZonesChange`. Driven by the React layer —
`useDraggable`, `useDropZone`, `useMapDropZone`.

---

## 6. Pointer interception

A tool (drawing, lens) arms itself by setting a `PointerInterceptor` on the engine:

```ts
type PointerInterceptor = (phase: 'down' | 'move' | 'up', event: PointerEvent) => boolean
```

Returning `true` **consumes** the event: the camera does not move. This is what makes
drawing and the lens **mutually exclusive** — there is only one interceptor.

`setDrawingSuspended(true)` neutralises it temporarily: that is what the space bar does
(camera pan during a stroke, which resumes exactly where it was).

In frozen mode (`interactive` ≠ `true`), the interceptor is not called at all.

### Wheel

```html
<div data-m3d-wheel-surface>…</div>
```

`WHEEL_SURFACE_ATTR` marks a **map surface**: an overlay above the canvas whose wheel
must zoom the map (markers, marquee, the lens area). Bars and panels do not carry it —
their wheel does not zoom.

It is **data carried by the element**, not a class list known to the engine: a new
surface declares itself, without touching the core, and renaming a CSS class breaks
nothing.

---

## 7. Cross-cutting utilities

| Export | Role |
|---|---|
| `MapMath` | `altitudeForZoom`, `zoomForAltitude`, `clamp`, `metersPerPixelAt`, easings… |
| `CAMERA_FOV`, `TILE_SIZE` | single-source constants |
| `fetchWithPolicy(url, init, policy)` / `HttpError` | timeout, retries, **jittered** exponential backoff |
| `setGeometryWarner(fn \| null)` | redirect (or silence) geometry warnings |
| `injectStyles()`, `themeToVars()`, `configToVars()`, `tilesFilterCss()` | stylesheet and CSS variables |
| `svgToDataUri(svg)` | SVG → data-URI, idempotent |
| `boundsContains(bounds, p)` | containment test against a geographic box |
| `resolveLocale()` / `resolveRegion()` | 🌍 resolves `'auto'` into an effective locale/region |
| `DEFAULT_STROKE_OPACITY`, `MEASURE_STROKE_OPACITY` | reference stroke opacities |

**On `setGeometryWarner`**: geometries with non-finite coordinates are discarded and
reported **once per origin**. Redirect them to your application's logger, or silence
them (`null`) — a library has no business writing authoritatively into the
application's console.

**On `fetchWithPolicy`**: retrying without waiting is exactly what you should not do to
a struggling server — the three attempts leave within the same handful of milliseconds,
hit an incident that has had no time to pass, and stand practically no chance of
succeeding where the first failed, for three times the cost. Hence the doubled, jittered
backoff (`config.providers.*.fetch`).

---

## 8. Without React

The core is usable on its own: `MapEngine`, `Camera`, `Projection`, `TagFilter`,
`ShapeLayer`, `PathLayer`, `DrawLayer`, `ClusterEngine`, `RelationEngine`,
`ViewportController`, `SearchRegistry`. None of these modules imports React.

The relation engine in particular is published **with its contract**, not just its
component: it runs server-side or in tests with a fake provider (no Three, no React, no
`fetch`).

---

## See also

- [HOOKS.md](HOOKS.md) — the React façades over all of this
- [CAMERA.md](CAMERA.md) — `Camera`, view events, basemap
- [CONFIG.md](CONFIG.md) — every budget and threshold quoted here
- [ZONES.md](ZONES.md) — `DrapedLayer` in practice

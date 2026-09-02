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
| `erasables` | registry of host objects the eraser may remove (`ErasableRegistry`) |
| `counters` | diagnostics panel counters (`CounterRegistry`) |
| `catalog` | registry of catalog sources (`CatalogRegistry`) — see [CATALOG.md](CATALOG.md) |
| `enrichment` | enrichment orchestrator at building pick (`PluginEnrichment`) — see [PLUGINS.md](PLUGINS.md) |
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
engine.invalidate() / engine.stats()
engine.start() / engine.stop() / engine.setSize(w, h) / engine.dispose()
```

`pickLatLngAtClient` is the bridge between a `PointerEvent` and a coordinate: a raycast
against the terrain, with an optional ellipsoid fallback when the pointer leaves the
globe.

### On-demand rendering

With the map standing still, the loop used to reproduce an identical image sixty times a
second. It still runs — layers advance, tiles arrive, gestures respond — but the two
**render** passes (WebGL and DOM overlays) only run if something asked for them
(`performance.renderOnDemand`).

The engine does it for everything it drives: camera movement, interaction, tiles in
flight, mode or setting changes. A layer does it for its own ongoing work, through
`ctx.invalidate()`. That leaves the host with `engine.invalidate()` only when it touches
the three.js scene directly.

```ts
engine.invalidate()          // paint the next few frames
engine.stats()               // → MapStats: drawCalls, triangles, painted/frames, …
```

`stats()` reads counters the renderer already keeps (no cost). The two to look at first:
`painted` against `frames` — with the map still, the gap measures exactly what on-demand
rendering saves — and `resolutionScale`, which tells whether the GPU is keeping up
(`performance.adaptiveResolution`).

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
| `basemap` | `{ mode, traffic, canPlan, can3d, trafficAvailable, canPickBuildings }` | basemap **or capability** change |
| `pedestrian` | `PedestrianState` | entering/leaving pedestrian mode, immersion, availability, noticeable rotation — see `usePedestrian` ([HOOKS.md](HOOKS.md)) |
| `buildingpickmode` | `boolean` | the "pick a building" tool was just armed or disarmed |
| `buildingclick` | `{ hit: { ref, info }, originalEvent }` | a building in the internal volume was clicked, tool active — see [BUILDINGS.md](BUILDINGS.md) |
| `graticule` | `boolean` | the coordinate grid was just switched on or off |
| `templatesave` / `templateremove` / `templateapply` | see [TEMPLATES.md](TEMPLATES.md) | template created/renamed, removed, applied |
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
| `trafficAvailable` | traffic offerable: 2D basemap present, not in 3D mode, served by Google — or an internal basemap that can **borrow** it (Google key + `providers.tiles.trafficViaExternal`) |
| `canPickBuildings` | a building is **pickable**: internal volume (extruded MVT footprints, each with its own identity) — the external photorealistic mesh is out of reach by nature, a single fused mesh with nothing to tell buildings apart |

`engine.supportsBasemap2d` is still available: it is the historical alias of `canPlan`.
`setMapMode('plan')` without `canPlan`, like `setTrafficVisible(true)` without
`trafficAvailable`, are **no-ops** — a state accepted with nothing on screen is worth less
than a clean refusal.

These flags come out of an exported pure function, `deriveBasemapCapabilities(mode, support,
traffic)`, whose `BasemapSupport` input describes what the engine knows about its sources —
see [TILES.md § 4](TILES.md#4-what-the-ui-offers-capabilities).

---

## 3. Writing a layer

```ts
type Layer = {
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
  invalidate(): void                  // "I have something that changes the image"
}
```

The `update` / `project` split is not cosmetic: **all layout reads happen in `update`,
all writes in `project`**. Mixing them causes layout thrashing as soon as there are more
than a handful of overlays.

Call `invalidate()` for as long as the layer has work in progress — an animation, geometry
being built, data arriving. Without it the engine may skip the frame's render: the layer
still gets `update`/`project`, but its result is not painted, and the animation freezes
until the next movement. Signalling costs nothing.

⚠️ The `project` pass **reads** world matrices, it does not write them: the engine walks
the overlay scene once, between the two passes. A layer calling `getWorldPosition()` per
item therefore redoes, per item and per frame, a parent-chain update already done for all
of them — reading `obj.matrixWorld` is enough.

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

The marker layer listens too, for a different reason: it **switches off its horizon test**
there. `isAboveHorizon` assumes a camera towering over the scene; at eye level curvature no
longer matters over the view distance, and the test collapses into "is the point lower than
my eyes" — which hid every marker settled up high, that is, on a roof, hence nearly all of
them in a city.

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
| `sampleGroundHeightCached(p)` | the above, memoised per cell (`performance.groundSample`) — prefer it inside a frame loop: an exact call costs 9 raycasts |
| `setGroundPlane(h)` | **analytic** street level — short-circuits `sampleGroundHeight` |
| `metersPerPixel(p, camera, viewportH, height?)` | resolution — this is what converts a px width into metres |
| `groundDistance(a, b)` | ground distance |
| `getENUAxes(...)` / `enuBasis(...)` / `enuBasisFor(anchor, out, height?)` | local frame |
| `isAboveHorizon(worldPos, cameraPos)` | globe occlusion — only valid when the camera towers over the scene (see `setGrounded`) |
| `setViewDirection(camera)` then `isBehindCamera(worldPos, camPos)` | behind the camera, regardless of `far`. The view direction is set **once per pass**: `getWorldDirection` re-inverts the camera's world matrix on every call |
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
| `engine.counters` | layers and surfaces | diagnostics counters | the `<StatsPanel>` panel |

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

### `ErasableRegistry` (`engine.erasables`)

Mirror of `selectables` for the **eraser**, but separate: an erasable object is not thereby
selectable, and vice versa. A host layer plugs a provider in; the `DrawLayer` queries it on
click or when a marquee finalizes, never per frame.

```ts
type ErasableProvider = {
  readonly kind: HostLayerKind   // 'path' | 'shape' — governed by `config.erase.targets`
  items(): ErasableItem[]        // { id, ring: LatLng[], closed, kind } — only objects marked `erasable`
  has(): boolean                 // answers WITHOUT building the list: decides whether the eraser is warranted
}
const off = engine.erasables.register(provider)
```

The library does not own these objects (they are your props): it only knows a geodesic
ring, and the actual removal goes through your `onErase`. `all()` concatenates the objects
of every provider; `hasAny(targets)` answers at the first hit, allocating nothing.

### `CounterRegistry` (`engine.counters`)

What the view **actually holds**, for the diagnostics panel (`<StatsPanel>`). A layer registers and declares its elements; the panel aggregates.

```ts
const off = engine.counters.register({
  stats: (bounds) => ({ kind: 'shapes', visible: countIn(bounds), total: all.length }),
})
// Call `off()` on unmount — a counter outliving its layer shows a frozen number.
```

⚠️ **Read-only.** A counter decides nothing: removing this registry would leave the panel empty, and that is all. That is the condition for a measuring tool never to become the cause of what it measures.

`stats(bounds)` receives the view bounds and is only called at the panel's refresh rate (`performance.readoutRefreshMs`), **and only while it is open** — that is where the scan is paid for, never in a frame pass.

`engine.viewStats(out)` returns the full snapshot (content, render, tiles), writing into `out` so it can be reused between calls.

`statLevel(value, threshold)` is the verdict (`'ok' | 'warn' | 'bad'`) the panel applies to each metric from `performance.statThresholds` — exported for a custom panel colouring its own cells. The direction is inferred from the order of the two bounds (`ok < warn`: small is good, like triangles; `ok > warn`: large is good, like fps), and a non-finite value yields `'ok'` — a metric that cannot be measured yet is not an alert, and painting it red would teach the reader to ignore red.

### `DragRegistry` (`engine.drag`)

The drag-and-drop source of truth: zones (`registerZone`), acceptance
(`acceptsAny(payload)`), gesture phase, `onZonesChange`. Driven by the React layer —
`useDraggable`, `useDropZone`, `useMapDropZone`.

### `PersistedVersionedStore` (base of `engine.plugins` / `engine.templates`)

Shared base of both persisted registries: a versioned store for `useSyncExternalStore`
(`version`, `on`) + **debounced** localStorage persistence (`dispose()` flushes on
unmount). A subclass only implements `serialize()` — what it writes. Exported so a custom
registry can be built without rewriting these safeguards.

---

## 6. Pointer interception

A tool (drawing, lens) arms itself by setting a `PointerInterceptor` on `engine.inputInterceptor`:

```ts
type PointerInterceptor = (phase: 'down' | 'move' | 'up', latLng: LatLng | null, event: PointerEvent) => boolean

engine.inputInterceptor = myInterceptor   // `null` to disarm
```

`latLng` is already resolved by the engine (raycast against the terrain): the
interceptor does not have to re-pick the point under the pointer itself.

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
| `VERSION` | package version, read from `package.json` at build time — for diagnostics or a host-side compatibility guard |
| `RemoveButton` / `REMOVE_ICON_PATH` | shared "remove" button (`label`, `withText?`, `className?`, `onRemove`) — relation status bar, dock, removal hint while dragging — and its `mdiClose` icon path; so a custom removal gesture wears the same face |

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

**Constructor options** (`MapEngineOptions`): among them, `landColor?: string` paints the
landmasses of the fallback globe — under React, `<Map>` passes `theme.globe.landColor`.

## See also

- [HOOKS.md](HOOKS.md) — the React façades over all of this
- [CAMERA.md](CAMERA.md) — `Camera`, view events, basemap
- [CONFIG.md](CONFIG.md) — every budget and threshold quoted here
- [ZONES.md](ZONES.md) — `DrapedLayer` in practice
- [BUILDINGS.md](BUILDINGS.md) — `buildingMenu`, building picking
- [TEMPLATES.md](TEMPLATES.md) — the `templatesave` / `templateremove` / `templateapply` events

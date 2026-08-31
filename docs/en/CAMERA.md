# Camera, view and basemap

[Français](../fr/CAMERA.md) · **English** · [↑ Index](README.md)

How you get somewhere, how you stay there, and what you look at once you are.

---

## 1. Initial position

```tsx
<Map center={{ lat: 48.8566, lng: 2.3522 }} zoom={14} />
```

`zoom` is the familiar **Web Mercator scale**: `0` = the world, `~21` = street level.
Exported conversions: `altitudeForZoom(zoom)` and `zoomForAltitude(m)`.

### Intro

By default the map starts in **globe view** and descends in an animated flight towards
`center`/`zoom`, Google Earth style. `intro={false}` turns it off.

During the flight, the destination altitude is **re-anchored** as tiles refine: the
ground height becomes more precise during the descent, so the landing is exact.
Settings: `config.startup` (`introDuration`, `introAltitudeFactor`, `introMaxWaitMs`,
`introFadeMs`).

### Remembered position

```tsx
<Map positionStorageKey="m3d:pos:dashboard" resetStoredPosition={false} />
```

A remembered position **replaces** `center`/`zoom` at mount **and turns the intro off**
— you do not replay an arrival when resuming a session. `resetStoredPosition` clears it
at mount. Without the prop, nothing is persisted.

Use a **distinct key per map** if several `<Map>` instances coexist on the same origin.
Writing is debounced (`config.data.positionSaveDebounceMs`).

---

## 2. “The map is ready” (`ready`)

```tsx
<Map onReady={(engine) => camera.fitBounds(boundsOfMarkers(markers)!)} />
```

**`ready` = the projection resolves heights, and framing targets the real ground.**

It is **not** “the engine exists”: that is `useMap()`, available at mount without
waiting for tiles. Before `ready`, a `fitBounds` would target the bare ellipsoid.

The event fires **once**, but a subscriber arriving afterwards receives it
**immediately anyway** — otherwise `onReady` would work on first mount and stay silent
after that.

If a tile source fails (invalid token, network down), `ready` still eventually fires
(`config.startup.readyMaxWaitMs`, ~8 s): the application is never left waiting on an
event that will not come.

Other surfaces: `engine.on('ready', cb)`, `engine.ready` (synchronous boolean), and
`useMapEvents({ onReady })` for a child component.

---

## 3. Moving the camera

```ts
const camera = useCamera()   // or engine.camera, or map.current?.camera
```

| Command | Effect |
|---|---|
| `flyTo(dest, opts?)` | flight towards `{ lat?, lng?, altitude? }` |
| `panTo(p, opts?)` | recentres **smoothly**, altitude unchanged |
| `setCenter(p)` | recentres **instantly**, altitude unchanged |
| `moveTo(dest, opts?)` | recentre/altitude, short theme duration |
| `setZoom(z, opts?)` | 2D-map-style zoom; the targeted point does not move |
| `getZoom()` | current zoom |
| `fitBounds(bounds, opts?)` | frames a geographic set (see § 4) |
| `follow(getPos)` | follows a target; returns the stop function |
| `getState()` | `{ lat, lng, altitude, heading, tilt }` |

`useCamera().state` is the **reactive** state (re-renders its consumer on every move —
the `camera` event is emitted every frame while the camera moves); the
`map.current?.camera` handle re-renders nothing — that is the difference between the
two paths.

Two rows of the table are not symmetric across the three paths: `getState()` only
exists on `engine.camera` / `map.current?.camera` (the `Camera` class) — via
`useCamera()`, the equivalent is `.state`. `moveTo` is the reverse case: a shortcut
added by the hook (short theme duration included), absent from `engine.camera` directly.

A third path for the common case: `useCameraCommands()` returns the **commands alone**,
with a stable identity and no subscription. A button that only calls `flyTo` has no
reason to re-render sixty times per second during a pan.

**Guardrails applied to every destination**: never above `maxAltitude`, never below
`real ground + config.camera.minGroundClearance` (the ground is sampled from the tiles,
with a short cache — the Dead Sea's negative geoid remains legitimate). Wheel zoom does
not go through this: it is covered by the controls' collision avoidance.

### Following

```tsx
<MarkerLayer followId={followedAgent} />          // declarative
const stop = camera.follow(() => agent.position)  // imperative
```

If the target momentarily disappears (clustered, hidden by a filter), the camera **hands
control back** to the controls instead of freezing, and resumes when it reappears.
Altitude is clamped by `config.camera.followAltitude`.

---

## 4. Framing (`fitBounds`)

```ts
camera.fitBounds(bounds, { padding: { left: 320, top: 40, right: 40, bottom: 40 } })
camera.fitBounds(bounds, { padding: 50, duration: 0 })   // instant
camera.fitBounds(traceBounds, { minAltitude: 80 })       // an object a few dozen metres across
```

**`padding` acts in two ways**: it shrinks the usable surface (so the camera pulls
back), and it **shifts the targeted centre** when asymmetric — the content then centres
in the area that **remains visible**, not in the whole viewport. That is what you want
under a side panel.

An absurd padding (wider than the viewport) is reduced to a minimal band rather than
dividing by ~0.

### Building `bounds`

All helpers are **antimeridian-correct** and return `null` rather than a poisoned box
when coordinates are not finite.

```ts
boundsOfLatLngs(points)          // list of points
boundsOfMarkers(markers)         // any object with { position }
boundsOfShape(shape) / boundsOfShapes(shapes)
boundsOfCircle(center, meters)   // geodesic disc
unionBounds([a, b, c])           // union, `null` entries ignored
centerOfBounds(b)
lngSpanDeg(b)
altitudeForBounds(b, opts?)      // framing altitude
```

`altitudeForBounds` clamps to **[350 m, 6000 km]** by default with a **1.35×** margin —
values designed for place search. `margin`, `minAltitude` and `maxAltitude` adjust them
when the content is smaller (a 200 m GPS trace would otherwise stay framed too high).
Global defaults live in `config.camera.fitBounds`.

---

## 5. Tracking the view

```tsx
<Map onViewportChange={(v) => refetch(v.bounds)} onCameraChange={(s) => setAltitude(s.altitude)} />
```

| Event | Rate | Use |
|---|---|---|
| `viewport` | after the camera **settles** (`config.data.viewportDebounceMs`) | wire a refetch |
| `camera` | **every move** | state display — *never* network calls here |

Equivalent hooks: `useViewport(cb, opts?)` and `useMapEvents({ onViewportChange,
onCameraChange, onClick, onReady })`.

A `Viewport` carries `{ bounds, center, zoom }`.

Its `zoom` is the **actually perceived** scale: it derives from the camera → aimed point
distance, not from altitude. The distinction matters in a tilted view, where
`altitude = distance × cos(tilt)` — at 85° the altitude drops tenfold without the screen
changing, and a zoom following it would gain 3.5 levels, enough to cross thresholds such as
`clustering.maxZoom`. Flat, the two coincide: the aimed point sits under the camera. In a
ground-level view (pedestrian mode) the distance is capped by
`pedestrian.tileDetailDistanceMeters` — otherwise the gaze would reach the horizon and the
scale read would be that of the vanishing point.

### Showing the view (`readout`)

The readout block puts on screen what those events carry, **plus orientation**: eye
altitude, the ground point below it, heading, tilt, and zoom — **on a single line**, in the
requested corner. It only wraps onto a second line when the map is too narrow for it.

```tsx
<Map readout />                                        {/* top-right corner, all 6 values */}
<Map readout={{ corner: 'bottom-left', fields: ['heading', 'tilt'] }} />
```

| Prop | Role | Default |
|---|---|---|
| `corner` | `'top-right'` · `'top-left'` · `'bottom-right'` · `'bottom-left'` | `'top-right'` |
| `fields` | Values shown, in order: `altitude`, `latitude`, `longitude`, `heading`, `tilt`, `zoom` | all six |
| `refreshMs` | Maximum write rate | `config.performance.readoutRefreshMs` (120) |
| `className` | Class on top of `m3d-readout` | — |

A value removed from `fields` is not merely hidden: it is no longer computed.

The two orientation angles, in degrees:

| Value | What it says | Range |
|---|---|---|
| `heading` | The direction being **looked at** — `0°` at north, increasing eastwards. Never `360°`: that is north, and it reads `0°`. | `[0, 360[` |
| `tilt` | The tilt — at `0°` the camera looks **straight down** (top-down view), at `90°` it looks at the **horizon**. | `[0, 90]` in practice |

**It never re-renders.** The map produces a camera state every frame; turning that into
React state would make this small block the most expensive component in the tree. So it
lays out its DOM once and hands the value writing over to an engine layer, in the
`project()` pass — the overlay one — at the rate above.

That is also what makes the heading correct. The `camera` event carries a **domain**
threshold that deliberately ignores orientation: turning in place changes neither
latitude, longitude nor altitude, so nothing is emitted. A heading wired to it would stay
frozen throughout a rotation — precisely the gesture you watch it perform.

Texts, decimals and number locale live in `labels.readout` (see [LABELS.md](LABELS.md)).
Altitude has no unit system of its own: it follows `labels.measure` like every distance in
the library — an imperial map reads it in feet with nothing to restate. Coordinates keep
the decimal **point** by default, even under a French interface: a coordinate gets copied
elsewhere.

The block lets map gestures through; only the values stay selectable, so a coordinate can
be copied.

To show it **outside** the map (your own status bar, an operations panel),
`<CameraReadout>` is exported — it only needs the map context — and
`makeReadoutFormatter(labels)` gives the same formatters with no DOM at all.

### Diagnostics panel — `<StatsPanel>`

The toolbar's **“Settings”** menu carries an **“Infos”** row that opens a panel: what the view holds, what it costs, what it retains. It **absorbs** the `<CameraReadout>` metrics — which is why the example turns the strip off by default.

| Section | What it gives |
| --- | --- |
| **Camera** | lat, lng, altitude, zoom, heading, tilt — the same as the strip, named by `labels.readout` |
| **Content** | markers painted / total, cluster badges, shapes, paths, links, drawings |
| **Render** | frames per second, painted frames, draw calls, triangles, textures, geometries, resolution scale |
| **Tiles and memory** | cached tiles, loading tiles, memory held, extrusion workers |

⚠️ **Everything is counted IN VIEW**, not in what the host has posted. `markers total` is the only exception, and it exists to be compared with `markers painted`: their gap is what reveals a cull or a clustering that is not doing its job.

Each value turns green, amber or red according to [`performance.statThresholds`](CONFIG.md) — a metric without a threshold stays colourless, because a latitude has no good value. Tints come from [`theme.colors.ui.stat`](THEME.md).

Sections flow into **columns derived from the width received** (an ideal column ≈ 188 px), each section staying in one piece: two columns with no scrolling inside the menu, a single one if you mount the panel in a narrow surface.

```tsx
// In your own surface rather than in the menu:
import { StatsPanel } from '@pasquelin/map3d'
;<StatsPanel sections={['render', 'tiles']} refreshMs={250} />
```

Like `<CameraReadout>`, **it never re-renders**: it lays out its DOM once and two engine layers write the cells. A performance panel refreshed through `useState` would measure what it caused itself.


---

## 6. Frozen map (`interactive`)

```tsx
<Map interactive={false} />   // or 'view', or true (default)
```

| Mode | Camera | Tools (drawing, lens) | Map click | Markers |
|---|---|---|---|---|
| `true` | free | active | emitted | clickable |
| `'view'` | **frozen** | neutralised | emitted | clickable |
| `false` | **frozen** | neutralised | suppressed | inert |

`'view'` is the preview you consult without being able to move it: the camera no longer
moves, but markers, selection and tooltips stay alive. `false` makes the map inert.

In both cases **overlays keep being rendered** — it is a frozen map, not a screenshot —
and a tool left selected finds its state intact on unfreeze.

`interactive` freezes the **map**, not your UI: the library's controls stay clickable
(they live outside the map surface). Hide whatever no longer makes sense:

```tsx
<Map interactive={false} controls={{ buttons: { zoomIn: false, zoomOut: false, tilt: false, globe: false } }} />
```

Imperative equivalent: `engine.setInteractive(mode)`, read via `engine.interactive`.

---

## 7. Basemap

Two basemaps, plus one overlay:

| | Source | Quota |
|---|---|---|
| **Photorealistic 3D** | Google Photorealistic 3D Tiles, via `cesiumIonToken` (Cesium Ion) or `googleMapsApiKey` (direct) | Cesium Ion, or Google |
| **2D plan** | Google Map Tiles | **your Google key** |
| **Traffic** | overlay of the 2D plan | Google |

```tsx
<Map googleMapsApiKey={KEY} mapMode="plan" />   // or "3d"
```

**Startup mode.** With `googleMapsApiKey`, the map **starts on the 2D plan**: more
readable for reading positions, and the 3D tileset is not even requested until you
switch. `mapMode="3d"` starts on the photorealistic tiles; without a Google key, `'3d'`
is the only possible mode and stays the default.

**Without `googleMapsApiKey`, there is no 2D ↔ 3D toggle** — the “3D” button only shows
when its destination mode is servable, never inert. That **single button** (with traffic)
lives in the **compass group**: lit while in 3D, clicking it turns 3D off and returns to
the plan, exactly like the former “2D” button. The traffic button only appears in plan
mode (the only mode where the overlay exists), and switching back to 3D turns it off: the
engine handles that, and `engine.getBasemap()` plus the `basemap` event are the source of
truth (`{ mode, traffic, trafficAvailable }`).

**Fallback globe.** `fallbackGlobe` (default `true`) displays a plain ellipsoid when no
tile is available: the map stays a map even without network or token.

> ### ⚠️ Quota
>
> The 2D basemap consumes the **Map Tiles API quota of your Google key**, whereas 3D via
> `cesiumIonToken` is served by Cesium Ion: starting in 2D **moves** the cost, it does
> not remove it.
>
> Two guardrails on the library side: during a camera flight (the intro in particular)
> only base levels are requested, instead of the eleven levels traversed; and a failed
> tile is retried with backoff (1 s then 4 s, three attempts) instead of being abandoned
> — a single `429` otherwise left permanent holes in the map.
>
> If you see `429 Too Many Requests`, also check the project's **per-minute** quotas in
> the Google Cloud console. Settings: `config.providers.tiles`.

---

## 8. The controls (`<MapControls>`)

```tsx
<Map controls={{ position: 'right' }} />
<Map controls={false} />
```

Buttons: `pan`, `rotate`, `compass`, `zoomIn`, `zoomOut`, `tilt`, `globe`, `graticule`,
`mode3d`, `plan`, `traffic`, `pedestrian`, `target`, `layers`, `catalog`, `fullscreen`.
Groups: `drag`, `compass`, `layers`, `target`, `pedestrian`, `zoom`, `fullscreen`.

`catalog` (remote entity catalog, see [CATALOG.md](CATALOG.md)) shares the `layers`
group with “Layers”.

The `compass` group gathers the whole **point of view**: compass (north / top-down), tilt,
the `mode3d` toggle, traffic, back-to-globe and the grid — there is no separate `view` or
`basemap` group anymore. `mode3d` is a **toggle**: lit while in 3D, turning it off returns to
the 2D plan (no separate “Plan” button). Fine grain: hiding `mode3d` disables returning to 3D,
hiding `plan` disables switching to the plan (useful with an external basemap to lock 3D on).

⚠️ `camera.maxTilt3d` and `camera.maxTilt2d` (both 0.44π ≈ 79.2° by default) do not only bound
the camera: the **graticule fade** is expressed as a fraction of that ceiling. Tightening them
therefore moves the angle at which the grid disappears — see
[GRATICULE.md § 4](GRATICULE.md#4-how-the-fade-works).

```tsx
// GROUP granularity: hide (false) or replace (ReactNode)
<MapControls components={{ compass: false, zoom: <MyZoom /> }} />

// BUTTON granularity: its shortcut is disabled with it; an emptied group disappears
<MapControls buttons={{ rotate: false, zoomOut: false, globe: false }} />
```

### Shortcuts

| Key | Action |
|---|---|
| `N` | north / top-down view |
| `+` / `−` | zoom in / out |
| `I` | tilt |
| `G` | back to globe |
| `K` | coordinate grid (graticule) |
| `B` | basemap: 3D ↔ plan |
| `T` | “Layers” panel |
| `C` | “Catalog” panel |
| `W` | pedestrian mode |
| `F` | fullscreen |

The traffic button has **no** default shortcut (only exists in plan mode, see § 7).

```tsx
<MapControls shortcuts={{ layers: 'y', fullscreen: false }} />   // remap / disable
```

**Bare** letters (no ⌘/Ctrl: browsers reserve ⌘T/⌘N/⌘W…), identical on Mac and PC,
shown in tooltips, ignored while typing. Defaults chosen not to collide with the drawing
tools — see `config.interaction.shortcuts.controls`.

### The “back to target” button

A screen often has a point of reference — the alert being viewed, the ongoing event.
Providing `target` adds a button that returns to it; omitting it removes the button. The
map does not need to know what the target represents, only where it is.

```tsx
<MapControls
  target={{
    position: alert.position,
    label: 'Back to the alert',   // default: labels.controls.target
    onlyWhenOutOfView: true,
    zoom: 16,                      // absent = current altitude preserved
  }}
/>
```

`onlyWhenOutOfView` is re-evaluated on the `viewport` event (the **settled** view), not
on every frame: no point testing during a flight, only the resting view matters.

---

## 9. Recipes

**Frame all the map's content on open**

```tsx
<Map onReady={() => {
  const b = unionBounds([boundsOfMarkers(agents), boundsOfShapes(zones)])
  if (b) camera.fitBounds(b, { padding: 80 })
}} />
```

**Drive from the outside, without writing a child component**

```tsx
const map = useRef<MapHandle>(null)
<Map ref={map} … />
map.current?.camera.fitBounds(bounds, { padding: 60 })
```

**Resume the user's session** — `positionStorageKey`, and nothing else.

**Convert a `PointerEvent` to lat/lng** —
`engine.pickLatLngAtClient(clientX, clientY, fallbackToEllipsoid?)`.

---

## See also

- [DATA.md](DATA.md) — refetching data on move
- [ZONES.md](ZONES.md) — framing on a zone
- [ENGINE.md](ENGINE.md) — events, projection, pointer interception
- [PEDESTRIAN.md](PEDESTRIAN.md) — the camera's third driver: ground-level walking
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [THEME.md](THEME.md)

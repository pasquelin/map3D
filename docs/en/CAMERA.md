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

`useCamera().state` is the **reactive** state (re-renders its consumer on every move);
the `map.current?.camera` handle re-renders nothing — that is the difference between
the two paths.

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

**Without `googleMapsApiKey`, the “basemap” group is not rendered at all** — rather than
offering inert buttons. The traffic button only appears in plan mode (the only mode
where the overlay exists), and switching back to 3D turns it off: the engine handles
that, and `engine.getBasemap()` plus the `basemap` event are the source of truth
(`{ mode, traffic, trafficAvailable }`).

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

Buttons: `pan`, `rotate`, `compass`, `zoomIn`, `zoomOut`, `tilt`, `topDown`, `globe`,
`mode3d`, `plan`, `traffic`, `target`, `layers`, `fullscreen`.
Groups: `drag`, `compass`, `zoom`, `view`, `basemap`, `target`, `layers`, `fullscreen`.

```tsx
// GROUP granularity: hide (false) or replace (ReactNode)
<MapControls components={{ view: false, zoom: <MyZoom /> }} />

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
| `B` | basemap: 3D ↔ plan |
| `T` | “Layers” panel |
| `F` | fullscreen |

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
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [THEME.md](THEME.md)

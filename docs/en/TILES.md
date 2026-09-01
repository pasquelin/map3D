# Tiles — external provider (Google) or internal server

[Français](../fr/TILES.md) · **English** · [↑ Index](README.md)

The 2D basemap comes either from **your own tile server** (`internal`, the default) or
from **Google Map Tiles** (`external`). The choice is a setting: nothing to rewire,
nothing to remount.

⚠️ The default origin points at the project's own server: **replace it with yours**.

```tsx
<Map
  center={MONACO}
  zoom={14}
  config={{ providers: { internal: { origin: 'https://tiles.example.com' }, tiles: { provider: 'internal' } } }}
/>
```

With `internal`, **no request goes to Google** for the basemap: no `createSession`, no key,
no quota. A complete 2D map without an API key becomes possible.

---

## 1. The two providers

|                       | `external`                            | `internal` (default)           |
| --------------------- | ------------------------------------- | ------------------------------ |
| Source                | Google Map Tiles                      | your server (XYZ scheme)       |
| Authentication        | API key + signed session              | none                           |
| Minimum setting       | `<Map googleMapsApiKey>`              | `providers.internal.origin`       |
| Traffic layer         | yes                                   | borrowed, with a key (see § 4) |
| Volume (`'3d'` mode)  | photorealistic 3D tiles (Cesium Ion)  | extruded buildings (see § 5)   |
| Quota                 | billed per tile                       | yours                          |

The provider changes **the basemap only**. Place search, routing and photorealistic 3D
tiles remain external services, configured separately (`providers.places`,
`providers.routing`, `providers.tiles3d`).

> **Both providers behave identically.** Outside the three rows above — what the provider
> *is* — nothing depends on it: click picking, shape draping, ground-elevation tracking,
> the camera stopping on built volume, tilt limits. What once justified treating internal
> as a special case was its ray-casting cost; that is fixed at the source (see § 5), not
> worked around with a special case.

**Volume auto-hide by altitude.** Seen from above, the internal buildings cover only a few
pixels, and their budget-bounded loading leaves a "square" of detail in the void. Above
`providers.buildings.maxViewAltitude` (1000 m **above ground**) they are hidden, **frozen and
destroyed** (RAM/VRAM freed, reloaded on the way back), leaving the 2D basemap alone
**without leaving `'3d'` mode**: descending brings them back. The criterion is a height above
ground, so it holds **at any tilt**.
Only the internal extruded buildings are affected — photorealistic 3D tiles are not.
Toggled by `providers.tiles3d.hideVolumeWhenClamped` (`false` keeps buildings always on),
the fade by `providers.tiles3d.volumeFadeMs` (`0` = instant); `providers.buildings.requestAltitudeFactor`
opens a band above the threshold where tiles are downloaded without being shown, so the
descent finds them ready.

## 2. Configuring the internal server

A single value changes between a development machine and production:

```tsx
config={{
  providers: {
    // The origin is SHARED by the 2D basemap and the volume: both come from one server.
    internal: { origin: 'http://localhost:8090' },   // in production: your domain
    tiles: {
      provider: 'internal',
      style: 'liberty',                  // name of the style the server renders
      retina: false,                     // true → @2x tiles
    },
  },
}}
```

The origin is **never written in code**: read it from the host application's environment
(`VITE_TILE_ORIGIN` in the example) and pass it through `config`.

The URL template is configurable too — useful behind a proxy, or for a server whose routes
differ:

```
providers.tiles.internalTileUrl = '{origin}/styles/{style}/{z}/{x}/{y}{r}.png'
```

| Token         | Replaced with                                 |
| ------------- | --------------------------------------------- |
| `{origin}`    | `providers.internal.origin` (trailing `/` removed) |
| `{style}`     | `providers.tiles.style`                        |
| `{r}`         | `@2x` when `retina`, otherwise empty           |
| `{z} {x} {y}` | tile coordinates (Web Mercator, XYZ scheme)    |

What the server must serve: raster tiles at `{z}/{x}/{y}`, Web Mercator, with **CORS**
headers (`Access-Control-Allow-Origin`) — tiles become WebGL textures, loaded with
`crossOrigin='anonymous'`.

### Zoom bounds

`baseZoom` (default 2) is the always-loaded level covering the globe: it is what keeps the
map hole-free while finer levels arrive. `maxZoom` (default 22) bounds the finest level
requested — **lower it** if your style stops earlier, otherwise the map asks for tiles that
do not exist.

Between the two, the basemap steps down through a **cascade**: the finest level on a disc
centred under the camera — a disc, so that sharpness depends on neither heading nor tilt —
then the coarser levels over the whole view, each reaching twice as far, until the first one
that covers it. That is what makes the
distance degrade gradually instead of dropping straight to the base level — a tile the size
of a quarter of a continent, a flat wash of colour that reads as a rendering bug.

The request cost is far lower than it looks: a coarse level covers a huge area, so it is
requested once and reused for the whole session. Only the finest level is renewed as you
move.

This cascade is not systematic: as soon as **a single level is enough to cover the whole
extent** — a near-vertical view, low tilt — the basemap switches to a **uniform** level
(`providers.tiles.uniformDetail`, default `true`): no more detail disc at the centre,
sharpness is the same everywhere, and coarser levels are prefetched as a clean fallback
while a step loads. It reverts to the cascade as soon as the view is too spread out for a
single level — the gap between the targeted level and the one covering the whole view
exceeds `providers.tiles.uniformMaxSpread` (default `1`) — and systematically in pedestrian
mode, where the near/far gradient at eye level is intentional.

## 3. Switching at runtime

Changing `provider` (or `origin`, `style`, `retina`) replaces the source **without
remounting the map**: the tile cache is cleared, the basemap reloads, the camera stays put.

```tsx
const [provider, setProvider] = useState<TileProvider>('external')
;<Map config={{ providers: { internal: { origin: TILE_ORIGIN }, tiles: { provider } } }} />
```

If the chosen provider has nothing to serve — `external` without a key, `internal` without
an `origin` — **no 2D basemap is offered** rather than one that would fail on every tile.
The map falls back to `'3d'` mode, and the matching buttons disappear (§ 4).

## 4. What the UI offers (capabilities)

The two providers do not offer the same options. The engine therefore publishes what is
**possible**, and `<MapControls>` only shows buttons that mean something — see
[ENGINE.md § BasemapState](ENGINE.md).

```ts
const { canPlan, can3d, trafficAvailable } = engine.getBasemap()
```

| Situation                                        | `2D` button | `3D` button | Traffic button |
| ------------------------------------------------ | ----------- | ----------- | -------------- |
| `external` + Google key + Ion token              | shown       | shown       | shown in plan  |
| `external` + Google key, no Ion token            | shown       | **hidden**  | shown in plan  |
| `external` without key (Ion token only)          | hidden      | shown       | hidden         |
| neither key nor token                            | hidden      | hidden      | hidden         |
| `internal` (origin set), no Google key           | shown       | shown       | hidden         |
| `internal` (origin set) + Google key             | shown       | shown       | shown in plan  |
| `internal` for 2D, `external` without token in 3D | shown      | **hidden**  | hidden         |

Three rules behind that table:

- **Each button depends on ITS own destination**, not on the other one. `2D` requires a
  servable flat basemap (`canPlan`: Google key, or `origin`), `3D` requires servable volume
  (`can3d`: a photorealistic tileset in `external`, terrain or buildings in `internal`).
  The two axes being independent, one can be offered without the other.
- **The engine applies the same rule as the toolbar**: `setMapMode` towards a mode with
  nothing to show is a no-op, including in vanilla usage and from the `mapMode` prop —
  switching would empty the screen. One exception: if NO mode is servable, the map keeps
  its own and its fallback globe; it has to be somewhere.
- **Traffic is a property of the Google tile** (`layerTypes` requested from the session),
  not a transparent overlay. An internal server therefore has nothing to switch on *on its
  own tiles*: turning it on **changes provider** for as long as the layer lasts (see below).
  Without a Google key there is nothing to borrow — `setTrafficVisible(true)` stays a no-op
  and the button is not offered.

### Traffic with the internal provider — borrowing

`internal` 2D basemap **and** a `<Map googleMapsApiKey>`: the traffic button is offered, and
turning it on **moves the basemap over to Google** for as long as the layer is on. Turning
it off returns to the internal server. The tile cache is cleared both ways: these are two
sets of tiles, not two versions of the same one.

```tsx
// The default behaviour — nothing to write to get it.
<Map
  googleMapsApiKey={KEY}
  config={{ providers: { tiles: { provider: 'internal', trafficViaExternal: true } } }}
/>
```

⚠️ **What borrowing commits to**: the basemap changes appearance (Google's style, not
yours) and its tiles are billed again while traffic is on. `trafficViaExternal: false`
restores the original refusal — no traffic outside the external provider, button hidden.

3D mode turns traffic off as before, and borrowing with it: the basemap returns to the
internal server with nothing for the host to do.

A host building its own toolbar reads the same flags, or calls the pure function that
settles them:

```ts
import { canEnterMode } from '@pasquelin/map3d'

const basemap = engine.getBasemap()
if (canEnterMode(basemap, '3d')) {
  /* offer volume */
}
```

The whole table is exported too: `deriveBasemapCapabilities(mode, support, traffic)`
returns the full `BasemapState` from a `BasemapSupport` — what the engine knows about its
sources at publish time: `hasBasemap2d`, `sourceSupportsTraffic`, `canBorrowTraffic`,
`provider3d`, `has3dTileset`, `hasRelief`, `hasBuildings`. Pure, with neither engine nor
WebGL, it is what `MapEngine` applies on every config or mode change; it can be tested as
is to check what a given configuration will offer on screen.

```ts
import { deriveBasemapCapabilities, type BasemapSupport } from '@pasquelin/map3d'

const support: BasemapSupport = {
  hasBasemap2d: true, sourceSupportsTraffic: false, canBorrowTraffic: true,
  provider3d: 'internal', has3dTileset: false, hasRelief: true, hasBuildings: true,
}
deriveBasemapCapabilities('plan', support, true).trafficAvailable   // true — by borrowing
```

## 5. Internal volume — extruded buildings

`providers.tiles3d.provider` decides where volume comes from, **independently of the 2D
basemap**:

```tsx
config={{
  providers: {
    internal: { origin: TILE_ORIGIN },
    tiles: { provider: 'internal' },
    tiles3d: { provider: 'internal' },   // 'external' = photorealistic tiles (Cesium Ion)
  },
}}
```

With `'internal'`, `'3d'` mode extrudes buildings from the server's vector tiles —
OpenMapTiles `building` layer, `render_height` / `render_min_height`, courtyards punched
through — above the raster basemap, which **stays visible**: it is what terrain will
displace. No photorealistic tileset is driven, so **no request goes to Cesium or Google**,
even when a token is configured elsewhere.

There is no separate switch for buildings: `providers.tiles3d.provider` already states
where volume comes from, and a second setting could only contradict it — leaving a `'3d'`
mode with nothing on screen.

What to know when tuning it:

- **A single zoom level** (`providers.buildings.zoom`, 14): the `maxzoom` of the
  OpenMapTiles data. Beyond it the same tile serves; buildings gain nothing from being
  re-requested finer.
- **`maxViewAltitude`** (1000 m above ground) bounds the top: from higher up, buildings
  would cover a few pixels for the price of decoding a whole city.
  `requestAltitudeFactor` (1.5) preloads above it without showing.
- **Colours from the theme**: `theme.globe.buildingColor` (façades) and
  `buildingRoofColor` (roofs). A footprint carrying the `colour` attribute keeps its own —
  hex as well as CSS keyword (`beige`, `silver`) — and its roof is lightened by
  `buildingRoofLighten`. The scene has no light at all: roof/façade contrast, plus the
  shading from `buildingSunAzimuth`, is what reads as volume.
- **`maxHeight`** (1000 m) bounds absurd heights. `height=99999` is a common OSM typo, and
  it produced a hundred-kilometre building whose bounding box kept the tile permanently
  visible and stopped the camera on a ghost.
- **`maxBytes`** (448 MiB) bounds cache memory, where `maxTiles` only bounds a count. It is
  the setting that matters: between a countryside tile and a city-centre one, what a tile
  retains varies a hundredfold.

### How far volume reaches

The volume is served by a **disc centred under the camera**, its radius capped by
`maxViewDistance` (5000 m). **Beyond it only the raster basemap remains** — a view tilted to
79° reaches tens of kilometres, and no z14 coverage would ever match that.

⚠️ A disc, not the view frustum's bbox: that is what makes coverage both **invariant** and
**continuous**. The bbox had two flaws.

It depended on **heading**: its area grows by ~2× between a north heading and a 45° one, so
the set of tiles changed as you turned the camera, without the view changing.

It blew up at the **horizon**: the extent came from a grid of rays cast through the screen,
and those crossing the horizon hit nothing — they were discarded. Every time a whole grid row
went to the sky, the extent collapsed at once, then `tan(tilt)` blew it back up until the next
row. Measured at 1000 m altitude: sawtooth reach between 2.8 and 36.3 km, two abrupt collapses
(59° and 74°), and 8 to 1058 tiles requested at constant altitude. At 55° and 70° the map
looked alike, at 60° it looked nothing like either.

A disc has neither flaw: it depends on no angle, and it is bounded without clamping anything.
Tiles whose centre falls outside the disc are dropped from the circumscribed square, which
returns half the budget — measured in Paris: 32 z14 tiles instead of 64. `maxRequest` is now
only a safety net.

**The raster basemap follows the same rule**, but for its DETAIL LEVEL: `lodLevels` picked the
level for the whole basemap from that same bbox. A 2× area factor being a whole level, the
basemap changed sharpness as you turned; and at 78° tilt the level collapsed down to
`baseZoom`, one texel of which covers a quarter of a continent — hence the blurry streaks at
the skyline. It is now decided on a disc of the same kind, whose radius follows the scale of
the view rather than the heading.

This is not an over-cautious setting, it is a limit of the data. 3D attributes exist only
at the OpenMapTiles schema's `maxzoom`:

| level | `building` layer    | attributes |
| ----- | ------------------- | ---------- |
| z12   | absent              | —          |
| z13   | present, ~9× lighter | **none**  |
| z14   | present             | `render_height`, `render_min_height`, `colour`, `hide_3d` |

A distant level of detail built on z13 would therefore extrude everything at
`defaultHeight` — uniform, wrong heights. Three levers if the boundary bothers you: raise
`maxViewDistance` (the tile peak grows as n², so raise `maxTiles`/`maxBytes` with it),
lower `camera.maxTilt3d` so the
view no longer reaches the horizon, or serve a tileset carrying heights below level 14.

### What it costs, and why you never see it

A dense z14 tile (Paris) carries 52,000 footprint vertices — about 131,000 triangles and
231,000 vertices to produce. Five mechanisms keep that load off the frame loop:

- **The whole pipeline in a pool of Web Workers.** Download, MVT decoding, buffer
  construction **and the bounding-volume tree** happen off the main thread, and the buffers
  come back by transfer (no copy). The workers are bundled as a self-contained blob when
  the library is built: nothing to configure in the host's bundler, no asset to serve.
  Where `Worker` does not exist (server rendering, tests), the very same code runs as a
  main-thread fallback.
- **One BVH per tile, built in the worker.** The map casts three rays per frame against the
  displayed surface (camera guard, elevation tracking, shape draping). Brute force, a
  single tile cost 5.7 ms per ray; with the tree, ~0.004 ms. That is what puts internal
  volume on par with the external `TilesRenderer`, whose tiles already have a hierarchy of
  their own. **Building it costs ~41 ms per dense tile**: as long as that happened at mount
  time it accounted for 97% of a tile's cost and dropped frames. It now arrives fully
  built, and attaching it costs ~0.05 ms — a factor of ~800.
- **Several workers.** The full pipeline weighs ~60 ms per dense tile: a single thread
  would serialise them, and buildings would appear more slowly than before. Measured over
  24 Paris z14 tiles — 1430 ms with one worker, 587 ms with three, 559 ms with four, then
  nothing more, and a **regression** at eight. `providers.buildings.workerPoolSize` (4)
  sets the count; the pool caps itself at the core count minus one.
- **Spread-out mounting.** What is left on the main thread — expanding colours (~1 ms),
  attaching the tree (~0.05 ms), pushing the buffers to the GPU — is spread out by
  `providers.buildings.mountPerFrame` (2).
- **Local, quantised geometry.** Vertices are expressed in metres around the tile centre,
  and the mesh matrix places them on the globe. An ECEF position is ~6.4 × 10⁶ m: in
  `Float32` its resolution drops to ~0.4 m — the thickness of a façade. Those local metres
  are then quantised to normalised `int16` (`positionPrecision`): half the bytes, for ~4 cm
  of resolution.
- **Cancellable loads.** A tile evicted while loading aborts it, on the network as well as
  in the worker: fast navigation otherwise left the queue entirely busy extruding tiles
  that had already left the view.

The MVT decoder and the workers are loaded via **dynamic import** — a host staying on
photorealistic volume never downloads them. That is what makes the weight of
three-mesh-bvh in the blob acceptable: it takes it from 13 to 71 kB gzipped, but **only a
host that displays internal volume pays it**, once.

> **Worker count.** `workerPoolSize` is pointless beyond
> `providers.buildings.maxInflight` (4 by default): the queue never starts more downloads
> than that, so the extra workers would sit idle. Raise the two together.

> **CSP.** The workers are created from a `Blob`: a security policy must allow
> `worker-src blob:` (or `child-src blob:`). Without it, creation fails and everything
> falls back to the main thread — a few hundred milliseconds of freeze per tile. The
> library then says so once in the console, so it is not mistaken for a slow machine.

## 6. Plugging in another provider

`TiledGlobeLayer` only knows one contract, `TileSource`: give the URL of a tile, and
prepare whatever that URL needs. Both shipped sources implement it, and nothing prevents
writing a third one (corporate proxy, local cache, custom signing).

```ts
import { createTileSource, type TileSource } from '@pasquelin/map3d'

export type TileSource = {
  tileUrl(z: number, x: number, y: number): string
  ensureSession(traffic: boolean): Promise<void> // no-op when nothing needs signing
  setConfig(cfg: TilesConfig, origin: string): void
  readonly supportsTraffic: boolean
}
```

`createTileSource(cfg, origin, apiKey?)` returns the source matching `cfg.provider`, or `null` when
that provider has nothing to serve.

Both shipped sources are exported, to be instantiated by hand — tests, a composite source
delegating to one of them:

| Class | Constructor | What it does |
|---|---|---|
| `GoogleTileSource` | `new GoogleTileSource(apiKey, cfg?)` | `createSession` session (re)created on demand and reused as long as its signature (map type, traffic) does not change; `supportsTraffic = true` |
| `InternalTileSource` | `new InternalTileSource(cfg?, origin?)` | XYZ URLs with neither session nor key: the `internalTileUrl` template is resolved once per `setConfig`, not per tile; `supportsTraffic = false` |

`cfg` and `origin` fall back to `defaultConfig.providers.tiles` / `.internal.origin`.

---

## See also

- [BUILDINGS.md](BUILDINGS.md) — picking a building of that internal volume
- [PEDESTRIAN.md](PEDESTRIAN.md) — tile level of detail while walking
- [CONFIG.md](CONFIG.md) — every `providers.tiles` key
- [ENGINE.md](ENGINE.md) — `BasemapState`, `basemap` event
- [PROPS.md](PROPS.md) — `<MapControls>` buttons

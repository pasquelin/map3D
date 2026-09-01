# `MapConfig` — reference

[Français](../fr/CONFIG.md) · **English** · [↑ Index](README.md)

Every adjustable value of the map, its role and its default.

Generated from `src/config/defaultConfig.ts` (values) and `src/config/types/*.ts`
(descriptions) — the defaults below are the ones the library actually applies.

```tsx
<Map config={{ performance: { antialias: false } }} />
```

An override is **partial and deep**: provide only what changes, `mergeConfig` fills in
the rest. Arrays and tuples, however, are replaced wholesale — a partial tuple is a
compile error.

> **Try before you write.** `pnpm dev:example` mounts, to the right of the map, a
> settings bench (Tweakpane) exposing THIS whole table, live. Its “Copy the
> `PartialConfig`” button yields the delta from the defaults in the exact shape to paste
> into `config={{ … }}`. Settings flagged ❄ are read when the engine is constructed:
> they only take effect once the map is remounted.

> **Translated by hand.** The source of truth is the French version, extracted from the
> code's JSDoc: check [fr/CONFIG.md](../fr/CONFIG.md) if a default looks out of date.

💰 = Google billing impact · 🌍 = locale/i18n impact

## `providers` — Third-party providers, network, caches

| Key | Description | Default |
|---|---|---|
| `providers.internal.origin` | Origin of the self-hosted server (scheme + host + port, no trailing `/`), substituted for `{origin}` in ALL internal templates — 2D basemap **and** volume, which come from the same server. ⚠️ The default is THE PROJECT's production server, not a public service: a third-party host **must** set its own, or pick the `'external'` providers. Empty, the `'internal'` providers stay inert. | `'https://map.gosecure.site'` |
| `providers.internal.elevationEpsilon` | Ground-elevation change (m) below which the raster basemap and the volumes are NOT rebuilt. Elevation is baked into both layers' geometry: tracking it to the centimetre would replay the whole cache every frame. Shared setting — both must use the exact same reference. ⚠️ Was a literal copied into both layers. | `1` |
| `providers.tiles.provider` | Basemap tile provider: `'external'` (Google Map Tiles, session + key, traffic available) or `'internal'` (self-hosted server, plain XYZ URLs, no key, no quota; traffic only by borrowing, see `trafficViaExternal`). See [TILES.md](TILES.md). | `'internal'` |
| `providers.tiles.internalTileUrl` | URL template for an internal raster tile — `{origin}`, `{style}`, `{z}`, `{x}`, `{y}` and `{r}` are substituted. No query string is appended: the internal server signs nothing. | `'{origin}/styles/{style}/{z}/{x}/{y}{r}.png'` |
| `providers.tiles.style` | Name of the style rendered by the internal server, substituted for `{style}`. | `'liberty'` |
| `providers.tiles.retina` | Request internal tiles at double density (`{r}` → `@2x`). Defaults to `false`: the canvas follows `performance.pixelRatio` (1 by default), where an @2x tile quadruples the bytes without adding anything on screen. | `false` |
| `providers.tiles.baseZoom` | Always-loaded base level covering the whole globe — what keeps the map hole-free while finer levels arrive. ⚠️ Was hard-coded (2). | `2` |
| `providers.tiles.fillPoles` | Extends the tiled basemap all the way to the poles. Web Mercator stops at ±85.0511°: without this, a cap of roughly 5° of latitude (~550 km radius) has no tile at all and lets the fallback sphere show through — an ocean-coloured disc in the middle of Antarctica and the Arctic. When enabled, the outermost tile row gets an extra vertex row placed AT the pole, carrying the edge's texture coordinate: the last row of texels is stretched to the pole, with no extra request and no extra texture. | `true` |
| `providers.tiles.maxZoom` | Highest tile zoom requested. ⚠️ Was hard-coded (22, the Google roadmap ceiling): an internal server whose style stops earlier was asked for levels that do not exist. | `22` |
| `providers.tiles.lodRing` | Side (in tiles) of the ring requested at each **intermediate** level of the detail cascade, around the looked-at point. ⚠️ New: the layer only knew two levels, so in a tilted view the distance dropped straight to the base level — a flat wash of colour. Each step reaches twice as far as the previous one. | `5` |
| `providers.tiles.language` | Language of the labels baked into the tiles. `'auto'` follows the browser. ⚠️ Hard-coded to `'fr-FR'` until now: the map displayed French names whatever the application's locale. | `'auto'` |
| `providers.tiles.region` | Regional bias (disputed border rendering, toponymy). `'auto'` lets the provider infer it. ⚠️ Hard-coded to `'FR'` until now. | `'auto'` |
| `providers.tiles.mapType` | 2D basemap requested from the provider. | `'roadmap'` |
| `providers.tiles.trafficViaExternal` | With the `'internal'` provider, **borrow** the Google basemap for as long as the traffic layer is on (no effect with `'external'`). The button stays offered as soon as a `<Map googleMapsApiKey>` is there; turning it on switches the basemap to Google, turning it off returns to the internal server. ⚠️ The basemap changes appearance and tiles are billed again while the layer is on. `false` = original behaviour (no traffic outside `'external'`). | `true` |
| `providers.tiles.layerTypes` | Additional layers requested from the tile session. | `["layerTraffic"]` |
| `providers.tiles.sessionUrl` | Tile session creation endpoint. | `'https://tile.googleapis.com/v1/createSession'` |
| `providers.tiles.tileUrl` | Tile URL template — `{z}`, `{x}`, `{y}` and `{session}` are substituted. | `'https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}'` |
| `providers.tiles.backoffAuthMs` | Wait after an identity refusal (invalid key, quota) before retrying. | `300000` |
| `providers.tiles.backoffTransientMs` | Wait after a transient failure (5xx, network). | `10000` |
| `providers.tiles.maxTiles` | Texture cache cap (GPU memory). ⚠️ 500 → 700: the detail cascade now goes all the way down to the base level, adding a ring of `lodRing²` tiles per coarser step. Under the old cap those levels were evicted by the fine tiles as soon as they were requested, and the uniform wash in the distance came back. | `700` |
| `providers.tiles.maxBytes` | Cap on memory retained by mounted tiles (bytes, `0` = unlimited). ⚠️ New: a decoded raster tile weighs 256×256×4 = 262 KB, so the 700-tile cap above makes 183 MB that nothing bounded. | `268435456` |
| `providers.tiles.evictEvery` | One frame in N triggers the eviction sort, which allocates and costs O(n log n). ⚠️ Was a literal (10). | `10` |
| `providers.tiles.evictSlack` | Overshoot (in tiles) beyond which eviction is forced without waiting its turn, to bound the memory peak. ⚠️ Was a literal (200). | `200` |
| `providers.tiles.mountPerFrame` | Tiles mounted into the scene per frame at most. A raster tile mounts in a fraction of a millisecond: nothing to spread out, unlike volume. | `8` |
| `providers.tiles.maxInflight` | Concurrent downloads. | `12` |
| `providers.tiles.margin` | Ring of tiles preloaded around the viewport. | `1` |
| `providers.tiles.maxRequest` | Budget of tiles requested for the target zoom level. In top-down view (`uniformDetail`), it decides how far the uniform level can reach the buildings' level before falling back to a coarser one — raising it extends buildings' reach (more RAM). ⚠️ 140 → 200. | `200` |
| `providers.tiles.uniformDetail` | Request a SINGLE detail level over the whole extent (the one that covers it within `maxRequest`) instead of the cascade of fine rings around the looked-at point — the latter concentrates detail into a **box** at the center, coarse around it. Uniform = same level everywhere, never a partial box, **top-down and tilted alike** (the zoom at the looked-at point already decides fineness). Raising `maxRequest` extends the fine level's reach (more RAM). The cascade is kept only when **walking** (pedestrian). `false` = cascade everywhere (original behavior). | `true` |
| `providers.tiles.uniformMaxSpread` | Zoom gap tolerated, in steps, between what the LOOKED-AT ground requires and what the whole view allows, before `uniformDetail` gives way to the cascade. On a flat view the gap is nil; in grazing view it explodes (measured: 73 m altitude and 73° tilt → 805 m tiles, eleven times eye height). `1` tolerates one step (invisible) and switches beyond that. `0` = cascade at the slightest gap; a very high value reverts to the old behaviour, uniform no matter what. | `1` |
| `providers.tiles.maxAttempts` | Attempts per tile before giving up for good. | `3` |
| `providers.tiles.retryDelays` | Backoff between two attempts at the same tile. | `[1000, 4000]` |
| `providers.tiles.errorTtlMs` | Duration (ms) a tile that exhausted its attempts stays in error before being requested again, if it is still in view. `0` = permanent error. <!-- audit: à vérifier à la fusion (cœur) --> | `30000` |
| `providers.tiles.staleFrames` | Frames out of view beyond which a pending tile leaves the download queue. Seen again, it comes back. <!-- audit: à vérifier à la fusion (cœur) --> | `120` |
| `providers.tiles.fetch.timeoutMs` | Network policy (`FetchPolicy`) of the Google **session creation**. Give up on a request with no response. `0` = no limit. <!-- audit: à vérifier à la fusion (cœur) --> | `10000` |
| `providers.tiles.fetch.retries` | Retries after a network failure or 5xx. `0` = none. <!-- audit: à vérifier à la fusion (cœur) --> | `0` |
| `providers.tiles.fetch.backoffMs` | Wait before the first retry, doubled on each round, with a random share. `0` = immediate retry. <!-- audit: à vérifier à la fusion (cœur) --> | `0` |
| `providers.routing.matrixUrl` | `computeRouteMatrix` endpoint — point it at a server proxy in production. | `'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'` |
| `providers.routing.routesUrl` | `computeRoutes` endpoint. | `'https://routes.googleapis.com/directions/v2:computeRoutes'` |
| `providers.routing.matrixFields` | Matrix FieldMask — 💰 directly drives Google billing. | `'originIndex,destinationIndex,duration,distanceMeters,condition'` |
| `providers.routing.routeFields` | Route FieldMask — 💰 likewise. | `'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'` |
| `providers.routing.routingPreference` | Requested routing quality — 💰 `TRAFFIC_AWARE_OPTIMAL` is the most expensive tier. | `'TRAFFIC_AWARE_OPTIMAL'` |
| `providers.routing.languageCode` | 🌍 Language of the returned strings. `'auto'` follows the browser. | `'auto'` |
| `providers.routing.regionCode` | 🌍 Regional bias. `'auto'` lets the provider infer it. | `'auto'` |
| `providers.routing.alternatives` | Request several routes (only the fastest is traced today). | `false` |
| `providers.routing.timeoutMs` | Abandon a request with no answer. `0` = no limit (original behaviour). | `10000` |
| `providers.routing.retries` | Retries after a network failure or 5xx. `0` = none. | `2` |
| `providers.routing.backoffMs` | Wait before the first retry, doubled each round, with a random share. `0` = immediate retry. | `300` |
| `providers.routing.headers` | Extra headers, taking precedence over ours. Required to target a **server proxy** rather than exposing the Google key client-side. | *(absent)* |
| `providers.routing.units` | Unit system of the returned strings (`'METRIC'` / `'IMPERIAL'`). Absent = inferred from `languageCode`. | *(absent)* |
| `providers.routing.cache.ttlMs` | Lifetime of a routing response. | `60000` |
| `providers.routing.cache.cellMeters` | Position quantisation in the cache key (drift tolerance). | `150` |
| `providers.routing.cache.maxEntries` | Entry cap before LRU eviction. | `500` |
| `providers.routing.fastestOversample` | Candidates queried per displayed link, as a multiple of the requested count. 💰 **Directly multiplies the billed matrix**: asking for the 5 fastest queries 15. Oversampling exists so that the N fastest *by time* are picked from enough candidates *by distance* — the closest… | `3` |
| `providers.routing.staleMeters` | Drift (m) of one end beyond which times and trace are recomputed. 💰 The lower the value, the more often the provider is called. | `150` |
| `providers.routing.refreshIntervalMs` | Minimum interval between two recomputations of the same relation. 💰 Throughput cap. | `15000` |
| `providers.routing.presets.fastest` | “The N fastest”; each step costs `N × fastestOversample` matrix cells. | `[3, 5, 10]` |
| `providers.routing.presets.radius` | Selection radii, **in metres** — the base unit, as everywhere. They are DISPLAYED through `labels.measure`, so an imperial set renders them in miles without changing anything here. But the steps themselves stay metric: 500 m, 1 km, 3 km yield “0.3 mi”, “0.6 mi”, “1.9 mi” — accurate but… | `[500, 1000, 3000]` |
| `providers.places.url` | `places:searchText` endpoint. | `'https://places.googleapis.com/v1/places:searchText'` |
| `providers.places.fields` | FieldMask — 💰 drives Places billing. | `'places.displayName,places.formattedAddress,places.location,places.viewport'` |
| `providers.places.pageSize` | Number of results requested (clamped to `pageSizeRange` by the provider). | `6` |
| `providers.places.pageSizeRange` | Bounds accepted by the API for `pageSize`. | `[1, 20]` |
| `providers.places.languageCode` | 🌍 Language of the results. `'auto'` follows the browser. | `'auto'` |
| `providers.places.regionCode` | 🌍 Regional bias of the results. | `'auto'` |
| `providers.places.timeoutMs` | Abandon a request with no answer. `0` = no limit. Tighter than for routing: the user is waiting in front of an empty list. | `5000` |
| `providers.places.retries` | Retries after a network failure or 5xx. `0` = none. 💰 Since search re-runs on every keystroke, each retry is one more billed Places call. | `1` |
| `providers.places.backoffMs` | Wait before the first retry, doubled each round, with a random share. `0` = immediate retry. | `300` |
| `providers.places.headers` | Extra headers, taking precedence over ours — same use and priority as `providers.routing.headers`. | *(absent)* |
| `providers.tiles3d.provider` | Volume provider (`'3d'` mode): `'external'` (photorealistic 3D tiles, from the Ion token / key passed to `<Map>`) or `'internal'` (terrain and buildings from the self-hosted server). Independent of `providers.tiles.provider`. Changeable at runtime; with `'internal'` the photorealistic tileset is frozen, so it **issues no request**. See [TILES.md](TILES.md). | `'internal'` |
| `providers.buildings.tileUrl` | URL template for a vector tile — `{origin}`, `{z}`, `{x}`, `{y}` substituted. | `'{origin}/data/openmaptiles/{z}/{x}/{y}.pbf'` |
| `providers.buildings.sourceLayer` | OpenMapTiles layer holding the footprints. | `'building'` |
| `providers.buildings.heightField` | Total height attribute (m above ground). | `'render_height'` |
| `providers.buildings.minHeightField` | Base height attribute — a porch or a stilted building does not start at 0. | `'render_min_height'` |
| `providers.buildings.hideField` | Boolean attribute excluding a footprint from extrusion. | `'hide_3d'` |
| `providers.buildings.colorField` | Per-footprint colour attribute; otherwise the theme decides. | `'colour'` |
| `providers.buildings.defaultHeight` | Height (m) used when the attribute is missing — a footprint without height stays visible. | `6` |
| `providers.buildings.maxHeight` | Maximum height (m) retained; beyond it the footprint is clamped. ⚠️ New: height came RAW from the data, and `height=99999` (a common OSM typo) produced a hundred-kilometre building — oversized bounding volume, tile permanently visible, camera stopped on a ghost. | `1000` |
| `providers.buildings.positionPrecision` | Format of the positions sent to the GPU: `'int16'` (integers normalised over the tile's extent, ~4 cm resolution, **half the bytes**) or `'float32'` (fallback, for a use case needing better than a centimetre). | `'int16'` |
| `providers.buildings.zoom` | Zoom of the requested tiles: the data's `maxzoom` (14 in OpenMapTiles). | `14` |
| `providers.buildings.maxViewAltitude` | Maximum height **above ground** (m) at which buildings stay shown; past it they are faded out, hidden and destroyed. ⚠️ Replaces `minViewZoom`/`showZoomOffset`, which were expressed in view zoom: zoom derives from an m/px resolution, hence from a division by viewport height, so the same setting kept buildings shown up to 15 km on a 700 px window against 31 km on a 1440 px one. An altitude depends on neither window nor latitude. | `1000` |
| `providers.buildings.requestAltitudeFactor` | Preload band above `maxViewAltitude`, as a multiple of it: tiles are downloaded and mounted there **without being shown**, so the descent does not discover them still to do. ⚠️ What it absorbs has changed in nature: mounting no longer costs ~20 ms but ~1 ms (the collision tree is built in the worker, see `workerPoolSize`) — it is now the **pipeline latency**, download and extrusion included. `1` removes the band — buildings then appear in fits and starts. | `1.5` |
| `providers.buildings.maxViewDistance` | **Maximum radius (m) of the coverage disc** for the volume, centred under the camera; past it the raster basemap stands alone. ⚠️ A disc, not the view frustum's bbox: the latter depended on **heading** (area ×2 between a north heading and a 45° one, so tiles changed as you turned) and blew up at the horizon in a sawtooth (2.8 → 36.3 km, collapses at 59° and 74°). A disc is invariant and bounded by construction. Cost grows as n²: measured in Paris, 32 z14 tiles at 5 km, 47 at 6 km — beyond that, raise `maxRequest`, `maxTiles` and `maxBytes`. | `5000` |
| `providers.buildings.margin` | Ring of tiles prefetched around the viewport. | `0` |
| `providers.buildings.maxTiles` | Cap on the extruded-tile cache (GPU memory). A dense z14 tile weighs ~131,000 triangles: this cap has nothing to do with the raster one. Keep it well above `maxRequest`, otherwise a pan evicts what it just requested. ⚠️ 36 → 80 (follows `maxRequest`). | `80` |
| `providers.buildings.maxBytes` | Cap on memory retained by mounted volumes (bytes, `0` = unlimited). ⚠️ New, and this is the one that **actually** bounds memory: a dense z14 tile weighs ~4.9 MB (positions, colours, indices, collision tree), so the 36-tile cap above made 175 MB — enough to lose the WebGL context on an integrated GPU. Out in the countryside the same 36 tiles weigh 2 MB: a tile count says nothing about what is retained. ⚠️ 256 → 448 MiB (follows the widened square; **lower it** on a modest machine). | `469762048` |
| `providers.buildings.evictEvery` | One frame in N triggers the eviction sort. ⚠️ Was a literal (10). | `10` |
| `providers.buildings.evictSlack` | Overshoot (in tiles) beyond which eviction is forced. ⚠️ Was a literal (16). | `16` |
| `providers.buildings.mountPerFrame` | Tiles mounted into the scene per frame at most. ⚠️ 1 → **2**. Mounting used to be dominated by building the collision tree (~41 ms per dense tile, 97% of the cost), now done in the worker: all that is left is attaching the tree (~0.05 ms), expanding colours (~1 ms) and the GPU upload — unmeasured, hence a doubling rather than opening it wide. | `2` |
| `providers.buildings.maxInflight` | Tiles concurrently downloading **and extruding**. ⚠️ 2 → **4**, aligned with `workerPoolSize`: left at 2 it would have starved the pool, leaving two workers out of four idle. | `4` |
| `providers.buildings.workerPoolSize` | Extrusion workers running in parallel. ⚠️ New, the necessary counterpart to building the collision tree in the worker: a dense tile now costs ~60 ms there instead of ~19, and a single thread would serialise them. Measured over 24 Paris z14 tiles — 1430 ms with one worker, 587 ms with three, 559 ms with four, then nothing more and a **regression** at eight. The pool caps itself at the core count minus one. Pointless beyond `maxInflight`. | `4` |
| `providers.buildings.maxRequest` | Budget of tiles requested for one view. ⚠️ Now only a **safety net**: the `maxViewDistance` disc bounds coverage, and the measured peak at 5 km is 32 tiles. This budget used to trigger a fallback to a fixed-size square around the looked-at point whenever exceeded — hence an abrupt switch between two regimes in tilted view. See [TILES.md § 5](TILES.md). | `49` |
| `providers.buildings.maxAttempts` | Attempts per tile before giving up. | `3` |
| `providers.buildings.retryDelays` | Backoff between two attempts on the same tile. | `[1000, 4000]` |
| `providers.buildings.errorTtlMs` | Duration (ms) a tile that exhausted its attempts stays in error before being requested again, if it is still in view. `0` = permanent error. <!-- audit: à vérifier à la fusion (cœur) --> | `30000` |
| `providers.buildings.staleFrames` | Frames out of view beyond which a pending tile leaves the download queue. Seen again, it comes back. <!-- audit: à vérifier à la fusion (cœur) --> | `120` |
| `providers.buildings.pickFields` | MVT attributes surfaced by the building pick (`buildingMenu`). **Empty by default**: the data carries dozens per footprint, and carrying them all would cost, per tile, more than the whole geometry. The host asks for what it displays. | `[]` |
| `providers.tiles3d.cesiumIonAssetId` | Cesium Ion asset served by default (Google Photorealistic 3D Tiles). ⚠️ The identifier used to be written in the engine and repeated in TWO documentation blocks: three copies of a value that designates a provider, the only one of its kind living outside `providers`. | `'2275207'` |
| `providers.tiles3d.hideVolumeWhenClamped` | Hides the internal buildings above `providers.buildings.maxViewAltitude`: from higher up they cover only a few pixels and leave a "square" in the void. Faded out then hidden — but **kept in memory** as long as you stay within the `requestAltitudeFactor` band, otherwise the reappearance would restart from an empty cache and pop instead of fading. RAM/VRAM is returned only above that band. The criterion is a height above ground, so **valid at any tilt**. **The mode does not change** (stays `'3d'`). `false` = always shown. Internal only. | `true` |
| `providers.tiles3d.volumeFadeMs` | Duration of the buildings' opacity fade on appearance/disappearance (ms). `0` = hard cut. | `250` |
| `providers.symbols.cacheMaxEntries` | Cap of the rendered thumbnail cache. ⚠️ Unbounded until now. | `200` |
| `providers.templates.baseUrl` | Root of the templates REST API. Empty = no backend (local cache only). | `''` |
| `providers.templates.headers` | Headers of the default HTTP provider (auth of a server-side proxy). | `{}` |
| `providers.templates.fetch.timeoutMs` | Give up on a request with no response. `0` = no limit. | `10000` |
| `providers.templates.fetch.retries` | Retries after a network failure or 5xx. `0` = none. | `1` |
| `providers.templates.fetch.backoffMs` | Wait before the first retry, doubled on each round, with a random share. | `300` |
| `providers.templates.categories` | Categories offered when saving — configurable, never hard-coded in the UI. | `["shapes", "freehand", "symbols"]` |
| `providers.templates.defaultCategories` | Categories ticked by default in the “Save” form. | `["shapes", "freehand", "symbols"]` |
| `providers.templates.defaultApply` | Default mode for applying a template to the current drawing. | `'merge'` |
| `providers.templates.allowExport` | Allow `.m3dt` file export/import. | `true` |
| `providers.templates.saveView` | Offer the “View” checkbox: the template also stores where you look from (camera pose, basemap, “Layers” filter, pedestrian view). | `true` |
| `providers.templates.defaultSaveView` | “View” checkbox checked upfront. No effect when `saveView` is false. | `false` |
| `providers.templates.applyView` | Replay a template's view when loading it (“merge” and “replace”; never “remove”). | `true` |
| `providers.templates.viewFlyDuration` | Travel duration (s) towards the loaded view; `0` = instant reposition. | `1.2` |

## `interaction` — Gesture thresholds, pointer tolerances, shortcuts

| Key | Description | Default |
|---|---|---|
| `interaction.shapeHitTolerancePx` | Click tolerance around a drawn shape's stroke. | `14` |
| `interaction.linkHitTolerancePx` | Click tolerance around a relation link's stroke. | `12` |
| `interaction.closeSnapPx` | Snap distance to close a polygon (drawing and marquee). | `16` |
| `interaction.clickSlopPx` | Movement beyond which a click becomes a drag (selection). | `4` |
| `interaction.dragSlopPx` | Same, for grabbing a marker towards a drop zone. | `8` |
| `interaction.repositionSlopPx` | Same, for repositioning an object on the map. | `4` |
| `interaction.cleanClickPx` | Movement tolerated before a map click stops counting as a click. | `6` |
| `interaction.lassoMinStepPx` | Decimation of the lasso stroke. | `3` |
| `interaction.duplicateOffsetPx` | Bottom-right offset applied to duplication clones. | `12` |
| `interaction.longPressMs` | Press-and-hold before arming a grab (touch). | `150` |
| `interaction.minScale` | Floor scale factor of a transformation (anti-collapse). | `0.02` |
| `interaction.damping` | Inertia of the navigation controls. | `true` |
| `interaction.lens.minDragPx` | Minimum drag to create a lens area. | `4` |
| `interaction.lens.minSizePx` | Minimum side of an area when resizing. | `28` |
| `interaction.history.coalesceMs` | Window during which a burst of actions makes a single undo entry. | `800` |
| `interaction.history.depth` | Depth of the undo stack. | `50` |
| `interaction.menu.hoverIntentMs` | Sustained hover before a submenu opens. | `150` |
| `interaction.menu.submenuCloseMs` | Grace delay before closing a sub-panel you left. | `140` |
| `interaction.buildingPick.cursor` | Canvas cursor while the “select a building” tool is active. A **system** cursor — the project's convention rules out cursor images. Set inline on the canvas, which wins over the injected stylesheet's `grab`. | `'crosshair'` |
| `interaction.hubHitTolerancePx` | Click tolerance around a relation hub (the link has its own). | `12` |
| `interaction.repositionHitPx` | Clickable target of a repositionable marker's ground point. The dot is 7 px: without widening, catching it is a matter of dexterity. The value used to live in the stylesheet (`::before`), hence outside this block although it belongs exactly here — a pointer tolerance that touch support… | `22` |
| `interaction.clickSuppressMs` | Time net after a gesture: how long the synthetic `click` that follows is swallowed. Coupled with `longPressMs` — a touch context that lengthens one must be able to lengthen the other. | `400` |
| `interaction.lockFlashMs` | Duration (ms) of the “shape locked” flash when a gesture targets a shape its constraints forbid editing. <!-- audit: à vérifier à la fusion (cœur) --> | `800` |
| `interaction.freehandMinStepPx` | Decimation of the freehand stroke (floor, in px). Counterpart of `lassoMinStepPx`. | `2` |
| `interaction.targetZoom` | Zoom of the “Target” flight from an inventory or a list. | `17` |
| `interaction.pinnedFlyZoom` | Zoom of the flight when clicking a dock favourite. | `16` |
| `interaction.barMinScale` | Compaction floor of a bar before it switches to columns. | `0.85` |
| `interaction.tooltip.flipBelowPx` | Below this window height, the tooltip flips below the pointer. | `76` |
| `interaction.tooltip.clampMarginPx` | Estimated half-width, for horizontal clamping against the edges. | `78` |
| `interaction.tooltip.offsetBelowPx` | Vertical offset when it opens downwards. | `18` |
| `interaction.tooltip.offsetAbovePx` | Same, upwards. | `14` |
| `interaction.spiderfy.pairRadiusRatio` | Radius of a PAIR, as a fraction of the chip radius (minimum separation). | `0.1` |
| `interaction.spiderfy.minRingRatio` | Floor radius of the ring, in multiples of the chip radius. | `1.15` |
| `interaction.spiderfy.gapPx` | Spacing between two chips on the ring. | `8` |
| `interaction.spiderfy.zoomEpsilon` | Zoom hysteresis of the automatic trigger. | `0.05` |
| `interaction.clusterOpenZoom.expansion` | Margin added to the cluster burst zoom (clean separation). | `0.3` |
| `interaction.clusterOpenZoom.max` | Margin added when the burst zoom already exceeds `clustering.maxZoom`. | `0.5` |
| `interaction.symbols.sizePx` | Screen size (px) of a placed symbol. | `40` |
| `interaction.symbols.previewSizePx` | Size of the thumbnails in the palette grid. | `34` |
| `interaction.shortcuts.controls.north` | Reorients to north and restores the top-down view. | `'n'` |
| `interaction.shortcuts.controls.zoomIn` | Zoom in one step. | `'+'` |
| `interaction.shortcuts.controls.zoomOut` | Zoom out one step. | `'-'` |
| `interaction.shortcuts.controls.tilt` | Toggles the camera tilt. | `'i'` |
| `interaction.shortcuts.controls.globe` | Pull back to globe view. | `'g'` |
| `interaction.shortcuts.controls.layers` | Opens the “Layers” panel (tag filter). | `'t'` |
| `interaction.shortcuts.controls.catalog` | Opens the “Catalog” panel. With no source declared, the key is inactive. | `'c'` |
| `interaction.shortcuts.controls.fullscreen` | Fullscreen. | `'f'` |
| `interaction.shortcuts.controls.basemap` | Switch photorealistic 3D ↔ 2D plan. | `'b'` |
| `interaction.shortcuts.controls.graticule` | Toggles the coordinate grid — a VIEW command, works with no drawing layer mounted. `'g'` (the mnemonic choice) is already taken by `globe`, hence the default `'k'`. | `'k'` |
| `interaction.shortcuts.controls.traffic` | Traffic overlay — the button only exists in plan mode. | `false` |
| `interaction.shortcuts.controls.pedestrian` | Enter / exit pedestrian mode — the button only exists in external photorealistic 3D. | `'w'` |
| `interaction.shortcuts.navigate.forward` | Move forward — held. Several keys: the arrows, universal, and a letter family that depends on keyboard layout. | `['arrowup', 'z']` |
| `interaction.shortcuts.navigate.backward` | Move back. | `['arrowdown', 's']` |
| `interaction.shortcuts.navigate.left` | Strafe left. | `['arrowleft', 'q']` |
| `interaction.shortcuts.navigate.right` | Strafe right. | `['arrowright', 'd']` |
| `interaction.shortcuts.navigate.boost` | Speed-up modifier, held. | `['shift']` |
| `interaction.shortcuts.pedestrian.immersion` | Toggles exploration ↔ full immersion (Pointer Lock). ENTERING pedestrian mode already has its own key in `controls.pedestrian`; this one only covers what has no toolbar button. `false` by default: Escape alone exits immersion (native Pointer Lock release), burning a global key for it would be confusing. | `false` |
| `interaction.shortcuts.draw.select` | Select tool. | `'v'` |
| `interaction.shortcuts.draw.selectRect` | Rectangle selection. | `'1'` |
| `interaction.shortcuts.draw.selectPoly` | Polygon selection. | `'2'` |
| `interaction.shortcuts.draw.selectBuilding` | Selection of a **building** of the internal volume — a row of the same selector, but not a drawing selection mode: it arms an engine tool, and leaves drawing. | `'4'` |
| `interaction.shortcuts.draw.selectLasso` | Lasso selection. | `'3'` |
| `interaction.shortcuts.draw.line` | Line. | `'l'` |
| `interaction.shortcuts.draw.polygon` | Polygon. | `'p'` |
| `interaction.shortcuts.draw.rect` | Rectangle. | `'r'` |
| `interaction.shortcuts.draw.circle` | Circle. | `'c'` |
| `interaction.shortcuts.draw.freehand` | Freehand stroke. ⚠️ Was `'d'`, now taken by keyboard movement (ZQSD). | `'h'` |
| `interaction.shortcuts.draw.arrow` | Arrow. | `'a'` |
| `interaction.shortcuts.draw.measure` | Measuring tool. | `'m'` |
| `interaction.shortcuts.draw.erase` | Eraser. | `'e'` |
| `interaction.shortcuts.draw.erasePoint` | Point eraser (sub-mode). No default key. | `false` |
| `interaction.shortcuts.draw.eraseSelect` | Marquee eraser (sub-mode). No default key. | `false` |
| `interaction.shortcuts.draw.symbol` | Tactical symbols palette. | `'y'` |
| `interaction.shortcuts.edit.undo.key` | Undo. | `'z'` |
| `interaction.shortcuts.edit.undo.mod` | Undo. | `'mod'` |
| `interaction.shortcuts.edit.redo.key` | Redo. | `'z'` |
| `interaction.shortcuts.edit.redo.mod` | Redo. | `'mod'` |
| `interaction.shortcuts.edit.redo.shift` | Redo. | `true` |
| `interaction.shortcuts.edit.redoAlt.key` | Windows variant (`Ctrl+Y`) — historically in addition to `Ctrl+Shift+Z`. | `'y'` |
| `interaction.shortcuts.edit.redoAlt.mod` | Windows variant (`Ctrl+Y`) — historically in addition to `Ctrl+Shift+Z`. | `'ctrl'` |
| `interaction.shortcuts.edit.selectAll.key` | Select all — only acts if a map tool is active. | `'a'` |
| `interaction.shortcuts.edit.selectAll.mod` | Select all — only acts if a map tool is active. | `'mod'` |
| `interaction.shortcuts.edit.duplicate.key` | Duplicate the selection. | `'d'` |
| `interaction.shortcuts.edit.duplicate.mod` | Duplicate the selection. | `'mod'` |
| `interaction.shortcuts.edit.delete` | Deleting the selection; both usual keys by default. | `["Delete", "Backspace"]` |
| `interaction.shortcuts.edit.closePolygon` | Closing the polygon in progress. | `'Enter'` |
| `interaction.shortcuts.edit.nudgePx` | Keyboard movement of the selection, in screen pixels. | `1` |
| `interaction.shortcuts.edit.nudgeFastPx` | Same with Shift — the “fast” step. | `10` |
| `interaction.shortcuts.lens.toggle` | Toggle of the lens tool. | `'x'` |

## `performance` — Computation and sampling budgets

| Key | Description | Default |
|---|---|---|
| `performance.pixelRatio` | Device pixel ratio of the rendering. `1` forces non-retina rendering: half as many pixels to fill, a smoother globe on a high-density display. | `1` |
| `performance.antialias` | Antialiasing of the WebGL context. A quality/GPU-load trade-off of the same order as `pixelRatio`, which was exposed — this one was not. ⚠️ Read at context **creation**: changing it at runtime has no effect. | `true` |
| `performance.powerPreference` | GPU trade-off requested from the browser. `'high-performance'` asks for the discrete GPU: on a dual-GPU laptop, the browser default happily leaves a full-screen 3D map on the integrated chip. ⚠️ Read at context **creation**. | `'high-performance'` |
| `performance.adaptiveResolution.enabled` | Lower the render resolution when below the target frame rate, raise it back when idle. The only lever that returns GPU time proportionally: halving the ratio quarters the pixels to fill. | `true` |
| `performance.adaptiveResolution.targetFrameMs` | Target frame time (ms). Above it, resolution steps down. | `22` |
| `performance.adaptiveResolution.minRatio` | Floor of the ratio, as a fraction of `pixelRatio`. | `0.5` |
| `performance.adaptiveResolution.step` | Step down/up, as a fraction of `pixelRatio`. | `0.1` |
| `performance.adaptiveResolution.sampleFrames` | Frames measured before acting — ignores isolated hiccups. | `30` |
| `performance.textureAnisotropy` | Anisotropic filtering of tile textures. `0` = hardware maximum (typically 16), `1` = none. ⚠️ Decisive in GRAZING view: without it, a texture viewed at a shallow angle produces a fan-shaped moiré that gets recomputed every frame — invisible from the sky, unbearable at eye height. The GPU cost is negligible next to the gain. | `0` |
| `performance.renderOnDemand.enabled` | Paint only what changed. The frame loop always runs; what is skipped is the RENDER (WebGL pass + DOM overlays) when nothing asked for it. | `true` |
| `performance.renderOnDemand.idleFrames` | Frames painted after the last request. | `3` |
| `performance.renderOnDemand.maxIdleMs` | Delay after which a frame is painted even without a request (safety net). `0` removes it. | `1000` |
| `performance.overlayDepth.nearMeters` | Near plane of the DOM overlay projection — deliberately much wider than the 3D render's, which would hide distant markers. | `0.1` |
| `performance.overlayDepth.farMeters` | Far plane of the same projection. | `1e9` |
| `performance.boundsPickGrid` | Side of the raycast grid that derives the visible bounds (`n²` per frame). | `5` |
| `performance.boundsMargin` | Widening of the bbox emitted by `onViewportChange`. **Directly drives the volume of data the application loads.** | `0.15` |
| `performance.viewportSettleFrames` | Frames of stillness before emitting the `viewport` event. | `4` |
| `performance.markerRecomputeMs` | Minimum interval between two cluster recomputations during a pan. | `90` |
| `performance.readoutRefreshMs` | Minimum interval between two writes of the view readout block (`<Map readout>`), in ms. Since the `camera` event fires every frame, copying it straight through would mean four DOM writes per frame for text the eye cannot follow. The latest value is always written. | `120` |
| `performance.statThresholds` | Comfort bounds for the diagnostics panel, per metric — what decides green, amber or red. A metric ABSENT from this table shows with no colour: that is the default for anything without a universal “good” or “bad” (a latitude, a heading, an altitude are not judged). | see below |
| `performance.statThresholds.fps` | Comfort bounds for “frames per second” — see the ordering rule below. | `{ ok: 55, warn: 30 }` |
| `performance.statThresholds.paintedRatio` | Comfort bounds for “share of loop frames actually painted” — see the ordering rule below. | `{ ok: 0.9, warn: 0.6 }` |
| `performance.statThresholds.markersVisible` | Comfort bounds for “markers actually painted” — see the ordering rule below. | `{ ok: 400, warn: 1200 }` |
| `performance.statThresholds.triangles` | Comfort bounds for “triangles in the scene” — see the ordering rule below. | `{ ok: 2_000_000, warn: 5_000_000 }` |
| `performance.statThresholds.drawCalls` | Comfort bounds for “draw calls” — see the ordering rule below. | `{ ok: 300, warn: 800 }` |
| `performance.statThresholds.textures` | Comfort bounds for “textures in GPU memory” — see the ordering rule below. | `{ ok: 400, warn: 900 }` |
| `performance.statThresholds.resolutionScale` | Comfort bounds for “applied resolution scale” — see the ordering rule below. | `{ ok: 1, warn: 0.75 }` |
| `performance.statThresholds.tileBytes` | Comfort bounds for “memory held by tiles” — see the ordering rule below. | `{ ok: 384 Mio, warn: 768 Mio }` |

> **A threshold's direction comes from the ORDER of its two bounds**, there is no flag to keep in sync with the values:
> — `ok < warn`: the metric **weighs** (triangles, markers) — smaller is better;
> — `ok > warn`: the metric **carries** (frame rate, painted frames) — larger is better.
>
> These values are calibrated for a 16.6 ms budget (60 Hz). A host targeting modest machines tightens them. See [Diagnostics panel](CAMERA.md).

| Key | Description | Default |
|---|---|---|
| `performance.cameraMoveEpsilon.deg` | Latitude/longitude difference (degrees) beyond which the camera counts as moved. | `1e-06` |
| `performance.cameraMoveEpsilon.altitudeRatio` | Altitude difference, as a fraction of the current altitude. | `0.001` |
| `performance.cameraMoveEpsilon.altitudeMinMeters` | Absolute floor of the previous one (m) — near the ground, a ratio alone never triggers. | `1` |
| `performance.groundSample.ttlMs` | Validity duration of a memoised sample. | `2000` |
| `performance.groundSample.cellDeg` | Spatial quantisation of the cache (degrees) — `1e-4` ≈ 11 m. `0` removes memoisation. | `0.0001` |
| `performance.groundSample.cacheMaxCells` | Cells kept before the street-level cache is purged. Bounds the memory of a session that covers a lot of ground. | `4096` |
| `performance.groundSample.rayOriginMeters` | Altitude the downward ray starts from. | `12000` |
| `performance.groundSample.rayFarMeters` | Ray range. Must stay consistent with `rayOriginMeters`. | `40000` |
| `performance.groundSample.radiusMeters` | Radius of the “street level” sample ring (local minimum under the roof). | `18` |
| `performance.groundSample.samples` | Number of shots on that ring. | `8` |
| `performance.markerCullMarginPx` | Margin (screen px) beyond the frame past which a marker is hidden (`display:none`): the browser stops computing its style, layout and compositing. `0` disables culling. | `200` |
| `performance.markerZoomBand` | Hysteresis around a `static` marker appearance threshold (`useZoomGate`). Without it, a wheel stopping exactly on the value makes the scenery flicker: zoom oscillates by a few thousandths as inertia settles, and every oscillation would cross the threshold. Same role as `relations.zoomBand`, applied here to whole markers appearing. | `0.15` |
| `performance.resettle.batch` | Items re-sampled per pass (raycast budget). | `4` |
| `performance.resettle.retryFrames` | Retry rate for unresolved anchors (unloaded area). | `30` |
| `performance.resettle.mppBand` | Resolution hysteresis before rebuilding widths (1.25 = ±25 %). | `1.25` |
| `performance.resettle.windowFrames` | Length of the window opened by a camera movement (frames). | `90` |
| `performance.resettle.spawnWindowFrames` | Length of the window opened when an object is created (frames). Longer than the previous one: the tiles under a freshly appeared object have often not finished refining. | `150` |
| `performance.resettle.everyNFrames` | One pass handles a batch every N frames — amortises the raycast cost. | `3` |
| `performance.relations.maxSteps` | Subdivision cap of a draped arc. | `256` |
| `performance.relations.stepMeters` | Sampling step of a draped arc. | `200` |
| `performance.relations.fanMaxLegs` | Beyond N links, the fan collapses into an aggregated line (legibility threshold). | `5` |
| `performance.relations.zoomBand` | Zoom hysteresis band before recomputing the visual grouping. | `0.3` |
| `performance.circleSegments` | Polygonisation density of a circle — rendering **and** geometric predicates. | `64` |
| `performance.shapeGroundSamples` | Points of a zone's outline probed to find the lowest ground under its volume — the base of an extrusion does not float on a slope. <!-- audit: à vérifier à la fusion (cœur) --> | `16` |
| `performance.groundHeightRange` | Altitude range accepted for a surface sample. Outside these bounds, the sample is deemed aberrant and ignored. Widen it for a non-terrestrial tileset (mock-up, indoor, aerial). | `[-500, 9000]` |

## `style` — Surface stacking

⚠️ **Two planes, not a single list.** `.m3d-overlay` and `.m3d-css2d` each create a stacking
context: the values living INSIDE them are never compared with those OUTSIDE. Setting a level
of the map plane beyond `mapOverlay` will therefore NOT raise it above the UI — `mapOverlay`
is what carries that whole plane.

- **Root plane** (children of `.m3d-root`): `mapOverlay` < `floatingHud` < `dock` < `ui` < `menu`
- **Map plane** (inside `.m3d-overlay`): `relationBar` < `editOverlay` < `listMenu`
- **Local plane** (inside the carrying surface): `tooltip`, `markerSelected` — locked inside
  a marker anchor or a panel, they never compare with either of the other two planes. Their
  small values are not an anomaly; raising them raises nothing.

⚠️ **Every default value changed** when moving to two planes. An application that pinned its
own modals to the old ones (`ui: 999`, `menu: 9999`) must revisit them.

| Key | Description | Default |
|---|---|---|
| `style.zIndex.mapOverlay` | ROOT plane. MAP surfaces: markers (`.m3d-css2d`), edit handles, lens zone, link anchors. Below every UI surface — this is what guarantees a panel is never pierced by a handle, and that the number of on-screen markers does not affect stacking (CSS2DRenderer writes `1..N` on the anchors; this level locks them inside one context). | `100` |
| `style.zIndex.floatingHud` | ROOT plane. Floating HUD (selection, lens): above the map, below the bars. | `900` |
| `style.zIndex.dock` | ROOT plane. Favourites dock — deliberately BELOW the bars. | `990` |
| `style.zIndex.ui` | ROOT plane. Bars, panels, search box: the UI surface plane. | `991` |
| `style.zIndex.barTooltip` | ROOT plane. Bar tooltips (`.m3d-tip`), portalled to the root by `<MapTooltip>` — hence SIBLINGS of the panels, not trapped inside the bar. ⚠️ Not to be confused with `tooltip`, which is a LOCAL plane. This one must sit above the panels (`ui`) — that is its whole point — but STAY BELOW `menu`: an open menu is a decision in progress, a tooltip is only an explanation. | `992` |
| `style.zIndex.menu` | ROOT plane. Context menus and drag-and-drop ghosts: at the top. | `993` |
| `style.zIndex.modal` | ROOT plane. Modals (confirmation dialog): above everything, menus included. | `1092` |
| `style.zIndex.relationBar` | MAP plane. Status bar of a relation, resting on the map. | `6` |
| `style.zIndex.editOverlay` | MAP plane. SVG selection overlay (transformation handles). | `15` |
| `style.zIndex.graticuleLabel` | MAP plane. Graticule labels — deliberately the LOWEST level: the grid is a reference backdrop, it must never pass in front of anything the map carries. | `1` |
| `style.zIndex.tooltip` | LOCAL plane. Tooltips, INSIDE the surface carrying them: the marker anchor for `.m3d-markertip`, the bar or panel for `.m3d-tip`. Both are isolated stacking contexts (anchor z-index written by CSS2DRenderer, a panel's `backdrop-filter`), so this value never compares with the MAP plane levels. Raising it will put the tooltip above nothing. | `2` |
| `style.zIndex.listMenu` | MAP plane. Actions menu of a list row. | `96` |
| `style.zIndex.markerSelected` | Selected marker, INSIDE its own marker anchor. ⚠️ Do not raise it above neighbouring markers: the anchor carries a numeric `z-index`, so it creates a context and this value stays locked inside it. The order BETWEEN markers is decided by the `renderOrder` the engine gives to CSS2DRenderer (see `setRaised`), not here. | `80` |

three.js render order (`renderOrder`) per **layer family**: drawings go above relations, themselves above shapes, paths and links (which tie).

| Key | Description | Default |
|---|---|---|
| `style.renderOrder.shapes` | Shapes (`<ShapeLayer>`). <!-- audit: à vérifier à la fusion (cœur) --> | `1` |
| `style.renderOrder.paths` | Paths (`<PathLayer>`). <!-- audit: à vérifier à la fusion (cœur) --> | `1` |
| `style.renderOrder.links` | Links. <!-- audit: à vérifier à la fusion (cœur) --> | `1` |
| `style.renderOrder.relations` | Relations — above shapes, paths and links. <!-- audit: à vérifier à la fusion (cœur) --> | `2` |
| `style.renderOrder.drawings` | Drawings — above everything else. <!-- audit: à vérifier à la fusion (cœur) --> | `4` |

## `camera` — Navigation limits and command steps

| Key | Description | Default |
|---|---|---|
| `camera.minZoom` | Minimum reachable zoom (maximum zoom-out). Bounds the same distance as `maxDistanceFactor`, in zoom rather than Earth radii: the tighter of the two wins. | `2` |
| `camera.maxZoom` | Maximum reachable zoom **in plan mode** — the descent floor. A flat map only reads better the closer you get. | `21` |
| `camera.maxZoom3d` | Maximum zoom **in 3D**, the counterpart of `maxZoom` as `maxTilt3d` is of `maxTilt2d`. Below building height the camera ends up IN the street: a wall fills the screen. Height above ground = `40,075,016 / 2^zoom` — ~153 m at 18, ~76 m at 19, ~19 m at 21. | `18` |
| `camera.maxTilt` | General maximum tilt (rad from nadir). | `1.05` |
| `camera.fov` | Vertical field of view (degrees). Read at engine construction only. | `60` |
| `camera.maxTilt3d` | Maximum tilt in 3D (rad from nadir) — beyond it, the view flips. | `1.382300767579509` |
| `camera.maxTilt2d` | Maximum tilt in 2D (rad from nadir). Defaults to `maxTilt3d` (~79°); tightening it bounds tile coverage (a flat map tilted toward the horizon requests them ever farther) and raises the angle at which the graticule fades out. | `1.382300767579509` |
| `camera.tiltStep` | Tilt step per click of the dedicated button (rad). | `0.34557519189487723` |
| `camera.zoomFactor.in` | Altitude factors per zoom notch (+/− button). | `0.5` |
| `camera.zoomFactor.out` | Altitude factors per zoom notch (+/− button). | `2` |
| `camera.maxDistanceFactor` | Maximum camera↔Earth-centre distance, in Earth radii (zoom-out limit). | `2.5` |
| `camera.maxAltitudeFactor` | Maximum flight altitude, in Earth radii. | `1.5` |
| `camera.minGroundClearance` | Guardrail: minimum height (m) above the REAL ground, tiles and buildings included. Applies to programmatic flights **and** to the wheel. | `20` |
| `camera.keyPan.speed` | Keyboard movement: ground-heights travelled per second. A FRACTION of the height, not an absolute speed — the map then scrolls at the same on-screen pace at any altitude. `0.8` ≈ one screen per second at nadir. | `0.8` |
| `camera.keyPan.boost` | Multiplier while the speed-up modifier is held. | `3` |
| `camera.followAltitude.min` | Altitude bounds (m) of follow mode. | `200` |
| `camera.followAltitude.max` | Altitude bounds (m) of follow mode. | `2000000` |
| `camera.fitBounds.margin` | Framing defaults (`fitBounds`) — overridable call by call. | `1.35` |
| `camera.fitBounds.minAltitude` | Framing defaults (`fitBounds`) — overridable call by call. | `350` |
| `camera.fitBounds.maxAltitude` | Framing defaults (`fitBounds`) — overridable call by call. | `6000000` |

## `clustering` — Marker grouping algorithm

| Key | Description | Default |
|---|---|---|
| `clustering.radius` | Grouping radius, in screen pixels. | `60` |
| `clustering.minPoints` | Below this, points stay individual. | `2` |
| `clustering.maxZoom` | Zoom beyond which geographic grouping stops. | `18` |
| `clustering.levelQuantization` | Zoom quantisation for the stability of cluster steps: the zoom is rounded to a multiple of this value before the step is chosen. <!-- audit: à vérifier à la fusion (cœur) --> | `1` |
| `clustering.spiderfyZoom` | Zoom from which an inseparable cluster (coincident points) fans out on click — the camera's maximum USEFUL zoom, beyond which it enters the 3D buildings. `19` ≈ 76 m altitude. | `19` |

## `markers` — Legibility thresholds

| Key | Description | Default |
|---|---|---|
| `markers.staticMinZoom` | Zoom below which `static` markers (placed symbols, defibrillators) disappear from the map. `0` disables hiding. They stay in SEARCH and in the lens: this threshold states what is legible, not what the user chose to hide — that is the tag filter's job. This is the DEFAULT threshold: a marker declaring `static: { minZoom }` imposes its own. | `13` |

## `data` — Loading rate, storage, search

| Key | Description | Default |
|---|---|---|
| `data.viewportDebounceMs` | Debounce between the camera stopping and the data request. | `500` |
| `data.positionSaveDebounceMs` | Debounce of camera position saving (`positionStorageKey`). | `400` |
| `data.storageKeys.tagFilter` | “Layers” filter selection. | `'m3d:tag-filter'` |
| `data.storageKeys.drawSettings` | Per-tool drawing style settings. | `'m3d:draw-settings'` |
| `data.storageKeys.searchHistory` | Search box history. | `'m3d:search-history'` |
| `data.storageKeys.plugins` | Plugin state (enabled + config), see [PLUGINS.md § 8](PLUGINS.md#8-the-hub-and-user-configuration). | `'m3d:plugins'` |
| `data.storageKeys.templates` | Local drawing templates (`Template[]` array), see [TEMPLATES.md](TEMPLATES.md). | `'m3d:templates'` |
| `data.storageKeys.catalog` | Catalog items displayed on the map (array of `CatalogKey`), see [CATALOG.md](CATALOG.md). | `'m3d:catalog'` |
| `data.storageKeys.catalogSettings` | Catalog settings (persistence, framing on add). Distinct from the previous one: unticking "keep" clears the SELECTION, and a shared key would wipe the very setting just changed. | `'m3d:catalog-settings'` |
| `data.storageKeys.preferences` | End-user preferences (3D quality, keyboard layout, speed, inertia), see [PREFERENCES.md](PREFERENCES.md). Absent from localStorage until the user has changed anything: the map then follows the application's config, untouched. | `'m3d:preferences'` |
| `data.search.minQuery` | Minimum input length before querying the providers. | `2` |
| `data.search.debounceMs` | Keystroke debounce. 💰 The most direct lever on the number of calls. | `250` |
| `data.search.limitPerGroup` | Results displayed per group. | `6` |
| `data.search.historySize` | Entries kept in the history. | `8` |
| `data.search.flyAltitude` | Altitude (m) of the flight to a result with no known bounds. | `2500` |
| `data.search.fitPadding` | Breathing room (px) when framing a result that has bounds. | `60` |
| `data.search.resolveLimit` | Cap on re-resolving a history entry before the flight. | `20` |

## `startup` — Intro and availability

| Key | Description | Default |
|---|---|---|
| `startup.introDuration` | Duration of the intro flight (globe → initial position), in seconds. | `3` |
| `startup.introMaxWaitMs` | Maximum wait for tiles before starting the intro anyway. | `8000` |
| `startup.readyMaxWaitMs` | Maximum wait before emitting `ready` by force. | `8000` |
| `startup.introFadeMs` | Fade of the overlay at the end of the intro. Counterpart of `introDuration`, which was exposed while its fade-out lived in the stylesheet. | `500` |
| `startup.introAltitudeFactor` | Starting altitude of the intro, in Earth radii (globe view). | `1` |
| `startup.fallbackSize` | Fallback size (px) when the container is not measured yet at mount — hidden container, SSR hydration, deferred layout. ⚠️ This is not cosmetic: this pair fixes the camera's first `aspect`, hence the first projection, before the `ResizeObserver` takes over. It used to be… | `[800, 600]` |

## `sky` — Procedural atmospheric sky

Computed sky (Preetham model + clouds), **faded in as you descend toward the ground in 3D**. In globe view (high altitude) it is invisible: only the stars and the space background remain — the view from space is never altered. The sun is the real subsolar point computed for `sky.date`, and the location comes from the targeted center: travelling from one continent to another changes day and night. No color here — the sky is computed physically from these parameters.

| Key | Description | Default |
|---|---|---|
| `sky.enabled` | Enables the sky. `false` = stars + color background only (previous behavior). | `true` |
| `sky.turbidity` | Atmospheric haze: `1` = clear sky, `~10` = hazy/milky. | `2` |
| `sky.rayleigh` | Rayleigh scattering — intensity of the sky's blue. | `1.2` |
| `sky.mieCoefficient` | Mie scattering — strength of the halo around the sun. | `0.005` |
| `sky.mieDirectionalG` | Mie directionality (0..1) — concentration of the solar halo. | `0.8` |
| `sky.clouds.coverage` | Cloud coverage: `0` = clear sky, `1` = overcast. | `0.35` |
| `sky.clouds.density` | Cloud opacity (0..1). | `0.4` |
| `sky.clouds.scale` | Cloud pattern scale (smaller = larger clouds). | `0.0002` |
| `sky.clouds.elevation` | Apparent elevation of the layer (0..1). | `0.5` |
| `sky.fade.start` | Camera altitude (m) above which the sky is invisible (globe view intact). | `500000` |
| `sky.fade.end` | Camera altitude (m) below which the sky is full. `start` must be > `end`. | `90000` |
| `sky.date` | Instant (ms epoch, like `Date.now()`) that fixes the sun's position. `0` = the map's mount time, frozen. A value > 0 freezes a precise instant (deterministic). | `0` |

## `pedestrian` — Pedestrian / first-person mode

Ground-level first-person view. ⚠️ Everything below is CONFIG, not theme: none of it
is visible directly. The look of the placement cursor and the reticle lives in
`theme.colors.pedestrian`. The key that ENTERS the mode lives in
`interaction.shortcuts.controls.pedestrian` (toolbar button); full-immersion toggling
lives in `interaction.shortcuts.pedestrian.immersion`.

| Key | Description | Default |
|---|---|---|
| `pedestrian.eyeHeightMeters` | Eye height above ground (m). | `1.7` |
| `pedestrian.walkSpeed` | Walking speed (m/s) — INDEPENDENT of altitude, unlike orbital flight. 5 m/s (18 km/h): real walking (1.4) feels like standing still in a scaled-down scene. Set to 1.4 for a faithful speed. | `5` |
| `pedestrian.sprintFactor` | Multiplier applied while the `boost` key is held. 2 rather than 3: at 3 the key gave 15 m/s (54 km/h) — you no longer read anything you cross. | `2` |
| `pedestrian.lookSpeed` | Look sensitivity: degrees of rotation per mouse pixel. | `0.15` |
| `pedestrian.invertY` | Inverts the vertical look axis. ⚠️ The default follows the map's CLICK-AND-DRAG convention (pulling down raises the view), not an FPS one. Under Pointer Lock (full immersion), the FPS convention applies on its own. | `true` |
| `pedestrian.invertX` | Inverts the horizontal look axis. | `false` |
| `pedestrian.pitchMaxDeg` | Bound of the vertical look (°) — at 90° the reference frame degenerates. | `89` |
| `pedestrian.viewDistanceMeters` | View distance (m): bounds the camera's `far`, hence frustum culling, hence the tiles requested — the #1 performance lever in grazing view. ALSO bounds markers and cluster chips, which stop being shown wherever the scenery stops being shown. | `1000` |
| `pedestrian.fogStartMeters` | Fog start (m). It always ends at `viewDistanceMeters`. | `700` |
| `pedestrian.nearMeters` | Near plane of the camera (m) in pedestrian mode. | `0.1` |
| `pedestrian.groundProbeMeters` | Range (m) of the ray that searches for the ground underfoot, every walking frame. ⚠️ Deliberately short: `sampleGroundHeight` normally reaches 40 km, and a ray that long would be the most expensive step of the walking loop. Also bounds falling: beyond it, the ground is deemed unreachable and the previous height is kept. | `5` |
| `pedestrian.tileDetailDistanceMeters` | Reference distance (m) for tile detail while walking — the distance you actually look at, not the one to your own feet (1.70 m would demand maximum zoom everywhere). Lower = sharper up close and heavier; higher = lighter and coarser. | `120` |
| `pedestrian.tileRefreshMs` | Minimum interval (ms) between two tile-coverage updates while walking. Every pass rebuilds the whole level cascade: at eye height redoing it sixty times a second serves no purpose. | `250` |
| `pedestrian.groundSmoothing` | Time constant (SECONDS) of the eye's vertical smoothing. Too strong → floaty feel; too weak → jitter as tiles refine. | `0.25` |
| `pedestrian.collision.radiusMeters` | Half-width of the body (m): distance below which a wall pushes back. | `0.3` |
| `pedestrian.collision.feelers` | Number of horizontal rays fanned out around the walking direction. | `6` |
| `pedestrian.collision.feelerMarginMeters` | Feeler length ON TOP of the radius (m) — enough to see the wall before reaching it. | `0.2` |
| `pedestrian.collision.maxStepHeightMeters` | Climbable step height (m): kerb, stair. Beyond it, it's a wall. | `0.4` |
| `pedestrian.placement.maxRoofDeltaMeters` | Maximum gap (m) between the targeted surface and the ring's street level. Beyond it, the point is a roof and the click is refused. | `2` |
| `pedestrian.placement.ringRadiusMeters` | Radius of the ground-sampling ring (m). ⚠️ 20 m rather than 4: the ring must EXIT the targeted building's footprint to find the street below — at 4 m it stayed on the roof, which became its own "street". | `20` |
| `pedestrian.placement.refreshMs` | Minimum interval (ms) between two cursor validations during placement. Each validation costs about ten raycasts; `pointermove` fires much faster than that. | `33` |
| `pedestrian.placement.refreshSlopPx` | Movement (px) below which the previous validation is reused as is. | `3` |
| `pedestrian.headBob.enabled` | Walking sway — an effect, disabled by default. | `false` |
| `pedestrian.headBob.amplitudeMeters` | Sway amplitude (m). | `0.05` |
| `pedestrian.headBob.frequency` | Oscillations per second (Hz) at nominal walking speed. | `1.8` |
| `pedestrian.transitions.enterMs` | Duration (ms) of the dive on entering pedestrian mode. | `800` |
| `pedestrian.transitions.exitMs` | Duration (ms) of the rise on exiting pedestrian mode. | `600` |

## `graticule` — Geographic coordinate grid

Parallels and meridians draped over the globe, with an adaptive mesh — see the [GRATICULE.md](GRATICULE.md) guide. No colors here: they live in `theme.colors.graticule`. `enabled` is only the STARTING state; the current source of truth is the engine (`engine.setGraticuleVisible`), since three commands drive it.

| Key | Description | Default |
|---|---|---|
| `graticule.enabled` | Starting state of the grid. | `false` |
| `graticule.targetLines` | Lines targeted on screen — this number picks the mesh. | `8` |
| `graticule.levelHysteresis` | Dead band of the mesh change, as a density fraction. ⚠️ Without it, a zoom stopping on a step boundary flips from one frame to the next, and every flip rebuilds the whole geometry. | `0.15` |
| `graticule.levelRangeDeg` | Scale bounds (degrees) — `[x, x]` freezes the mesh. `null` = free scale. | `null` |
| `graticule.segmentsPerLine` | Segments per line (CEILING): the densification that makes lines follow the globe's curvature. | `128` |
| `graticule.maxLines` | Hard cap of lines per axis — memory guard rail. | `64` |
| `graticule.bandScreens` | Width of the built band, in screens. Leaving it triggers a rebuild. | `2` |
| `graticule.latLimitDeg` | Latitude where meridians stop: beyond it they converge and density explodes. | `85` |
| `graticule.heightOffsetMeters` | Vertical drape offset (m) above the visible surface. | `0` |
| `graticule.heightToleranceMeters` | Drape-height drift tolerated (m) before a rebuild. | `5` |
| `graticule.opacity` | Opacity of ordinary lines. | `0.55` |
| `graticule.remarkableOpacity` | Opacity of remarkable lines — deliberately stronger. | `0.85` |
| `graticule.dash` | Dash pattern `{ dash, gap }` in WORLD units (metres). `null` = solid stroke. | `null` |
| `graticule.remarkable.enabled` | Draw remarkable lines (Equator, tropics, polar circles, meridians). | `true` |
| `graticule.remarkable.parallels` | Remarkable parallels `{ lat, labelKey }`. In config rather than constants: obliquity drifts, and a non-terrestrial tileset has neither tropics nor polar circles. | Equator, tropics, polar circles |
| `graticule.remarkable.meridians` | Remarkable meridians `{ lng, labelKey }`. ⚠️ The antimeridian is written `-180`: `normalizeLng` maps into `[-180, 180)`. | Prime meridian, 180th |
| `graticule.tiltFade.start` | Fade start, as a FRACTION of the mode's tilt ceiling (`camera.maxTilt3d`/`maxTilt2d`). ⚠️ Fractions and not degrees: the ceiling (79.2° by default in both modes) stays configurable per mode. | `0.75` |
| `graticule.tiltFade.end` | Full disappearance, same unit. | `0.95` |
| `graticule.fadeMs` | Fade time constant (ms) — that is the softness. | `250` |
| `graticule.levelFadeMs` | Cross-fade on mesh change (ms). `0` = hard cut. | `300` |
| `graticule.labels.enabled` | Show coordinate labels. | `true` |
| `graticule.labels.placement` | `'center-cross'`: latitudes along the meridian nearest the centre, longitudes along the nearest parallel — this is what naturally caps their number. `'edges'` pins them to the borders. | `'center-cross'` |
| `graticule.labels.maxLabels` | Hard cap of displayed labels. | `40` |
| `graticule.labels.spacingPx` | Minimum gap (px) between two labels of the same chain. | `90` |
| `graticule.labels.rotate` | Orient the label along its line — past 45° it flips a quarter turn to stay readable. | `true` |
| `graticule.labels.format` | `'auto'` follows the mesh: ≥ 1° → `45°N`, minutes → `45°11'N`, seconds → `45°11'25"N`. Or `'dms'`/`'dm'`/`'deg'` to force it. | `'auto'` |
| `graticule.labels.remarkableNames` | Show remarkable lines' names rather than their coordinate. | `true` |
| `graticule.labels.idleOpacity` | Opacity at rest — labels fade back and become full under the pointer. `1` removes the effect. | `0.65` |
| `graticule.labels.hoverPaddingPx` | Margin (px) around a label to consider it hovered. ⚠️ Hover is GEOMETRIC: labels stay `pointer-events: none`, so none can swallow the start of a map drag. | `4` |

---

## `catalog` — Remote geographic entity catalog

Browsable reference sets declared by the host and by plugins (`engine.catalog`) — see the [CATALOG.md](CATALOG.md) guide. Storage keys live in `data.storageKeys`.

| Key | Description | Default |
|---|---|---|
| `catalog.pageSize` | Items requested per page from `CatalogSource.list`. One page covers more than a panel's height, so scrolling doesn't hit a sentinel on the very first row. | `50` |
| `catalog.debounceMs` | Keystroke debounce before querying the source. 💰 The direct lever on the number of calls to the host's API — aligned with `data.search.debounceMs`. | `250` |
| `catalog.maxInlineActions` | Source actions rendered inline on a list row. Beyond that, the NAME would be what disappears; extra ones are ignored, with a warning. | `2` |
| `catalog.overscanRows` | Rows rendered off-screen on each side of the virtual window. The dial between "no blank on fast scroll" and "React work per frame": each unit adds TWO rendered rows on every frame. | `4` |
| `catalog.prefetchMarginPx` | 💰 Distance from the list bottom that triggers the next page (px). Decides the VOLUME of calls to `CatalogSource.list`: a wide margin prefetches while you are still scrolling, but requests pages you may never look at. | `200` |
| `catalog.persistDebounceMs` | Debounce before writing the selection to storage. `localStorage.setItem` is SYNCHRONOUS: without damping, a burst of gestures writes as many times as it has items, on a payload that keeps growing. `0` writes immediately; a pending payload is always flushed before the page goes away. | `250` |
| `catalog.familyHeaders` | Name the families of the types menu (`CatalogSource.family`). `false` keeps only the separating rule. Not applicable to a source without `family`: its group has no name, and wording invented by the library would hard-code text. | `true` |
| `catalog.groupHeaders` | Open a named section in the LIST whenever `CatalogItem.group` changes. A setting rather than “just don't set `group`”: sources may come from THIRD-PARTY plugins the host does not control. Not applicable to a source that does not set `group` — the flag then saves even the per-item comparison. | `true` |

---

## `watermark` — "map3D" signature (attribution)

Signature shown at the bottom right: a mark **painted into the WebGL canvas** (immune to CSS/DOM — neither `display:none` nor node removal hides it), doubled by a transparent link to the repository and its license. The content (text, URL, style) is **not** configurable: making it overridable would be a removal vector for the attribution.

| Key | Description | Default |
|---|---|---|
| `watermark.enabled` | Show the signature. Setting it to `false` is **reserved for holders of a commercial license** of map3D: under the default PolyForm-Noncommercial license, removing the attribution violates the license. | `true` |

## `capture` — Map image capture

Defaults for capture ("Take a photo" and `engine.capture()`). Holds only **serialisable** values: the overlay rasteriser and the mail/trace callbacks are functions, passed via the `<Map capture>` prop — see [PROPS.md](PROPS.md).

| Key | Description | Default |
|---|---|---|
| `capture.format` | Default format of the produced image (`'png' | 'jpeg' | 'webp'`). | `'png'` |
| `capture.quality` | Quality 0..1 for compressed formats (jpeg/webp); ignored for png. | `0.92` |
| `capture.scale` | Default supersampling (`1 | 2`): ×2 is sharper than the display, at the cost of one heavy frame. | `1` |
| `capture.background` | Default background (`'opaque' | 'transparent'`). `'transparent'` falls back to opaque today: the renderer is created without an alpha channel. | `'opaque'` |

## `selection` — Kinds selectable by the selection tool

Per-kind policy: which objects the selection tool (click/rect/lasso/polygon) may retain.

| Key | Description | Default |
|---|---|---|
| `selection.selectable.marker` | Whether markers are selectable by the selection tool. | `true` |
| `selection.selectable.path` | Whether paths are selectable by the selection tool. | `true` |
| `selection.selectable.cluster` | Whether clusters are selectable (→ selects their child markers). | `true` |

## `erase` — Eraser targets

Per-target policy: what the eraser (point or selection mode) is allowed to delete.

| Key | Description | Default |
|---|---|---|
| `erase.targets.drawing` | Whether the eraser can delete drawings (line/polygon/rect/circle/freehand/arrow). | `true` |
| `erase.targets.measure` | Whether the eraser can delete measurements. | `true` |
| `erase.targets.symbol` | Whether the eraser can delete symbols. | `true` |
| `erase.targets.path` | Whether the eraser can delete host paths marked `erasable` (`PathLayer`). | `true` |
| `erase.targets.shape` | Whether the eraser can delete host shapes marked `erasable` (`ShapeLayer`). | `true` |

## `toolbar` — Drawing bar

What belongs to the **bar** (`<Toolbar>`). What belongs to the **tools** stays in its own
domain: `erase.targets` for the eraser policy, `interaction.shortcuts.draw` for the keys —
those act with no bar mounted.

`autoHide` removes from the bar whatever has **nothing to act on**, rather than greying it
out: an eraser without a target is not an unavailable tool but a tool with no purpose, and
two inert history arrows take up a bar that is already compacted for height. An
auto-hidden *tool* cannot be armed from the keyboard either, and if it was armed when its
last target disappeared, it is released — unlike the history commands, which keep their
shortcut: history does not need the bar to exist. The “Clear all” row lives in the eraser's submenu and
shares its scope: it appears and disappears with it, with no key of its own.

| Key | Description | Default |
|---|---|---|
| `toolbar.minZoom` | Zoom below which the bar retracts — below it, drawing no longer makes sense (globe view). | `5` |
| `toolbar.autoHide.erase` | Remove the eraser — and its “Clear all” row — while no allowed target is on screen. | `true` |
| `toolbar.autoHide.history` | Remove “Undo” and “Redo” while there is nothing to undo or redo, instead of greying them out. Each hides on its own account; the keyboard shortcut does not depend on the bar. | `true` |

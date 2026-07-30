# `MapConfig` — reference

[Français](../fr/CONFIG.md) · **English** · [↑ Index](README.md)

Every adjustable value of the map, its role and its default.

Generated from `src/config/defaultConfig.ts` (values) and `src/config/types.ts`
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
| `providers.tiles.provider` | Basemap tile provider: `'external'` (Google Map Tiles, session + key, traffic available) or `'internal'` (self-hosted server, plain XYZ URLs, no key, no quota, **no traffic**). See [TILES.md](TILES.md). | `'internal'` |
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
| `providers.tiles.maxAttempts` | Attempts per tile before giving up for good. | `3` |
| `providers.tiles.retryDelays` | Backoff between two attempts at the same tile. | `[1000, 4000]` |
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
| `providers.buildings.minViewZoom` | View zoom below which no tile is requested. Seen from above, buildings cover only a few pixels. **13 rather than 14**: the zoom of a tilted view is lower than the one asked of the camera. | `13` |
| `providers.buildings.showZoomOffset` | Zoom levels during which the 3D stays SHOWN on zoom-out below `minViewZoom` before being hidden. The 2D basemap draws its footprints ~1 zoom above the 3D's useful zoom: `1` aligns both appearing/disappearing (otherwise the 3D leaves one level before the footprints). `0` = hidden exactly at `minViewZoom`. | `1` |
| `providers.buildings.margin` | Ring of tiles prefetched around the viewport. | `0` |
| `providers.buildings.maxTiles` | Cap on the extruded-tile cache (GPU memory). A dense z14 tile weighs ~131,000 triangles: this cap has nothing to do with the raster one. Keep it well above `maxRequest`, otherwise a pan evicts what it just requested. ⚠️ 36 → 80 (follows `maxRequest`). | `80` |
| `providers.buildings.maxBytes` | Cap on memory retained by mounted volumes (bytes, `0` = unlimited). ⚠️ New, and this is the one that **actually** bounds memory: a dense z14 tile weighs ~4.9 MB (positions, colours, indices, collision tree), so the 36-tile cap above made 175 MB — enough to lose the WebGL context on an integrated GPU. Out in the countryside the same 36 tiles weigh 2 MB: a tile count says nothing about what is retained. ⚠️ 256 → 448 MiB (follows the widened square; **lower it** on a modest machine). | `469762048` |
| `providers.buildings.evictEvery` | One frame in N triggers the eviction sort. ⚠️ Was a literal (10). | `10` |
| `providers.buildings.evictSlack` | Overshoot (in tiles) beyond which eviction is forced. ⚠️ Was a literal (16). | `16` |
| `providers.buildings.mountPerFrame` | Tiles mounted into the scene per frame at most. ⚠️ New, and it is **one**: mounting (expanding colours, building the collision tree) costs about twenty milliseconds and stays on the main thread. Two tiles landing in the same frame — which `maxInflight` allows — added up their cost into a visible freeze. | `1` |
| `providers.buildings.maxInflight` | Tiles concurrently downloading **and extruding** in the worker. | `2` |
| `providers.buildings.maxRequest` | Budget of tiles requested for one view: the N×N tiles around the **looked-at** point (the ground under screen centre, not under the camera). `49` = 7×7, about 11 km of reach in Paris (widened to fill the tilted view). Beyond it, the raster basemap stands alone — see [TILES.md § 5](TILES.md). ⚠️ Raising it further requires raising `maxTiles`/`maxBytes` (RAM). | `49` |
| `providers.buildings.maxAttempts` | Attempts per tile before giving up. | `3` |
| `providers.buildings.retryDelays` | Backoff between two attempts on the same tile. | `[1000, 4000]` |
| `providers.buildings.pickFields` | MVT attributes surfaced by the building pick (`buildingMenu`). **Empty by default**: the data carries dozens per footprint, and carrying them all would cost, per tile, more than the whole geometry. The host asks for what it displays. | `[]` |
| `providers.tiles3d.cesiumIonAssetId` | Cesium Ion asset served by default (Google Photorealistic 3D Tiles). ⚠️ The identifier used to be written in the engine and repeated in TWO documentation blocks: three copies of a value that designates a provider, the only one of its kind living outside `providers`. | `'2275207'` |
| `providers.tiles3d.hideVolumeWhenClamped` | Hides the internal buildings when the zoom AT THE LOOKED-AT POINT drops below `providers.buildings.minViewZoom` (zoom-out, or a far looked-at point in tilted view): from afar they cover only a few pixels and leave a "square" in the void. Hidden, frozen AND **destroyed** (RAM/VRAM returned, reloaded on the way back). The criterion is perceived zoom (resolution × distance), so **valid at any tilt**. **The mode does not change** (stays `'3d'`). `false` = always shown. Internal only. | `true` |
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
| `interaction.freehandMinStepPx` | Decimation of the freehand stroke (floor, in px). Counterpart of `lassoMinStepPx`. | `2` |
| `interaction.targetZoom` | Zoom of the “Target” flight from an inventory or a list. | `17` |
| `interaction.pinnedFlyZoom` | Zoom of the flight when clicking a dock favourite. | `16` |
| `interaction.drawToolbarMinZoom` | Zoom below which the drawing bar retracts — drawing implies a close view. | `11` |
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
| `interaction.shortcuts.controls.topDown` | Top-down view (the `north` shortcut already does it). | `false` |
| `interaction.shortcuts.controls.globe` | Pull back to globe view. | `'g'` |
| `interaction.shortcuts.controls.layers` | Opens the “Layers” panel (tag filter). | `'t'` |
| `interaction.shortcuts.controls.fullscreen` | Fullscreen. | `'f'` |
| `interaction.shortcuts.controls.basemap` | Switch photorealistic 3D ↔ 2D plan. | `'b'` |
| `interaction.shortcuts.controls.traffic` | Traffic overlay — the button only exists in plan mode. | `false` |
| `interaction.shortcuts.navigate.forward` | Move forward — held. Several keys: the arrows, universal, and a letter family that depends on keyboard layout. | `['arrowup', 'z']` |
| `interaction.shortcuts.navigate.backward` | Move back. | `['arrowdown', 's']` |
| `interaction.shortcuts.navigate.left` | Strafe left. | `['arrowleft', 'q']` |
| `interaction.shortcuts.navigate.right` | Strafe right. | `['arrowright', 'd']` |
| `interaction.shortcuts.navigate.boost` | Speed-up modifier, held. | `['shift']` |
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
| `performance.renderOnDemand.enabled` | Paint only what changed. The frame loop always runs; what is skipped is the RENDER (WebGL pass + DOM overlays) when nothing asked for it. | `true` |
| `performance.renderOnDemand.idleFrames` | Frames painted after the last request. | `3` |
| `performance.renderOnDemand.maxIdleMs` | Delay after which a frame is painted even without a request (safety net). `0` removes it. | `1000` |
| `performance.overlayDepth.nearMeters` | Near plane of the DOM overlay projection — deliberately much wider than the 3D render's, which would hide distant markers. | `0.1` |
| `performance.overlayDepth.farMeters` | Far plane of the same projection. | `1e9` |
| `performance.boundsPickGrid` | Side of the raycast grid that derives the visible bounds (`n²` per frame). | `5` |
| `performance.boundsMargin` | Widening of the bbox emitted by `onViewportChange`. **Directly drives the volume of data the application loads.** | `0.15` |
| `performance.viewportSettleFrames` | Frames of stillness before emitting the `viewport` event. | `4` |
| `performance.markerRecomputeMs` | Minimum interval between two cluster recomputations during a pan. | `90` |
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
| `style.zIndex.menu` | ROOT plane. Context menus and drag-and-drop ghosts: at the top. | `992` |
| `style.zIndex.modal` | ROOT plane. Modals (confirmation dialog): above everything, menus included. | `1092` |
| `style.zIndex.relationBar` | MAP plane. Status bar of a relation, resting on the map. | `6` |
| `style.zIndex.editOverlay` | MAP plane. SVG selection overlay (transformation handles). | `15` |
| `style.zIndex.tooltip` | LOCAL plane. Tooltips, INSIDE the surface carrying them: the marker anchor for `.m3d-markertip`, the bar or panel for `.m3d-tip`. Both are isolated stacking contexts (anchor z-index written by CSS2DRenderer, a panel's `backdrop-filter`), so this value never compares with the MAP plane levels. Raising it will put the tooltip above nothing. | `2` |
| `style.zIndex.listMenu` | MAP plane. Actions menu of a list row. | `96` |
| `style.zIndex.markerSelected` | Selected marker, INSIDE its own marker anchor. ⚠️ Do not raise it above neighbouring markers: the anchor carries a numeric `z-index`, so it creates a context and this value stays locked inside it. The order BETWEEN markers is decided by the `renderOrder` the engine gives to CSS2DRenderer (see `setRaised`), not here. | `80` |

## `camera` — Navigation limits and command steps

| Key | Description | Default |
|---|---|---|
| `camera.minZoom` | Minimum reachable zoom (maximum zoom-out). Bounds the same distance as `maxDistanceFactor`, in zoom rather than Earth radii: the tighter of the two wins. | `2` |
| `camera.maxZoom` | Maximum reachable zoom **in plan mode** — the descent floor. A flat map only reads better the closer you get. | `21` |
| `camera.maxZoom3d` | Maximum zoom **in 3D**, the counterpart of `maxZoom` as `maxTilt3d` is of `maxTilt2d`. Below building height the camera ends up IN the street: a wall fills the screen. Height above ground = `40,075,016 / 2^zoom` — ~153 m at 18, ~76 m at 19, ~19 m at 21. | `18` |
| `camera.maxTilt` | General maximum tilt (rad from nadir). | `1.05` |
| `camera.zoomStep` | Zoom step per wheel notch. | `0.5` |
| `camera.dragSpeed.min` | Movement speed at ground level. | `0.002` |
| `camera.dragSpeed.max` | Movement speed in globe view. | `0.35` |
| `camera.fov` | Vertical field of view (degrees). Read at engine construction only. | `60` |
| `camera.maxTilt3d` | Maximum tilt in 3D (rad from nadir) — beyond it, the view flips. | `1.382300767579509` |
| `camera.maxTilt2d` | Maximum tilt in 2D: lower, to bound tile coverage. | `0.6283185307179586` |
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
| `clustering.levelQuantization` | Zoom quantisation for the stability of cluster steps. | `1` |
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

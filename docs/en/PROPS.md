# Component props — reference

[Français](../fr/PROPS.md) · **English** · [↑ Index](README.md)

What each component accepts, what it does, and its default.

A default written `config.x` or `theme.x` means the prop **overrides** that setting for
this instance: passing nothing follows the map, passing a value takes over locally.

Generated from the components' real types and defaults.

> **Translated by hand.** The source of truth is the French version, extracted from the
> code's JSDoc: check [fr/PROPS.md](../fr/PROPS.md) if a default looks out of date.

💰 = Google billing impact

## `<Map>`

Root — mounts the engine and every surface.

| Prop | Description | Default |
|---|---|---|
| `center` **(required)** | Initial position. A remembered position (`positionStorageKey`) replaces it. | — |
| `zoom` **(required)** | Initial zoom (Web Mercator scale: 0 = world, ~21 = street level). | — |
| `googleMapsApiKey` | Google Maps Platform key → Photorealistic 3D Tiles directly (takes precedence over Ion). | — |
| `cesiumIonToken` | Cesium Ion token → Google Photorealistic 3D Tiles via Cesium. | — |
| `cesiumIonAssetId` | Cesium Ion asset (default 2275207 = Google Photorealistic 3D Tiles). | — |
| `mapMode` | Map type at startup. Default: `'plan'` as soon as a 2D basemap is servable — Google key **or** an internal server's `providers.internal.origin` (see [TILES.md](TILES.md)) — otherwise `'3d'`. Pass `'3d'` explicitly to start on volume. Read at **construction**: switching afterwards goes through the toolbar button or `MapHandle`. | — |
| `fallbackGlobe` | Plain ellipsoid fallback globe when no tile is available (default: true). | — |
| `errorTarget` | Target screen-space error (quality/perf). | — |
| `intro` | Google Earth-style intro: globe view then an animated descent to center/zoom (default: true). | — |
| `positionStorageKey` | localStorage key of the last camera position (absent = no persistence). A remembered position replaces `center`/`zoom` at mount and turns the intro off. | — |
| `resetStoredPosition` | Clears the remembered position at mount → normal intro and `center`/`zoom` (default: false). | — |
| `tagStorageKey` | localStorage key of the “Layers” filter (`null` = no persistence; a distinct key per map if several `<Map>` coexist). Default: `m3d:tag-filter`. | — |
| `pluginStorageKey` | localStorage key of the plugin state (`null` = no persistence). Default: `config.data.storageKeys.plugins`. | — |
| `interactive` | Interactivity (default `true`). `'view'` freezes the camera while keeping markers and selection alive; `false` makes the map inert. In both frozen modes the tools (drawing, lens) are neutralised. Overlays, markers, shapes and paths keep being RENDERED — it is… | `true` |
| `onReady` | The map is **usable**: the projection resolves heights, a `fitBounds` targets the real ground. Called once, and immediately if the map already was. To simply get hold of the engine, `useMap()` is enough — it is available from mount,… | — |
| `onViewportChange` | Visible frame after the camera settles — wire it to a refetch. | — |
| `onCameraChange` | Camera position on every movement (high frequency: no network calls here). | — |
| `className` | Class of the root container, in addition to `m3d-root`. | — |
| `style` | Styles of the root container. The map fills 100 % of its parent. | — |
| `ref` | Imperative handle of the map (see `MapHandle`): enough to frame, draw or query **from the outside**, without writing a child component just to reach a hook. | — |
| `theme` | Theme: a single theme, a `{ light, dark }` pair, or nothing (neutral theme). Declared here, the map mounts its own theme root — no `<MapProvider>` to place around it. | — |
| `colorScheme` | `'auto'` (default) follows `prefers-color-scheme` and updates live. | — |
| `labels` | Translations (deep merge onto `defaultLabels`) — see LABELS.md. | — |
| `config` | Settings: third-party providers (endpoints, language, quotas), gesture thresholds, computation budgets, loading rate. Deep merge onto `defaultConfig` — provide only what changes. See `MapConfig`. ```tsx <Map config={{ providers: { tiles: { language:… | — |
| `capture` | Host injection for image capture (`CaptureProps`): `rasterizeOverlay` (rasteriser for the DOM overlays — markers/labels — e.g. `html-to-image`, otherwise 3D-only capture), `onCapture` (trace on every capture, for a log / API upload) and `onMail` (delivery of the "mail" action). Its presence **enables** the "Take a photo" row of the ⚙ menu. Defaults (format, quality, scale, background) live in `config.capture`. | — |

### Imperative handle — `MapHandle` (`ref`) and `useCapture()`

`ref` exposes `MapHandle`. Beyond `camera` / `drawing` / `lens` / `relations` / `pedestrian`, the handle carries **`capture(opts?): Promise<Blob>`**: synchronous render of the map to an image, DOM overlays composited when a `rasterizeOverlay` is provided via `capture`, otherwise 3D-only. `opts` (`CaptureOptions`) overrides the `config.capture` defaults per call (`format`, `quality`, `scale`, `background`, plus `overlay` and `rasterizeOverlay`). The core `engine.capture()` does the same without injection; the **`useCapture()`** hook is the counterpart for a component under `<Map>`. Use it to trace an image on an action (log, upload to an API).

### `<Map>` surfaces

Beyond the props above, `<Map>` accepts the declarative surfaces of `MapSurfaces`:
they mount the toolbar, controls, search, dock, drawing, relations, layers and
grouping **in the right nesting order**.

| Prop | Description | Default |
|---|---|---|
| `toolbar` | Drawing toolbar, **lens included** (`toolbar.lens`). `false` = no bar — and no lens. | *(defaults)* |
| `controls` | Navigation controls. `false` = no controls. | *(defaults)* |
| `search` | Unified search: `true` for the defaults, an object to configure it. Absent = no box. | *(absent)* |
| `readout` | View readout block (altitude, coordinates, zoom), on a single line: `true` for the defaults — top-right corner —, an object to configure it (`corner`, `fields`, `refreshMs`). Absent, it does not exist. See [CAMERA.md](CAMERA.md). | *(absent)* |
| `dock` | Favourites dock — its presence enables it (and makes markers grabbable). | *(absent)* |
| `templates` | Templates manager: named saves of the drawing. The button lives IN the controls bar, below “Layers” — so `controls` must be active. `false`/absent removes it; an object configures it (API provider, categories…). Acts on the drawing through `engine.templates.drawPort` (set by `draw`). See [TEMPLATES.md](TEMPLATES.md). | *(absent)* |
| `draw` | Drawing layer (+ `selectionBadges`). `false` removes drawing AND the bar. | *(defaults)* |
| `relations` | Tag relation engine (+ `statusBar`) — its presence enables it. | *(absent)* |
| `layers` | Data layers, in render order (`markersLayer`, `shapesLayer`, `pathsLayer`). | `[]` |
| `plugins` | Plugins to make available ([PLUGINS.md](PLUGINS.md)). Registry fed at mount; the user enables/configures through the hub. | `[]` |
| `cluster` | The map's grouping surface (see `<ClusterSurface>`). `false` turns grouping off. | *(defaults)* |
| `markerMenu` | Marker menu, **shared** by the map, the lens and the selection panel. | *(absent)* |
| `buildingMenu` | Menu of a **building** of the internal volume, opened on click while the “Select a building” tool is active. Receives a [`BuildingInfo`](BUILDINGS.md#4-buildinginfo). Without this prop the tool highlights on hover but clicking opens nothing. | *(absent)* |
| `children` | Your components mounted inside the map (`useMap()`, custom panels…). | *(absent)* |

## `<ClusterSurface>`

The **map's** grouping — mounted by `<Map cluster>`. It holds the single index fed by
every layer (`engine.clusters`) and renders the chips; each layer keeps rendering its
own markers.

| Prop | Description | Default |
|---|---|---|
| `enabled` | Turns grouping off for the whole map. | `true` |
| `size` | Chip diameter (px). | `theme.markers.size × 1.18` |
| `icon` | **SVG** icon (markup) of a chip, replacing the pie chart. | — |
| `typeIcon` | Icon of a type (SVG fragment, viewBox `0 0 24 24`, `currentColor`) inside its slice. | — |
| `typeLabel` | Readable name of a type, for a slice's tooltip. | — |
| `tooltip` | Chip tooltip — `(cluster, members, segmentType?)`. `segmentType` is set when the hover targets ONE slice. `null` = no tooltip. | — |

The algorithm (radius, thresholds, fan-out) is configured separately, in
`config.clustering`.

## `<MapProvider>`

Provides theme, labels and config to a subtree.

| Prop | Description | Default |
|---|---|---|
| `theme` | Single theme, `{ light, dark }` pair, or nothing (neutral theme by default). | `defaultTheme` |
| `colorScheme` | 'auto' follows `prefers-color-scheme` (and updates live). | `'auto'` |
| `labels` | Label overrides (translation) — deep merge onto `defaultLabels`, see LABELS.md. | — |
| `config` | Setting overrides — deep merge onto `defaultConfig`, see `MapConfig`. | — |
| `children` **(required)** | Subtree receiving theme, labels and config. | — |

## `<MarkerLayer>`

Markers, clustering, selection, dragging.

| Prop | Description | Default |
|---|---|---|
| `points` | Markers to display. Mutually exclusive with `source`, which loads them per view. | — |
| `source` | Viewport-driven source (refetched on move, `minZoom` gate). | — |
| `getId` | Stable key of a marker (default `p.id`): it decides identity, hence tweening. | `((p: MarkerData<T>) => p.id)` |
| `cluster` | `{ enabled: boolean }` — whether THIS layer takes part in the map's grouping (default: it does). The algorithm is set in `config.clustering`, the appearance on `<Map cluster>`: a cluster is a property of the map, not of a layer. | `{ enabled: true }` |
| `icon` | **SVG** icon (markup) of a marker, rendered as a DOM `<img>` anchored to the map. | — |
| `typeLabel` | Readable label of a type (`'agent'` → “Agents”): **search group name** and list row subtitle. A type is named here, once. The name of a type inside a cluster **chip** comes from `<Map cluster={{ typeLabel }}>` — a chip can aggregate several layers. | — |
| `tooltip` | Tooltip on marker hover: `title` and `content` accept any ReactNode (text, HTML, components — avatar, badges…). `null` = no tooltip for this marker. Information lives ON HOVER — clicking is reserved for actions (context menu, selection).… | — |
| `menu` | Context menu of a marker (right-click, and the “…” button in lists). | — |
| `selectedId` | Selected marker — **controlled**: the layer never changes it on its own. | — |
| `followId` | Marker followed by the camera; it stays centred on it while provided. | — |
| `onSelect` | Selection changed. The rule is uniform: **any click that does not select a marker yields `null`** — bare map as well as cluster. Since `selectedId` is controlled, the layer cannot clear it itself: it reports, the application decides. Without handling the… | — |
| `size` | Marker diameter (px) (default: `theme.markers.size`). | — |
| `selectionRing` | Diameter (px) of the multi-selection ring (default: `size + 4`). Tune it when the SVG icon occupies less than its box (e.g. a chip at 58/80 of the sprite) so the ring stays glued to the artwork. | — |
| `draggable` | Makes markers **grabbable on long press** for drag-and-drop (e.g. dropping into `<PinnedDock>`). `true` enables all markers; a function targets them selectively. The normal click (selection/menu) is preserved; the ghost attached to the cursor… | — |
| `repositionable` | **Repositionable** markers: press + move makes them follow the surface, releasing delivers the new position to `onReposition`. The normal case is to leave this prop empty and carry the flag on the DATA (`MarkerData.repositionable`):… | — |
| `onReposition` | New position on release — to be reflected in your data. | — |
| `onRepositionMove` | Position tracked continuously during the gesture (live preview, form field). | — |
| `leaderLine` | Vertical leader line + ground dot, with the content lifted above the position (default `true`): an alert badge stays readable without hiding the point it marks. Set it to `false` when the icon MUST coincide with its coordinate — that is the case for… | — |
| `cullMargin` | Margin (screen px) beyond the frame past which a marker is **hidden** (`display:none`): the browser stops computing its style, layout and compositing. Default: 200 px. `0` disables culling. A marker already displayed is not… | — |
| `staticMinZoom` | Zoom below which THIS layer's `static` markers disappear, instead of `config.markers.staticMinZoom` — a scenery layer and an alert layer do not share a legibility horizon. A marker declaring `static: { minZoom }`… | `config.markers.staticMinZoom` |

## `<DrawLayer>`

Drawing tools and symbols.

| Prop | Description | Default |
|---|---|---|
| `tools` | Allowed tools (default: all). Also filters what `setTool` accepts. | — |
| `shortcuts` | Shortcut per tool/action — `false` to disable one, another key to remap. | — |
| `defaults` | Style of a newly drawn shape, before any user setting. | — |
| `presets` | Steps offered by the style palettes (widths, opacities, corner radii). Merged onto the defaults: provide only what changes. | — |
| `settingsStorage` | Persistence of per-tool settings: localStorage (default) or none. | — |
| `settingsStorageKey` | localStorage key of the per-tool settings. Default `m3d:draw-settings`. Make it distinct as soon as TWO maps coexist on the same origin: without their own key they write to the same place and the last one to change a setting imposes it on the other. Same precaution… | — |
| `value` | **Controlled** collection (GeoJSON): when provided, it is authoritative over the drawing. | — |
| `onChange` | The whole collection after every mutation, coalesced to 1×/frame. | — |
| `onSelectionChange` | Notified on every selection change (shape ids, marker ids). | — |
| `onShapeAdd` | **Per-shape** events — for an app doing CRUD by identity (one mutation per zone). Emitted at the moment of the change, without the coalescing of `onChange` which serialises the whole collection 1×/frame. Both can coexist. | — |
| `onShapeUpdate` | Shape modified (move, resize, style). | — |
| `onShapeDelete` | Shape deleted. | — |
| `onErase` | The eraser removed objects (`EraseResult`: removed lib `shapes` + host `paths`/`hostShapes` ids to remove from your state). | — |
| `onShapeEdit` | Double-click on a shape: intent to open a sheet — nothing has changed. | — |
| `constraints` | Business rules for **user** drawing: allowed perimeters, maximum area. Programmatic mutations are not subject to them. | — |
| `onReject` | Shape refused — wire it to your toast (the library displays nothing itself). | — |
| `symbols` | The bar's **Symbols** tool: enabled by default with the MIL-STD-2525D catalogue and its renderer (SDK loaded through a dynamic import when the palette is first opened). `enabled: false` removes the tool; `catalog`/`renderer` replace the bundled symbology… | — |
| `children` | Mounted inside the drawing context — place the bar and panels there. | — |

## `<RelationLayer>`

Routed links between markers. 💰

| Prop | Description | Default |
|---|---|---|
| `rules` **(required)** | Relation rules — this is where the application injects its vocabulary. | — |
| `provider` **(required)** | Routing provider (Google Routes, a server proxy, or a fake). Must be STABLE across renders (`useMemo`): it determines the engine's identity, so passing it built inline (`provider={createX({…})}`) would recreate it on every render and… | — |
| `width` | Link stroke width, in screen pixels. | `8` |
| `defaultColor` | Last colour fallback: used by relations where NEITHER the rule nor the source marker gives a colour (source outside the registry, type absent from the theme). Yellow, readable on satellite and plan alike. The order is `rule.color` → source marker colour → this… | `'#ffd400'` |
| `linkDash` | Marching dash of SEARCH links — the 3D equivalent of the selection's marching ants. Lengths and speed in screen pixels (`speed` = px/s towards the target). `false` for a solid line. `gapOpacity`: what remains between two dashes, as a fraction… | `DEFAULT_DASH` |
| `routeColor` | Colour of the real route: distinct from the links, it is a different object. A navigation-style purple rather than blue — on satellite imagery a blue trace blends into the rivers and basins it follows. | `'#7c4dff'` |
| `hoverDarken` | Darkening factor of the hovered link (< 1 = darker). The family colour is darkened rather than replaced: the tint carries the meaning (which tag family), and hovering must not blur it. | `0.72` |
| `hubRadius` | Radius of the hub laid flat under the source marker, in screen pixels. It is what materialises the relation and carries the cross that clears it: too small and the command becomes a game of skill. | `26` |
| `casingWidth` | Dark outline under the link (legibility on satellite imagery). 0 to remove it. | `3` |
| `casingColor` | Outline colour (default: the theme's path colour). | — |
| `minOpacity` | Opacity of the lowest-ranked link — legibility floor of the rank gradient. | `1` |
| `staleMeters` | Drift of one end beyond which times and routes are recomputed. Below it, the link follows the marker but the figures stay: an agent moving 20 m does not justify a routing call. 0 to never recompute. | `routing.staleMeters` |
| `refreshIntervalMs` | Minimum interval between two recomputations of the same relation. Combined with `staleMeters`, it caps the call rate: a fast vehicle cannot trigger more than one call per interval, whatever its speed. | `routing.refreshIntervalMs` |
| `menuPresets` | Steps offered by a family's menu (“the 3 fastest”, “within 500 m”). A domain choice: the right scale depends on what you are linking. | — |
| `fanMaxLegs` | Beyond this number of links, the fan collapses into an aggregated line — past that it becomes illegible. Default 5. | — |
| `fastestOversample` | 💰 Candidates queried per displayed link in “fastest” mode (default 3). The closest as the crow flies is not the fastest — one-way streets, a river to go around. Several are therefore queried and DURATION decides. Each unit multiplies the… | `routing.fastestOversample` |
| `children` | Children mounted inside the relations context. The FUNCTION form receives the API directly: grafting the menu entry onto a marker layer declared at the same level then does not require extracting a component just for `useRelations()`. | — |

## `<LensLayer>`

Lens tool (inventory of an area).

| Prop | Description | Default |
|---|---|---|
| `getId` | Stable key of a marker (default: `m.id`). | `defaultGetId` |
| `renderItem` | Rendering of a row (default: type chip + avatar + id). | — |
| `actions` | Actions of a row's dropdown menu, in addition to “Target” (extensible). | — |
| `menu` | Menu of a row, in the SAME shape as `<MarkerLayer menu>` — that is what makes the inventory's “…” button identical to the marker's menu on the map. Takes precedence over `actions`. Filled in by `<Map markerMenu>` when the lens provides none. | — |
| `markerTypeLabel` | Readable label of a marker type (per-type summary). | — |
| `shortcut` | Activation keyboard shortcut (single letter, case-insensitive). Default `x`. `null` = none. | — |
| `targetZoom` | Zoom of a row's “Target” flight (default 17). | — |

## `<ShapeLayer>`

Geographic zones.

| Prop | Description | Default |
|---|---|---|
| `shapes` **(required)** | Zones to display (circles, rectangles, polygons), draped over the terrain. | — |

## `<PathLayer>`

Paths.

| Prop | Description | Default |
|---|---|---|
| `paths` **(required)** | Paths to display, draped over the terrain. | — |
| `animateHead` | Pulsing of the current point, at the head of the path (default `true`). | `true` |

## `<SearchBox>`

Unified map + place search. 💰

| Prop | Description | Default |
|---|---|---|
| `onSelect` | Notified when a result is picked (the camera already goes there on its own). | — |
| `search` | Geocoder for the “Places” group. Default: Google Places with `<Map googleMapsApiKey>`'s key; `false` removes the group. Concerns places ONLY: the map groups (markers, zones, drawings, symbols) come from the layers themselves via… | — |
| `placeholder` | Default: `labels.search.placeholder`. | — |
| `flyAltitude` | Fallback camera altitude (m) when the result has no bounds. | `searchCfg.flyAltitude` |
| `historyStorageKey` | localStorage key of the history — `null` to disable it. | `config.data.storageKeys.searchHistory` |
| `historySize` | Maximum number of history entries. | `searchCfg.historySize` |
| `limitPerGroup` | Results displayed per group (default 6) — the header announces the real total. | `searchCfg.limitPerGroup` |
| `scope` | Scope selector attached to the field (default `true`). `false` = all groups. | `true` |
| `groupOrder` | Order of the MAP groups (`['marker:agent', 'marker:alert']`); those not listed follow in alphabetical order. “Places” is outside the ordering: it always opens the list, since searching for a city is the most common framing gesture. | — |
| `minQuery` | Minimum input length before querying anything (default 2). Lower it to 1 for a dataset with short labels (codes, round numbers); raise it to spare a provider billed per call. | `searchCfg.minQuery` |
| `debounceMs` | Keystroke debounce, in ms (default 250). Every keystroke triggers a call to the place provider: raising it directly reduces the bill. | `searchCfg.debounceMs` |

## `<Toolbar>`

Drawing toolbar.

| Prop | Description | Default |
|---|---|---|
| `position` | Anchoring side of the bar. | `'left'` |
| `minZoom` | Minimum display zoom — drawing only makes sense in a close view; below it the bar slides off screen. | `config.interaction.drawToolbarMinZoom` |
| `tools` | Displayed tools, in order (`'select'` included — default: all). | `DEFAULT_DRAW_TOOLS` |
| `selectModes` | Modes offered by the selection flyout (default: all 3); a single one = no flyout. | — |
| `eraseModes` | Modes offered by the eraser flyout (default: point + marquee); a single one = no flyout. | — |
| `measureTools` | Rows offered by the “Measure” button — only one (`measure`) exists today, so the submenu never opens: the button acts directly. The coordinate grid has moved to the view controls (`<MapControls>`, `config.graticule`); the submenu's chassis stays in place for a future row. | — |
| `components` | Hides (`false`) or replaces (ReactNode) each section — default: everything displayed. | `{}` |
| `extraTools` | **Application** tools rendered as primary items of the bar, after the native tools (drawing, symbols, lens): they take on the bar's visual language instead of floating in a corner of the map. They drive their own state, the bar does not… | — |

## `<MapControls>`

Navigation bar.

| Prop | Description | Default |
|---|---|---|
| `position` | Anchoring side of the bar. | `'right'` |
| `components` | GROUP granularity: hide (`false`) or replace (ReactNode) a whole group of the bar. | `{}` |
| `buttons` | BUTTON granularity: `false` hides a specific button (e.g. `{ rotate: false, zoomOut: false }`). A group whose buttons are all hidden disappears, and a hidden button's keyboard shortcut is disabled with it. | `{}` |
| `shortcuts` | Keyboard shortcuts per action — `false` to disable one, another key to remap it if it is already taken elsewhere in the app. BARE letters (no ⌘/Ctrl: browsers reserve ⌘T/⌘N/⌘W…), identical on Mac and PC, shown in the… | — |
| `tagLabel` | Readable label of a tag in the “Layers” panel (default: the raw tag). | — |
| `templates` | Templates manager (button below “Layers”, same structure). `false`/absent removes it; an object configures it (API provider, categories…). Provided by `<Map templates>`. | — |
| `target` | The screen's point of reference (the alert being viewed, the ongoing event…): providing this prop adds a **“back to target”** button to the bar; omitting it removes the button. The map does not need to know what the target represents, only where it is. | — |

## `<GraticuleLayer>`

Geographic coordinate grid — see [GRATICULE.md](GRATICULE.md). **Mounted automatically by
`<Map>`**: do not mount it yourself (two grids would stack). **No props**: it is configured
through `config.graticule`, themed through `theme.colors.graticule`, and toggled through
`useGraticule()`, the “Measure” submenu or the `graticule` button of `<MapControls>`.

It costs nothing while the grid is off. The component stays exported for maps built without
`<Map>` (full imperative mounting).

## `<MeasureToolButton>`

The bar's “Measure” button and its submenu. Mounted by `<Toolbar>` — these exports only serve a
manual mount (custom bar).

| Prop | Description | Default |
|---|---|---|
| `position` | Anchor side, for opening the submenu. | — |
| `tools` | Rows displayed; a single one = no submenu — the current state, since only one row (`measure`) exists. | *(the only existing row)* |

## `<PinnedDock>`

Favourites dock.

| Prop | Description | Default |
|---|---|---|
| `items` **(required)** | Pinned items (derived from the ids stored consumer-side). | — |
| `onPin` **(required)** | A marker has been **dropped** into the dock: the consumer adds the id to its storage. | — |
| `onUnpin` **(required)** | A pinned item has been **removed** (cross, or dragged out of the dock). | — |
| `onReorder` | New order after a pinned item has been dragged INSIDE the dock. Receives the full list of ids in the desired order — to be reflected in your storage, the dock staying controlled. Absent: the chips do not reorder. | — |
| `onPinClick` | Click on a chip — emitted **in addition** to the default action (flyTo). | — |
| `flyOnClick` | `flyTo` towards the item on click (default `true`). `false` = only `onPinClick` is emitted. | — |
| `flyZoom` | Target zoom of the `flyTo` on click (default 16). Ignored if `flyAltitude` is provided. | — |
| `flyAltitude` | Target altitude of the `flyTo` (m above the ellipsoid) — takes precedence over `flyZoom`. | — |
| `accept` | Acceptable payloads. Default: `payload.type === 'marker'`. | — |
| `renderPin` | Custom rendering of a chip (default: an avatar/icon square coloured by type). | — |
| `tooltip` | Tooltip on chip hover (title/content ReactNode), displayed above — the same language as the marker tooltip. `null` = no tooltip. | — |
| `zoneId` | Id of the drop zone (distinct if several docks coexist). Default `m3d-pinned`. | `'m3d-pinned'` |
| `size` | Side (px) of the squares. Default 64. | `64` |
| `defaultCollapsed` | Dock collapsed at mount (the user expands it with a click). Default `false`. | — |

## `<MarkerList>`

Reusable marker list.

| Prop | Description | Default |
|---|---|---|
| `markers` **(required)** | Listed markers, in the order provided. | — |
| `getId` **(required)** | Stable key of a row. Required here — the list assumes nothing about the shape of the data. | — |
| `renderItem` | Rendering of the **title** (1st line) — default: `MarkerData.title`, otherwise the id. | — |
| `renderSubtitle` | Rendering of the **subtitle** (2nd line, smaller) — default: the type via `markerTypeLabel`. | — |
| `markerTypeLabel` | Readable label of a type (default subtitle). | — |
| `onRemove` | Per-row removal cross (hidden if absent): deselects / removes. | — |
| `onTarget` | Click on the row / “Target” action. Default: camera flight to the marker. | — |
| `targetZoom` | Zoom of the “target” flight (default 17). | — |
| `actions` | Actions of the dropdown menu, in addition to “Target”. | — |
| `menu` | Menu of a row, in the SAME shape as `<MarkerLayer menu>`: this is what lets a row's “…” button offer exactly the marker's map menu, submenus and separators included. When provided, it takes precedence over `actions`. “Target” stays… | — |

## `<TemplatesPanel>`

Bar button + panel of the template manager (drawing snapshots). Also accepts all
[`useTemplates`](HOOKS.md) options below. Details in [TEMPLATES.md](TEMPLATES.md).

| Prop | Description | Default |
|---|---|---|
| `provider` | Template backend. Absent = localStorage cache only. Present = authoritative (its list overwrites the view on mount, mutations go through it). | — |
| `categories` | Categories offered when saving. | `config.providers.templates.categories` |
| `defaultCategories` | Categories checked by default in the “Save” form. | `config.providers.templates.defaultCategories` |
| `defaultApply` | Default apply mode on click (`'merge'` \| `'replace'`). | `config.providers.templates.defaultApply` |
| `allowExport` | Allows `.m3dt` file export/import. | `config.providers.templates.allowExport` |
| `saveView` | Offers the “View” checkbox when saving (remembers camera pose, basemap, layers, pedestrian mode). | `config.providers.templates.saveView` |
| `defaultSaveView` | “View” checkbox checked by default. No effect if `saveView` is false. | `config.providers.templates.defaultSaveView` |
| `applyView` | Replays a template's view on load, when it carries one. | `config.providers.templates.applyView` |
| `viewFlyDuration` | Duration (s) of the flight to the loaded view; `0` = instant. | `config.providers.templates.viewFlyDuration` |
| `position` | Side of the host bar: the panel opens on the opposite side. | `'right'` |
| `tipId` | id of the host bar's shared `<Tooltip>` (MapControls). | — |
| `shortcut` | Key (single letter) that opens/closes the panel. `false` = no shortcut. | — |
| `grouped` | Rendered WITHOUT its own `.m3d-controls-group` card — for a shared group (with “Layers”). | — |

## `<CatalogControl>`

Bar button + "Catalog" panel: browses remote reference sets (zones, towns, departments…)
and lays their geometries on the map. Sources come from the `engine.catalog` registry,
not from props. Details in [CATALOG.md](CATALOG.md).

**With no source declared, the component renders nothing** — a button that would only
open an empty list is worse than no button. It is already mounted by `<MapControls>`
(button `catalog`, in the "Layers" group): instantiate it yourself only to place it in a
custom bar.

| Prop | Description | Default |
|---|---|---|
| `position` | Host bar side: the panel opens on the opposite side. | `'right'` |
| `tipId` | id of the host bar's shared `<Tooltip>` (MapControls). | — |
| `shortcut` | Key (single letter) that opens/closes the panel. `false` = no shortcut. Mounted by `<MapControls>`, it receives `interaction.shortcuts.controls.catalog`; no default of its own in a manual mount. | — |
| `grouped` | Rendered WITHOUT its own `.m3d-controls-group` card — to sit alongside "Layers". | — |

## `<Confirm>`

Modal confirmation dialog (above everything, `style.zIndex.modal`). Closes on Enter
(confirm), Escape, the cross or a click outside the dialog.

| Prop | Description | Default |
|---|---|---|
| `message` **(required)** | Displayed message (already formatted). | — |
| `confirmLabel` **(required)** | Confirmation button label. | — |
| `cancelLabel` **(required)** | Cancel button label. | — |
| `danger` | Destructive action: the confirmation button turns red. | — |
| `onConfirm` **(required)** | Called on confirmation. | — |
| `onCancel` **(required)** | Called on cancel (cross, Escape, outside click). | — |

## `<TemplateThumb>`

SVG preview thumbnail of a template's content — projected, auto-framed geometries, no
three.js and no GPU.

| Prop | Description | Default |
|---|---|---|
| `draw` **(required)** | GeoJSON FeatureCollection of the drawing to preview. | — |
| `size` | Side of the render square (px). | `40` |

## `<StatsPanel>`

Diagnostics panel, already mounted as the “Infos” row of the “Settings” menu. Render it yourself to place it in another surface — see [CAMERA.md](CAMERA.md).

| Prop | Type | Default | Role |
| --- | --- | --- | --- |
| `sections` | `readonly StatsSection[]` | all four | Sections shown, in panel order: `'camera'`, `'content'`, `'render'`, `'tiles'`. |
| `refreshMs` | `number` | `config.performance.readoutRefreshMs` | Maximum write rate. It is also the rate at which layer counters are queried — the panel costs nothing while closed. |

## `pathsLayer({ paths, animateHead })`

**Draped path** layer (routes, itineraries), to be placed in `layers` like `shapesLayer`.

| Prop | Type | Default | Role |
| --- | --- | --- | --- |
| `paths` | `PathData[]` | — | Displayed paths. Each carries its points and may override `color`, `width`, `casing`. |
| `animateHead` | `boolean` | `true` | Pulse on the current point, at the head of the path. |
| `id` | `string` | — | Layer key (like `markersLayer`/`shapesLayer`) — provide it as soon as `layers` can be reordered or filtered. |

Width is in **world metres**: a path grows with zoom, unlike drawing-layer strokes which keep a constant on-screen thickness. For a **computed** itinerary (traffic, travel time), see [RELATIONS.md](RELATIONS.md).

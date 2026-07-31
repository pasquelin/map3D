# map3d — English documentation

[Français](../fr/README.md) · **English** · [↑ Root](../../README.md)

**React 3D mapping library** (Three.js): globe → flat map, DOM markers/clusters, paths,
shapes, drawing tools, real-time data — **fully themable**.

Built for an *Operator Dashboard* (severity-graded alerts, geolocated mobile
agents), but generic and transport-agnostic (no Apollo/Socket.IO dependency).

## Highlights

- **Photorealistic 3D tiles** (Google via Cesium Ion) + fallback ellipsoid globe.
- **DOM/CSS markers and clusters** (native animations, `:hover`, accessibility), pooled
  nodes, `translate3d` positioning in a single project → write pass.
- **Inertia-free camera**: a single exponential smoothing (no oscillation).
- **World-space clustering** (supercluster), discrete zoom steps, stable keys (no
  flicker).
- **Animated mobile agents**: stable identity → the marker glides instead of being
  recreated.
- **Viewport-driven data**: bbox refetch on move + live real-time updates.
- **Ground-draped paths and shapes** (terrain anchor height, strokes in **screen px**,
  constant across zoom).
- **Full Figma-style drawing editor**: selection (click, marquee, lasso), resize/rotate
  handles, separate fill/stroke styles, persisted per-tool settings, undo/redo,
  host-lockable shapes.
- **One single 3D source**: Google Photorealistic 3D Tiles via **Cesium Ion** (one
  token).
- **Tag filtering (“layers”)**: tagged markers and drawings, filter panel built into the
  controls (search, checkboxes, colour chips, counters), persisted selection.
- **Typed light/dark theme**, `prefers-reduced-motion` honoured.
- **100 % translatable labels**: no hard-coded string, everything overridable through
  `<MapProvider labels>` (see [LABELS.md](LABELS.md)).

## Documentation

This page is the **guided tour**: it shows every domain in action. The guides below
cover each one **in depth**.

| Guide | Contents |
|---|---|
| [MARKERS.md](MARKERS.md) | points, `MarkerData`, clustering, selection, follow, zoom-gated scenery, repositioning, dock, performance |
| [ZONES.md](ZONES.md) | zones and draped shapes, volumetric extrusion, geodesic predicates, framing, paths |
| [DRAWING.md](DRAWING.md) | tools, selection, editing, style, history, GeoJSON, CRUD by identity, constraints |
| [SYMBOLS.md](SYMBOLS.md) | drag-and-drop icon catalogue, MIL-STD-2525D symbology |
| [TEMPLATES.md](TEMPLATES.md) | named drawing saves, local or API storage, sharing, `.m3dt` export |
| [RELATIONS.md](RELATIONS.md) | tag links, real distances and travel times |
| [LENS.md](LENS.md) | lens: inventory of the markers in an area |
| [SEARCH.md](SEARCH.md) | unified map + place search |
| [CAMERA.md](CAMERA.md) | initial position, `ready`, flights, framing, frozen map, basemap |
| [TILES.md](TILES.md) | tile provider: Google or self-hosted server, capabilities and buttons |
| [BUILDINGS.md](BUILDINGS.md) | picking a building of the internal volume: the tool, `buildingMenu`, surfaced attributes |
| [GRATICULE.md](GRATICULE.md) | coordinate grid: adaptive mesh, remarkable lines, labels, tilt fade |
| [PLUGINS.md](PLUGINS.md) | plugin author guide: contract, config, data source, enrichment at pick, hub, official registry |
| [DATA.md](DATA.md) | viewport-driven, real time, tags, pinning, persistence |
| [HOOKS.md](HOOKS.md) | every hook, and what makes what re-render |
| [ENGINE.md](ENGINE.md) | engine, events, registries, custom layers |

**Reference** — extracted from the real types and defaults, so no documented default can
diverge from what the library applies:

| Reference | Contents |
|---|---|
| [CONFIG.md](CONFIG.md) | `MapConfig` — what you **set**: providers, gestures, budgets, storage |
| [THEME.md](THEME.md) | `MapTheme` — what you **see**: colours, sizes, rhythm |
| [LABELS.md](LABELS.md) | `MapLabels` — every **string** and the formatting rules |
| [PROPS.md](PROPS.md) | React component props |

### Where to start

| You want to… | Go to |
|---|---|
| put points on a map | [MARKERS.md § 1](MARKERS.md#1-in-two-minutes) |
| display perimeters | [ZONES.md § 1](ZONES.md#1-in-two-minutes) |
| let the user draw | [DRAWING.md § 1](DRAWING.md#1-in-two-minutes) |
| refetch your data on move | [DATA.md § 2](DATA.md#2-viewport-driven) |
| frame the map on some content | [CAMERA.md § 4](CAMERA.md#4-framing-fitbounds) |
| translate the interface | [LABELS.md](LABELS.md) |
| adapt the visual identity | [THEME.md](THEME.md) |
| show a coordinate grid | [GRATICULE.md § 2](GRATICULE.md#2-turning-it-on) |
| serve tiles from your own server | [TILES.md § 2](TILES.md#2-configuring-the-internal-server) |
| open a menu on a 3D building | [BUILDINGS.md § 3](BUILDINGS.md#3-buildingmenu--the-contract) |
| write your own layer | [ENGINE.md § 3](ENGINE.md#3-writing-a-layer) |
| add a plugin (third-party source) | [PLUGINS.md § 1](PLUGINS.md#1-concept-and-mental-model) |

### The three settings trees

`<Map>` accepts three trees, deep-merged onto a complete base. Each has its own reason
to change:

```tsx
<MapProvider
  theme={{ colors: { ui: { accent: '#0af' } } }}   // visual identity
  labels={{ measure: imperialMeasure }}            // language and units
  config={{ performance: { antialias: false } }}   // machine, quota, input device
>
  <Map center={…} zoom={14} />
</MapProvider>
```

The dividing line: change the **theme** for a brand, **labels** for a locale, **config**
for an API key, a quota or touch support. A component's props **override** these trees
for one instance: passing nothing follows the map.

## Install

```bash
npm i map3d three react react-dom
```

`three` and `react`/`react-dom` (19) are **peer dependencies**.

The MIL-STD symbology SDK (`@armyc2.c5isr.renderer/mil-sym-ts-web`, ~9 MB) is a direct
dependency but loaded through a **dynamic import**: it never enters a bundle that does
not display symbols (see [Symbols](#symbols-a-drag-and-drop-icon-catalogue)).

## Quick start

```tsx
import {
  MapProvider, Map, MarkerLayer, MapControls,
  defaultTheme, type MarkerData,
} from 'map3d'

type Alert = { title: string }

export function App() {
  const alerts: MarkerData<Alert>[] = [
    { id: 1, type: 'alert-critical', position: { lat: 48.8566, lng: 2.3522 }, data: { title: 'Intrusion' } },
  ]
  return (
    <MapProvider theme={defaultTheme} colorScheme="auto">
      <div style={{ height: '100vh' }}>
        <Map cesiumIonToken={import.meta.env.VITE_CESIUM_ION_TOKEN} center={{ lat: 48.8566, lng: 2.3522 }} zoom={13}>
          <MarkerLayer<Alert>
            points={alerts}
            getId={(m) => m.id}
            cluster={{ enabled: true }}
            onSelect={(m) => console.log(m.data.title)}
          />
          <MapControls position="right" />
        </Map>
      </div>
    </MapProvider>
  )
}
```

## Dynamic data (bbox + real time)

```tsx
import type { DataSource, MarkerData } from 'map3d'

// Refetched on move (zoom gate + debounce + cancellation built in).
const source: DataSource<MarkerData<Alert>> = {
  minZoom: 10,
  async load(viewport, signal) {
    const { north, south, east, west } = viewport.bounds
    return fetchAlerts({ north, south, east, west }, signal) // your API / GraphQL
  },
}

<MarkerLayer source={source} getId={(m) => m.id} cluster={{ enabled: true }} />
```

For **real time** (agent positions), simply pass `points` that change: thanks to `getId`
(stable identity), a position change **animates** the marker instead of recreating it.

```tsx
<MarkerLayer
  points={agents}                     // updated by your WebSocket
  getId={(m) => m.id}
  selectedId={selected}
  followId={followed}                 // the camera follows the live agent
  icon={(m) => agentSvg(m.data)}      // SVG markup anchored to the map
/>
```

## Tag filtering (“layers”)

Every marker can carry `tags`; drawings are tagged automatically (`['draw', <tool>]`).
The **Layers** button in `<MapControls>` opens a panel listing the tags present on the
map (search, checkboxes, counters): ticking one or more tags leaves only the matching
elements visible (**OR** semantics — “the users and every rectangle”). The selection is
persisted in `localStorage`.

```tsx
const agents: MarkerData<Agent>[] = [
  { id: 'a1', type: 'agent-enroute', tags: ['user', 'move'], position, data },
  { id: 'a2', type: 'agent-available', tags: ['user', 'standby'], position, data },
]

// Identification colours for the panel chips (otherwise a stable hashed palette):
const theme = mergeTheme(defaultTheme, {
  colors: { tags: { user: '#22c55e', move: '#06b6d4' } },
})
```

- Marker filtering is applied **before** clustering (clusters reflect the filter);
  drawings simply toggle their visibility (no geometry rebuild).
- Programmatic access: `useTags()` / `useTagSelection()` (or `engine.tags`: `toggle`,
  `clear`, `isVisible`, `all`).
- Persistence: key configurable via `<Map tagStorageKey>` (`null` to disable, one key
  per map if several maps coexist).

### Off-screen markers

A marker that leaves the frame **stays mounted**: its DOM node, its React portal and its
`CSS2DObject` are kept. Only those that went **behind the camera** and those that went
**behind the globe** (horizon occlusion) are hidden automatically.

Those more than **200 px** outside the frame (`<MarkerLayer cullMargin>`, `0` to
disable) are hidden as well: the browser stops computing their style, layout and
compositing. A marker **created** off-frame never even enters the document — the
`CSS2DRenderer` only inserts the element on the first render where the object is
visible. Measured on the demo, initial view: **9 anchors in the DOM instead of 32**, and
no marker rendered beyond the margin (23 without culling).

The price is one projection per marker per frame, the same computation the
`CSS2DRenderer` already performs to position them. The margin is not cosmetic: any
tighter and edge markers flicker during a pan. A hidden marker also drops out of marquee
selection — off-frame by at least 200 px, no rectangle drawn on screen could reach it
anyway.

This setting does **not** reduce the number of mounted objects (the `CSS2DRenderer`
z-sort covers everything that exists). To bound that number, two levers, in this order:
a **viewport-scoped** `source` (the only one that bounds the data, including at maximum
zoom where clustering no longer groups) and **clustering**.

## Relations (real distances and travel times)

`<RelationLayer>` links a marker to its neighbours **by tags**, with the **real road**
distances and durations from a routing provider. A “Distance around” section is
**grafted onto** the marker's context menu: it does not replace it. The tag families
applicable to the source are listed directly, each opening its selection presets.

```tsx
import { RelationLayer, RelationStatusBar, createGoogleRoutesProvider, type RelationRule } from 'map3d'

// The ONLY place the domain lives: the engine only knows tags.
const RULES: RelationRule[] = [
  {
    id: 'alert-to-agents',
    label: 'Agents',              // level-2 menu label
    from: { any: ['alert'] },     // the source marker must satisfy this selector
    to: { any: ['user'], none: ['onsite'] }, // and so must candidate targets
    color: '#22c55e',             // family chip; omitted → colour of the targeted tag
    mode: 'DRIVE',
    selection: { mode: 'fastest', count: 3, maxMeters: 15000 },
    limit: { compute: 15, render: 10 },
  },
]

const provider = useMemo(() => createGoogleRoutesProvider({ apiKey, region: 'fr' }), [apiKey])

<RelationLayer rules={RULES} provider={provider}>
  {(relations) => (
    <>
      <MarkerLayer
        points={markers}
        menu={(m) => {
          const rel = relations.menuFor(m)          // [] if no rule applies
          return rel.length === 0 ? base(m) : [...base(m), { separator: true }, ...rel]
        }}
      />
      <RelationStatusBar nameOf={(p) => nameById(p.id)} />
    </>
  )}
</RelationLayer>
```

**Tag selectors** — `{ any, all, none }`: `any` = at least one (OR semantics, the same
as the “Layers” filter), `all` = all required, `none` = exclusion. The three clauses
combine with AND.

**Selection** — `fastest` keeps the `count` fastest (the closest as the crow flies is
not the fastest: the library oversamples, and **duration** decides); `radius` keeps
everything under `radiusMeters`. `maxMeters` is the cost guardrail applied **before**
any network call, and `limit.compute` / `limit.render` cap the points sent to routing
and the links drawn, respectively.

**Colour of links and chips** — two different questions, two colours. The **link**
answers “who does this beam come from?”: it carries the colour of **its source marker**
(`theme.colors.marker[type].base`, exactly its chip's), links and hub included, and it
is resolved **on every pass** — an agent changing status also changes the colour of its
links, without reopening the relation. The **family chip** (marker menu, status-bar
toggle) answers “what does this family target?”: it carries the colour of the **tag
targeted** by the rule, resolved as in the “Layers” panel (`theme.colors.tags`, then
`tagColor`'s hashed palette) — nothing more to declare, the tag table given to the theme
serves both surfaces. The chosen tag is the last of `to.all` (the most restrictive:
`{ all: ['alert', 'critical'] }` → “critical”), otherwise the first of `to.any` (see
`familyTag`). `rule.color`, when declared, wins over both; `defaultColor` is the last
fallback.

**Search** links use a **marching dash** (the selection's marching ants, transposed onto
a 3D ribbon: `<RelationLayer linkDash={{ length, gap, speed, gapOpacity }}>` in screen
pixels, `false` for a solid line). The gap between two dashes is not empty: it keeps the
link's colour at `gapOpacity`, which gives it a continuous body without imposing an
outline in another tint (a dashed link therefore gets no `casingWidth`). The **traced**
route stays solid, keeps its casing and takes `routeColor`: the dash says “candidate
under evaluation”, the solid line says “here is the trip”.

**One single link per marker pair.** Two opposite relations — the agent towards its
alerts, the alert towards its agents — describe the same arc and used to overlap
pixel-perfectly, the second hiding the first. Only one link is drawn now, and its
**successive dashes alternate the colours** of every relation involved (up to
`MAX_DASH_COLORS`): one mesh fewer, and membership visible. The link belongs to the
**last relation opened** — that is the one carrying the label, the hover and the click.
Without dashes (`linkDash={false}`) there are no dashes left to colour: the link stays
solid, in that same relation's colour.

**What is displayed** — a flat hub under the source marker, one link per target with its
rank and its `2.4 km · 9 min` label, and the real route on clicking a link. The hub
carries its relation's **status bar**: it anchors right next to the marker, follows its
moves, and flips to the other side of the hub when the container edge gets too close.
Each open relation therefore has its own bar, where the eye already is.

The bar describes **what is actually on screen**, and changes with it:

| | Without a route | Route traced |
| --- | --- | --- |
| Chip | family colour | route colour |
| Title | `source → family` | `source → chosen target` |
| Segments | family, travel mode | travel mode only |
| Measure | extent (`The 3 fastest`) | `2.4 km · 9 min` of the trip |

The family selector disappears once the target is settled — it would offer to redo a
choice already made. Changing the **travel mode** during a trace **re-traces** it in the
new mode instead of falling back to direct links: it is the same trip asked differently.
The old trace stays visible during recomputation rather than leaving a gap. Targets
aggregated into the same cluster share a trunk and open into a fan, without ever
bursting the cluster or touching the zoom. Links follow both ends: a moving marker
carries its link along, and beyond `staleMeters` the times are recomputed (throughput
capped by `refreshIntervalMs`).

**Honest values** — until routing has answered, the label shows `…`; if it fails, “Time
unavailable”. **Never** a fallback to straight-line distance: it serves to select, not
to fill in a travel time.

**API key — read before production.** `createGoogleRoutesProvider` calls Google from the
browser, so the key ships in the bundle. Google web services (Routes v2) **do not
accept** HTTP-referrer key restrictions — only IP ones: a key embedded in a web page is
therefore usable by a third party, at your expense. In production, implement
`RoutingProvider` (two methods: `matrix` and `route`) against your own backend. The core
depends on nothing but that contract, no change is needed anywhere else.

| Export | Role |
| --- | --- |
| `<RelationLayer rules provider width defaultColor linkDash routeColor hubRadius casingWidth minOpacity staleMeters refreshIntervalMs>` | Mounts the layer, holds the state, provides the context. `provider` must be stable (`useMemo`). |
| `<RelationStatusBar nameOf>` | Status bars — **one per relation**, anchored to its source marker's hub: clickable segments (tag family, travel mode) and clearing. Repositions itself against the edges. |
| `useRelations()` | `{ rules, menuFor, run, snapshots, setMode, routeColor, familyColor, untrace, clear }` — throws outside a `<RelationLayer>`. |
| `RelationEngine` `selectTargets` `matchesSelector` `familyTag` `buildRelationMenu` | **Headless** core (no Three, no React, no `fetch`): usable server-side or in tests with a fake provider. |
| `createGoogleRoutesProvider({ apiKey, language, region })` `RoutingProvider` | Google Routes v2 provider, or the contract to implement for your own. |
| `LinkLayer` `haversineMeters` `greatCirclePoints` `decodePolyline` `RouteCache` | Reusable building blocks (draped link rendering, spherical geometry, encoded polylines, TTL + position cache). |

Travel modes: `DRIVE`, `WALK`, `BICYCLE`, `TWO_WHEELER`, `TRANSIT`. Labels and templates
are translatable through `labels.relations` and `labels.duration` (see
[Translating labels](#translating-labels-labels)).

## Drawing tools

A complete Figma/Photoshop-style shape editor, draped over the 3D terrain (shapes
anchored to the ground, strokes in screen px, constant across zoom).

**Drawing**: line, polygon (clicks + Enter), rectangle (adjustable corner radius),
circle, freehand, arrow, measure (thin dashed dimension ⊢––⊣ with a distance label),
eraser.

**Selection** (`V`): single click (Shift+click = add/remove), or **rectangle** (`1`),
**polygon** (`2`), **lasso** (`3`) marquee — submenu on button hover, “touch = selected”
semantics. Black/white marching-ants outlines (readable on any background), bounding box
in multi-selection.

**Editing**: Figma-style handles — corners (2 axes, Shift = uniform scale), edge
midpoints (1 axis), individual vertices (polygon/line/arrow/measure), body drag = move,
**Shift while dragging = rotate** (dedicated cursor). Multi-selection: grouped
transformations in a common frame. A rotated rectangle resizes along its own axes.

**Style panel** (shown with an active tool or a selection): **separate fill and stroke**
colours (stacked Photoshop-style swatches with a ⇄ swap), theme palette + native picker,
stroke width **including 0** (no stroke), stroke style (solid/dashed/dotted), stroke AND
fill opacity, rectangle corner radius. Without a selection it sets the active tool's
defaults; with a selection it restyles the shapes.

**Per-tool settings** (gear): each tool keeps its own defaults (colours, width, stroke,
opacities, radius…), **persisted in `localStorage`** (`m3d:draw-settings`, disableable
via `settingsStorage="none"`), with a live preview, per-tool or global reset, and a
shortcut summary.

**Space bar**: holding Space while drawing/editing = **temporary camera pan** (the
stroke in progress is frozen, not lost); Space+Shift = camera rotation; releasing
resumes exactly.

**History**: full undo/redo (`⌘Z`/`⌘⇧Z`) covering creation, editing, style, deletion,
duplication. `⌘A` select all, `⌘D` duplicate, `Delete` delete, arrow keys = move by 1 px
(Shift = 10 px).

**Locked shapes**: a GeoJSON feature with `properties.locked: true` (e.g. an area
boundary imposed by your API) is untouchable in the UI — clicking it flashes a padlock;
“Clear all” keeps it, and **undo/redo preserves it** (neither deleted nor unlocked by
Ctrl+Z). Unlocking is reserved for host code: `api.lock(ids)` / `api.unlock(ids)`.

**GeoJSON**: export/import via `onChange`/`value`/`toGeoJSON`/`fromGeoJSON`. Per-shape
properties: `kind`, `color` (stroke), `fillColor`, `width` (px, 0 = no stroke),
`fillOpacity`, `strokeOpacity`, `stroke` (`solid`/`dashed`/`dotted`), `radius` (corner
%, rects), `locked`, `tags`, `meta`. Each feature also carries its `id` (standard
GeoJSON field). Older files (without the newer fields) load as-is.

**Identity and business metadata**: every shape has a **stable `id` that survives the
round trip** export → import, and a free-form `meta: Record<string, unknown>` field
carried through end to end, never interpreted or rendered by the library. That is where
your model lives (database uuid, groups, title…).

**Per-shape events**: `onShapeAdd` / `onShapeUpdate` / `onShapeDelete` are emitted **at
the moment of the change**, unlike `onChange` which serialises the whole collection and
coalesces to 1×/frame. `onShapeEdit` signals a **double-click** — an intent to open a
sheet host-side, not a mutation. Both styles coexist: `onChange` for a controlled global
state, `onShape*` for CRUD by identity (one mutation per shape). Undo/redo emits these
events too, derived by difference.

```tsx
<DrawLayer
  value={imposedZones}                         // controlled import (replaces everything, not undoable)
  onChange={(fc) => save(fc)}                  // full GeoJSON, coalesced (1 emission per frame max)
  onSelectionChange={(ids) => console.log(ids)}
  onShapeAdd={async (s) => {                   // CRUD by identity: one mutation per shape
    const { uuid } = await createZone(s)
    api.updateShape(s.id, { meta: { uuid } }, { silent: true })  // silent = no re-emission
  }}
  onShapeUpdate={(s) => saveZone(s.meta?.uuid, s)}
  onShapeDelete={(s) => deleteZone(s.meta?.uuid)}
  onShapeEdit={(s) => openSheet(s.meta?.uuid)} // double-click
  // Business rules for USER drawing (programmatic mutations are exempt).
  constraints={{ limits: allowedPerimeters, maxAreaM2: 10_000_000 }}
  onReject={(reason, s) => toast(reason === 'outOfLimits' ? 'Outside the area' : 'Too large')}
  settingsStorage="local"                      // or "none"
  shortcuts={{ selectLasso: 'q', rect: false }} // remap/disable tools and selection modes
>
  <Toolbar
    position="left"
    tools={['select', 'rect', 'circle', 'arrow', 'erase']}  // displayed tools, in order
    selectModes={['rect', 'lasso']}                          // selector modes (a single one = no flyout)
    components={{ settings: false, clear: false }}           // hide/replace each section
  />
</DrawLayer>
```

The `useDrawing()` API exposes everything: `tool/setTool`,
`selectMode/setSelectMode`, `selection`, `select`, `selectAll`, `clearSelection`,
`deleteSelection`, `duplicateSelection`, `setStyle`/`currentStyle`, `lock`/`unlock`,
`undo`/`redo`/`canUndo`/`canRedo`, `settings` (+ `useDrawSettings()`),
`toGeoJSON`/`fromGeoJSON`, `shortcuts`.

**Business constraints** — `constraints.limits` (`ShapeData`, as in `<ShapeLayer>`)
requires every drawn shape to fit inside **at least one** perimeter, and
`constraints.maxAreaM2` caps its area. A refused creation leaves no trace (no mesh, no
history, no `onChange`); a refused **edit** restores the shape to its pre-gesture state
rather than losing it — and therefore does not emit `onShapeUpdate`.
`onReject(reason, shape)` lets you display your own message: the library displays
nothing itself. `limits` draws nothing either — display your perimeters with
`<ShapeLayer>` or as locked shapes. Only **user gestures** are constrained:
`addShape`/`updateShape`/`fromGeoJSON` inject without checks.

The predicates are exported and **geodesic** (therefore stable under camera rotation,
unlike a screen-space test): `polygonAreaM2` (spherical excess, the same method as
`google.maps.geometry.spherical.computeArea`), `pointInRing`, `ringInsideRing`,
`circleRing`, `ringOfShape`.

**CRUD by identity** — to drive shapes one by one from your code: `getShapes()`,
`getShape(id)`, `getLastShape()`, `addShape(shape, opts?)` (returns the id),
`updateShape(id, patch, opts?)`, `removeShape(id, opts?)`,
`replaceShapes(shapes, opts?)`. All accept `{ silent: true }`, which **suppresses every
event emission** — indispensable to re-inject a response from your backend without
re-triggering the mutation that just produced it. `addShape({ id: myUuid, … })` makes
your business identifier the map3d id directly; `replaceShapes` emits events by
difference, where `fromGeoJSON` replaces wholesale. In a patch, `style` is merged field
by field but `meta` is **replaced** (`{ meta: { ...getShape(id)?.meta, uuid } }` to
patch it).

## Symbols (a drag-and-drop icon catalogue)

**Catalogue icons** are placed on the terrain by dragging them from the palette, then
become movable, selectable, tag-filterable and persistable — the same guarantees as
drawing shapes, applied to points.

There is **no dedicated layer to mount**: a placed symbol is a shape of the drawing
collection (`kind: 'symbol'`), so `<DrawLayer>` carries the whole thing. It therefore
inherits undo/redo, GeoJSON and per-shape events without anything being duplicated.

The artwork is **injected** (`SymbolRenderer`), like the search and routing providers:
the layer only knows catalogue `key`s, never a particular symbology format. A catalogue
can therefore change its artwork without invalidating already-stored data.

```tsx
const catalog: SymbolCatalog = {
  id: 'my-catalogue',
  entries: [
    { key: 'commandPost', label: 'Command post', category: 'installations' },
    { key: 'hospital', label: 'Hospital', category: 'installations' },
  ],
}

// `render` is SYNCHRONOUS (called on every render) so it must memoise; loading of
// any SDK goes through `ready`, after which the layer re-renders.
const renderer: SymbolRenderer = {
  ready: loadMySdk(),
  render: (key, { size, variant } = {}) => ({ size: size ?? 40, svg: svgAnchoredAtCentre(key, variant) }),
}

<DrawLayer
  symbols={{ catalog, renderer }}             // `enabled: false` removes the tool
  onShapeAdd={(s) => createInDb(s)}           // CRUD by identity, shapes AND symbols
  onShapeUpdate={(s) => save(s.meta?.uuid, s)}
  onShapeDelete={(s) => remove(s.meta?.uuid)}
  onChange={(fc) => persist(fc)}              // or the global state as GeoJSON
/>
```

The events are the drawing layer's: a symbol is recognisable by `kind === 'symbol'`, and
its catalogue entry by `symbol.key`. The affiliation applied to placements is the
palette's (`useDrawing().symbols.affiliation`), not a prop.

**The SVG must be anchored at the centre of its viewBox** — this is a requirement, not a
convenience. MIL-STD symbols have an internal anchor point that is not the centre of the
image (a command post hangs below its mast): rendering the raw SVG would offset the
symbol by several pixels relative to the terrain. Recentring the viewBox on the anchor
is the provider's responsibility; the layer places the centre of the image on the
coordinate.

Rendering goes through `<MarkerLayer>`: a point symbol **is** an icon point, so it
inherits projection, node pooling, marquee/lasso selection and the “Layers” filter
without reimplementing them. Default tags follow the house convention:
`['symbol', <category>]`, alongside `['draw', <tool>]` and `['marker', <type>]`.

It also inherits **grouping** and the **scenery zoom threshold**: placed by the dozen
over the same area, symbols overlap without saying anything about what they hide, and
zoomed out over a region they mask the alerts. They therefore take part in the **map's**
grouping — the same index as the application's markers, so one chip can mix the two —
and are `static` by default (see [Static markers](#static-markers-scenery)):

```tsx
<DrawLayer
  symbols={{
    catalog,
    renderer,
    cluster: { enabled: false },   // `{ enabled: true }` by default
    minZoom: 14,      // threshold for the WHOLE layer, instead of `config.markers.staticMinZoom`
  }}
/>
```

When the threshold depends on the **kind** of symbol rather than the layer, it is
declared on the catalogue entry — that is what knows a command post structures a region
where a checkpoint only means something once you are on site:

```tsx
entries: [
  { key: 'commandPost', label: 'Command post', category: 'installations', minZoom: 10 },
  { key: 'checkpoint', label: 'Checkpoint', category: 'installations', minZoom: 16 },
]
```

Placing a new icon and moving an existing one are **the same gesture** on the same zone
(`useMapDropZone`): only the origin of the payload differs. The rest goes through
`useDrawing()`: its `symbols` field exposes `catalog`, `render` (thumbnails), `ready`,
`affiliation`/`setAffiliation`, `paletteOpen`/`setPaletteOpen` and
`place(key, at, variant?)`; CRUD, history and GeoJSON are the shapes' own (`addShape`,
`updateShape`, `removeShape`, `undo`/`redo`, `toGeoJSON`…), symbols included.

The catalogue's `multiPoint` entries (tactical graphics: perimeter, axis, area) are
**ignored on drop**: they are placed by collecting successive points, a mode that is not
implemented yet.

### Palette (`<SymbolPaletteButton>`)

The button that opens the palette is a **native tool of the bar** (like the lens):
`<Toolbar>` renders it itself, `components={{ symbol: false }}` hides it.

```tsx
<DrawLayer>
  <Toolbar />
</DrawLayer>
```

The catalogue, the affiliation and the labels come from `<DrawLayer>`'s context: the
palette takes no configuration at all.

The panel reuses the visual language of “Layers” (search, counters, panel docked on the
side opposite the bar, closing on outside click or Escape) and adds a grid per category.
Every thumbnail is rendered by the `SymbolRenderer` **in the current affiliation**:
changing affiliation redraws the whole palette, and the placed symbol inherits the
variant on display. A badge on the button counts the symbols present on the map.

Usage details: the grab is **immediate** on a thumbnail (`longPressMs: 0` — a palette
has no click to preserve, unlike a marker whose click opens a sheet); `multiPoint`
entries are listed but greyed out and non-grabbable, rather than hidden, so the
catalogue does not look incomplete; and the panel is only mounted while open, so when
closed it never calls the renderer.

### Bundled MIL-STD-2525D symbology

A ready-to-use catalogue and renderer ship with the library, backed by the official
`@armyc2.c5isr.renderer` SDK:

```tsx
import { MILSYM_CATALOG, createMilSymRenderer } from 'map3d'

const renderer = useMemo(() => createMilSymRenderer({ affiliation: 'friendly' }), [])

<DrawLayer symbols={{ renderer }} />   // `catalog` defaults to MILSYM_CATALOG
```

`MILSYM_CATALOG` covers **91 entries** across 7 categories — 80 point icons
(`installations`, `units`, `equipment`, `air`, `events`, `control`) and 11 multi-point
tactical graphics — with labels and descriptions in French. A symbol's `variant` is its
**affiliation**: `friendly`, `hostile`, `neutral`, `unknown`.

The SDK weighs ~9 MB: it is loaded through a **dynamic import**, isolated in a chunk that
only a map displaying symbols downloads. `render` stays synchronous (the
`SymbolRenderer` contract) and serves from a cache keyed by SIDC + size; it returns
`null` until `ready` resolves, the layer showing a placeholder until then.

⚠️ **The SIDC pitfall** — the affiliation is the **4th** digit of a 2525D SIDC, not the
3rd (that one carries the *context*: reality / exercise / simulation). Writing it in 3rd
position — which is what operator's `applySidcAffiliation` does — produces a non-standard
context symbol: decorated artwork, different dimensions and a **different anchor point**
(≈ 5 px of vertical offset measured), while the affiliation stays the catalogue's own.
map3d's `applyAffiliation` writes in the right place; this is a point to fix when
migrating operator.

## Lens (X-ray of the markers in an area)

A **read-only** tool: you drag a rectangular area on screen, and a panel inventories
**every marker it covers — including those aggregated inside a cluster**. The map itself
does not move: nothing is selected, no cluster is burst open, no shape is created (so
nothing lands in the GeoJSON, the undo/redo history or the style panel).

It is **mounted by the map and enabled by default** — like the Symbols tool, there is
nothing to assemble:

```tsx
<Map center={PARIS} zoom={14}>          {/* the lens is there, key X, button in the bar */}
  <MarkerLayer points={markers} />
  <DrawLayer><Toolbar /></DrawLayer>
</Map>
```

`lens` only serves to **configure** the tool (everything is optional), and
`lens={false}` removes it entirely — no shortcut, no button:

```tsx
<Map
  lens={{
    renderItem: (m) => m.data?.name ?? m.id,   // default: type chip + avatar + id
    actions: SHEET_ACTIONS,                    // in addition to the native “Target”
    markerTypeLabel: (t) => LABELS[t] ?? t,    // per-type summary in the header
    getId: (m) => m.id,
    shortcut: 'x',                             // `null` = none
    targetZoom: 17,
  }}
>
```

The button is a **native `<Toolbar>` tool** (hideable via
`components={{ lens: false }}`), and `useLens()` provides
`active`/`activate`/`deactivate`/`toggle` anywhere under `<Map>` — to drive the lens
from your own UI.

**Interaction**: while the tool is active, dragging draws the area (drawing again
replaces it, a single click clears it); the map is navigated with the wheel and the
space bar, as for drawing. The area is movable and resizable, and the list **recomputes
live** as the map scrolls underneath. `Escape` removes the area, then leaves the tool.
The lens and the drawing tools are **mutually exclusive** — they share the same pointer
interceptor.

The panel reuses the selection panel's `<MarkerList>`: one row per marker, fixed header
with the per-type count, scrollable body, per-row cross, extensible actions menu.

## Translating labels (`labels`)

Every displayed string (tooltips, aria-labels, placeholders, panels, the measure tool's
distance label) has a **French default** in `defaultLabels` and is overridden key by key
through `<MapProvider labels>` (deep merge — pass only what you translate):

```tsx
<MapProvider
  labels={{
    controls: { fullscreen: 'Fullscreen' },
    toolbar: { undo: 'Undo', redo: 'Redo' },
    tools: { freehand: 'Freehand', measure: 'Measure' },
    tags: { button: 'Layers — filter by tag' },
    measure: { kilometers: '{value} km' },   // templates: keep the {variables}
  }}
>
```

- `useLabels()` gives the resolved object to your custom components;
  `formatLabel(template, params)` interpolates the `{variables}`.
- **Full key reference** (groups `controls`, `tags`, `symbols`, `search`, `toolbar`,
  `tools`, `selectModes`, `style`, `selection`, `markerList`, `lens`, `settings`,
  `actions`, `glyphs`, `modKey`, `keys`, `format`, `measure`, `duration`, `relations`,
  `pinned`, `plural`, `errors`):
  see [LABELS.md](LABELS.md).

## Keyboard shortcuts

**Tools** are picked with bare letters, identical on Mac and PC; **editing actions**
(undo, select all, duplicate) use the platform modifier (⌘ on Mac, Ctrl elsewhere) with
targeted `preventDefault`. All of them appear in the buttons' tooltips and are ignored
while typing (search, forms).

**Moving on the map** — the only keys that act while **held down**:

| Key | Action |
|---|---|
| `↑` `↓` `←` `→` | Forward / back / strafe, **in the view's frame** |
| `Z` `S` `Q` `D` | The same, on AZERTY |
| `Shift` (held) | Speed up (×3) |

"Straight ahead" follows the **ground**, never the line of sight: the camera keeps its
altitude however steep the tilt. Turning the view turns the keys with it, and they stay
active in **rotate mode** — the mouse orbits, the arrows move.

Speed is proportional to height above ground (`camera.keyPan.speed`), so the map scrolls at
the same on-screen pace at any altitude.

The arrows go back to **nudging a drawing selection** as soon as there is one — the map
steps aside on its own. Letters are remapped through `interaction.shortcuts.navigate`
(WASD on QWERTY, for instance).

**Map controls (`<MapControls>`)**:

| Key | Action |
|---|---|
| `N` | North / top-down view |
| `+` / `−` | Zoom in / out |
| `I` | Tilt (3D view) |
| `G` | Back to globe |
| `B` | Basemap: 3D ↔ plan |
| `T` | Layers — tag filter (open/close) |
| `F` | Fullscreen |

Remappable if a key is already taken elsewhere in your app — same pattern as the drawing
tools:

```tsx
<MapControls shortcuts={{ layers: 'y', fullscreen: false }} />   // T → Y, F disabled
<DrawLayer shortcuts={{ rect: 'k' }} />                          // drawing tools
```

**Drawing tools (`<DrawLayer>`)**:

| Key | Action |
|---|---|
| `V` | Select — `1` rectangle, `2` polygon, `3` lasso |
| `L` `P` `R` `C` `H` `A` `M` `E` | Line, Polygon, Rectangle, Circle, freehand (`H`), Arrow, Measure, Eraser |
| `Space` (hold) | Temporary camera pan (drawing frozen, not lost) — `Space+Shift` = camera rotation |
| `Shift` + drag | Rotate the shape (body) / uniform scale (corner handle) |
| `⌘Z` / `⌘⇧Z` (`Ctrl` elsewhere) | Undo / Redo (creation, editing, style, deletion) |
| `⌘A` / `⌘D` | Select all / Duplicate the selection |
| `Delete`/`⌫` | Delete the selection |
| Arrow keys | Move the selection by 1 px (Shift = 10 px) |
| `X` | Lens — inventory of the markers in an area (`<Map lens={{ shortcut }}>` to remap) |
| `Enter` | Close the polygon (drawing or marquee) |
| `Escape` | Cascade: cancels the gesture/stroke in progress → marquee → deselects → navigation tool |

A remap is immediately reflected in the tooltips (both bars display their effective
shortcuts).

## Main API

| Item | Role |
|---|---|
| `<MapProvider theme colorScheme labels>` | Resolved theme (light/dark + reduced-motion) + translatable labels ([LABELS.md](LABELS.md)). |
| `<Map cesiumIonToken googleMapsApiKey center zoom mapMode fallbackGlobe interactive onReady onViewportChange onCameraChange>` | Canvas + engine (Cesium Ion). |
| `<MarkerLayer points/source getId cluster icon typeLabel tooltip menu selectedId followId onSelect selectionRing draggable repositionable onReposition leaderLine cullMargin staticMinZoom>` | DOM markers/clusters. Hover tooltips derived from `MarkerData.title`/`titleColor`/`content` (`tooltip` remains the override for a title plain text cannot express — clicking = actions), `MarkerData.avatar` (managed round photo), `MarkerData.new` (sonar until clicked) and `MarkerData.urgent` (red reticle, urgent-styled tooltip). `typeLabel` names a type once and for all (search groups, cluster satellites). An inseparable cluster at maximum zoom → automatically fanned out. |
| `<Map cluster={{ enabled, size, icon, typeIcon, typeLabel, tooltip }}>` `<ClusterSurface>` | The **map's** grouping: a single index fed by every layer (`engine.clusters`), which renders the chips. The algorithm lives in `config.clustering`; `<MarkerLayer cluster={{ enabled: false }}>` opts a layer out. |
| `<PathLayer paths animateHead>` | Paths/routes (animated GPS trace). |
| `<ShapeLayer shapes>` | Zones: circle-radius, polygon, rectangle-bounds — ground-draped, or **volumetric** through `extrudeHeight`. |
| `<DrawLayer tools shortcuts defaults settingsStorage value onChange onSelectionChange onShapeAdd onShapeUpdate onShapeDelete onShapeEdit>` | Full shape editor (selection, editing, style, undo/redo, locking) + GeoJSON, stable per-shape identity, free-form business metadata and CRUD by id. |
| `<DrawLayer symbols={{ enabled, catalog, renderer }}>` | Catalogue icons placed by **drag-and-drop** (injected artwork), movable, tagged, undo/redo + GeoJSON — see [Symbols](#symbols-a-drag-and-drop-icon-catalogue). |
| `<SymbolPaletteButton position tipId shortcut categoryLabel variants variant onVariantChange previewSize>` | Button + categorised palette with search, affiliation selector and grabbable thumbnails (→ `<Toolbar extraTools>`). |
| `<Toolbar position minZoom tools selectModes components>` | Fully configurable drawing bar (hideable/replaceable sections). |
| `<DrawStylePanel>` `DrawSettingsButton` | Style panel and per-tool settings, usable standalone. |
| `<MapControls>` `<ContextMenu>` | Replaceable controls (**Pan/Rotate** drag buttons — rotate without holding Shift —, **Layers** button = tag filter). |
| `<SearchBox onSelect search placeholder flyAltitude historyStorageKey historySize limitPerGroup scope groupOrder>` | **Unified** search: the map's elements (markers, zones, drawings, symbols) AND place geocoding, in one **grouped** list. Map groups are not configured — layers register themselves with the `engine.search` registry as soon as an element carries a `title`; `<MarkerLayer typeLabel>` names them. Chip-based scope selector, headers announcing the total before truncation, picking a marker = camera flight **+ selection** (like a click) with the `<Map markerMenu>` menu under its “…” button, localStorage history re-resolved against the current position, keyboard ↑ ↓ Enter Escape. `search` replaces the geocoder only (**Google Places built in** by default through `<Map googleMapsApiKey>`'s key, or `createGooglePlacesSearch({ apiKey, language, region, limit })`); `false` removes the “Places” group, which otherwise always opens the list. |
| `<TagFilterControl position tipId>` | Button + tag filter panel, usable standalone outside `<MapControls>`. |
| `<ToolButton icon label tip shortcut active>` | Toolbar button (icon, state, tooltip + `aria-label` carrying the shortcut) — to populate `extraTools` / `components` with the native buttons' visual language. Pair it with `useToolbar()`: an application tool must close itself when the bar retracts or a native tool takes over (`bar.retracted \|\| bar.nativeActive`, via `useCloseWhenHidden`) and turn the others off when opening (`bar.claim()`). Without that, two buttons stay lit and the bar no longer tells you where you are. |
| `AnchorHeightCache` | Memoised anchor heights (throttled raycasting, retries for missing tiles, 2D↔3D invalidation) for a custom layer projecting ground-draped elements. |
| `<RelationLayer rules provider>` `<RelationStatusBar>` | Tag links to neighbouring markers, with real road distances and durations — see [Relations](#relations-real-distances-and-travel-times). |
| Hooks | `useMap`, `useCamera`, `useViewport`, `useLiveData`, `useDrawing`, `useDrawSettings`, `useLens`, `useMapEvents`, `useTags`, `useTagSelection`, `useRelations`, `useToolbar`, `useCloseWhenHidden`, `useDraggablePanel`, `useDraggable`, `useDropZone`, `useMapDropZone`, `useRepositionable`, `useTheme`, `useLabels`, `useConfig`. |

**Dropping onto the map (`useMapDropZone`)** — the counterpart of the
`useDraggable`/`useDropZone` pair when the drop target is the **terrain** and not a
panel: the zone covers the three map surfaces (canvas, markers, overlay) — never the
toolbars — and the callback directly receives the targeted coordinate, via ellipsoid
raycast (accurate in a tilted view as in 2D). A drop beside the globe is ignored, there
being no position to hand over.

```tsx
// The palette makes its items grabbable; the map receives them at the right lat/lng.
useMapDropZone<Icon>({
  accept: (p) => p.type === 'icon',
  onDrop: (payload, latLng) => place(payload.data, latLng),
})
```

`<MapControls>` is fully configurable, at two granularities:

```tsx
// GROUP granularity: hide (false) or replace (ReactNode) a whole group.
<MapControls components={{ view: false, zoom: <MyZoom /> }} />

// BUTTON granularity: hide a specific button — its keyboard shortcut is
// disabled with it, and an emptied group disappears.
<MapControls buttons={{ rotate: false, zoomOut: false, globe: false }} />
```

Buttons: `pan`, `rotate`, `compass`, `zoomIn`, `zoomOut`, `tilt`, `topDown`, `globe`,
`mode3d`, `plan`, `traffic`, `target`, `layers`, `fullscreen` — groups: `drag`,
`compass`, `zoom`, `view`, `basemap`, `target`, `layers`, `fullscreen`.

#### The “back to target” button

A screen often has a point of reference — the alert being viewed, the ongoing event.
Providing `target` adds a button that returns to it; omitting it removes the button. The
map does not need to know what the target represents, only where it is.

```tsx
<MapControls
  target={{
    position: alert.position,
    label: 'Back to the alert',   // default: labels.controls.target
    onlyWhenOutOfView: true,       // only appears once the target has left the screen
    zoom: 16,                      // absent = current altitude preserved
  }}
/>
```

`onlyWhenOutOfView` is re-evaluated on the `viewport` event (the **settled** view), not
on every frame: no point testing during a flight, only the resting view matters.

### Volumetric zones (`extrudeHeight`)

A zone is ground-draped by default. `extrudeHeight` (metres above the ground) turns it
into a **volume** — vertical walls plus a cap — for tilted views where a flat fill reads
poorly:

```tsx
<ShapeLayer shapes={[{ kind: 'polygon', points, color: '#f59e0b', fillOpacity: 0.18, extrudeHeight: 200 }]} />
```

The volume is mounted **in the same frame as the draped surface**: it inherits its
anchor and its terrain height, already resolved and refined as tiles load. It therefore
cannot drift from its base on pan — it has no position of its own. Unlike ground-hugging
shapes, its faces **depth-test**: a building passing in front occludes it correctly.

Its edges (bottom ring, uprights, cap ring) are drawn as **1 px GL lines**, constant
across zoom and with no px→metre conversion — a ribbon would never land exactly on a
pixel. On an extruded shape, those edges therefore replace the ribbon outline; `width`
only applies to draped shapes.

**The volume starts at the real ground, not at the zone's plane**: the terrain is sampled
along the outline and the bottom of the walls descends below the lowest point, so it
never floats above a hollow (a bank, a bridge, a valley). The cap stays flat at
`extrudeHeight` above the zone's reference ground. `extrudeHeight` is a property **of
the zone**: two neighbouring zones can have different heights, and changing it at runtime
rebuilds the volume.

Only affects closed shapes (polygon, rectangle, circle).

### Map ready (`onReady`)

```tsx
<Map onReady={(engine) => camera.fitBounds(boundsOfMarkers(markers))} />
```

**`ready` = the projection resolves heights and framing targets the real ground.** It is
not “the engine exists”: that is `useMap()`, available at mount without waiting for
tiles. Before `ready`, a `fitBounds` would target the bare ellipsoid.

The event fires **once**, but a subscriber arriving afterwards receives it immediately
anyway — otherwise `onReady` would work on first mount and stay silent after that. If a
tile source fails (invalid token, network down), `ready` still fires after 8 s: the
application is never left waiting on an event that will not come.

Other surfaces: `engine.on('ready', cb)`, `engine.ready` (synchronous boolean), and
`useMapEvents({ onReady })` for a child component that is not the one rendering `<Map>`.

### Options carried by the marker data

Besides `position`, `type`, `tags`, `icon`/`avatar`, `new` and `urgent`, a `MarkerData`
carries:

| Field | Effect |
|---|---|
| `title` | Human-readable name, **single source of truth**: tooltip title, list labels (lens, selection panel, dock) and the text **indexed by search**. Without it these surfaces fall back to the id — and the marker is findable by nobody. |
| `titleColor` | Title tint (critical alert, agent status) — spares you writing JSX for the one thing a title expresses beyond its text. |
| `content` | Tooltip body: any ReactNode (badges, avatar, mini table). |
| `zIndex` | Priority between overlapping markers (default 0). The selected marker and the one whose menu is open stay **above any value**: a business `zIndex` cannot bury what you are interacting with. |
| `selectedColor` | Ring colour when this marker is the `selectedId` — the ring then carries information (an agent's status, an alert's source) instead of a fixed tint. Default: the theme accent. |
| `repositionable` | The marker can be dragged on the map (see the next section). |
| `static` | **Fixed scenery** (placed symbol, defibrillator, hydrant): hidden below a zoom threshold (see the next section). |

`title`/`titleColor`/`content` follow the **same precedence rule** as `repositionable`:
the layer prop wins when provided. `<MarkerLayer tooltip>` then decides the tooltip
alone — including returning `null` — and `<MarkerList renderItem>` decides the row title
alone, tint included. `ShapeData` and drawn shapes carry a `title` too, to the same end.

**The selected marker and the followed marker escape the tag filter**: hiding what the
map is centred on would make the target vanish without explanation, and following would
lose its position mid-way.

On the layer side, `cluster` accepts `radius`, `minPoints`, `maxZoom` and `spiderfyZoom`
— they override the theme **for this layer**, since two maps in the same app do not
necessarily share a point density.

### Static markers (scenery)

A defibrillator, a hydrant, a placed symbol are not events: they are **landmarks** you
consult from close up. Zoomed out over a region, a map that displays them all covers
itself with illegible pictograms that hide what does demand action.

`static` makes them disappear below a zoom threshold:

```tsx
// Config threshold (13 by default)
{ id: 'aed-01', type: 'defib', position, title: 'AED — Town hall', static: true, data }

// Threshold SPECIFIC to this point: a station structures a district, it is seen from further away
{ id: 'aed-04', type: 'defib', position, title: 'AED — Gare du Nord', static: { minZoom: 11 }, data }
```

The global threshold is set in the config, and applies to every marker declared
`static: true`:

```tsx
<Map config={{ markers: { staticMinZoom: 13 } }} />   // 0 = never hidden
```

Three things do **not** change when the threshold is crossed:

- **search and the lens** keep finding it, and the flight leads there. A zoom threshold
  states what is *legible*, not what you are allowed to find — that is the whole
  difference with the tag filter, which obeys a user choice and hides everywhere;
- **the selected or followed marker** stays displayed, as with the tag filter;
- **above the threshold it is an ordinary marker**: it groups and takes its slice in a
  cluster's pie chart like any other type.

A hidden static marker does not count towards a cluster's total either: a cluster only
announces what it actually hides.

**Placed symbols** are static by default. Their threshold follows the same cascade, from
most general to most specific — `config.markers.staticMinZoom`, then
`<DrawLayer symbols={{ minZoom }}>` for the whole layer, then `minZoom` on the catalogue
entry when the threshold depends on the **kind** of symbol (a command post is seen from
afar, a checkpoint is not). The bundled MIL-STD catalogue declares none: its 91 entries
follow the layer's threshold.

### Repositionable markers

A marker can be **dragged on the map** to define a position. The flag lives on the
**data**, because in a single set only some markers are editable:

```tsx
const markers = [
  { id: 'a1', type: 'alert-high', position, data },                     // fixed
  { id: 'pin', type: 'pin', position, repositionable: true, data },     // movable
]

<MarkerLayer
  points={markers}
  onReposition={(m, latLng) => setForm(latLng)}       // on release
  onRepositionMove={(m, latLng) => preview(latLng)}   // continuously (optional)
/>
```

The `<MarkerLayer repositionable>` prop (boolean or predicate) lets you decide globally
or on a criterion external to the marker (edit mode, permissions); **when provided, it
takes precedence** over the data field.

The gesture arms on **movement** (4 px), not on long press: the click stays intact as
long as the pointer does not move. The marker follows the **real terrain**
(`pickLatLng`), so it stays under the cursor in a tilted view, falling back to the
ellipsoid if the pointer leaves the globe.

**Not to be confused with `draggable`**, which is payload drag-and-drop (long press →
ghost → `<PinnedDock>`). Both gestures start from the same `pointerdown`: a
repositionable marker ignores `draggable`, even when the layer enables it for all.

For a custom layer placing its own movable handles: `useRepositionable()`, and
`engine.pickLatLngAtClient(clientX, clientY, fallbackToEllipsoid?)` to convert a
`PointerEvent` into a lat/lng.

### Frozen map (`interactive`)

```tsx
<Map interactive={false}>   // or 'view', or true (default)
```

| Mode | Camera | Tools (drawing, lens) | Map click | Markers |
|---|---|---|---|---|
| `true` | free | active | emitted | clickable |
| `'view'` | **frozen** | neutralised | emitted | clickable |
| `false` | **frozen** | neutralised | suppressed | inert |

`'view'` is the preview you consult without being able to move it: the camera no longer
moves, but markers, selection and tooltips stay alive. `false` makes the map inert. In
both cases **overlays keep being rendered** — it is a frozen map, not a screenshot — and
a tool left selected finds its state intact on unfreeze.

Imperative equivalent: `engine.setInteractive(mode)`, read via `engine.interactive`.

`interactive` freezes the **map**, not your UI: the library's controls stay clickable
(they live outside the map surface). Hide whatever no longer makes sense:

```tsx
<Map interactive={false}>
  <MapControls buttons={{ zoomIn: false, zoomOut: false, tilt: false, globe: false }} />
</Map>
```

### Framing and recentring the camera

`useCamera()` (and `engine.camera`) exposes, in addition to `flyTo`/`follow`/`moveTo`:

```tsx
const camera = useCamera()

// Frames a geographic set. `padding` in pixels: one number for all four sides,
// or {top,right,bottom,left}. When asymmetric, it also shifts the targeted centre —
// the content centres in the area that REMAINS visible, useful under a side panel.
camera.fitBounds(bounds, { padding: { left: 320, top: 40, right: 40, bottom: 40 } })
camera.fitBounds(bounds, { padding: 50, duration: 0 })     // instant
camera.fitBounds(traceBounds, { minAltitude: 80 })         // frame an object a few dozen metres across

camera.setCenter(p)          // instant, altitude preserved
camera.panTo(p)              // animated, altitude preserved
camera.setZoom(16)           // 2D map scale (0 = world, ~20 = street)
camera.getZoom()
```

`bounds` are built with the exported helpers, all **antimeridian-correct** and tolerant
of non-finite coordinates (they return `null` rather than a poisoned box):

```ts
boundsOfLatLngs(points)          // list of points
boundsOfMarkers(markers)         // any object with { position }
boundsOfShapes(shapes)           // ShapeData[] (circle, rect, polygon…)
boundsOfCircle(center, meters)   // geodesic disc
unionBounds([a, b, c])           // union, `null` entries ignored
centerOfBounds(b)                // centre, antimeridian included
altitudeForBounds(b, opts?)      // framing altitude (used by SearchBox and fitBounds)
```

By default `altitudeForBounds` clamps to `[350 m, 6000 km]` with a 1.35× margin — values
designed for place search. `minAltitude`, `maxAltitude` and `margin` adjust them when the
content is smaller (a 200 m GPS trace).

**Basemap** — switches between the photorealistic 3D tiles and the Google 2D plan, plus
the traffic overlay. These basemaps are Google services: **without `googleMapsApiKey`,
the whole group is not rendered** rather than offering inert buttons. The traffic button
only appears in plan mode (the only mode where the overlay exists), and switching back
to 3D turns it off — the engine handles that, and `engine.getBasemap()` plus the
`basemap` event are the source of truth.

**Startup mode (`<Map mapMode>`)** — with `googleMapsApiKey`, the map **starts on the 2D
plan**: more readable for reading positions, and the 3D tileset is not even requested
until you switch (no photorealistic tile downloaded on load). `mapMode="3d"` starts on
the photorealistic tiles; without a Google key, `'3d'` is the only possible mode and
stays the default.

⚠️ **Quota** — the 2D basemap consumes the **Map Tiles API quota of your Google key**,
whereas 3D via `cesiumIonToken` is served by Cesium Ion: starting in 2D *moves* the cost,
it does not remove it. Two guardrails on the library side: during a camera flight (the
intro in particular) only base levels are requested, instead of the eleven levels
traversed; and a failed tile is retried with backoff (1 s then 4 s, three attempts)
instead of being abandoned — a single `429` otherwise left permanent holes in the map. If
you see `429 Too Many Requests`, also check the project's per-minute quotas in the Google
Cloud console.

## Full example (Operator Dashboard)

```bash
npm install
cp examples/react/.env.example examples/react/.env   # set VITE_CESIUM_ION_TOKEN
npm run dev:example
```

Reproduces the Operator Dashboard: 3D map, severity-graded alerts (clustered, refetched
on move), animated mobile agents + camera follow, zones, drawing, **light/dark** toggle,
alternative **neon** theme, fallback globe.

## Build

```bash
npm run build        # ESM + CJS + types (dist/)
npm run typecheck
```

## Translating this documentation

Each language is a folder in `docs/`, named after its **ISO 639-1** code, holding the
**same file names** — which is what makes switching languages mechanical
(`../fr/MARKERS.md` ↔ `../en/MARKERS.md`).

To add a language:

1. `cp -r docs/fr docs/<code>` then translate.
2. Keep the file names **and the heading anchors** (`## 4. Framing…`): the cross-links
   depend on them.
3. Add the language line at the top of each file, and the new entry in
   [`docs/README.md`](../README.md) and the [root README](../../README.md).

What is **not** translated: example code, API names, `labels` keys. What is: the prose,
the comments inside examples, and the interface labels quoted as examples.

---

[Français](../fr/README.md) · [English](README.md) · [↑ Root](../../README.md)

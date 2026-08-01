# Markers — complete guide

[Français](../fr/MARKERS.md) · **English** · [↑ Index](README.md)

A **marker** is a stably-identified point placed on the globe, rendered in **DOM/CSS**
(not as a WebGL sprite): it inherits native animations, `:hover`, accessibility and
selectable text, at the cost of one node per visible point.

This document covers the data (`MarkerData`), the layer (`<MarkerLayer>`), clustering,
selection, repositioning, zoom-gated scenery, and the surfaces that consume markers
(search, lens, dock).

- Exhaustive props and real defaults → [PROPS.md](PROPS.md)
- Thresholds, budgets, quotas → [CONFIG.md](CONFIG.md)
- Colours, sizes, animations → [THEME.md](THEME.md)

---

## 1. In two minutes

```tsx
import { Map, markersLayer, type MarkerData } from '@pasquelin/map3d'

type Agent = { status: string }

const agents: MarkerData<Agent>[] = [
  {
    id: 'a1',
    type: 'agent-available',
    position: { lat: 48.8566, lng: 2.3522 },
    title: 'Dupont',            // human-readable name: tooltip, lists, SEARCH
    tags: ['user', 'standby'],  // “Layers” filter
    data: { status: 'available' },
  },
]

<Map
  center={{ lat: 48.8566, lng: 2.3522 }}
  zoom={14}
  layers={[
    markersLayer<Agent>({
      points: agents,
      cluster: { enabled: true },
      selectedId: selected,
      onSelect: (m) => setSelected(m?.id ?? undefined),
      typeLabel: (t) => LABELS[t] ?? t,
    }),
  ]}
/>
```

`markersLayer<Agent>({…})` is the **typed factory**: since `layers` is heterogeneous,
its public type sees `data` as `unknown`; the factory moves the generic onto the call
site, so `icon`, `menu` and `tooltip` receive `MarkerData<Agent>`.

Manual mounting is still possible — `<MarkerLayer>` under `<Map>` — but it leaves the
nesting order up to you (relations around the markers, lens above everything). See
[§ 14](#14-declarative-layer-or-component).

---

## 2. Feeding points: `points` or `source`

The two props are **mutually exclusive**.

| | `points` | `source` |
|---|---|---|
| Origin | an array you own | a `DataSource` the library queries |
| Refresh | yours (React state, WebSocket) | on camera move (bbox) |
| Zoom gate | yours | the source's `minZoom` |
| Cancellation | yours | `AbortSignal` provided |

```ts
const source: DataSource<MarkerData<Alert>> = {
  minZoom: 10,                                   // below this: no loading at all
  async load(viewport, signal) {
    const { north, south, east, west } = viewport.bounds
    return fetchAlerts({ north, south, east, west }, signal)
  },
}

<MarkerLayer source={source} cluster={{ enabled: true }} />
```

`load` is called once the camera has **settled** (debounce and cancellation of the
previous request are built in — see `data.fetch` in [CONFIG.md](CONFIG.md)).

For **real time** (agent positions), pass `points` that change: thanks to stable
identity, a `position` change **animates** the marker instead of recreating it.

> A viewport-scoped `source` is the **only** lever that truly bounds the amount of
> data — clustering stops grouping at maximum zoom, and culling hides without
> unmounting. See [§ 13](#13-performance).

---

## 3. Anatomy of a `MarkerData`

```ts
type MarkerData<T = unknown> = {
  id: string | number
  position: LatLng
  type: string
  title?: string
  titleColor?: string
  content?: ReactNode
  tags?: string[]
  avatar?: string
  icon?: string
  new?: boolean
  urgent?: boolean
  repositionable?: boolean
  static?: boolean | { minZoom: number }
  zIndex?: number
  selectedColor?: string
  data: T
}
```

| Field | Effect | Read by |
|---|---|---|
| `id` | **Stable identity**, independent of position: when `position` changes the marker is *smoothly translated* instead of recreated. A business key (agent uuid), not an array index. | everything |
| `position` | `{ lat, lng }`. The marker is anchored to its geographic coordinate (ECEF frame): it does not drift on pan or tilt. | everything |
| `type` | Category → colour via `theme.colors.marker[type]` (falls back to `marker.default`). Also the key of a **search group** and a pie slice inside a cluster. | theme, cluster, search |
| `title` | **Human-readable name — single source of truth**: tooltip title, list row label (lens, selection, dock) and **the text indexed by search**. Without it those surfaces fall back to the id, and the marker is findable by nobody. Deliberately `string` and not `ReactNode`: a name must be comparable, sortable and searchable. | tooltip, lists, search |
| `titleColor` | Title tint (critical alert, agent status) — spares you writing JSX for the one thing a title expresses beyond its text: its severity. | tooltip, lists, search |
| `content` | Tooltip body: any `ReactNode` (badges, avatar, mini table). | tooltip |
| `tags` | “Layers” filtering. Absent → `['marker', type]` (internal rule), otherwise the marker would vanish as soon as any filter is active. | tag filter, relations |
| `avatar` | **Photo** URL: round chip ringed with the type colour, takes precedence over `icon`. Cropped (a portrait survives a circle). | marker, lists, dock |
| `icon` | URL / data-URI of a **pictogram**, displayed **whole** in lists. Set automatically for symbols, whose artwork *is* their identity. | lists, dock |
| `new` | Sonar animation around the marker until its first click (the “seen” state is held by the layer, for the session). | marker |
| `urgent` | Animated red reticle for as long as the flag is true — designed to catch the eye immediately. | marker |
| `repositionable` | This marker can be dragged on the map (see [§ 11](#11-repositionable-markers)). | gesture |
| `static` | Fixed scenery: disappears below a zoom threshold (see [§ 8](#8-zoom-gated-scenery-static)). | display |
| `zIndex` | Priority between overlapping markers (default `0`, highest in front). The **selected** marker and the one whose **menu is open** stay above any value: a business `zIndex` cannot bury what you are interacting with. | rendering |
| `selectedColor` | Ring colour when this marker is the `selectedId`. Absent = the theme accent. Lets the ring carry information (status, alert source). | rendering |
| `data` | **Your** business object, never interpreted by the library — what your callbacks receive. | you |

### Exported helpers

```ts
boundsOfMarkers(markers)          // bounding box → camera.fitBounds
markerColorOf(theme, type)        // the SAME colour resolution the library uses
tagColorOf(theme, tag)            // same for a tag (theme, then hashed palette)
```

`markerColorOf` is published so that a marker, a list or a panel written by the host
application matches the library's own instead of re-implementing the fallback chain.

> The resolution rules for `tags` (`['marker', type]` by default) and for
> `static` → threshold are **internal**: the library applies them, it does not expose
> them. Write `m.tags ?? ['marker', m.type]` if you need to reproduce them.

---

## 4. How a marker is rendered

### The template

By default a marker is a **chip** (`theme.markers.size`, `ringWidth`, `gradient`,
`gloss`) coloured by its `type`, sitting at the top of a **vertical leader line** with
a ground dot.

```tsx
<MarkerLayer leaderLine={false} />   // the icon coincides with its coordinate
```

The leader line (`leaderLine`, default `true`) lifts the content above the position:
an alert badge stays readable without hiding the point it marks. Set it to `false`
when the icon **must** coincide with its coordinate — that is the case for tactical
symbols, whose anchor point is carried by the artwork itself.

> `leaderLine` decides the **DOM structure** of a node at creation time: it is not a
> live setting, unlike `cullMargin`.

### Where the marker settles

`settleToGround` (default `true`) settles the marker on the real surface rather than on
the ellipsoid — otherwise it "slides" towards the parallel street as you pan (parallax).
The height used is the **street level**, never a roof: under the internal provider it is
read analytically (the raster sheet, flat and non-raycastable), under photorealistic tiles
it is the minimum over a ring of `performance.groundSample.radiusMeters`. The distinction
is invisible from above; at eye level, a marker settled on a roof floats thirty metres
over your head.

### Custom icon

```tsx
<MarkerLayer icon={(m) => `<svg viewBox="0 0 40 40">…</svg>`} />
```

`icon` returns **SVG markup**, rendered as a DOM `<img>` anchored to the map
(`svgToDataUri` is exported and idempotent — an already-encoded source passes through
untouched).

### Size and rings

| Prop | Default | Role |
|---|---|---|
| `size` | `theme.markers.size` | sprite diameter |
| `selectionRing` | `size + 4` | **multi-selection** ring — tune it when the SVG icon occupies less than its box, so the ring stays glued to the artwork |

An `avatar` fills the whole template: its ring starts at `size + 12`, without the chip
factor `selectionRing` carries for sprites.

---

## 5. Tooltip

Information lives **on hover**; clicking is reserved for actions (selection, menu).

**With no configuration**, the tooltip is built from the data: `title` (tinted by
`titleColor`) as the title, `content` as the body. A marker with neither `title` nor
`content` has no tooltip.

```tsx
<MarkerLayer
  tooltip={(m) =>
    m.data.silent ? null : { title: <Badge sev={m.data.sev} />, content: <Sheet m={m} /> }
  }
/>
```

When provided, the `tooltip` prop **decides alone** — including returning `null`.
Reserve it for titles that plain text cannot express: `titleColor` already covers the
common case.

### Cluster tooltip

The cluster builds its own: the per-type count when hovering a donut **slice**, the
total on the core. It is configured on the map — `<Map cluster={{ tooltip }}>` to
replace it, `<Map cluster={{ typeLabel }}>` to name the types that appear in it (see
[§ 10](#10-grouping-clusters)).

---

## 6. Context menu

```tsx
<Map
  markerMenu={(m, relations) => [
    { label: 'Open sheet', onClick: () => open(m.data) },
    { separator: true },
    ...relations?.menuFor(m) ?? [],
  ]}
/>
```

`markerMenu` is **shared by the three surfaces** that offer a marker menu: the marker
on the map, the lens inventory and the selection panel. A marker therefore offers the
same actions wherever you meet it, declared once.

The second argument carries the relation engine's entries (“Distance around ›
Agents”), `null` without `relations`.

Per-surface overrides, when they must differ:

| Surface | Prop |
|---|---|
| map | `layers[].menu` / `<MarkerLayer menu>` |
| lens | `toolbar.lens.menu` |
| selection panel | `draw.selectionBadges.markerMenu` |

Both listings add **“Target” at the top themselves** — no need to include it.

A `danger: true` entry renders in **red** (destructive action): this is how placed
symbols prepend a “Delete” to their menu — see
[SYMBOLS.md § 6](SYMBOLS.md#6-what-a-symbol-inherits).

The menu opens on **right-click** on the map, and via the “…” button in lists.

---

## 7. Selection and follow

### Single selection — controlled

```tsx
const [selected, setSelected] = useState<string | number>()

<MarkerLayer
  selectedId={selected}
  onSelect={(m) => setSelected(m?.id ?? undefined)}   // ⚠️ handle the null case
/>
```

`selectedId` is **controlled**: the layer never changes it on its own, it reports. The
`onSelect` rule is uniform — **any click that does not select a marker yields
`null`** (bare map as well as a cluster).

> Without handling `null`, the ring would only move when clicking another marker, and
> would survive opening a cluster — including when the selected marker is precisely the
> one that has just been absorbed into it.

The ring colour comes from `MarkerData.selectedColor`, otherwise from the theme accent.

### Marquee multi-selection

The **Select** tool in `<Toolbar>` (rectangle, polygon, lasso) also selects markers:
the layer registers itself with the `engine.selectables` registry. Only
**individually visible** markers are reachable — a cluster is never selected as a
block, and a marker hidden by culling drops out of the selection.

The selected ids are read from `useDrawing().markerSelection`, and the selection panel
badges display them (see `draw.selectionBadges`).

### Camera follow

```tsx
<MarkerLayer followId={followedAgent} />
```

The camera stays centred on that marker for as long as the prop is provided. If the
target momentarily disappears (clustered, hidden by a filter), the camera **hands
control back** instead of freezing, and following resumes when it reappears.

### Exemptions

The **selected** marker and the **followed** marker escape both the tag filter **and**
the scenery threshold: hiding what the map is centred on would make the target vanish
without explanation, and following would lose its position mid-way.

---

## 8. Zoom-gated scenery (`static`)

A **fixed piece of scenery** — a placed symbol, a defibrillator, a hydrant — is a
landmark you consult from close up, not an event demanding action.

```ts
{ id: 'aed-12', type: 'aed',      static: true,             position, data }  // config threshold
{ id: 'chu',    type: 'hospital', static: { minZoom: 9 },   position, data }  // own threshold
```

| Form | Threshold |
|---|---|
| `true` | `config.markers.staticMinZoom` (default **13**) |
| `{ minZoom: n }` | `n` — specific to this marker (`0` = visible at any zoom) |

Not all scenery reads at the same distance: a hospital deserves to appear well before
a fire hydrant, and it is the **data** that knows this, not a global setting.

**One single consequence**: the marker disappears from the map below its threshold.
While visible, it is a marker like any other — cluster and pie chart treat it exactly
like the other types, and a hidden static marker stops inflating cluster totals in the
same move (a cluster only ever counts what it actually hides).

> **`static` is not the tag filter.** The threshold says what is **legible**; the
> filter obeys a **user choice** and hides everywhere, search included. A hidden static
> marker remains searchable and reachable: searching “defibrillator” must find it and
> fly to it at any zoom.

### Where the threshold is set

From most general to most specific — each level only matters if the previous one is
not enough:

| Level | Where | When to use it |
|---|---|---|
| Config | `config.markers.staticMinZoom` | the scenery of the whole map |
| Layer | `<MarkerLayer staticMinZoom>` | this layer — a scenery layer and an alert layer do not share a legibility horizon |
| Data | `MarkerData.static: { minZoom }` | this point; it has the final say |

### Placed symbols

They are `static` out of the box, and **take part in the map's grouping** like any
other layer — so they mix with the application's markers inside the same chip
(`<DrawLayer symbols={{ cluster: { enabled: false } }}>` to take them out and go back
to one marker per symbol). Their threshold follows the same cascade, with
`<DrawLayer symbols={{ minZoom }}>` for the layer level and `SymbolEntry.minZoom` for
the data level — it is **your** catalogue that knows a command post structures a region
where a checkpoint only means something once you are on site.

> `MILSYM_CATALOG` declares **no** `minZoom` at all: its 91 entries share the layer's
> threshold. For a per-kind horizon, supply your own catalogue (or derive from it by
> adding `minZoom` to the entries you care about).

The gate costs nothing when nobody uses it: with no `static` marker, the layer does not
subscribe to the camera. And the tracked state is a **crossing**, not a zoom — one
re-render per threshold crossed, not one per wheel frame.

---

## 9. Tags and the “Layers” filter

```ts
{ id: 'a1', type: 'agent-enroute',   tags: ['user', 'move'],    position, data }
{ id: 'a2', type: 'agent-available', tags: ['user', 'standby'], position, data }
```

- Without `tags`, a marker gets `['marker', type]`.
- The filter is an **OR**: ticking `user` and `rect` leaves “the users **and** every
  rectangle” visible.
- It is applied **before** clustering: clusters reflect the filter.
- The **Layers** button in `<MapControls>` lists the tags actually present (search,
  checkboxes, chips, counters). The selection is persisted (`<Map tagStorageKey>`,
  `null` to disable).
- Chip colour: `theme.colors.tags[tag]`, otherwise a **stable hashed palette**
  (`tagColor`) — the same colour across sessions without storing anything.

Programmatic access: `useTags()` / `useTagSelection()`, or `engine.tags` (`toggle`,
`clear`, `isVisible`, `all`, `report`).

---

## 10. Grouping (clusters)

**A cluster is a property of the MAP, not of a layer.** Whatever overlaps on screen
becomes a chip, whichever layer the points come from: the application's markers and
placed symbols group together, and the pie chart mixes their types.

```tsx
<Map
  config={{ clustering: { radius: 60, minPoints: 2, maxZoom: 18, spiderfyZoom: 19 } }}
  cluster={{ typeIcon, typeLabel, tooltip }}   // appearance; `false` turns it all off
  layers={[markersLayer({ points })]}          // participates by default
/>
```

| Where | What |
|---|---|
| `config.clustering` | the algorithm: `radius` (screen px), `minPoints`, `maxZoom`, `spiderfyZoom` |
| `<Map cluster>` | the appearance: `icon`, `typeIcon`, `typeLabel`, `tooltip`, `size` — `false` turns grouping off |
| `<MarkerLayer cluster={{ enabled: false }}>` | takes ONE layer out of the grouping (a tracking point you always want to see on its own) |

The division of roles: the map decides **where the grouping is**, each layer decides
**what its markers look like** (icon, menu, tooltip, dragging). A layer therefore only
places what the surface leaves it — the rest is inside a chip.

The tooltip receives `MarkerData[]` **without typed data**: a chip can aggregate
markers from several layers, so nothing guarantees a common `data`.

### What the library does beyond geographic grouping

1. **World clustering, not viewport clustering** — supercluster receives world bounds.
   In an oblique view, viewport bounds do not reach the horizon: a distant alert would
   disappear. Off-screen content is handled by projection and globe occlusion, not by
   a box filter.
2. **Screen declutter** — geographic clustering does not prevent two clusters from
   **overlapping** on screen in a tilted view (one behind the other). They are
   projected, sorted by depth, and merged into the cluster **in front**: no information
   stays hidden in the background.
3. **Automatic fan-out** — beyond `maxZoom`, any node still merged is a screen overlap:
   it is spread into a fan, each marker keeping its own vertical thread down to its
   ground point. Folded back as soon as you zoom out.
4. **At ground level, declutter only** — in pedestrian mode it is the only one left, and
   the only one that makes sense at eye level: whatever overlaps to the eye becomes a
   badge, wherever the points are. Geographic clustering switches itself off (the zoom
   derived from altitude goes past `maxZoom`) and the fan-out is disabled — its radius
   comes from a 2D map resolution under the camera, which says nothing about a marker's
   distance in a ground-level view. Declutter then projects at the marker's **real
   height**: at eye level, the gap between the ground and the ellipsoid spans several
   screens. Nothing to configure: it is the ground-level view signal the engine broadcasts
   to layers (see [ENGINE § 3](ENGINE.md#3-writing-a-layer)).
5. **Bounded by the view distance** — markers AND badges disappear beyond
   `pedestrian.viewDistanceMeters`, the same bound as the `far` plane and the end of the
   fog. A DOM overlay keeps its screen size whatever the distance: without this bound,
   alerts from a city 700 km away lined up on the horizon at the same size as those across
   the street.

### Appearance

The default cluster is a **donut**: a core carrying the total, surrounded by a ring
segmented by type (`theme.clusters`: `coreRadius(total)`, `ringWidth`, `strokeWidth`,
`segmentGap`, `startAngle`; `theme.colors.cluster` for the tints).

The donut is rendered by the library; what you configure is **what it shows of a
type** — and you configure it on the **map**, not on a layer, since one chip can
aggregate several layers:

```tsx
<Map
  cluster={{
    icon: (c) => `<svg …>${c.total}</svg>`,       // replaces the pie chart
    typeIcon: (type) => <path d={ICONS[type]} />, // SVG fragment 0 0 24 24, currentColor
    typeLabel: (type) => LABELS[type],            // name of a type in the tooltip
    tooltip: (c, members, segmentType) => ({ … }),// `null` = no tooltip
    size: 52,                                      // default: theme.markers.size × 1.18
  }}
/>
```

`ClusterInfo` carries `{ total, counts, types, position }`, `types` being sorted by
descending count (dominant first). That is what `<DefaultCluster>` receives — exported
for a custom rendering.

---

## 11. Repositionable markers

Dragging a marker to **define a position** (the point you drop in a form, a symbol
placed by hand).

```tsx
const markers = [
  { id: 'a1',  type: 'alert-high', position, data },                        // fixed
  { id: 'pin', type: 'pin',        position, repositionable: true, data },  // movable
]

<MarkerLayer
  points={markers}
  onReposition={(m, latLng) => save(m.id, latLng)}     // on release
  onRepositionMove={(m, latLng) => preview(latLng)}    // continuously (optional)
/>
```

The flag lives on the **data** because in a single set only some markers are editable.
The `<MarkerLayer repositionable>` prop (boolean or predicate) decides globally or on a
criterion external to the marker (edit mode, permissions) and then **takes precedence**
over the data field.

- The gesture arms on **movement** (`interaction.repositionSlopPx`, ~4 px), not on long
  press: the click stays intact as long as the pointer does not move.
- The marker follows the **real terrain**: it stays under the cursor in a tilted view,
  falling back to the ellipsoid if the pointer leaves the globe.
- **Not to be confused with `draggable`** ([§ 12](#12-drag-and-drop-to-a-dock)), which
  is payload drag-and-drop. Both gestures start from the same `pointerdown`: as long as
  the leader line is shown they coexist (repositioning from the **ground point**,
  dragging to the dock from the **icon**); without a leader line, repositioning wins.
- The **ground point is also a click target** (whenever a leader line is shown):
  **tapping** it selects / opens the menu just like the icon, **dragging** it
  repositions. The distinction is made by the slop threshold (`repositionSlopPx`), not by
  the native `click`. This is what lets the eraser delete a symbol by clicking its base,
  not only its icon.

For a custom layer: `useRepositionable()` and
`engine.pickLatLngAtClient(clientX, clientY, fallbackToEllipsoid?)`.

---

## 12. Drag-and-drop to a dock

```tsx
<Map
  layers={[markersLayer({ points: agents, draggable: (m) => m.type === 'agent-available' })]}
  dock={{
    items: pinned,
    onPin: (payload) => add(payload.id),
    onUnpin: (id) => remove(id),
    onReorder: (ids) => reorder(ids),
  }}
/>
```

`draggable` (`true` or a predicate) makes markers grabbable on **long press**
(`interaction.longPressMs`): the normal click is preserved, the ghost attached to the
cursor reuses the marker icon, and **clusters are never grabbable**.

> The absence of `dock` has a deliberate consequence beyond display: no zone accepts a
> marker any more, so markers stop being grabbable. A gesture with no destination is
> not offered.

`<PinnedDock>` is **controlled**: `items` comes from the application, which persists
whatever it wants — the library stores nothing. A `PinnedItem` carries
`{ id, position?, type?, color?, label?, avatar?, icon?, data? }`.

Generic building blocks: `useDraggable` (make grabbable), `useDropZone` (receiving
zone), `useMapDropZone` (dropping **onto the terrain**, which yields the targeted
lat/lng via ellipsoid raycast).

---

## 13. Performance

| Lever | Effect | Bounds what… |
|---|---|---|
| viewport-scoped `source` | distant data is never loaded | …you load ✅ |
| `cluster` | n nodes instead of n markers | …you mount |
| `cullMargin` (default **200 px**) | hides (`display:none`) what is off-frame | …the browser computes |

**Culling in detail.** A marker that leaves the frame stays **mounted**: its DOM node,
its React portal and its `CSS2DObject` are kept. Beyond the margin it is hidden, so the
browser stops computing its style, layout and compositing. A marker **created**
off-frame never enters the document at all (the `CSS2DRenderer` only inserts the
element on the first visible render). Measured on the demo, initial view: **9 anchors
in the DOM instead of 32**.

A hidden marker **also drops out of marquee selection**: off-frame by at least that
margin, no rectangle drawn on screen could reach it anyway.

`cullMargin={0}` disables culling. The margin is not cosmetic: tighter, edge markers
flicker during a pan. Unlike `leaderLine`, this is a **live** setting — changing it at
runtime rebuilds nothing.

Hidden without any setting: markers that went **behind the camera** and those that went
**behind the globe** (horizon occlusion).

Culling does **not** reduce the number of mounted objects (the `CSS2DRenderer` z-sort
covers everything that exists): for that you need clustering, and above all a scoped
source.

---

## 14. Declarative layer or component

```tsx
// Declarative — <Map> mounts everything in the right nesting order
<Map layers={[markersLayer<Agent>({ id: 'agents', points: agents })]} relations={{ rules, provider }} />

// Manual — you place the layers yourself
<Map>
  <RelationLayer rules={rules} provider={provider}>
    <MarkerLayer points={agents} />
  </RelationLayer>
</Map>
```

`MarkersSpec` = `MarkerLayerProps` + a layer `id` (**provide it as soon as the list can
be reordered or filtered**: without it the index is used, and a layer inserted at the
front would recycle its neighbour's state) + a `menu` that receives a **second
argument**: the relation engine API, or `null`.

That second argument replaces `<RelationLayer>`'s render prop: with no children, the
“Distance around ›” entries still have to reach the menu.

---

## 15. What markers feed on their own

No configuration is needed for these integrations — the layer registers with the
engine's registries when it mounts.

| Surface | Registry | What it sees |
|---|---|---|
| **Search** | `engine.search` | markers carrying a `title`, **after the tag filter**. One group per `type` (`marker:<type>`), named by `typeLabel` and coloured by `theme.colors.marker[type]`. A marker without a `title` is skipped, never indexed under its id. |
| **Lens** | `engine.markers` | **all** markers within a geographic box, clusters included (source data). Also serves `visualNodeOf` (the node aggregating a marker) to the relation engine. |
| **Marquee** | `engine.selectables` | the markers **individually visible** on screen. |
| **Layers** | `engine.tags` | the tags of **all** points, even those hidden by the scenery threshold. |
| **Grouping** | `engine.clusters` | the layer's **placed** points — `<ClusterSurface>` decides which ones become a chip (see [§ 10](#10-grouping-clusters)). |

`typeLabel` names a type **once and for all**: search group and list row subtitle.
Inside a cluster chip, it is `<Map cluster={{ typeLabel }}>` that names the slices.

---

## 16. Marker lists

`<MarkerList>` is the list shared by the lens and the selection panel: one row per
marker, header with a per-type count, scrollable body, per-row cross, actions menu.

```tsx
<MarkerList
  markers={markers}
  getId={(m) => m.id}
  renderItem={(m) => <b>{m.title}</b>}       // default: title, otherwise the id
  renderSubtitle={(m) => m.data.reference}   // default: the type via markerTypeLabel
  markerTypeLabel={(t) => LABELS[t]}
  onRemove={(id) => remove(id)}
  onTarget={(m) => open(m)}                  // default: camera flight
  actions={[{ id: 'sheet', label: 'Open', run: (m) => open(m) }]}
  menu={(m) => MENU(m)}                      // takes precedence over `actions`
/>
```

A row's visual marker follows the same rule everywhere — **photo > icon > colour
chip** — carried by the exported `<Swatch>` component.

---

## 17. Recipes

**Frame all markers once the map is ready**

```tsx
<Map
  onReady={() => {
    const b = boundsOfMarkers(agents)
    if (b) camera.fitBounds(b, { padding: { left: 320, top: 40, right: 40, bottom: 40 } })
  }}
/>
```

`onReady` (and not mount): before it, a `fitBounds` would target the bare ellipsoid
instead of the real ground.

**Make the selection ring carry information**

```ts
{ id, type: 'agent', selectedColor: agent.late ? '#ef4444' : undefined, position, data }
```

**Two marker layers in the same map**

```tsx
layers={[
  markersLayer<Alert>({ id: 'alerts', points: alerts, cluster: { enabled: true } }),
  markersLayer<Agent>({ id: 'agents', points: agents, typeLabel: (t) => AGENTS[t] }),
]}
```

Each layer gets its own entry in the registries (tags, search, inventory): they do not
step on each other.

**A marker that must stay in front of every other**

```ts
{ id: 'current', type: 'pin', zIndex: 100, position, data }
```

**Disable the tooltip for a single marker** —
`tooltip: (m) => (m.data.muted ? null : …)`.

---

## See also

- [ZONES.md](ZONES.md) — zones, draped shapes and paths
- [DRAWING.md](DRAWING.md) — user drawing, selection and editing
- [LENS.md](LENS.md) — lens (inventory of the markers in an area)
- [SEARCH.md](SEARCH.md) — unified search
- [RELATIONS.md](RELATIONS.md) — tag links and real routes
- [PEDESTRIAN.md](PEDESTRIAN.md) — eye-level declutter and view bounds
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [THEME.md](THEME.md) · [LABELS.md](LABELS.md)

# Catalog — browsing a remote reference set

[Français](../fr/CATALOG.md) · **English** · [↑ Index](README.md)

A **catalog** is a set of geographic entities the map does not hold: your zones, your
zone groups, France's 36,000 towns, its departments, its regions. You browse it, search
it, and put on the map whatever you want to see there.

What sets it apart from everything else fits in one sentence: **map3D knows no API, only
a source contract.** You write a `CatalogSource` that can list, paginate and return a
geometry; the library handles search, virtualization, draped display, persistence and
framing. A type with 36,699 entries costs the same code as one with 5.

| Need | Where to go |
|---|---|
| Display zones you already hold in memory | [ZONES.md](ZONES.md) — `<ShapeLayer>` |
| Find what is **already on the map** | [SEARCH.md](SEARCH.md) — unified search |
| **Browse a remote reference set** and place items from it | this document |

---

## 1. In two minutes

```tsx
import { Map, type CatalogSource } from '@pasquelin/map3d'
import { mdiCityVariantOutline } from '@mdi/js'

const towns: CatalogSource = {
  id: 'cities',
  label: 'Towns',
  icon: mdiCityVariantOutline,
  total: 36699,

  async list({ query, cursor, limit, signal }) {
    const r = await fetch(`/api/towns?q=${query}&cursor=${cursor ?? ''}&limit=${limit}`, { signal })
    const { items, total, next } = await r.json()
    return { items: items.map((v) => ({ id: v.id, title: v.name })), total, nextCursor: next }
  },

  async geometry(id, signal) {
    const r = await fetch(`/api/towns/${id}/outline`, { signal })
    const { points } = await r.json()
    return [{ kind: 'polygon', points, title: 'Outline' }]
  },
}
```

Then register it on the engine — exactly as a plugin would:

```tsx
<Map center={PARIS} zoom={12} onReady={(engine) => engine.catalog.register(towns)} />
```

The **Catalog** button appears in the controls bar, next to "Layers" and "Templates".
With no source declared, it does not render at all.

---

## 2. `CatalogSource` — anatomy

A source belongs to one of **two regimes**, told apart by `kind`:

```ts
type CatalogSource = CatalogBrowseSource | CatalogToggleSource

type CatalogSourceBase = {
  id: string                  // stable identity: key prefix, persisted value
  label: string               // menu label — the library translates no type name
  icon: string                // @mdi/js path
  family?: string             // groups menu entries
  total?: number              // count shown WITHOUT issuing a request
}

// The BROWSE regime: a paginated list, one checkbox per item.
type CatalogBrowseSource = CatalogSourceBase & {
  kind?: 'browse'             // DEFAULT — a source written without `kind` is a browse one
  list(req: CatalogRequest): Promise<CatalogPage>
  geometry(id: CatalogId, signal: AbortSignal): Promise<ShapeData[]>
  markers?(id: CatalogId, signal: AbortSignal): Promise<MarkerData[]>
  children?(id: CatalogId, req: CatalogRequest): Promise<CatalogPage>
  actions?: readonly CatalogAction[]
}

// The TOGGLE regime: one switch, loaded for the visible frame — see § 4.
type CatalogToggleSource = CatalogSourceBase & {
  kind: 'toggle'
  source: DataSource<MarkerData>
  markerLayer?: { icon?; tooltip?; menu?; typeLabel?; cluster?; size? }
}

type CatalogRequest = {
  query: string        // already normalized: "reseau" must find "Réseau"
  cursor?: string      // returned by the previous page; absent = first page
  limit: number        // config.catalog.pageSize
  signal: AbortSignal  // aborted as soon as the request goes stale
}

type CatalogPage = {
  items: readonly CatalogItem[]
  total?: number       // absent ⇒ the counter falls back to the loaded count
  nextCursor?: string  // absent ⇒ last page
}
```

**The cursor is opaque to the library.** Offset, token, last item key: it hands it back
verbatim on the next request and assumes nothing about it.

**`total` is never computed.** The menu shows "36,699" without having opened the type —
if you don't provide it, no count is shown; it will not go looking for one.

> **⚠️ `geometry` must answer for items from `list` AND from `children`.** An expanded
> child belongs to the same source as its parent, and that is the method that will be
> called for it. A source indexing only its roots would return an empty array for every
> child — a checkbox that displays nothing, with no error.

**`markers` places POINTS**, where `geometry` places shapes. Both are requested on the
same gesture and removed together; an item may have only one of the two. Points join
clustering, the "Layers" filter (via `tags`) and search (via `title`) like any other
marker — and clicking the name frames the union of shapes AND points.

**`actions` exists only on a browse source**: an action receives the `CatalogItem` it
acts on, and a toggle source has no items.

---

## 3. `CatalogItem`, badges and actions

```ts
type CatalogItem = {
  id: CatalogId
  title: string
  icon?: string
  color?: string
  badges?: readonly CatalogBadge[]
  bounds?: Bounds        // present ⇒ frame without loading the geometry
  disabled?: boolean     // inert row: no framing, no display, no action
  hasChildren?: boolean
}

type CatalogBadge = {
  icon?: string
  text?: string
  color?: string
  label: string          // tooltip AND accessible name — required
}
```

**A status is not rendered as a badge.** An item unavailable on the business side is a
`disabled` row: greyed out entirely, name included. A column of green ticks says nothing
the absence of greying doesn't already say, and it eats into the name's width.

**`bounds` saves a round trip per click.** When provided, framing is immediate; when
absent, the geometry is loaded first. On a reference set where the bbox is known, that is
the difference between instant framing and one request per item.

**Actions** render as icons on the right, capped by `config.catalog.maxInlineActions`
(default 2) — beyond that, the name would be what disappears. Extra ones are ignored,
with a console warning.

```ts
actions: [
  {
    id: 'edit',
    icon: mdiPencilOutline,
    label: 'Edit zone',
    run: (item) => openEditor(item.id),
    hidden: (item) => item.disabled === true,
  },
]
```

---

## 4. Toggle sources

Some reference sets are not meant to be browsed. Nobody ticks thirty-six thousand
defibrillators one by one: you **turn them on with a single switch**, and the **view**
decides what gets loaded.

```tsx
import { mdiHeartPulse } from '@mdi/js'
import type { CatalogToggleSource } from '@pasquelin/map3d'

const defibs: CatalogToggleSource = {
  id: 'defibs',
  kind: 'toggle',                    // ← this is what changes everything
  label: 'Defibrillators',
  icon: mdiHeartPulse,
  total: 36699,                      // the reference set, not the view

  source: {
    minZoom: 12,                     // 💰 below this zoom, NO request at all
    load: async ({ bounds }, signal) => {
      const r = await fetch(`/api/aed?bbox=${bbox(bounds)}`, { signal })
      const points = await r.json()
      return points.map((p) => ({
        id: p.id, position: p.pos, type: 'defib', title: p.name, tags: ['aed'], data: p,
      }))
    },
  },

  markerLayer: { cluster: { enabled: true } },
}
```

`source` is the library's **`DataSource<MarkerData>`**, unchanged (see [DATA.md](DATA.md)):
debouncing, the `minZoom` gate, `AbortSignal` and rejection of out-of-order responses are
already handled by `ViewportController`. You only write `load`.

`markerLayer` reuses the plugin declarative path's contract
([PLUGINS.md § 5](PLUGINS.md#5-map-rendering)): points join the **same** clustering index
(`engine.clusters`), the **"Layers" filter** (via `MarkerData.tags`) and **unified search**
(via `MarkerData.title`) as everything else on the map.

### 4.1 What the row does

|  | `browse` | `toggle` |
|---|---|---|
| Chevron, sub-list, search | yes | **no** |
| Clicking the **name** | toggles **and** frames the camera | toggles, **no framing** |
| Clicking the **checkbox** | toggles only | toggles |
| `total` shown | yes | yes |
| Loading state | — | yes |
| **Number of loaded items** | — | **never** — see § 4.2 |
| `children`, `bounds`, `disabled`, `actions` | yes | not applicable |

No framing on a toggle, and that is not an oversight: on a view-driven set, the view
decides the content. Framing it on its own content would let the content decide the very
view that determines it.

Turned off, a set has **no layer mounted**: no controller, no view listener, no request. A
36,000-point reference set costs nothing until you touch it.

### 4.2 ⚠️ Loaded volume is not displayed volume

The bounds handed to `load` are **deliberately wider than the screen**. `computeBounds`
expands the bbox by `config.performance.boundsMargin` (default `0.15`, i.e. **+30% in
latitude AND longitude**, ≈ **+69% of area**) and samples it on a 5×5 grid that catches
ground all the way to the horizon in a tilted view — so a genuinely visible marker is
never hidden, and nothing pops in as you pan.

A toggle source therefore loads **structurally more than what you see**. That is intended.

> **Never display the number of loaded items.** Next to a map showing three of them, a
> "142" reads as "142 displayed": you go looking for the missing 139 and conclude the
> renderer is broken. The library shows it nowhere, and neither should your interface.
>
> `total` is legitimate: it is the volume of the **reference set** — stable, verifiable,
> unrelated to the view. So is the **loading state**: it states something true.

### 4.3 Toggle or plugin

Both load markers from the viewport. What separates them is not technical:

| | **Catalog `toggle`** | **Plugin** |
|---|---|---|
| What it is | a **reference set of the host application** | a **third-party capability** |
| Who writes it | you, in your app | an author, often someone else |
| Distribution | none — it is your app's code | packaged, **versioned**, published (npm) |
| Configuration | hard-coded in your code | **declarative auto-rendered schema** (`config`) |
| Where users enable it | **Catalog** panel, with your other sets | **Plugins** hub |
| Lifecycle | mounted by `<Map>` | `register` / `setEnabled` / `unregister` |

In one sentence: **one more reference set in your panel → `toggle`; a capability that gets
installed, updated and uninstalled → plugin** ([PLUGINS.md](PLUGINS.md)).

### 4.4 Failures

A failed load leaves the current set **intact** and turns the indicator off: nothing is
reported to the user. The browse regime, by contrast, drops the item from the selection and
lights an error badge on its row — it has an item to put one on, a toggle source does not.
If your set must surface its failures, do it from your `load`.

### 4.5 Persistence

The **on/off** state survives a reload, in a **distinct field** of the payload
(`config.data.storageKeys.catalog`) — never mixed into item keys, which would otherwise
carry a source id colliding with an item id. A set whose source is no longer registered is
turned off silently, like an orphaned key.

Markers themselves are **never** serialized: they are re-requested from the source on the
first frame.

---

## 5. Aggregates and children

A "zone group" is not a library concept: it is an item whose **`geometry` returns several
shapes**. Ticking the group shows them together, unticking removes them together.

Declare `hasChildren` and provide `children` to make it **expandable**:

```ts
children: async (id, { signal }) => {
  const r = await fetch(`/api/groups/${id}/zones`, { signal })
  return { items: (await r.json()).map((z) => ({ id: z.id, title: z.name })) }
}
```

An aggregate's checkbox is then **derived from its children**: all shown → ticked; none →
unticked; some → **indeterminate**. Ticking the aggregate ticks its children (loading them
if needed, even collapsed); unticking one turns it indeterminate. The aggregate itself
never enters the selection — otherwise the same zone would be counted twice and unticking
a child would say nothing.

**One level of descent only.** `children` applies to roots; a grandchild is not inserted.
The need (group → zones) is flat, and recursion would require per-level pagination for a
case that does not arise.

**One zone may belong to two entries** — a group and the zone reference set. The map
paints it only once: shapes are deduplicated by `ShapeData.id`, and it survives unticking
one as long as the other still references it.

---

## 6. Pagination, search and volume

The list is **virtualized**: only visible rows render, however many entries there are. A
sentinel at the bottom requests the next page before reaching the edge, and two pages are
never in flight at once.

Search is **debounced** (`config.catalog.debounceMs`, default 250 ms), every stale request
is **aborted** (`AbortSignal`), and an out-of-order response is **discarded**. An
`AbortController` alone would not suffice: an already-resolved promise runs its `then`
even after the abort, and a slow response to "par" would overwrite the fast one to
"paris".

Nothing is requested while the panel is closed.

| Situation | Behaviour |
|---|---|
| `list` fails | banner + "Retry"; already-loaded pages stay visible |
| `geometry` fails | the item leaves the selection, error badge on the row |
| `children` fails | the row collapses; the rest of the list is untouched |
| No result | "No result" (search) or "No item" (empty source) |

---

## 7. Display, framing and persistence

What you display becomes an ordinary **draped shape**: it follows the terrain, follows
the theme, and **enters search** — a zone placed from the catalog is then findable by
name (see [ZONES.md § 5](ZONES.md#5-search)). A shape without a `title` inherits the
one from its catalog item.

**Two distinct gestures on a row:**

| Gesture | Effect |
|---|---|
| Clicking the **name** | toggles display **and** frames the camera |
| The **checkbox** | toggles only (framing follows the "frame on add" setting) |

That is what lets you add five items in a row without the view jumping, while keeping a
direct gesture for "show me that one".

**Persistence.** What is displayed survives a reload: the **keys** are kept
(`config.data.storageKeys.catalog`), and geometries are re-requested from the source. A
geometry is an API's answer at a point in time — serving it back from local storage would
display a perimeter the backend may have moved since. An entry that has become unknown is
dropped silently. The **title** lent to an anonymous shape is persisted alongside its key:
a zone placed from the catalog therefore stays findable by name **even after a reload**,
not only in the session where it was placed.

Users control all of this from the toolbar's gear panel: *keep between sessions*, *frame
on add*, *remove all*. **"Remove all" also turns off toggle sources** — the button says
"all", and sparing one would leave thousands of points on a map you just asked to clear.
The **Catalog button's badge** likewise counts ticked items and switched-on sets alike.

---

## 8. Config, theme, labels

```ts
config.catalog = {
  pageSize: 50,            // items requested per page
  debounceMs: 250,         // 💰 search debounce: the direct lever on call volume
  maxInlineActions: 2,     // actions rendered inline
  overscanRows: 4,         // rows rendered off-screen on each side of the virtual window
  prefetchMarginPx: 200,   // 💰 distance from the list bottom that triggers the next page
  persistDebounceMs: 250,  // debounce for writing the selection to storage
}
config.data.storageKeys.catalog          // 'm3d:catalog'          — the selection
config.data.storageKeys.catalogSettings  // 'm3d:catalog-settings' — the settings
config.interaction.shortcuts.controls.catalog  // 'c'
```

| Theme | Role |
|---|---|
| `sizing.catalogRowHeight` | row height — **constant**, virtualization depends on it |
| `sizing.catalogIndent` | child row offset |
| `sizing.catalogChevronW` | expand chevron width — also the gutter reserved on rows without children |
| `sizing.catalogPanelW` | type panel width |
| `sizing.catalogSubPanelW` | list panel width — together with `catalogPanelW`, the framing margin it reserves |
| `sizing.panelMaxHeight.catalog` | maximum height |

All text lives in `labels.catalog` (see [LABELS.md](LABELS.md)). **Type names** are not
there: they come from `CatalogSource.label`, which you provide. A toggle source reuses the
**same keys** as item rows (`catalog.add`, `catalog.remove`, `catalog.loading`), with the
source name as `{label}`: nothing new to translate.

Two settings concern **only** toggle sources, and they live elsewhere:

| Setting | Role |
|---|---|
| `CatalogToggleSource.source.minZoom` | 💰 zoom gate, carried by the source itself |
| `config.data.viewportDebounceMs` | debounce of the reload on camera movement |
| `config.performance.boundsMargin` | 💰 how much is loaded around the screen — see § 4.2 |

---

## 9. Declaring a source from a plugin

`engine.catalog` is a registry like `engine.tags` or `engine.search`: a plugin registers
its sources there and returns the removal function.

```ts
useEffect(() => {
  const off = engine.catalog.register(mySource)
  return off
}, [engine])
```

A removed source takes away whatever it had placed on the map — otherwise zones no panel
can remove any more would stay on screen.

---

## 10. Recipes

**A reference set with known bboxes** — framing without a request:

```ts
items: towns.map((v) => ({ id: v.id, title: v.name, bounds: v.bbox }))
```

**A type without remote search** (small set already in memory):

```ts
list: async ({ query, cursor, limit }) => {
  const f = query ? all.filter((z) => normalize(z.title).includes(normalize(query))) : all
  const start = cursor ? Number(cursor) : 0
  const page = f.slice(start, start + limit)
  return { items: page, total: f.length, nextCursor: start + page.length < f.length ? String(start + page.length) : undefined }
}
```

**Two families in the menu** — `family` separates them, in registration order:

```ts
{ id: 'zones', family: 'My zones', … }
{ id: 'cities', family: 'Territories', … }
```

**Driving the selection from the application**:

```tsx
const catalog = useCatalog()
catalog.toggle(source, item, { fit: true })   // BROWSE source
catalog.setMany(source, items, true)
catalog.toggleSource('defibs')                // switches a toggle set on/off
catalog.toggleSource('defibs', false)         // forced state
catalog.clear()
```

**Reading a set's state** — `useCatalogToggle(id)`, not `useCatalog()`: it subscribes to
THIS set's two booleans, where the full API would re-render your component on every catalog
mutation.

```tsx
const { on, loading, toggle } = useCatalogToggle('defibs')
```

**Sorting heterogeneous sources** — the guards discriminate the union:

```ts
import { isToggleSource } from '@pasquelin/map3d'

const sets = sources.filter(isToggleSource)   // `s.source` is typed here
```

**Showing the metadata of ONE known source** (icon, label, `total`) without
subscribing to the whole list — a diagnostic overlay, a legend:

```tsx
const source = useCatalogSource('cities')
// undefined until the source is registered on `engine.catalog`
if (source) console.log(source.label, source.total)
```

---

## See also

- [ZONES.md](ZONES.md) — the shapes the catalog places on the map
- [SEARCH.md](SEARCH.md) — searching what is already displayed
- [PLUGINS.md](PLUGINS.md) — declaring a source from a plugin
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [THEME.md](THEME.md) · [LABELS.md](LABELS.md)

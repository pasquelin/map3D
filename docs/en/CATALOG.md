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

```ts
type CatalogSource = {
  id: string                  // stable identity: key prefix, persisted value
  label: string               // menu label — the library translates no type name
  icon: string                // @mdi/js path
  family?: string             // groups menu entries
  total?: number              // count shown WITHOUT issuing a request

  list(req: CatalogRequest): Promise<CatalogPage>
  geometry(id: CatalogId, signal: AbortSignal): Promise<ShapeData[]>
  children?(id: CatalogId, req: CatalogRequest): Promise<CatalogPage>
  actions?: readonly CatalogAction[]
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

## 4. Aggregates and children

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

## 5. Pagination, search and volume

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

## 6. Display, framing and persistence

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
on add*, *remove all*.

---

## 7. Config, theme, labels

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
there: they come from `CatalogSource.label`, which you provide.

---

## 8. Declaring a source from a plugin

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

## 9. Recipes

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
catalog.toggle(source, item, { fit: true })
catalog.setMany(source, items, true)
catalog.clear()
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

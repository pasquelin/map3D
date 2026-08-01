# Search — complete guide

[Français](../fr/SEARCH.md) · **English** · [↑ Index](README.md)

One box, one list: the **map's own elements** (markers, zones, drawings, symbols)
**and** place **geocoding**, grouped into sections.

The principle that governs everything else: **map groups are not configured**. Layers
register themselves with the `engine.search` registry as soon as an element carries a
name. A marker only needs a `title` to become findable, and a `typeLabel` on its layer
for its group to have a readable name.

---

## 1. In two minutes

```tsx
<Map
  search                                  // `true` = the defaults
  googleMapsApiKey={KEY}                  // → “Places” group (Google Places)
  layers={[
    markersLayer({ points: agents, typeLabel: (t) => LABELS[t] }),  // named group
    shapesLayer({ shapes: zones }),                                 // “Zones” group
  ]}
/>
```

Without the `search` prop, **the box does not exist**.

---

## 2. What gets indexed

| Group | Id | Source | Condition |
|---|---|---|---|
| one per **marker type** | `marker:<type>` | `<MarkerLayer>` | the marker carries a `title` |
| Zones | `shape` | `<ShapeLayer>` | the shape carries a `title` |
| Drawings | `draw` | `<DrawLayer>` | the drawn shape carries a `title` |
| Places | `place` | geocoder | `search` prop ≠ `false` |

**An unnamed element is skipped, never indexed under its id**: offering “7f3a-91b2” in
a result list helps nobody.

Markers are seen **after the “Layers” filter**: what is hidden on the map is
unfindable — no point flying the camera to a marker the user will not see. A marker
hidden by the **scenery threshold**, on the other hand, stays searchable: that threshold
states what is *legible*, not what the user *chose* to hide.

Two layers carrying the same type produce **one** group whose counts add up: the user
sees “Agents”, not two implementation layers.

---

## 3. Picking a result

- The camera goes there **on its own**. If the entry carries **bounds** it **frames**;
  otherwise it flies to `flyAltitude`. That is why a zone or a city is looked at whole,
  where a marker is simply reached.
- Picking a **marker** also **selects** it — exactly like a click on the map: the layer
  reports, your `onSelect` decides. Short-circuiting that would amount to inventing a
  second selection semantics.
- A row's “…” button opens the **marker menu** (`<Map markerMenu>`), evaluated on open
  and not when the row is rendered.
- `onSelect(entry)` notifies you as well, if you have something else to do.

Keyboard: `↑` `↓` `Enter` `Escape`.

**Honest headers**: each group announces the **real total** before truncation, not the
number of rows displayed.

**History**: recent picks are persisted (`historyStorageKey`, `null` to disable) and
**re-resolved against the current position** when shown again.

---

## 4. Configuring the box

```tsx
<Map
  search={{
    placeholder: 'Search an agent, a zone, a city…',
    scope: true,                                   // chip-based scope selector
    groupOrder: ['marker:agent', 'marker:alert'],  // order of MAP groups
    limitPerGroup: 6,
    minQuery: 2,
    debounceMs: 250,
    flyAltitude: 1200,
    historyStorageKey: 'm3d:search-history',
    historySize: 8,
    onSelect: (entry) => console.log(entry.group, entry.id),
  }}
/>
```

| Prop | Default | Note |
|---|---|---|
| `search` | Google Places with `<Map googleMapsApiKey>`'s key | `false` removes the “Places” group |
| `limitPerGroup` | `6` | the header announces the real total |
| `scope` | `true` | `false` = all groups, no selector |
| `groupOrder` | — | groups not listed follow in alphabetical order |
| `minQuery` | `2` | 💰 raise it to spare a per-call billed provider; lower it to `1` for short labels (codes, round numbers) |
| `debounceMs` | `250` | 💰 every keystroke triggers a geocoder call |
| `flyAltitude` | `2500` | fallback altitude when the picked result has no `bounds` |
| `historyStorageKey` | — | `null` disables |
| `historySize` | `8` | max entries kept in history |

“Places” is **outside the ordering**: the group always opens the list, since searching
for a city is the most common framing gesture.

### Geocoder

```tsx
import { createGooglePlacesSearch } from '@pasquelin/map3d'

<Map search={{ search: createGooglePlacesSearch({ apiKey, language: 'en', region: 'gb', limit: 5 }) }} />
```

Or your own — the signature is minimal:

```ts
(query: string, signal?: AbortSignal) => Promise<SearchResult[]>
```

Endpoint, FieldMask (💰 billing) and network policy are configured in
`config.providers.places` — see [CONFIG.md](CONFIG.md).

---

## 5. Plugging in a source that is not a layer

Use this **only** for a business directory or a remote repository: markers, shapes,
drawings and symbols already register themselves.

```ts
useEffect(() => {
  // 1. Declare the group (counts) — only emits on a real change
  engine.search.report('my-directory', [{ id: 'directory', label: 'Directory', count: contacts.length }])

  // 2. Provide the results
  return engine.search.register({
    query: (needle, opts) => {
      // out of scope: nothing for us (a fresh literal — never a shared object)
      if (opts.group && opts.group !== 'directory') return { entries: [], totals: new Map() }
      const hits = contacts
        .map((c) => ({ item: c, score: scoreMatch(normalizeSearch(c.name), needle), distance: 0 }))
        .filter((h) => h.score !== NO_MATCH)
      return {
        entries: rankHits(hits, opts.limit).map((c) => ({
          group: 'directory',
          id: c.id,
          title: c.name,
          position: c.position,
          select: () => open(c),
        })),
        totals: new Map([['directory', hits.length]]),
      }
    },
  })
}, [engine, contacts])
```

Two structural rules:

- **The `query` contract is synchronous.** Everything living on the map is already in
  memory, and an async round trip per keystroke would only make the list flicker. Remote
  geocoding, on the other hand, is not a provider — it is handled separately, precisely
  because it is slow and fallible.
- **Groups are *declared*, not requested.** On a real-time feed the marker array is
  replaced several times a second while the groups do not change: `report` compares
  before emitting.

A useful optimisation for a large set: build the entries (and their closures) **only
after truncation** — a two-letter query can match hundreds of elements of which only six
will be displayed.

---

## 6. Types and helpers

```ts
type SearchEntry = {
  group: string          // 'marker:agent' | 'shape' | 'draw' | 'place' | …
  id: string | number
  title: string
  subtitle?: string      // reference, address — NEVER the type (the header says it already)
  titleColor?: string
  position: LatLng
  bounds?: Bounds        // present → picking FRAMES instead of flying
  avatar?: string
  icon?: string
  color?: string
  select?: () => void    // what “picking” means for THIS element
  menu?: () => MenuItem[]
}

type SearchGroup = { id: string; label: string; count: number; color?: string }
```

| Export | Role |
|---|---|
| `SearchRegistry` | the registry (`engine.search`): `register`, `report`, `unreport`, `groups`, `query` |
| `markerGroupId(type)` | `` `marker:${type}` `` — use it instead of concatenating by hand |
| `SHAPE_GROUP` `DRAW_GROUP` `PLACE_GROUP` | the library's group ids |
| `normalizeSearch` | normalisation (case, accents) |
| `scoreMatch` / `NO_MATCH` | score of a normalised title against a query |
| `rankHits(hits, limit)` | sort by score then proximity, truncate |
| `proximityRank(a, b)` | proximity rank, breaks ties between equal scores |
| `Hit<T>` | `{ item, score, distance }` — the retained match, before formatting into a `SearchEntry` |
| `createTitleCache(titleOf)` | memoises title normalisation by object reference (`WeakMap`) — decisive on a real-time feed |
| `createGooglePlacesSearch` | Google Places geocoder |

A group's colour must be **the same** as that of its elements on the map
(`theme.colors.marker[type]`, zone stroke…): it is what visually links a scope-selector
entry to what you see on screen. Use `markerColorOf(theme, type)` rather than
re-implementing the fallback chain.

---

## 7. Recipes

**Make a zone findable** — give it a `title`. Nothing else.

**Order the groups** — `groupOrder: ['marker:alert', 'marker:agent', 'shape']`.

**A map without geocoding** — `search={{ search: false }}`: the map groups remain.

**A hand-placed search box** — `<SearchBox>` is exported; it must live under `<Map>`
(it consumes the map context).

---

## See also

- [MARKERS.md](MARKERS.md) — `title`, `typeLabel`, shared menus
- [ZONES.md](ZONES.md) — naming a zone, bounds
- [CAMERA.md](CAMERA.md) — what “framing” means
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [LABELS.md](LABELS.md)

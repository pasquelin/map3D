# Data — viewport, real time, tags, pinning

[Français](../fr/DATA.md) · **English** · [↑ Index](README.md)

How data enters the map, how it leaves, and what the user can do with it.

---

## 1. Three data regimes

| Regime | Who decides | Mechanism |
|---|---|---|
| **Static** | you | a `points` / `shapes` array you own |
| **Viewport-driven** | the map | a `DataSource` refetched by bbox |
| **Real time** | your transport | changing `points`, animated by stable identity |

The three mix freely: one layer on `source`, another on real-time `points`.

---

## 2. Viewport-driven

```ts
type DataSource<T> = {
  minZoom?: number
  load(viewport: Viewport, signal: AbortSignal): Promise<T[]>
}

type Viewport = { bounds: Bounds; center: LatLng; zoom: number }
```

```tsx
const source: DataSource<MarkerData<Alert>> = {
  minZoom: 10,
  async load({ bounds }, signal) {
    return fetchAlerts(bounds, signal)
  },
}

<MarkerLayer source={source} cluster={{ enabled: true }} />
```

What the controller does for you, and which you therefore must not redo:

1. **Debounce** between the camera stopping and the request
   (`config.data.viewportDebounceMs`, overridable).
2. **Zoom gate**: below `minZoom`, no loading at all — not even a cancelled request.
3. **Cancellation** of the previous request as soon as a new view arrives
   (`AbortSignal`).
4. **Priming** with the current view at mount, without waiting for a first move.

All of it is **transport-agnostic**: Apollo, REST, gRPC-web, whatever — `load` is just a
promise.

Direct hook, if you want the data without going through a layer:

```ts
const { data, loading } = useLiveData(source, { debounce: 800 })
```

And the bare controller, outside React: `ViewportController` (`push`, `setSource`,
`dispose`).

### Just subscribing to the view

```ts
useViewport((v) => refetch(v.bounds), { minZoom: 12, debounce: 500 })
```

The `viewport` event is emitted when the camera goes **idle**, not on every frame. For a
high-frequency display, `camera` is the one you want — and definitely **no** network
calls inside it. See [CAMERA.md § 5](CAMERA.md#5-tracking-the-view).

---

## 3. Real time

Simply pass `points` that change: thanks to stable identity (`id`, or `getId`), a
`position` change **animates** the marker instead of recreating it.

```tsx
<MarkerLayer
  points={agents}          // updated by your WebSocket
  selectedId={selected}
  followId={followed}      // the camera follows the live agent
  icon={(m) => agentSvg(m.data)}
/>
```

The glide duration and easing come from `theme.markers.moveTween`.

**What makes this sustainable on a dense feed**, and which explains a few API choices:

- DOM nodes are **pooled** and positioned with `translate3d`, in a single project →
  write pass.
- Titles normalised for search are memoised **per marker object**: a tick rebuilds the
  array but preserves most references, so only what actually changed is re-normalised.
- Search **groups** and **tag counters** are *declared* and compared before emitting: a
  GPS tick that changes no group re-renders nobody.
- Cluster recomputation is **throttled** (~11 Hz) during continuous movement; the
  clusters, anchored in 3D, follow the map at 60 fps regardless. A trailing call
  guarantees the correct final state once the camera settles.

`diffById(previous, next, getId)` is exported (`{ entered, updated, exitedKeys }`) for a
custom layer that wants the same recycling.

---

## 4. Tags and the “Layers” filter

A tag is a **visibility label** chosen by the user, not a rendering category (that is a
marker's `type`).

```ts
{ id: 'a1', type: 'agent-enroute', tags: ['user', 'move'], position, data }
```

| Element | Default tags |
|---|---|
| marker | `['marker', <type>]` |
| drawn shape | `['draw', <tool>]` |
| placed symbol | `['symbol', <category>]` |

The **Layers** button in `<MapControls>` (key `T`) opens a panel listing the tags
**actually present** on the map: search, checkboxes, chips, counters.

- **OR** semantics: ticking `user` and `rect` leaves “the users **and** every
  rectangle”.
- No tag ticked = **no filter** (everything visible).
- An element **with no tag** is hidden as soon as a filter is active — hence the default
  tags above.
- Markers: the filter is applied **before** clustering (clusters reflect the filter).
  Drawings: a plain visibility toggle, no geometry rebuilt.
- The **selected** marker and the **followed** marker are exempt.
- Persisted in `localStorage`: `<Map tagStorageKey>` (`null` to disable, one key per map
  if several coexist).
- A tag that is selected but **absent** from the map (a persisted selection from a
  session whose data has changed) is listed with a count of `0` — otherwise it would
  filter with no checkbox available to untick it.

### Colours

`theme.colors.tags[tag]`, otherwise a **deterministic hashed palette** (`tagColor`): a
tag keeps its colour across sessions and across layers without storing anything. Single
resolver: `tagColorOf(theme, tag)`.

```tsx
<MapControls tagLabel={(t) => TAG_LABELS[t] ?? t} />   // readable label
<TagFilterControl />                                    // the panel, outside <MapControls>
```

### Programmatic access

```ts
const tags = useTags()          // re-renders on REGISTRY change (tags present)
const sel  = useTagSelection()  // re-renders on SELECTION change

sel.isVisible(['user'])   // what the library itself calls
sel.toggle('user')
sel.clear()
tags.all()                // TagEntry[] = { tag, count }[]
```

Outside React: `engine.tags`. A custom layer declares its tags with
`engine.tags.report(sourceId, countTags(items, (i) => i.tags))` and removes them with
`unreport` on unmount.

---

## 5. Pinning (favourites dock)

```tsx
<Map
  layers={[markersLayer({ points: agents, draggable: true })]}
  dock={{
    items: pinned,                         // derived from the ids YOU store
    onPin: (payload) => add(payload.id),
    onUnpin: (id) => remove(id),
    onReorder: (ids) => reorder(ids),
    onPinClick: (item) => open(item),
    flyOnClick: true,
    flyZoom: 16,
  }}
/>
```

The dock is **controlled**: the library stores nothing.

> The absence of `dock` has a deliberate consequence beyond display: no zone accepts a
> marker any more, so markers **stop being grabbable**. A gesture with no destination is
> not offered.

`PinnedItem` = `{ id, position?, type?, color?, label?, avatar?, icon?, data? }`. The
default square takes the `type` colour (or `color`), shows the `avatar` as a cover,
otherwise the `icon` centred, otherwise the `label`'s initial.

### Generic drag-and-drop

The dock is only a consumer: the mechanism is public.

```ts
// Make an element grabbable
const { onPointerDown, className } = useDraggable({
  payload: { type: 'icon', id: entry.key, data: entry },
  ghost: <Thumbnail entry={entry} />,
  longPressMs: 0,        // a palette has no click to preserve
})

// Receive on a panel
useDropZone({ id: 'my-zone', accept: (p) => p.type === 'icon', onDrop: (p, point) => … })

// Receive on the TERRAIN — the targeted lat/lng is provided
useMapDropZone({ accept: (p) => p.type === 'icon', onDrop: (p, latLng) => place(p.data, latLng) })
```

`useMapDropZone` covers the canvas and the HTML overlay — **never the markers layer**
(a marker can float above another zone, e.g. the dock, and would otherwise divert its
drop to the map) **nor the toolbars**. A drop beside the globe is ignored: there is no
position to hand over.

Source of truth: `engine.drag` (`DragRegistry`) — zones, typed payload, gesture phase.

---

## 6. Persistence: the map of keys

Everything lives in `localStorage`, everything can be disabled, and **everything must be
made distinct if two maps coexist on the same origin**.

| What | Prop | Default |
|---|---|---|
| camera position | `<Map positionStorageKey>` | *none* (no persistence) |
| “Layers” filter | `<Map tagStorageKey>` | `m3d:tag-filter` |
| drawing settings | `draw.settingsStorageKey` (+ `settingsStorage: 'none'`) | `m3d:draw-settings` |
| search history | `search.historyStorageKey` | `m3d:search-history` |
| pinned favourites | — | **nothing**: you do the storing |

Unavailable storage (SSR, private mode) is treated as absent, never as an error.

---

## 7. Recipes

**Load by bbox and animate in real time in the same map**

```tsx
layers={[
  markersLayer<Alert>({ id: 'alerts', source: alertsByBbox, cluster: { enabled: true } }),
  markersLayer<Agent>({ id: 'agents', points: liveAgents, followId: followed }),
]}
```

**Zoom gate for a POI layer** — `source.minZoom = 15`. Nothing goes out below that
threshold.

**Manual refetch on another criterion** — `useViewport((v) => refetch(v), { minZoom })`
and keep control of the request.

**Hide a family of elements by default** — there is no initial tag selection: the filter
starts empty (everything visible) or resumes from what was persisted. For an initial
state, pre-filter your `points`.

---

## See also

- [MARKERS.md](MARKERS.md) — stable identity, culling, clustering
- [CAMERA.md](CAMERA.md) — the `viewport` and `camera` events
- [ENGINE.md](ENGINE.md) — registries and custom layers
- [CONFIG.md](CONFIG.md) — rates, budgets, storage keys

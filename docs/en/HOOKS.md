# Hooks — reference

[Français](../fr/HOOKS.md) · **English** · [↑ Index](README.md)

Every hook must be called **under `<Map>`** (they consume the map context). Those marked
“throws” raise an error outside the layer that provides them — deliberately: a silent
`null` would turn a mounting mistake into a distant runtime bug.

---

## Context

| Hook | Returns | Note |
|---|---|---|
| `useMap()` | `MapEngine` | available **from mount**, without waiting for tiles |
| `useTheme()` | `MapTheme` | resolved theme (light/dark + `prefers-reduced-motion`) |
| `useLabels()` | `MapLabels` | resolved labels — every string in the library goes through it |
| `useConfig()` | `MapConfig` | resolved settings, **always complete** |
| `usePreferences()` | `{ prefs, hasStored, store }` | resolved by `<MapProvider>`; `store` is `null` outside a map — see [PREFERENCES.md § 5](PREFERENCES.md#5-for-the-application) |

> **Prefer `useConfig()` over `engine.config` in the React layer.** The engine receives
> the config from an effect in `<Map>`, and a child's effects run **before** its
> parent's: on the render where `<Map config>` changes, `engine.config` still carries
> the previous frame's value, and no re-render will come to correct whatever read it.
>
> For a closure that outlives its render (a handler subscribed once, an animation loop),
> keep the value in a **ref refreshed on every render**.

---

## Camera and view

### `useCamera(): UseCameraResult`

```ts
const { state, flyTo, follow, moveTo, fitBounds, setCenter, panTo, setZoom, getZoom } = useCamera()
```

`state` is **reactive**: the consumer re-renders on every camera move — the `camera`
event is emitted **every frame** while it moves.

### `useCameraCommands(): CameraCommands`

```ts
const { flyTo, fitBounds, setZoom } = useCameraCommands()
```

The **commands alone**, with a stable identity: this hook subscribes to nothing and
never re-renders. It is the path for a "recenter" button or a menu that drives the view
without displaying it — going through `useCamera` for a single `flyTo` would re-render
the whole subtree sixty times per second during a pan. To drive from outside React, the
`map.current?.camera` handle is still available.

### `usePedestrian(): PedestrianApi`

```ts
const { state, enterPlacement, enter, exit, setImmersion } = usePedestrian()
```

Pedestrian / first-person mode: reactive `state` plus the commands. State comes from the
**event**, not from a read at render time: the map can leave the mode on its own (Escape
in the canvas, a 2D toggle), and a consumer tracking only its own calls would show an
active button for a mode already exited. `enter(p)` returns `false` if the point cannot
be placed.

### `useViewport(cb, opts?)`

```ts
useViewport((v) => refetch(v.bounds), { minZoom: 12, debounce: 500 })
```

Subscribes to the **settled** view (idle-style). Without `debounce`, the map's own rate
applies (`config.data.viewportDebounceMs`) — the same as `useLiveData`.

### `useMapEvents(handlers)`

```ts
useMapEvents({ onClick, onCameraChange, onViewportChange, onReady })
```

Declarative subscription. `onReady` is **replayed** if the map was already ready.

### `useZoomGate(thresholds): (minZoom) => boolean`

Boolean gate over a list of thresholds — what hides `static` markers. Re-renders only
when a threshold is **crossed**, not on every move.

---

## Data

### `useLiveData(source, opts?)`

```ts
const { data, loading } = useLiveData(source, { debounce: 800 })
```

Loads a `DataSource` according to the view: debounce, `minZoom` gate, cancellation of
the previous request, priming with the current view. Transport-agnostic.

### `useTags()` / `useTagSelection()`

Two hooks, two reasons to re-render:

| Hook | Re-renders when |
|---|---|
| `useTags()` | the **registry** changes (tags appear on or disappear from the map) |
| `useTagSelection()` | the **selection** changes (the user ticks a box) |

Both return the same `TagFilter` (`isVisible`, `toggle`, `clear`, `all`, `selected`,
`isActive`, `report`, `unreport`). A panel listing tags wants the first; a layer doing
the filtering wants the second.

### `usePlugins(): { plugins, byId }`

Reactive view of registered plugins (`meta`, `enabled`, `config`, `schema`, plus
`setEnabled` / `setConfig` / `resetConfig` / `refresh`). Recomposed only when the
registry changes. Details in [PLUGINS.md](PLUGINS.md).

### `useBuildingEnrichment(): BuildingEnrichment`

Enrichment state of the last picked building: `loading`, `data` (attrs merged from the
active enrichers), `tags` (union of provenances), `error`, and `byPlugin(id)` for the
breakdown. Re-renders on `loading→data→error` transitions and when the "Layers" filter
changes. Read it in the component opened by `<Map buildingMenu>` — see
[BUILDINGS.md](BUILDINGS.md) and [PLUGINS.md](PLUGINS.md).

### `useCatalog(side?): CatalogApi`

```ts
const catalog = useCatalog() // side: 'left' | 'right' (default 'right')
catalog.toggle(source, item, { fit: true })
catalog.setMany(source, items, true)
catalog.clear()
```

Catalog selection and gestures: `selection`, `isShown`, `isPending`, `hasError`, `toggle`,
`setMany`, `clear`, `shapes` (shapes to pass to `<ShapeLayer>`). `side` reserves the framing
margin on the side where the panel opens. Details in
[CATALOG.md § 9](CATALOG.md#9-recipes).

### `useCatalogSources()` / `useCatalogSource(id)`

Declared catalog sources (`engine.catalog`), reactive to a source registering or
unregistering. The second isolates one source by id (`undefined` if absent).

### `useCatalogSettings(): CatalogSettingsApi`

Persisted catalog settings (`persist`, `fitOnAdd`) + `setPersist` / `setFitOnAdd` — shared
with `useCatalog`, never out of sync.

---

## Drawing, lens, relations

### `useDrawing(): DrawingApi` — *throws* outside `<DrawLayer>`

The whole drawing API: tool, selection, style, history, CRUD, GeoJSON, symbols. Details
in [DRAWING.md § 16](DRAWING.md#16-drawingapi--the-reference).

### `useDrawSettings(): DrawSettings`

**Per-tool** settings (persisted), read reactively: `get(tool)`, `set(tool, patch)`,
`reset(tool?)`, `isCustomized(tool)`.

### `useGraticule(): GraticuleApi`

Coordinate-grid toggle — `{ visible, setVisible, toggle }`. Reads state **from the engine**:
three commands drive it (Measure submenu, controls button, shortcut), and a local React state
would have diverged. See [GRATICULE.md](GRATICULE.md).

### `useLens(): LensApi` — *throws* outside `<LensLayer>`

`{ active, activate, deactivate, toggle, shortcut }`.

### `useRelations(): RelationApi` — *throws* outside `<RelationLayer>`

`{ rules, menuFor, run, snapshots, hubHosts, setMode, routeColor, familyColor, untrace,
clear }`. Details in [RELATIONS.md § 9](RELATIONS.md#9-relationapi).

### `useTemplates(options?): TemplatesView` — under `<MapProvider>`

`{ templates, categories, defaultCategories, defaultApply, allowExport, busy,
saveCurrent, updateFromDrawing, apply, rename, remove, refresh, exportFile, importFile }`.
Reactive view + actions of the drawing-template manager (localStorage only or an API
provider). Details in [TEMPLATES.md § 8](TEMPLATES.md#8-usetemplates-hook).

### `useToolbar(): ToolbarApi`

```ts
const bar = useToolbar()   // { retracted, nativeActive, claim() }
```

What a tool needs to know about the bar carrying it. **Outside a `<Toolbar>`, everything
is inert**: a button mounted on its own has nobody to hand control to.

### `useCloseWhenHidden(hidden, close)`

Closes a surface when the bar retracts or a native tool takes over. The contract for an
application tool fits in two lines:

```tsx
const bar = useToolbar()
const [open, setOpen] = useState(false)
useCloseWhenHidden(bar.retracted || bar.nativeActive, setOpen)
<ToolButton active={open} onClick={() => { if (!open) bar.claim(); setOpen(!open) }} />
```

Without this, two buttons stay lit and the bar no longer tells you where you are.

---

## Gestures

### `useDraggable(opts)`

```ts
const { onPointerDown, className } = useDraggable({
  payload: { type: 'marker', id, data },
  ghost: <Thumbnail />,
  longPressMs: 0,     // default: config.interaction.longPressMs
  slop: 8,            // default: config.interaction.dragSlopPx
  disabled: false,
})
```

**If no zone accepts the payload** — typically a map with no dock — the hook returns an
inert `onPointerDown` and no class: the element keeps its normal click and
`touch-action`. Otherwise the user would get a ghost under the cursor and a release with
no effect, that is, a gesture that looks broken.

The hook re-evaluates when zones mount or unmount: the grab neither stays dead after a
dock arrives, nor stays live after it leaves.

### `useDropZone(opts)`

```ts
const { dropProps, isOver } = useDropZone({ id: 'm3d-pinned', accept, onDrop })
<div {...dropProps} />
```

Hit-testing goes through the `data-m3d-drop` attribute, never through a maintained
screen rectangle: robust to layout, resize and scroll. `isOver` only reflects hovering
by an **accepted** payload.

### `useMapDropZone(opts)`

```ts
const { isOver } = useMapDropZone({ accept, onDrop: (payload, latLng, point) => place(payload, latLng) })
```

The counterpart of the pair above when the target is the **terrain**: the zone covers
the canvas and the HTML overlay — **never the markers layer** (a marker can float above
another zone, e.g. the dock, and would otherwise divert its drop to the map) nor the
toolbars — and the callback receives the targeted coordinate via **ellipsoid raycast**
(accurate in a tilted view as in 2D). A drop beside the globe is ignored, there being no
position to hand over.

### `useRepositionable(opts)`

Free movement of an element **anchored to the map** (≠ payload drag-and-drop): the
gesture arms on movement, follows the real terrain, and delivers the position on
release.

```ts
useRepositionable({ id, layer, slop, onStart, onMove, onDrop })
```

`onStart` fires **once per gesture**, never on a plain click: the host can use it to
close surfaces anchored to the marker, which no outside click will dismiss any more.

### `useDraggablePanel(defaultPos?)`

```ts
const { panelRef, style, gripProps, pinned, reset } = useDraggablePanel({ x, y })
<div ref={panelRef} style={style}><button {...gripProps} /></div>
```

A floating panel movable by a grip, clamped to the container, re-clamped on resize —
**invariant: a pinned panel stays inside the container even when it shrinks**.
`defaultPos` positions the panel *as long as it is not pinned* (useful to anchor it to a
moving element); `reset()` snaps it back.

Shared by the selection panel and the lens inventory — same gesture, a single
implementation.

---

## Custom layers

There is **no public hook** for this: a layer is mounted with the engine's methods,
inside an effect.

```tsx
const engine = useMap()
useEffect(() => {
  const layer = new MyLayer(engine.annotations, engine.projection)
  engine.addLayer(layer)
  return () => engine.removeLayer(layer)
}, [engine])
```

`<ShapeLayer>` and `<PathLayer>` internally use `useLayer` / `useLayerSync`, which
factor this pattern out — **they are not exported**. The full pattern (including data
resynchronisation) is in [ENGINE.md § 3](ENGINE.md#3-writing-a-layer).

---

## See also

- [ENGINE.md](ENGINE.md) — the engine, its events and its registries
- [MARKERS.md](MARKERS.md) · [ZONES.md](ZONES.md) · [DRAWING.md](DRAWING.md)
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md)

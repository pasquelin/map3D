# Drawing — complete guide

[Français](../fr/DRAWING.md) · **English** · [↑ Index](README.md)

A Figma-style shape editor, **draped over the 3D terrain**: shapes are stored in
lat/lng, anchored to the ground, and their strokes have a screen-pixel width that stays
constant across zoom.

`<DrawLayer>` carries the collection, history, selection, editing, style, constraints,
GeoJSON **and placed symbols** — a symbol is a `kind: 'symbol'` shape, not a separate
layer (see [SYMBOLS.md](SYMBOLS.md)).

---

## 1. In two minutes

```tsx
<Map
  center={PARIS}
  zoom={15}
  draw={{
    onShapeAdd: (s) => createZone(s),
    onShapeUpdate: (s) => save(s.meta?.uuid, s),
    onShapeDelete: (s) => remove(s.meta?.uuid),
  }}
  toolbar={{ tools: ['select', 'rect', 'circle', 'polygon', 'erase'] }}
/>
```

`<Map draw={…}>` mounts the layer **and** the toolbar in the right order.
`draw={false}` removes the drawing **and** the toolbar that drives it.

Manual mounting:

```tsx
<Map>
  <DrawLayer onChange={(fc) => save(fc)}>
    <Toolbar position="left" />
  </DrawLayer>
</Map>
```

---

## 2. The tools

| Tool | Key | Shape produced |
|---|---|---|
| Select | `V` | — (see § 3) |
| Line | `L` | open polyline |
| Polygon | `P` | successive clicks + `Enter` to close |
| Rectangle | `R` | adjustable corner radius |
| Circle | `C` | centre + radius |
| Freehand | `D` | continuous stroke |
| Arrow | `A` | polyline + head |
| Measure | `M` | thin dashed dimension ⊢––⊣ with a distance label |
| Eraser | `E` | deletes on click |
| Symbols | `Y` | opens the palette (see [SYMBOLS.md](SYMBOLS.md)) |

```tsx
<Toolbar tools={['select', 'rect', 'circle', 'arrow', 'erase']} />  // displayed, in this order
<DrawLayer tools={['select', 'rect']} />                            // ALLOWED (also filters setTool)
```

`<DrawLayer tools>` bounds what is possible; `<Toolbar tools>` bounds what is
**displayed**. The “Settings” panel lists the tools that are actually enabled —
removing a tool from the bar does not leave it configurable in a panel that ignores it.

**Space bar**: holding `Space` during a stroke or an edit = **temporary camera pan**
(the stroke in progress is frozen, not lost); `Space+Shift` = camera rotation;
releasing resumes exactly where you were.

---

## 3. Selection

Three marquees, under the same `V` button (flyout on hover):

| Mode | Key | Gesture |
|---|---|---|
| `rect` | `1` | rectangle |
| `poly` | `2` | polygon (clicks + `Enter`) |
| `lasso` | `3` | freehand |

**“Touch = selected”** semantics: it is enough for a marquee to graze a shape. Single
click to select a shape, `Shift+click` to add/remove.

```tsx
<Toolbar selectModes={['rect', 'lasso']} />   // a single mode = no flyout
```

Selection covers **shapes** *and* **markers** — marker layers register with the
`engine.selectables` registry. The two are read separately:

```ts
const { selection, markerSelection, selectionDetails } = useDrawing()
```

Outlines use black/white **marching ants** (readable on any background, satellite and
snow included — see `theme.colors.marquee`), with a bounding box in multi-selection.

The **selection badges** (`draw.selectionBadges`) list what is selected: shapes grouped
by `kind`, markers as rows with their menu. Mounted by default;
`selectionBadges: false` removes them.

---

## 4. Editing

Figma-style handles:

| Gesture | Effect |
|---|---|
| corner handle | resizes on 2 axes (`Shift` = uniform scale) |
| edge-midpoint handle | resizes on 1 axis |
| vertex handle | moves a point (polygon, line, arrow, measure) |
| drag the body | moves |
| `Shift` + drag the body | **rotates** (dedicated cursor) |
| arrow keys | moves by `1 px` (`Shift` = `10 px`) |

In multi-selection, transformations are **grouped in a common frame**. A rotated
rectangle resizes along its **own axes**.

---

## 5. Style

The style panel appears with an active tool or a selection.

- **Separate fill and stroke colours** (stacked Photoshop-style swatches with a ⇄
  swap), theme palette (`theme.colors.draw.palette`) + native picker.
- Stroke width **including 0** (fill only).
- Stroke style: `solid` / `dashed` / `dotted`.
- Stroke **and** fill opacity.
- Rectangle corner radius (% of the short side, 0–50).

**Without a selection**, the panel sets the active tool's defaults; **with a
selection**, it restyles the shapes.

```ts
const { setStyle, currentStyle, selectionHasRect } = useDrawing()
setStyle({ color: '#f43f5e', width: 4, stroke: 'dashed' })
```

`currentStyle` is the selection's **common denominator** (a heterogeneous field is
absent), otherwise the tool's defaults.

### Steps (`presets`)

These are product choices, not constants: the density of a cadastral plan does not call
for the same stroke widths as a tactical sketch.

```tsx
<Map draw={{ presets: { widths: [0, 1, 3, 6], fillOpacities: [0, 0.2, 0.5] } }} />
```

| Step set | Default |
|---|---|
| `widths` | `[0, 2, 4, 8, 14]` |
| `strokeOpacities` | `[0.25, 0.5, 0.75, 0.95]` |
| `fillOpacities` | `[0, 0.3, 0.6, 1]` |
| `radii` | `[0, 10, 25, 50]` |

### Per-tool settings (gear icon)

Each tool keeps its **own** defaults (colours, width, stroke, opacities, radius),
**persisted in localStorage**, with a live preview, per-tool or global reset, and a
shortcut summary.

```tsx
<Map draw={{ settingsStorage: 'none' }} />                        // no persistence
<Map draw={{ settingsStorageKey: 'm3d:draw-settings:map-b' }} />  // two maps coexist
```

Default key: `m3d:draw-settings`. **Give each map its own as soon as two maps coexist
on the same origin** — without a distinct key, the last one to change a setting imposes
it on the other. Same precaution as `positionStorageKey` and `tagStorageKey`.

Effective resolution of a setting: `base (theme/props) < tool specifics < user
overrides`. The measure tool, for example, has its own thin width and opacity — it is a
dimension line, not a drawing stroke.

Reactive read: `useDrawSettings()`.

---

## 6. History

Full undo/redo covering **creation, editing, style, deletion, duplication**.

| Shortcut | Action |
|---|---|
| `⌘Z` / `Ctrl+Z` | undo |
| `⌘⇧Z` / `Ctrl+Y` | redo |
| `⌘A` | select all |
| `⌘D` | duplicate |
| `Delete` / `⌫` | delete |

Per-shape events (`onShapeAdd/Update/Delete`) are **also emitted by undo/redo**,
derived by difference: your backend stays in sync with the map.

> Every gesture pushes a snapshot of the collection into the history, which **clones**
> it (`structuredClone`). `meta` values must therefore be serialisable — a function, a
> `Symbol` or a DOM node would make the clone fail, and with it the gesture. Store an
> identifier, not a callback or a live instance.

---

## 7. The shape, as the application sees it

```ts
type DrawnShape = {
  id: string
  kind: DrawTool
  title?: string          // human-readable name — indexed by search
  points: LatLng[]
  closed: boolean
  style: DrawStyle        // { color, fillColor, width, fillOpacity, strokeOpacity, stroke, radius }
  tags: string[]          // default ['draw', kind] — ['symbol', key] for a symbol
  locked?: boolean
  meta?: ShapeMeta        // Record<string, unknown> — YOUR model, opaque to the library
  symbol?: { key: string; variant?: string }   // kind: 'symbol' only
}
```

This is the **exchange currency** of events and CRUD. The internal `Drawing` type stays
flat for rendering; you never see it.

**Stable identity**: a shape's `id` **survives the export → import round trip**
(`Feature.id`, a standard GeoJSON field).

**Business metadata**: `meta` is carried through end to end, never interpreted or
rendered. That is where your model lives (database uuid, groups, active flag…).

---

## 8. Events: two styles that coexist

| Event | When | Payload |
|---|---|---|
| `onChange` | after every mutation, **coalesced to 1×/frame** | the whole collection as GeoJSON |
| `onShapeAdd` / `onShapeUpdate` / `onShapeDelete` | **at the moment** of the change | one `DrawnShape` |
| `onShapeEdit` | **double-click** on a shape | one `DrawnShape` — *nothing changed* |
| `onSelectionChange` | selection change | `(ids, markerIds)` |
| `onReject` | shape refused by the constraints | `(reason, shape)` |

`onChange` serves a **controlled global state**; `onShape*` serves **CRUD by identity**
(one mutation per shape). `onShapeEdit` is an **intent** to open a sheet host-side, not
a mutation.

```tsx
<DrawLayer
  onShapeAdd={async (s) => {
    const { uuid } = await createZone(s)
    api.updateShape(s.id, { meta: { uuid } }, { silent: true })   // ⚠️ silent
  }}
  onShapeEdit={(s) => openSheet(s.meta?.uuid)}
/>
```

---

## 9. CRUD by identity

```ts
const api = useDrawing()   // or map.current?.drawing

api.getShapes()                              // DrawnShape[]
api.getShape(id)                             // DrawnShape | null
api.getLastShape()                           // the one just drawn
api.addShape(shape, opts?)                   // → id (your uuid if you provide one)
api.updateShape(id, patch, opts?)            // → boolean
api.removeShape(id, opts?)                   // → boolean
api.replaceShapes(shapes, opts?)             // events emitted BY DIFFERENCE
api.lock(ids) / api.unlock(ids)
api.toGeoJSON() / api.fromGeoJSON(fc)        // wholesale replacement
```

**`{ silent: true }` suppresses *every* event emission** (granular **and**
`onChange`): indispensable to re-inject a response from your backend without
re-triggering the mutation that just produced it.

In a patch, `style` is **merged field by field** but `meta` is **replaced**:

```ts
api.updateShape(id, { meta: { ...api.getShape(id)?.meta, uuid } })
```

`title: ''` removes the name.

`replaceShapes` emits by difference, where `fromGeoJSON` replaces wholesale.

---

## 10. GeoJSON

```tsx
<DrawLayer value={controlledCollection} onChange={(fc) => persist(fc)} />
```

`value` is authoritative over the drawing (controlled import, not undoable).

Per-feature properties: `kind`, `title`, `color` (stroke), `fillColor`, `width` (px,
`0` = no stroke), `fillOpacity`, `strokeOpacity`, `stroke`, `radius`, `locked`, `tags`,
`meta`, `symbol`. Every feature carries its standard `id`.

Geometries: `LineString` (open shapes), `Polygon` (closed), `Point` (symbols).

Older files, without the recent fields, load as-is.

---

## 11. Locked shapes

A `locked: true` shape — the area boundary imposed by your API — is **untouchable in
the UI**: no selection, no editing, no eraser, no “Clear all”. Clicking it flashes a
padlock.

**Undo/redo preserves it**: `Ctrl+Z` neither deletes nor unlocks it. Only
`fromGeoJSON` / `value` and `api.lock` / `api.unlock` change it — unlocking is reserved
for host code.

---

## 12. Business constraints

```tsx
<Map
  draw={{
    constraints: { limits: allowedPerimeters, maxAreaM2: 10_000_000 },
    onReject: (reason, shape) => toast(reason === 'outOfLimits' ? 'Outside the area' : 'Too large'),
  }}
/>
```

| Constraint | Rule |
|---|---|
| `limits: ShapeData[]` | the shape must fit entirely within **at least one** perimeter |
| `maxAreaM2` | maximum area of a **closed** shape (open lines are not affected) |

- A refused **creation** leaves no trace: no mesh, no history entry, no `onChange`.
- A refused **edit** restores the shape to its pre-gesture state rather than losing it —
  and therefore does not emit `onShapeUpdate`.
- `onReject` lets you display **your** message: the library displays nothing itself.
- `limits` **draws nothing**: display your perimeters with `<ShapeLayer>` or as locked
  shapes.
- Only **user gestures** are constrained. `addShape`, `updateShape` and `fromGeoJSON`
  inject without checks: when the application injects a shape it knows what it is
  doing, and silently rejecting its data would be worse than anything.

The predicates are exported and geodesic — see
[ZONES.md § 7](ZONES.md#7-geodesic-predicates).

---

## 13. Tags and the “Layers” filter

Drawn shapes are tagged automatically: `['draw', <kind>]`, and
`['symbol', <catalogue key>]` for a symbol. In the “Layers” panel, the user wants to
filter “hospitals”, not “symbols” as a block.

Unlike markers, a drawing hidden by the filter **simply toggles its visibility** — no
geometry is rebuilt.

`tags` is patchable (`updateShape(id, { tags: [...] })`).

---

## 14. Shortcuts

**Tools** are picked with bare letters, identical on Mac and PC; **editing actions**
use the platform modifier (⌘ on Mac, Ctrl elsewhere) with targeted `preventDefault`.
All of them appear in tooltips and are ignored while typing.

```tsx
<Map draw={{ shortcuts: { selectLasso: 'q', rect: false } }} />   // remap / disable
```

Defaults (`config.interaction.shortcuts.draw` and `.edit`):

| | |
|---|---|
| `V` `1` `2` `3` | select, rectangle, polygon, lasso |
| `L` `P` `R` `C` `H` `A` `M` `E` `Y` | line, polygon, rect, circle, freehand (`H`), arrow, measure, eraser, symbols |
| `Enter` | close the polygon (drawing or marquee) |
| `Escape` | cascade: cancels the gesture in progress → marquee → deselects → navigation tool |

A remap is immediately reflected in the tooltips.

---

## 15. The toolbar (`<Toolbar>`)

```tsx
<Toolbar
  position="left"
  minZoom={12}                                   // below this, the bar slides off screen
  tools={['select', 'rect', 'circle']}
  selectModes={['rect', 'lasso']}
  components={{ settings: false, clear: false }} // hide / replace a section
  extraTools={<MyTool />}                        // your tools, in the bar's visual language
/>
```

Sections (`components`): `navigate`, `select`, `symbol`, `lens`, `stylePanel`,
`settings`, `undo`, `redo`, `clear`. `false` hides, a `ReactNode` replaces.

**A retracting bar releases everything it drives** and returns to the hand tool: a tool
left armed would keep intercepting gestures, so that zooming out would leave you
drawing shapes on a map where no button lets you stop.

### Putting your own tool in the bar

```tsx
const bar = useToolbar()
const [open, setOpen] = useState(false)

useCloseWhenHidden(bar.retracted || bar.nativeActive, setOpen)   // close itself

<ToolButton
  icon={mdiChartBox}
  label="Statistics"
  active={open}
  onClick={() => { if (!open) bar.claim(); setOpen(!open) }}      // turn the others off
/>
```

Without this, two buttons stay lit and the bar no longer tells you where you are.
`ToolbarApi` = `{ retracted, nativeActive, claim() }`.

---

## 16. `DrawingApi` — the reference

Obtained via `useDrawing()` (throws outside a `<DrawLayer>`) or via
`map.current?.drawing` (`null` when `draw={false}`).

| Group | Members |
|---|---|
| Tool | `tool`, `setTool`, `tools`, `shortcuts` |
| Selection | `selectMode`, `setSelectMode`, `selection`, `markerSelection`, `selectionDetails`, `select`, `deselectMarkers`, `clearSelection`, `selectAll`, `deleteSelection`, `duplicateSelection`, `selectionHasRect` |
| Style | `setStyle`, `currentStyle`, `settings` |
| Lock | `lock`, `unlock` |
| History | `undo`, `redo`, `canUndo`, `canRedo`, `clear` |
| Serialisation | `toGeoJSON`, `fromGeoJSON` |
| CRUD | `getShapes`, `getShape`, `getLastShape`, `addShape`, `updateShape`, `removeShape`, `replaceShapes` |
| Symbols | `symbols` — see [SYMBOLS.md](SYMBOLS.md) |

---

## 17. Recipes

**Draw programmatically, without the user**

```ts
const id = api.addShape({
  kind: 'circle',
  points: [centre, edge],
  style: { color: '#22c55e', fillOpacity: 0.2 },
  meta: { uuid },
})
```

**Display the API's perimeters as untouchable shapes**

```ts
api.replaceShapes(perimeters.map((p) => ({ ...p, locked: true })), { silent: true })
```

**Open a sheet on double-click** — `onShapeEdit={(s) => open(s.meta?.uuid)}`.

**Two maps in the same app** — give each its own keys: `settingsStorageKey`,
`tagStorageKey`, `positionStorageKey`.

---

## See also

- [ZONES.md](ZONES.md) — data zones, extrusion, predicates
- [SYMBOLS.md](SYMBOLS.md) — catalogue icons placed by drag-and-drop
- [MARKERS.md](MARKERS.md) — marker multi-selection
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [THEME.md](THEME.md) · [LABELS.md](LABELS.md)

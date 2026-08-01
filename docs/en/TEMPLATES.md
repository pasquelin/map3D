# Templates — full guide

[Français](../fr/TEMPLATES.md) · **English** · [↑ Index](README.md)

A **template** is a **named save of the drawing**: shapes, freehand strokes and
MIL-STD-2525D symbols. It contains **no zones, no markers, no paths, no links** — only
what the user drew. The content is the drawing layer's `GeoJSONFeatureCollection` (see
[DRAWING.md](DRAWING.md)), filterable by category.

The manager lives **in the controls bar, under “Layers”** (same structure). Storage is
**localStorage by default**, overridable by an **external API**: as soon as a
`TemplateProvider` is wired in, its list **takes precedence** over the local cache
(templates may have been published by other users).

## 1. In two minutes

```tsx
import { Map } from 'map3d'

<Map draw templates />
```

`templates` mounts the button under “Layers”. It opens a panel to **save** the current
drawing (name + checked categories), **list** templates (preview thumbnail, stats,
editable name, delete), **update** them with the current drawing (overwrites the
existing content, with confirmation), **apply** them to the drawing (merge or
replace), and **export/import** a `.m3dt` file.

> The button lives in the controls bar, so `controls` must be enabled (the default).
> A template saves the drawing, so `draw` must be enabled.

## 2. What a template holds

The content is split by **category**, derived from each shape's `kind`:

| Category | `kind` | Included |
|----------|--------|----------|
| `shapes` | `line`, `polygon`, `rect`, `circle`, `arrow`, `measure` | ✅ |
| `freehand` | `freehand` | ✅ |
| `symbols` | `symbol` | ✅ |
| Zones (`ShapeLayer`), markers, paths, links | — | ❌ |

When saving, the **checkboxes** pick which categories are kept. The offered categories
and their default selection are configurable (see §5).

A **separate** checkbox, “View”, adds to the template the place you are looking from —
camera pose, basemap, visible layers. That is what tells a “Vernon” template apart from a
“Nice” one when both hold the same drawing. It is not one of the categories because a view
is not drawing: see §11.

Data type:

```ts
type Template = {
  id: string
  name: string
  content: { draw: GeoJSONFeatureCollection; view?: TemplateView }
  origin: 'local' | 'api'   // 'api' = served by the provider (may be readOnly)
  readOnly?: boolean
  author?: string
  createdAt?: number
  updatedAt?: number
  stats?: TemplateStats     // per-category counts, extent, size
}
```

## 3. Applying a template

Three modes (`ApplyMode`), chosen in the panel:

- **Merge** — adds the template's shapes to the current drawing. The operation is
  **idempotent by identity**: re-clicking the same template does not stack its shapes.
- **Replace** — replaces the current drawing with the template's.
- **Remove** — removes from the drawing the shapes coming from this template (the
  inverse of Merge).

`defaultApply` (config/prop) deliberately exposes only `merge`/`replace`: “remove” is a
one-off action, not a sensible default.

Applying goes through `fromGeoJSON` (the drawing's canonical import path: handles
symbols, closed polygons and locked shapes).

If the template holds a **view**, it is replayed on `merge` and `replace` — never on
`remove`: taking shapes away is no reason to move the map. A template with no shapes at
all still applies: only its view is replayed.

**Active “Layers” filter** — dropping a template while a tag filter hides part of the map
would add invisible shapes (their tags aren't checked). On `merge`/`replace`, applying
therefore **reveals** the placed shapes' tags: they are added to the filter selection so
the loaded template shows. The filter isn't created if it was inactive (nothing is hidden
then), and `remove` reveals nothing (it places no shapes).

## 4. Local storage vs API (the provider)

Without a provider everything is **local** and persisted to localStorage
(`config.data.storageKeys.templates`, default `m3d:templates`).

With a provider, **the API is authoritative**: its list is loaded on mount and
overwrites the view; mutations (save, rename, delete) go through it.

```tsx
import { Map, createHttpTemplateProvider } from 'map3d'

const provider = createHttpTemplateProvider() // reads config.providers.templates

<Map draw templates={{ provider }} config={{ providers: { templates: {
  baseUrl: 'https://my-api.example/templates',
  headers: { Authorization: 'Bearer …' },
} } }} />
```

The contract (to implement for a custom backend):

```ts
type TemplateProvider = {
  list(signal?): Promise<Template[]>
  save(template, signal?): Promise<Template>
  update(id, patch, signal?): Promise<Template>
  remove(id, signal?): Promise<void>
  setConfig?(config: TemplatesConfig): void
}
```

`createHttpTemplateProvider` ships a default REST implementation (`GET baseUrl`,
`POST baseUrl`, `PATCH baseUrl/:id`, `DELETE baseUrl/:id`) over `fetchWithPolicy`
(timeout + bounded retries).

`origin:'api'` templates may be marked `readOnly` (published by another user): they
are shown with a lock, and cannot be renamed or deleted locally.

## 5. Settings (`config.providers.templates`)

```ts
type TemplatesConfig = {
  baseUrl: string                         // '' = no API (local only)
  headers: Record<string, string>
  fetch: FetchPolicy                      // { timeoutMs, retries, backoffMs }
  categories: TemplateCategory[]          // categories offered when saving
  defaultCategories: TemplateCategory[]   // checked by default
  defaultApply: 'merge' | 'replace'       // default apply mode
  allowExport: boolean                    // .m3dt export/import
  saveView: boolean                       // offer the “View” checkbox
  defaultSaveView: boolean                // “View” checked upfront
  applyView: boolean                      // replay the view when loading
  viewFlyDuration: number                 // travel duration (s); 0 = instant
}
```

Every setting is overridable by a panel prop
(`<Map templates={{ categories, defaultApply, … }}>`). **Nothing is hardcoded.**

## 6. `.m3dt` file export / import

When `allowExport` is true, each row offers an export button (downloads a
self-contained JSON `{ format: 'm3dt', version, template }`) and the panel footer an
import button. An imported template is added to the **local** cache with a fresh id.

## 7. Events (non-React host)

The engine emits (see [ENGINE.md](ENGINE.md)):

```ts
engine.on('templatesave', (t) => …)             // created or renamed
engine.on('templateremove', ({ id }) => …)
engine.on('templateapply', ({ id, mode }) => …)
```

Mutations accept `{ silent: true }` (on `engine.templates`) to NOT re-emit —
essential when the host re-injects what it just received from its backend, to avoid an
echo.

## 8. `useTemplates` hook

To drive the manager from your own components:

```ts
const t = useTemplates({ provider })
t.templates            // reactive list
t.saveCurrent(name, ['shapes', 'symbols'], { view: true })  // { view } is optional
t.saveCurrent('Vernon', [], { view: true })                 // view only, no drawing
t.updateFromDrawing(id, { view: true })   // overwrites an existing template's content
t.apply(id, 'merge')
t.rename(id, name); t.remove(id)
t.exportFile(id); t.importFile(file)
t.refresh()            // reload from the provider
```

## 9. Internationalization

No text is hardcoded: everything comes from `labels.templates.*` (title, actions,
categories, stats). Provide your own strings via `<MapProvider labels>` / `<Map labels>`
for any language. See [LABELS.md](LABELS.md).

## 10. `engine.templates` registry

The engine owns the registry (`engine.templates`, a `TemplateRegistry`), like
`engine.tags` for the “Layers” filter. The drawing layer wires a **`drawPort`**
(`toGeoJSON`/`fromGeoJSON`) into it: that is what lets the button live in the controls
bar, outside the drawing's React context. See [ENGINE.md](ENGINE.md) for
engine-owned registries.

## 11. Saved view

A template can hold the **view** its drawing is looked at from. That is what gives you one
template per site — “Vernon”, “Nice” — rather than a drawing with no place.

```ts
type TemplateView = {
  lat: number; lng: number; altitude: number   // ground point UNDER THE EYE, and height
  heading: number                              // bearing (rad), 0 = north, positive eastwards
  tilt: number                                 // tilt (rad), 0 = nadir, π/2 = horizon
  mapMode: '3d' | 'plan'
  traffic: boolean
  tags?: readonly string[]                     // “Layers” filter — tag NAMES
  pedestrian?: TemplatePedestrianView          // standing point + gaze + immersion
}
```

**Usage only.** No data goes in: no marker, no zone, no path. The `tags` are names, not
the items they designate.

**Nothing derived is stored** — no zoom, no extent: altitude and pose give them back,
whereas a frozen copy would drift as soon as the container is resized. Same for the ground
height under the pedestrian, re-measured on arrival.

### Degradation

A view taken on a better-equipped map stays loadable; each setting degrades on its own,
without failing the others:

| Situation | Effect |
|-----------|--------|
| `plan` mode with no servable 2D basemap (or `3d` with no volume) | mode unchanged |
| `traffic: true` outside the layer's conditions | traffic ignored |
| View taken in 3D, reloaded in `plan` | tilt **clamped** to the mode's limit |
| Saved tag absent from the map | it filters, but stays **uncheckable** (listed at count 0) |
| Pedestrian view, ground not streamed yet or volume unavailable | camera pose stands: same place, same bearing |

### Outside the panel

`captureView` / `applyView` are exported for hosts managing their own views — a “back to
here” button, a default view on mount:

```ts
import { captureView, applyView } from 'map3d'

const view = captureView(engine)                    // store it wherever you like
applyView(engine, view, { duration: 1.2 })          // 0 or omitted = instant
```

`applyView`'s internal order is not cosmetic: taking control comes first (otherwise the
intro flight grabs the camera back), the basemap mode precedes the pose (it is what sets
the tilt limit), leaving pedestrian mode precedes the pose (otherwise the controller
overwrites it on the next frame), and entering pedestrian mode comes last (its standing
point is validated by raycast, so you must have arrived).

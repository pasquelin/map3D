# Symbols — complete guide

[Français](../fr/SYMBOLS.md) · **English** · [↑ Index](README.md)

**Catalogue icons** are placed on the terrain by dragging them from a palette, then
become movable, selectable, tag-filterable and persistable — the same guarantees as
drawing shapes, applied to points.

**There is no layer to mount.** A placed symbol is a shape of the drawing collection
(`kind: 'symbol'`): `<DrawLayer>` carries the whole thing, and the symbol inherits
undo/redo, GeoJSON and per-shape events without anything being duplicated.

---

## 1. Out of the box

The **MIL-STD-2525D** symbology ships with the library and is **enabled by default**:

```tsx
<Map center={PARIS} zoom={15} draw={{}} toolbar={{}} />
{/* “Symbols” button in the bar, key Y, MIL-STD catalogue */}
```

To disable the tool: `draw={{ symbols: { enabled: false } }}`.

---

## 2. Artwork is injected

The layer only knows **catalogue keys**, never a symbology format. Same pattern as the
search and routing providers: a catalogue can change its artwork without invalidating
already-stored data.

```ts
type SymbolCatalog = {
  id: string                                  // e.g. 'mil-std-2525d' — recorded in the GeoJSON
  entries: SymbolEntry[]
  variantColors?: Record<string, string>      // { friendly: '#00A8FF', … }
}

type SymbolEntry = {
  key: string            // STABLE identifier — this is what gets stored
  label: string
  category: string       // grouping bucket in the palette (free-form string)
  description?: string
  keywords?: string[]    // extra terms for the palette's search
  multiPoint?: boolean   // tactical graphic (perimeter, axis, area)
  minPoints?: number
  color?: string
  minZoom?: number       // appearance threshold of the PLACED symbol (see § 6)
  tags?: string[]        // default ['symbol', category]
}

type SymbolRenderer = {
  render: (key: string, opts?: { size?: number; variant?: string }) => RenderedSymbol | null
  ready?: Promise<void>
}
```

```tsx
const catalog: SymbolCatalog = {
  id: 'my-catalogue',
  entries: [
    { key: 'commandPost', label: 'Command post', category: 'installations' },
    { key: 'hospital',    label: 'Hospital', category: 'installations', minZoom: 9 },
  ],
}

const renderer: SymbolRenderer = {
  ready: loadMySdk(),
  render: (key, { size, variant } = {}) => ({ size: size ?? 40, svg: svgAnchoredAtCentre(key, variant) }),
}

<Map draw={{ symbols: { catalog, renderer } }} />
```

`render` is **synchronous** (called on every React render): memoise on the provider
side. Loading of any SDK goes through `ready`, after which the layer re-renders;
`render` may return `null` until then, and the layer shows a discreet placeholder.

> ### ⚠️ The SVG must be anchored at the **centre of its viewBox**
>
> This is a requirement, not a convenience. MIL-STD symbols have an internal anchor
> point that is not the centre of the image — a command post hangs below its mast.
> Rendering the raw SVG would offset the symbol by several pixels relative to the
> terrain. **Recentring the viewBox on the anchor is the provider's responsibility**;
> the layer merely places the centre of the image on the coordinate.

Rendering corollary: a symbol is placed **without a leader line**
(`leaderLine={false}`) — its artwork carries its own anchor point.

---

## 3. The bundled MIL-STD-2525D symbology

```tsx
import { MILSYM_CATALOG, createMilSymRenderer } from 'map3d'

const renderer = useMemo(() => createMilSymRenderer({ affiliation: 'friendly' }), [])

<Map draw={{ symbols: { renderer } }} />   // `catalog` defaults to MILSYM_CATALOG
```

`MILSYM_CATALOG` covers **91 entries** across 7 categories — 80 point icons
(`installations`, `units`, `equipment`, `air`, `events`, `control`) and 11 multi-point
tactical graphics — with labels and descriptions **in French**.

A symbol's `variant` is its **affiliation**: `friendly`, `hostile`, `neutral`,
`unknown`. Identification colours in `MILSYM_AFFILIATION_COLORS`.

**Weight and loading.** The `@armyc2.c5isr.renderer/mil-sym-ts-web` SDK weighs ~9 MB.
It is loaded through a **dynamic import**, isolated in a chunk that only a map
displaying symbols downloads — and never on the mere mount of `<DrawLayer>`: loading is
triggered by opening the palette or by the presence of a placed symbol. `render` stays
synchronous and serves from a cache keyed by SIDC + size.

### ⚠️ The SIDC pitfall

The affiliation is the **4th** digit of a 2525D SIDC, not the 3rd — that one carries
the *context* (0 reality, 1 exercise, 2 simulation).

Writing it in 3rd position produces a non-standard context symbol: decorated artwork,
different dimensions and a **different anchor point** (≈ 5 px of vertical offset
measured), while the affiliation stays the catalogue's own. map3d's `applyAffiliation`
writes in the right place; operator's `applySidcAffiliation` does not — a point to fix
during the migration.

```ts
applyAffiliation(sidc, 'hostile')   // → sidc.substring(0,3) + '6' + sidc.substring(4)
milSymSidc(key, affiliation)        // final SIDC of a catalogue entry
```

---

## 4. The palette

The button that opens the palette is a **native tool of the bar** (like the lens):
`<Toolbar>` renders it itself, `components={{ symbol: false }}` hides it.

```tsx
<DrawLayer>
  <Toolbar />
</DrawLayer>
```

The catalogue, the affiliation and the labels come from `<DrawLayer>`'s context: **the
palette takes no configuration at all**.

The panel reuses the visual language of “Layers” — search, counters, panel docked on
the side opposite the bar, closing on outside click or `Escape` — and adds a grid per
category. A badge on the button counts the symbols present on the map.

Every thumbnail is rendered by the `SymbolRenderer` **in the current affiliation**:
changing affiliation redraws the whole palette, and the placed symbol inherits the
variant on display.

Usage details, and why:

- The grab is **immediate** on a thumbnail (`longPressMs: 0`) — a palette has no click
  to preserve, unlike a marker whose click opens a sheet.
- `multiPoint` entries are **listed but greyed out** rather than hidden, so the
  catalogue does not look incomplete. They are **ignored on drop**: they are placed by
  collecting successive points, a mode that is not implemented yet.
- The panel is only mounted while open: closed, it never calls the renderer.

The texts (button, categories, affiliations) do not go through the catalogue: they live
in `labels.symbols` — see [LABELS.md](LABELS.md).

---

## 5. Placing, moving, persisting

Placing a new icon and moving an existing one are **the same gesture** on the same zone
(`useMapDropZone`): only the origin of the payload differs.

```ts
const { symbols } = useDrawing()

symbols.enabled              // false when the tool is disabled
symbols.catalog              // current catalogue
symbols.render(key, opts?)   // thumbnail — null until the artwork is loaded
symbols.ready                // false while the renderer is loading
symbols.affiliation          // variant applied to placements
symbols.setAffiliation(v)
symbols.paletteOpen          // published by the button, never read back by it
symbols.setPaletteOpen(open)
symbols.place(key, at, variant?)   // places a symbol → id, or null
```

The rest is the shapes' CRUD: `addShape`, `updateShape`, `removeShape`, `undo`/`redo`,
`toGeoJSON`… symbols included.

The events are the drawing layer's — a symbol is recognisable by
`kind === 'symbol'`, and its catalogue entry by `symbol.key`:

```tsx
<Map
  draw={{
    onShapeAdd: (s) => (s.kind === 'symbol' ? createSymbol(s.symbol!.key, s.points[0]) : createZone(s)),
    onShapeUpdate: (s) => save(s.meta?.uuid, s),
    onShapeDelete: (s) => remove(s.meta?.uuid),
  }}
/>
```

---

## 6. What a symbol inherits

Rendering goes through `<MarkerLayer>`: a point symbol **is** an icon point, so it
inherits projection, node pooling, culling, marquee/lasso selection and the “Layers”
filter without reimplementing any of them.

| Trait | Behaviour |
|---|---|
| **Tags** | `['symbol', <category>]` by default, or `entry.tags` — alongside `['draw', <tool>]` and `['marker', <type>]`. In “Layers”, you filter “hospitals”, not “symbols” as a block. |
| **Zoom threshold** | A placed symbol is **scenery** (`MarkerData.static`): it disappears below a threshold. Cascade: `entry.minZoom` → `<DrawLayer symbols={{ minZoom }}>` → `config.markers.staticMinZoom`. ⚠️ `MILSYM_CATALOG` declares **no** `entry.minZoom`: its 91 entries follow the layer's threshold. A per-kind horizon requires your own catalogue. |
| **List icon** | `MarkerData.icon` is filled in automatically: for a symbol, the artwork **is** the identity — a colour chip would say nothing about what is on the map. |
| **Grouping** | Symbols take part in the **map's** grouping, alongside the application's markers: one chip can mix them. `draw.symbols.cluster = { enabled: false }` takes them out; the chips' appearance lives on `<Map cluster>`. |
| **Search** | through the shape's name, group `draw` — see [SEARCH.md](SEARCH.md). |
| **History / GeoJSON** | the shapes' own; `symbol: { key, variant }` survives the round trip. |

Manual rendering: `<SymbolMarkers>` is exported (mounted by `<DrawLayer>`) for a custom
presentation — the state itself stays in the drawing collection.

---

## 7. Recipes

**A minimal domain catalogue, without MIL-STD**

```tsx
<Map draw={{ symbols: { catalog: myCatalogue, renderer: myRenderer } }} />
```

The MIL-STD SDK is then never loaded: it only ships with `createMilSymRenderer`.

**Force the affiliation at mount** —
`createMilSymRenderer({ affiliation: 'friendly' })`, then `symbols.setAffiliation(v)`
afterwards.

**Place from your own UI**

```ts
const { symbols } = useDrawing()
symbols.place('hospital', { lat, lng })
```

**Receive a drop elsewhere on the map** — `useMapDropZone({ accept, onDrop })`, which
yields the targeted lat/lng via ellipsoid raycast (accurate in a tilted view as in 2D).

---

## See also

- [DRAWING.md](DRAWING.md) — the collection, events, CRUD, GeoJSON
- [MARKERS.md](MARKERS.md) — `static`, tags, culling, selection
- [LABELS.md](LABELS.md) — `labels.symbols`

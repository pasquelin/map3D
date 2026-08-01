# Lens — X-ray of the markers in an area

[Français](../fr/LENS.md) · **English** · [↑ Index](README.md)

A **read-only** tool: you drag a rectangular area on screen, and a panel inventories
**every marker it covers — including those aggregated inside a cluster**.

The map itself does not move: nothing is selected, no cluster is burst open, no shape is
created. So nothing lands in the GeoJSON, the undo/redo history or the style panel.

---

## 1. It is already there

The lens is **mounted by the map and enabled by default** — like the Symbols tool,
there is nothing to assemble:

```tsx
<Map center={PARIS} zoom={14} layers={[markersLayer({ points: markers })]} draw={{}} toolbar={{}} />
{/* button in the bar, key X */}
```

`toolbar.lens` only serves to **configure** it — everything is optional:

```tsx
<Map
  toolbar={{
    lens: {
      renderItem: (m) => m.data?.name ?? m.id,   // default: type chip + avatar + id
      actions: SHEET_ACTIONS,                     // in addition to the native “Target”
      menu: (m) => MENU(m),                       // takes precedence over `actions`
      markerTypeLabel: (t) => LABELS[t] ?? t,     // per-type summary in the header
      getId: (m) => m.id,
      shortcut: 'x',                              // `null` = none
      targetZoom: 17,
    },
  }}
/>
```

`toolbar={{ lens: false }}` removes it **entirely** — no button, no shortcut, no layer.
**`toolbar={false}` removes it too**: without a bar there is no button, and keeping the
tool reachable by shortcut alone would be an invisible half-measure. A map that wants
the lens without the bar mounts `<LensLayer>` itself (see § 5).

---

## 2. Interaction

While the tool is active:

| Gesture | Effect |
|---|---|
| drag on the map | draws the area; **drawing again replaces** the existing one |
| single click | clears the area |
| handles | move / resize the area (the list recomputes) |
| cross | removes the area |
| wheel | zooms the map |
| `Space` held | camera pan (`Space+Shift` = rotation), as for drawing |
| `Escape` | removes the area, then leaves the tool |

A drag shorter than `config.interaction.lens.minDragPx` counts as a **click**: it must
create nothing. Resizing by a handle keeps a guaranteed minimum side
(`config.interaction.lens.minSizePx`): no flipping over.

The lens is a **fixed screen overlay**: the list **recomputes live** as the map scrolls
underneath it.

**The lens and the drawing tools are mutually exclusive** — they share the same pointer
interceptor. Exclusivity is carried by `<DrawLayer>`, mounted *below* the lens layer:
the lens therefore knows nothing about drawing, and works on a map that has none.

---

## 3. The inventory

The panel reuses the `<MarkerList>` of the selection panel: one row per marker, a fixed
header with the **per-type count**, a scrollable body, a cross per row, an extensible
actions menu.

What it sees, precisely: **every** marker whose position falls inside the box, read from
the **source data** through the `engine.markers` registry — clusters included, and after
the “Layers” filter.

The screen → geo conversion happens in two steps: the rectangle's corners are picked to
obtain a coarse geographic box (falling back to the whole world if the view looks at the
sky), then every candidate marker is reprojected to screen for the final test. Each
marker is projected at the **ground height beneath it**, not at the height of the area's
centre: otherwise, on uneven terrain, the screen offset would produce false positives
and false negatives near the edges.

A row's menu follows the general rule: `toolbar.lens.menu`, otherwise
`<Map markerMenu>`, otherwise `actions`. **“Target” is added at the top by the list** —
do not add it again.

The panel anchors by default to the **right** of the area (width
`theme.sizing.lensPanelW`), and switches to the **left** when the right side does not
fit inside the container. It stays **draggable** by its grip and clamped to the screen
wherever it is dropped.

---

## 4. Driving the lens from your own UI

```ts
const lens = useLens()   // anywhere under <Map>

lens.active        // the tool is armed (or an area already exists)
lens.activate()
lens.deactivate()
lens.toggle()
lens.shortcut      // the letter shown in the tooltip, or null
```

Or through the imperative handle: `map.current?.lens` (`null` when the lens is
removed).

The toolbar button is a **native `<Toolbar>` tool**, hideable via
`components={{ lens: false }}` — hiding it leaves the tool reachable by shortcut, where
`toolbar={{ lens: false }}` removes it altogether.

---

## 5. Manual mounting

`<LensLayer>`, `<LensToolButton>` and `<LensPanel>` are exported for a custom bar or a
panel reused elsewhere.

```tsx
<Map toolbar={{ lens: false }}>   {/* otherwise two lenses: two shortcuts, two areas */}
  <LensLayer shortcut="x">
    …
  </LensLayer>
</Map>
```

Useful types: `LensOptions`, `LensLayerProps`, `LensPanelProps`, `LensRenderItem`,
`LensRect` (a rectangle in **container pixels**, not client pixels).

---

## See also

- [MARKERS.md](MARKERS.md) — `engine.markers`, `<MarkerList>`, shared menus
- [DRAWING.md](DRAWING.md) — exclusivity with the drawing tools
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [LABELS.md](LABELS.md)

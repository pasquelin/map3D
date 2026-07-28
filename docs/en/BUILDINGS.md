# Selecting a building

[Français](../fr/BUILDINGS.md) · **English** · [↑ Index](README.md)

When the map shows the **internal volume** (buildings extruded from vector tiles, see
[TILES § 5](TILES.md#5-internal-volume--extruded-buildings)), a toolbar tool lets you
**pick a single building**: it highlights on hover, and clicking opens a menu that **your
application composes**.

```tsx
<Map
  center={PARIS}
  zoom={17}
  config={{ providers: { tiles3d: { provider: 'internal' } } }}
  buildingMenu={(info) => [
    { label: 'Height', hint: `${Math.round(info.height)} m`, disabled: true },
    { label: 'Open record', onSelect: () => openRecord(info.featureId) },
  ]}
/>
```

The library writes **no text** into that menu, not even a title: it does not know what a
building means to you.

---

## 1. What the tool does

| Gesture | Effect |
| --- | --- |
| Toolbar button, or `U` | arms or leaves the tool; the canvas cursor becomes a crosshair |
| Hover | the targeted building takes `theme.globe.buildingHoverColor` |
| **Clean** click | opens the `buildingMenu` menu, at the cursor |
| Menu open | the building keeps `theme.globe.buildingSelectColor` **for as long as it is** |
| Drag | pans the map as usual — no menu opens |
| Escape, wheel, click outside | closes the menu |

**Camera navigation stays whole.** The tool intercepts nothing: it reads the same pointer
events as the map and only keeps the clean click, the one whose movement stays under
`interaction.cleanClickPx`. You can orbit a neighbourhood without leaving the tool.

There is **no persistent selection**: the highlight is tied to the open menu and goes away
with it. A lasting selection belongs to the application, which holds it in its own state
from what the menu tells it.

## 2. When the button appears

The button exists **only** when there are internal buildings to pick. That is the
`canPickBuildings` capability of the basemap state, true when all three hold:

- the map mode is `'3d'`;
- `providers.tiles3d.provider` is `'internal'`;
- the internal server actually serves buildings (origin set, vector tile template set).

Switching to plan, or back to the photorealistic volume, **disarms the tool by itself** and
restores its cursor: there is nothing left under the pointer to pick.

> **The external photorealistic volume is out of reach**, and will stay so: Google's 3D
> tiles are a **merged** textured mesh, in which no building is distinct from another.
> There is nothing there to select — this is not a limitation of the library.

Like every toolbar button, it can be hidden at the fine grain, and its shortcut goes with
it:

```tsx
<Map controls={{ buttons: { selectBuilding: false } }} />
```

## 3. `buildingMenu` — the contract

`buildingMenu` receives the clicked building and returns [`MenuItem`](MARKERS.md)s, exactly
like `markerMenu`: information rows (`disabled: true` makes them inert), actions,
separators, submenus.

```tsx
import type { BuildingInfo, MenuItem } from 'map3d'

function buildingMenu(info: BuildingInfo): MenuItem[] {
  const coord = `${info.lat.toFixed(5)}, ${info.lng.toFixed(5)}`
  return [
    { label: 'Id', hint: info.featureId ?? '—', disabled: true },
    { label: 'Coordinate', hint: coord, disabled: true },
    { label: 'Height', hint: `${Math.round(info.height)} m`, disabled: true },
    { separator: true },
    { label: 'Copy coordinate', onSelect: () => navigator.clipboard.writeText(coord) },
  ]
}
```

Without this prop the tool still works — it highlights on hover — but clicking opens
nothing: the library would have nothing to put in that menu. A menu returning an **empty**
array does not open either: an empty panel on click would be worse than no menu at all.

The function is called **on open**, not on every render: it can read your application's
state at click time without the map having to depend on it.

## 4. `BuildingInfo`

| Field | Type | Contents |
| --- | --- | --- |
| `featureId` | `number \| null` | the vector tile's `feature.id`; `null` when the data carried none |
| `lat` / `lng` | `number` | the **point clicked on the volume**, not the footprint's centre |
| `height` | `number` | total height of the footprint (m above ground) |
| `minHeight` | `number` | base height — non-zero for a porch, for stilts |
| `props` | `Record<string, unknown>` | MVT attributes requested through `pickFields`; empty otherwise (§ 5) |

> **A "building" is a FOOTPRINT, not a feature.** One MVT feature may carry several (two
> wings of the same block), and they then share the same `featureId`. Each hovers and picks
> separately; the id does not tell them apart.

## 5. Bringing back attributes from the data

By default `info.props` is **empty**. This is not an oversight: a dense tile carries
several thousand footprints, each with dozens of attributes — carrying them all would cost
more than the geometry itself.

Name what you display:

```tsx
config={{ providers: { buildings: { pickFields: ['name', 'class'] } } }}
```

Those attributes then cross the extrusion worker for every footprint and land in
`info.props`. The others are never read. `height`, `minHeight`, `featureId` and the
coordinate are there regardless — they cost nothing, the geometry already carried them.

⚠️ Changing `pickFields` **rebuilds already-extruded tiles**: it is a startup setting, not
a switch to flip mid-session.

## 6. Settings

| Setting | Default | Role |
| --- | --- | --- |
| `providers.buildings.pickFields` | `[]` | MVT attributes surfaced in `info.props` (§ 5) |
| `interaction.buildingPick.cursor` | `'crosshair'` | canvas cursor while armed — a **system** cursor |
| `interaction.shortcuts.controls.selectBuilding` | `'u'` | toggle shortcut; `false` removes it |
| `interaction.cleanClickPx` | — | shared with the map click: beyond it, the gesture is a drag |
| `theme.globe.buildingHoverColor` | `'#F2B441'` | hovered building's tint |
| `theme.globe.buildingSelectColor` | `'#E8613C'` | tint of the building whose menu is open |
| `labels.controls.selectBuilding` | `'Sélectionner un bâtiment'` | button label and tooltip |

Both tints **replace** the footprint's vertex colours, shading included — that is what
makes one building stand out of a whole neighbourhood. They are read when the map mounts,
like the other volume colours: changing the theme does not repaint a highlight in progress.

## 7. What it costs

Nothing while the tool is not armed: no ray is cast, and a tile's building table holds one
entry per footprint — not one per vertex.

Once armed, each pointer move costs **one** ray cast against the bounding-volume tree the
tile already carries (~0.015 ms), and the highlight rewrites an **already allocated** range
of colours: nothing enters or leaves the scene, and nothing is allocated in the frame loop.

## See also

- [Tiles](TILES.md) — where the volume comes from, and how to set the internal server
- [Markers](MARKERS.md) — `markerMenu`, whose contract `buildingMenu` mirrors
- [`MapConfig`](CONFIG.md) · [`MapTheme`](THEME.md) · [`MapLabels`](LABELS.md) · [Props](PROPS.md)

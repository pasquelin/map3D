# Zones, shapes and paths — complete guide

[Français](../fr/ZONES.md) · **English** · [↑ Index](README.md)

A **zone** is a geometry placed on the globe and **draped over the terrain**: polygon,
rectangle, circle, line, arrow. It hugs the ground, its strokes have a width in
**screen pixels** (constant across zoom, as on any map), and it can become a **volume**
for tilted views.

Three paths lead to a zone, and they do not overlap:

| Path | Component | What for |
|---|---|---|
| **Data** — your zones, displayed as-is | `<ShapeLayer shapes>` | perimeters from the backend, sectors, isochrones. Rendering + search, **no interaction**. |
| **Drawing** — the user traces | `<DrawLayer>` | zones created, edited, selectable, undo/redo, GeoJSON. See [DRAWING.md](DRAWING.md). |
| **Constraint** — a perimeter that bounds drawing | `draw.constraints.limits` | “you may only draw inside these”. Draws nothing itself. |

The rest of this document covers the first path, the geometry it shares with the other
two, and paths (`<PathLayer>`), its open-ended cousin.

---

## 1. In two minutes

```tsx
import { Map, shapesLayer, type ShapeData } from 'map3d'

const zones: ShapeData[] = [
  { kind: 'circle',  id: 'z1', title: 'Perimeter A', center: PARIS, radiusMeters: 800 },
  { kind: 'polygon', id: 'z2', title: 'North sector', points: [...], color: '#f59e0b', fillOpacity: 0.18 },
  { kind: 'rect',    id: 'z3', bounds: { north, south, east, west }, extrudeHeight: 120 },
]

<Map center={PARIS} zoom={14} layers={[shapesLayer({ id: 'zones', shapes: zones })]} />
```

Equivalent manual mounting: `<Map><ShapeLayer shapes={zones} /></Map>`.

---

## 2. `ShapeData` — anatomy

```ts
type ShapeData = {
  // identity (optional, but see § 5)
  id?: string | number
  title?: string
  // style
  color?: string
  width?: number          // stroke width, in SCREEN PIXELS
  fillOpacity?: number
  extrudeHeight?: number  // metres above the ground → volume
} & (
  | { kind: 'polygon'; points: LatLng[] }
  | { kind: 'line';    points: LatLng[] }
  | { kind: 'arrow';   points: LatLng[] }
  | { kind: 'rect';    bounds: Bounds }
  | { kind: 'circle';  center: LatLng; radiusMeters: number }
)
```

### The five variants

| `kind` | Geometry | Closed | Fill | Extrusion |
|---|---|---|---|---|
| `polygon` | `points[]` | ✅ | ✅ | ✅ |
| `rect` | `bounds` (N/S/E/W) | ✅ | ✅ | ✅ |
| `circle` | `center` + `radiusMeters` | ✅ | ✅ | ✅ |
| `line` | `points[]` | ❌ | — | — |
| `arrow` | `points[]` (head at the last point) | ❌ | — | — |

A polygon is **implicitly closed**: do not repeat the first point at the end of the
list. A circle is polygonised at render time using
`config.performance.circleSegments` (default 64).

### Style

| Field | Default | Note |
|---|---|---|
| `color` | `theme.colors.zone.stroke` | used for the stroke **and** the fill |
| `width` | `6` | **screen pixels** — converted to metres at the current resolution, on every rebuild |
| `fillOpacity` | `0.22` | `0` = no fill (outline only) |
| `extrudeHeight` | `0` | see [§ 4](#4-volumetric-zones-extrudeheight) |

> `theme.colors.zone` declares both `fill` **and** `stroke`, but `<ShapeLayer>` only
> consumes `stroke`: the fill is that same colour, painted at `fillOpacity`. For two
> distinct tints, set `color` on the shape.

### Identity and name

`id` and `title` play **no** role in rendering — they exist to be found.

- `title` is the **human-readable name**, exactly like `MarkerData.title`: it is what
  search indexes and what lists display. Without it, a zone is findable by nobody.
- `id` identifies the zone in search results (falls back to `title`).

An **anonymous** zone renders normally, it is simply invisible to search —
“polygon-3” is not a useful result.

---

## 3. Draping

A shape is not stamped onto a theoretical sphere: it is built in a **local tangent
plane** (ENU frame) anchored to a terrain height resolved by raycast, then refined as
tiles stream in.

What that means in practice:

- **The outline hugs the terrain** — a perimeter on a hillside does not cut through the
  slope.
- **The shape is rebuilt** when the resolution changes enough (hysteresis band on the
  width in metres) or when the anchor height becomes more precise. This is not a
  per-frame recomputation.
- **While tiles are missing**, a fallback is used without being memoised: the window
  stays open until real resolution.
- **Draped shapes do not depth-test**: they draw on top of the terrain, so they stay
  readable in a hollow. **Volumes**, on the other hand, do depth-test (see § 4).
  Exception: in **pedestrian mode**, draped shapes depth-test too, so they stay
  occludable by buildings at eye level.

The protocol is shared (`DrapedLayer`) between zones, paths and relation links. A
custom layer projecting its own draped elements can reuse `AnchorHeightCache` instead
of rewriting its precautions (throttled raycasting, retries for missing tiles,
2D ↔ 3D invalidation).

---

## 4. Volumetric zones (`extrudeHeight`)

A zone is draped on the ground by default. `extrudeHeight` (metres **above ground**)
turns it into a volume — vertical walls plus a cap — for tilted views where a flat fill
reads poorly.

```tsx
<ShapeLayer shapes={[{ kind: 'polygon', points, color: '#f59e0b', fillOpacity: 0.18, extrudeHeight: 200 }]} />
```

**Anchoring.** The volume is mounted **in the same ENU frame as the draped surface**:
it inherits its anchor and its terrain height, already resolved and refined. It has no
position of its own, so it cannot drift from its base on pan.

**The bottom starts at the real ground, not at the zone's plane.** The terrain is
sampled along the outline (16 points, one raycast each, **at build time only**) and the
bottom of the walls goes below the lowest measured point, plus 8 m of burial to stay
underground between two samples. Without that, on descending terrain (a bank, a bridge,
a valley), the bottom of the walls would end up floating above the hollow — precisely
what the draped shape used to hide, since it draws over everything. Unknown terrain
(missing tiles) → falls back to the anchor plane; the drape will be rebuilt.

The **cap** stays flat, at `extrudeHeight` above the zone's reference ground.

**Edges replace the outline.** Bottom ring, uprights and cap ring are drawn as **1 px
GL lines**, constant across zoom and with no px → metre conversion (a ribbon would
never land exactly on a pixel). On an extruded shape, `width` therefore no longer
applies.

**Depth.** A volume's faces depth-test: a building passing in front occludes it
correctly.

**Scope.** Only affects **closed** shapes (polygon, rectangle, circle) — on a line or
an arrow it would produce a wall with no thickness. A non-finite value (a `NaN` coming
from an upstream computation) is coerced to `0`, which yields a draped outline rather
than making the shape lose its stroke entirely.

`extrudeHeight` is a property **of the zone**: two neighbouring zones can have
different heights, and changing it at runtime rebuilds the volume.

---

## 5. Search

`<ShapeLayer>` registers itself with the `engine.search` registry:

- a **named** zone (`title`) is searchable, an anonymous one is ignored;
- the group is `shape` (label: `labels.search.groups.shape`), coloured by the zone's
  stroke;
- each entry carries its **bounds** — which is what makes picking it **frame** the
  zone, instead of hovering its centre at an arbitrary altitude.

Nothing to configure: just name your zones. See [SEARCH.md](SEARCH.md).

---

## 6. Framing: the `Bounds` helpers

All **antimeridian-correct** and tolerant of non-finite coordinates (they return `null`
rather than a poisoned box that would make the camera aim at nothing).

```ts
boundsOfShape(shape)             // one shape, whatever its variant
boundsOfShapes(shapes)           // a set
boundsOfCircle(center, meters)   // geodesic disc
boundsOfLatLngs(points)          // list of points
boundsOfMarkers(markers)         // any object with { position }
unionBounds([a, b, c])           // union, `null` entries ignored
centerOfBounds(b)                // centre, antimeridian included
lngSpanDeg(b)                    // width in degrees of longitude
altitudeForBounds(b, opts?)      // framing altitude
```

```tsx
const b = boundsOfShapes(zones)
if (b) camera.fitBounds(b, { padding: { left: 320, top: 40, right: 40, bottom: 40 } })
```

`altitudeForBounds` clamps to `[350 m, 6000 km]` by default with a 1.35× margin —
values designed for place search. `margin`, `minAltitude` and `maxAltitude` adjust them
when the content is smaller (a 200 m zone).

See [CAMERA.md](CAMERA.md) for the full framing story (asymmetric padding, durations).

---

## 7. Geodesic predicates

Exported and **geodesic** — therefore stable under camera rotation, unlike a
screen-space test. This is what the library itself uses for drawing constraints.

```ts
ringOfShape(shape, segments?)      // any shape → a LatLng ring (circle polygonised, rect expanded)
pointInRing(p, ring)               // ray casting; a point on the edge is ACCEPTED
ringInsideRing(inner, outer)       // containment (tested on `inner`'s vertices)
polygonAreaM2(ring)                // area by spherical excess
circleRing(center, meters, segs?)  // disc → ring
predicateSegments(renderSegments)  // safe predicate density given a render density
PREDICATE_CIRCLE_SEGMENTS          // 64
```

`ringOfShape` reduces all five variants to a single input type: predicates then have
only one case to handle.

`polygonAreaM2` uses the Chamberlain & Duquette method — the **same** as
`google.maps.geometry.spherical.computeArea`, so the values are comparable. The ring is
assumed implicitly closed and simple: an area makes no sense on a self-intersecting
outline.

> **Predicate density ≠ render density.** `PREDICATE_CIRCLE_SEGMENTS` (64) is distinct
> from `config.performance.circleSegments`: making the former configurable would expose
> a setting able to change a **boolean answer**, where the latter only changes
> smoothness. The invariant is that it must never be coarser than the render — an
> inscribed polygon shrinks as you remove vertices, so testing with fewer segments than
> you draw would report “outside” for a point visibly inside. `predicateSegments(n)`
> enforces the invariant instead of merely stating it.
>
> `ringInsideRing` tests `inner`'s **vertices**: exact for convex outlines, sufficient
> for a zone drawn inside a perimeter. A concave outline with an edge bulging out
> between two vertices would pass — densify `inner` if you need better precision.

```ts
// “Is this alert inside one of my sectors?”
const inside = zones.some((z) => pointInRing(alert.position, ringOfShape(z)))
```

---

## 8. Zones drawn by the user

A **drawn** zone is not a `ShapeData`: it is a `DrawnShape` of the drawing collection,
with a stable identity, a richer style (separate fill and stroke, stroke style, corner
radius), tags, a lock and business metadata. It is selectable, editable, undoable and
exportable to GeoJSON.

Everything is in [DRAWING.md](DRAWING.md). Two junction points here:

**Constraining drawing to perimeters.** `constraints.limits` takes `ShapeData` — the
same type `<ShapeLayer>` displays:

```tsx
<Map
  layers={[shapesLayer({ shapes: perimeters })]}   {/* DISPLAYING them is up to you */}
  draw={{
    constraints: { limits: perimeters, maxAreaM2: 10_000_000 },
    onReject: (reason) => toast(reason === 'outOfLimits' ? 'Outside the area' : 'Too large'),
  }}
/>
```

`limits` draws nothing: the drawing layer uses it as a predicate. Display your
perimeters with `<ShapeLayer>` (or as **locked** shapes in the drawing, if you want
them to live in the same collection). Only **user gestures** are constrained —
`addShape`, `updateShape` and `fromGeoJSON` inject without checks.

**Choosing the right layer.**

| Need | Layer |
|---|---|
| Display zones coming from the backend | `<ShapeLayer>` |
| Make them clickable / selectable | `<DrawLayer>` (via `addShape` / `value`) |
| Make them untouchable but in the same collection | `<DrawLayer>` + `locked: true` |
| Make them extruded | `<ShapeLayer>` (`extrudeHeight` does not exist on the drawing side) |
| **Browse a remote reference set** and place items from it | the catalog — see [CATALOG.md](CATALOG.md) |

---

## 9. Paths (`<PathLayer>`)

The **open** cousin of the zone: a ground-draped ribbon with a legibility casing and an
animated head. Designed for a GPS trace or a route.

```tsx
<PathLayer
  paths={[{ id: 'trace-1', points: trace, color: '#22d3ee', width: 6, casing: true }]}
  animateHead                      // pulsing head point (default true)
/>
```

```ts
type PathData = {
  id?: string | number
  points: LatLng[]
  color?: string        // default theme.colors.path.base
  width?: number        // screen px, default 6
  casing?: boolean      // dark outline under the ribbon
  casingColor?: string  // default theme.colors.path.casing
}
```

The casing is not cosmetic: on satellite imagery, a stroke without one is lost in the
background. Same reason as `casingWidth` on relation links.

`<PathLayer>` does **not** register with search (a path has no name) and is not
interactive.

---

## 10. Theme

| Key | Effect |
|---|---|
| `colors.zone.stroke` | default stroke **and** fill of a zone, colour of the search group |
| `colors.zone.fill` | declared, not consumed by `<ShapeLayer>` (see § 2) |
| `colors.path.base` / `colors.path.casing` | paths |
| `colors.draw.default` / `colors.draw.palette` | **drawn** shapes — see [DRAWING.md](DRAWING.md) |

Changing the theme at runtime rebuilds the shapes that have no `color` of their own.
Full reference: [THEME.md](THEME.md).

---

## 11. Recipes

**A radius circle around a point, framed on screen**

```tsx
const zone: ShapeData = { kind: 'circle', center: alert.position, radiusMeters: 500, title: 'Perimeter' }

<Map layers={[shapesLayer({ shapes: [zone] })]} onReady={() => camera.fitBounds(boundsOfShape(zone)!, { padding: 60 })} />
```

**A building as a volume, readable in a tilted view**

```ts
{ kind: 'polygon', points: footprint, color: '#38bdf8', fillOpacity: 0.15, extrudeHeight: 45 }
```

**An outline with no fill**

```ts
{ kind: 'polygon', points, fillOpacity: 0, width: 3 }
```

**Frame every zone and every marker together**

```ts
const b = unionBounds([boundsOfShapes(zones), boundsOfMarkers(agents)])
if (b) camera.fitBounds(b, { padding: 80 })
```

**Reject an out-of-perimeter input, application-side**

```ts
const ring = ringOfShape(perimeter)
const valid = ringInsideRing(ringOfShape(inputZone), ring)
```

**Area of a zone, in m²** — `polygonAreaM2(ringOfShape(zone))`.

---

## See also

- [DRAWING.md](DRAWING.md) — user drawing, editing, GeoJSON, constraints
- [MARKERS.md](MARKERS.md) — points and clusters
- [CAMERA.md](CAMERA.md) — framing, flights, basemap
- [CATALOG.md](CATALOG.md) — browsing a remote reference set and placing zones from it
- [SEARCH.md](SEARCH.md) — unified search
- [PEDESTRIAN.md](PEDESTRIAN.md) — why draped shapes depth-test while walking
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [THEME.md](THEME.md)

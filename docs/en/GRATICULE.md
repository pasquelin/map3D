# Graticule — geographic coordinate grid

[Français](../fr/GRATICULE.md) · **English** · [↑ Index](README.md)

Parallels and meridians draped over the globe, whose **mesh adapts to zoom** on an
atlas's sexagesimal scale — 30° in globe view, 1″ at street level — and which **fades out
smoothly** when the view tilts too far for a grid to stay readable.

It is a **reference layer**, not a tool: turning it on interrupts nothing, releases no
drawing tool, and creates no shape. Nothing lands in the GeoJSON, the undo/redo history
or the style panel.

---

## 1. What it displays

Three families of lines, and their labels:

| | |
|---|---|
| **Parallels** | constant latitudes — horizontal in a north-up view |
| **Meridians** | constant longitudes — they **converge** towards the poles, which the grid actually shows since it follows the curvature |
| **Remarkable lines** | Equator, Tropics of Cancer and Capricorn, Polar Circles, Prime Meridian, 180th meridian. Own colour, stronger opacity, and **their name** as the label |

Labels take the appearance of the library's tooltips, and show the coordinate at the
current mesh's precision: `45°N` at degree level, `45°11'N` at minute level,
`45°11'25"N` at second level.

## 2. Turning it on

Three paths, depending on who decides.

**The layer must be mounted** in every case — it is what paints:

```tsx
<Map center={PARIS} zoom={14} controls={{}}>
  <GraticuleLayer />
</Map>
```

It costs nothing while the grid is off: no geometry, no label, no render-loop wake-up. So
it can stay mounted permanently.

**On at startup** — through config:

```tsx
<Map config={{ graticule: { enabled: true } }}>
  <GraticuleLayer />
</Map>
```

**Driven from the application** — through the hook, which reads engine state:

```tsx
const { visible, setVisible, toggle } = useGraticule()
```

⚠️ `graticule.enabled` is only the **starting** state. The current source of truth lives
in the engine (`engine.setGraticuleVisible`), because three commands drive it: the "Grid"
row of the Measure submenu, the view-controls button, and the keyboard shortcut. Two
copies of that state would have diverged.

## 3. How the mesh adapts

The scale is **sexagesimal**, never decimal — that is what yields a map's `13°42'25"N`
rather than a `0.1°` no survey uses:

```
30° 15° 10° 5° 2° 1° │ 30′ 15′ 10′ 5′ 2′ 1′ │ 30″ 15″ 10″ 5″ 2″ 1″
```

The library keeps the **coarsest step that still leaves at least `targetLines` lines on
screen** (8 by default). Raising `targetLines` densifies the grid, lowering it opens it up.

```tsx
config={{ graticule: { targetLines: 12 } }}
```

**`levelHysteresis` is not a comfort detail.** A zoom stopping exactly on a step boundary
would flip from one frame to the next, and *every flip rebuilds the whole geometry*: the
dead band (15 % density gap by default) is the only thing preventing a rebuild loop. Set
it to `0` only to observe the effect.

**Freezing the mesh** — `levelRangeDeg` bounds the scale, and `[x, x]` locks it:

```tsx
config={{ graticule: { levelRangeDeg: [1 / 60, 1 / 60] } }}   // always 1′
```

## 4. How the fade works

Past a certain tilt, a grid stops being readable: cells crush towards the horizon and the
mesh turns into moiré. So it fades away.

The band is expressed in **fractions of the current mode's tilt ceiling**, not in absolute
degrees. The reason is concrete: that ceiling is **79.2° in 3D** but **36° in flat map
mode** (`camera.maxTilt3d` / `maxTilt2d`) — a band written "60° → 75°" would *never*
trigger when flat.

```tsx
config={{ graticule: { tiltFade: { start: 0.75, end: 0.95 }, fadeMs: 250 } }}
```

What that gives at the defaults:

| Mode | Ceiling | Fade starts (0.75) | Gone (0.95) |
|---|---|---|---|
| **3D** | 79.2° | 59.4° | 75.2° |
| **plan** | 36.0° | 27.0° | 34.2° |

`fadeMs` is the smoothing time constant — that is the softness. At `0`, the grid appears
and disappears instantly.

⚠️ A host tightening `camera.maxTilt3d` **moves the fade with it**, since the band is
relative. That is intended: the grid always disappears at the same "percentage of
available tilt", whatever limit is imposed on the camera. See [CAMERA.md](CAMERA.md).

**Mesh cross-fade** — on a step change, the old grid fades out while the new one fades in,
instead of a hard cut:

```tsx
config={{ graticule: { levelFadeMs: 300 } }}   // 0 = hard cut
```

## 5. Remarkable lines

They are drawn **whatever the mesh** — without that, the Equator would vanish from step
15° onwards, when it is precisely the line the eye looks for. When one of them falls
exactly on a mesh line, it does not double it: it **marks** it.

They live in config, with their label key:

```tsx
config={{
  graticule: {
    remarkable: {
      enabled: true,
      parallels: [
        { lat: 0, labelKey: 'equator' },
        { lat: 23.4363, labelKey: 'tropicCancer' },
        // …
      ],
      meridians: [{ lng: 0, labelKey: 'primeMeridian' }],
    },
  },
}}
```

Why config rather than constants: the obliquity of the ecliptic (23.4363°) drifts slowly,
and a non-terrestrial tileset — a model, a survey, a planet — has neither tropics nor
polar circles. `remarkable: { enabled: false }` removes them all.

Adding a line **also** requires its label, otherwise the coordinate shows instead of the
name:

```tsx
labels={{ graticule: { remarkable: { myLine: 'Zone boundary' } } }}
```

## 6. Labels

By default they sit **along the centre cross**: latitudes follow the meridian nearest the
screen centre, longitudes the nearest parallel. That is what naturally caps their number
at any zoom, and what gives them a map's two diagonal chains.

```tsx
config={{
  graticule: {
    labels: {
      enabled: true,
      placement: 'center-cross',   // 'edges': pinned to the borders, never over the centre
      format: 'auto',              // 'dms' | 'dm' | 'deg' to force it
      rotate: true,                // follow the line's angle
      remarkableNames: true,       // "Equator" rather than "0°N"
      idleOpacity: 0.65,           // 1 = always full
      maxLabels: 40,
      spacingPx: 90,
      hoverPaddingPx: 4,
    },
  },
}}
```

**Rotation** — a label follows its line **as long as it stays readable**. Past 45° it
flips a quarter turn and sits across the line: a meridian in a north-up view is vertical,
and a label written bottom-to-top cannot be read.

**Hover** — labels are translucent at rest and become fully opaque under the pointer. They
stay `pointer-events: none`: hover is computed geometrically, so **no label can swallow the
start of a map drag**.

**Density** — three settings bound it, and `spacingPx` is the one that acts in practice:
`maxLabels` is a guard rail you only reach by lowering `spacingPx` a lot.

## 7. Appearance

The config / theme split rule, here as elsewhere: **what is seen lives in the theme, the
rest in config.** A value you change for a brand identity is theme; a value you change for
a denser screen or a weaker machine is config.

```tsx
theme={{
  colors: {
    graticule: {
      line: '#ffd54a',              // ordinary parallels and meridians
      remarkable: '#ff8f00',        // Equator, tropics, polar circles…
      label: '#ffffff',
      labelBackground: 'rgba(0,0,0,0.55)',
    },
  },
}}
```

The default is **yellow** rather than an atlas's white: white disappears over a light
flat-map background, whereas amber holds on both — dark satellite as well as road map —
without clashing with the drawing palette.

Staying in config because they are not brand identity: `opacity`, `remarkableOpacity`,
`dash` (dash pattern, in world metres), `heightOffsetMeters`.

⚠️ **Line width is not adjustable**: WebGL ignores `linewidth`, the stroke is 1 px. Making
it adjustable would require triangulated ribbons, with their anchor raycasts and LOD
resettle — a cost out of proportion with what the grid provides.

## 8. In the interface

Two entry points, **one single state**. They light up and go out together.

**"Measure" submenu** in the toolbar — hovering the ruler button opens two rows, "Measure"
and "Grid":

```tsx
<Map draw={{}} toolbar={{}} />
{/* remove the grid from the bar, without removing it from the map: */}
<Map draw={{}} toolbar={{ measureTools: ['measure'] }} />
```

The submenu's two rows **are not painted the same way, deliberately**: "Measure" designates
the active tool — a *choice*, exclusive of other tools — whereas "Grid" is a *switch*, which
coexists with any tool. The first takes the solid accent fill ("this is the one"), the second a
tint and a checkmark ("on"). Both can therefore be true at once without the menu reading as two
competing choices.

**View-controls button**, next to "Globe":

```tsx
<Map controls={{ buttons: { graticule: false } }} />   // to remove it
```

⚠️ That second button is not a duplicate. The toolbar **retracts below zoom 11**
(`interaction.drawToolbarMinZoom`): without it, the grid would become undrivable in globe
view — exactly where it is most useful.

**Shortcut** — `K` by default, in `interaction.shortcuts.controls`:

```tsx
config={{ interaction: { shortcuts: { controls: { graticule: 'g', globe: 'k' } } } }}
```

It lives in the **controls** table rather than the drawing one, even though the grid also
has a row in the Measure submenu: it is a view command, and its button works with no
drawing layer mounted. Filed under `draw`, the shortcut died with `<DrawLayer>` while the
tooltip kept announcing it.

As everywhere in the library, **a key is only live if its button is rendered**.

## 9. Performance

The grid is built to cost nothing. What you need to know if you tune it:

**Three rebuild triggers, never the frame** — the mesh changed, the centre left the built
band, or the drape height drifted by more than `heightToleranceMeters`. Between two
rebuilds, the layer only writes an opacity and repositions its labels.

**A band, not the globe** — at a 1″ step, building the whole Earth would take millions of
vertices. The library builds `bandScreens` screens (2 by default) around the centre:
overflowing it is what turns "rebuild per frame" into "rebuild per screen travelled".
Widening the band spaces rebuilds out and makes each one heavier.

**It never reads the viewport bounds.** `MapView.bounds` goes through a grid of 25
ellipsoid raycasts that the engine reserves for consumers outside the frame loop: the mesh
is derived from camera altitude, by two pure functions.

**Render-on-demand is respected** — the loop is only woken while a fade converges, never at
rest. With the grid off, the layer does nothing at all: no geometry, no draw call, not one
DOM write.

**Proportionate densification** — `segmentsPerLine` (128) is a *ceiling*. A line spanning
only a few arcseconds is straight: the library does not put 128 segments on it.

Hard guard rails, to lower only on very weak machines: `maxLines` (64 per axis),
`labels.maxLabels` (40).

## 10. Known limitations

- **1 px stroke**, imposed by WebGL (see §7).
- **No MGRS or UTM**: the library only does the geographic graticule. A military grid is a
  second grid engine — per-zone projection, polar bands, zone designators.
- **Meridians stop at `latLimitDeg`** (85° by default): beyond it they converge and the
  vertex density explodes for an unreadable result.
- **No line hovering**: only labels react to the pointer.
- **Below zoom 11**, the toolbar being retracted, the grid is driven from the view-controls
  button, the shortcut or the API (see §8).

---

**See also** — [CAMERA.md](CAMERA.md) (tilt ceilings the fade depends on) ·
[THEME.md](THEME.md) · [CONFIG.md](CONFIG.md) · [HOOKS.md](HOOKS.md)

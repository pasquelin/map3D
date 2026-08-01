# `MapTheme` — reference

[Français](../fr/THEME.md) · **English** · [↑ Index](README.md)

Everything you SEE: colours, sizes, rhythm. The counterpart of `MapConfig`, which
configures behaviour.

```tsx
<MapProvider theme={{ colors: { ui: { accent: '#0af' } } }}>
```

Partial, deep override, like the config. A `{ light, dark }` pair lets the theme follow
the host application's mode.

Generated from `src/theme/defaultTheme.ts` and `src/theme/types.ts`.

> **Translated by hand.** The source of truth is the French version, extracted from the
> code's JSDoc: check [fr/THEME.md](../fr/THEME.md) if a default looks out of date.

💰 = Google billing impact · 🌍 = locale/i18n impact

## `colorScheme` — Default mode

| Key | Description | Default |
|---|---|---|
| `colorScheme` | The theme's default mode (a `{light, dark}` pair makes it automatic). | `'dark'` |

## `colors` — Palette

| Key | Description | Default |
|---|---|---|
| `colors.background` | Canvas background, visible before tiles load. | `'#0d1415'` |
| `colors.marker.default.base` | Colour per marker type (e.g. 'alert-critical', 'agent-available'). | `'#2E7CF6'` |
| `colors.marker.default.accent` | Colour per marker type (e.g. 'alert-critical', 'agent-available'). | `'#78BEFF'` |
| `colors.marker.default.contrast` | Colour per marker type (e.g. 'alert-critical', 'agent-available'). | `'#ffffff'` |
| `colors.tags` | Per-tag colour ("Layers" panel), key = tag name. A tag absent from this object falls back to the library's hashed palette. Optional. | `{}` |
| `colors.cluster.core` | Donut core. | `'#1e293b'` |
| `colors.cluster.text` | Total displayed in the centre. | `'#ffffff'` |
| `colors.cluster.ring` | Separating ring between core and slices. | `'#ffffff'` |
| `colors.draw.palette` | Palette offered by the drawing colour picker. | `["#F0503A", "#EE8F0A", "#079A7D", "#2E7CF6", "#6344F0", "#101828"]` |
| `colors.draw.default` | Colour of a newly drawn shape. | `'#2E7CF6'` |
| `colors.ui.panel` | Panel and bar background (translucent). | `'rgba(20,26,30,0.9)'` |
| `colors.ui.text` | Primary text. | `'#f8fafc'` |
| `colors.ui.muted` | Secondary text, discreet labels. | `'#94a3b8'` |
| `colors.ui.accent` | Accent colour: active state, focus, selection. | `'#2E7CF6'` |
| `colors.ui.error` | Errors and destructive actions. | `'#d11a01'` |
| `colors.ui.border` | Borders and separators. | `'rgba(255,255,255,0.10)'` |
| `colors.ui.stat` | **Optional.** Diagnostics panel verdicts (`ok` / `warn` / `bad`), see [`performance.statThresholds`](CONFIG.md). Distinct from `error`: an excessive value is not an error, it is a budget overrun — conflating them would make a heavy map read as a broken one. When absent the panel falls back to `colors.ui.text`: no colour rather than a verdict the theme did not intend. | `{ ok: '#4ade80', warn: '#facc15', bad: '#f87171' }` |
| `colors.attention.sonar` | Attention decorations for markers (`new`/`urgent`) — operational signals, deliberately very loud colours. Optional: an earlier theme stays valid. | `'#ffd60a'` |
| `colors.attention.target` | Attention decorations for markers (`new`/`urgent`) — operational signals, deliberately very loud colours. Optional: an earlier theme stays valid. | `'#ff3b30'` |
| `colors.pedestrian.placeValid` | Pedestrian mode: placement cursor and full-immersion reticle. Target shown when the aimed point is a placeable street. Optional: an earlier theme stays valid. | `'#2E7CF6'` |
| `colors.pedestrian.placeBlocked` | Pedestrian mode: crossed-out target when the aimed point is a roof or the sky. Optional. | `'#d11a01'` |
| `colors.pedestrian.reticle` | Pedestrian mode: central reticle of full immersion. Optional. | `'#f8fafc'` |
| `colors.path.base` | Colour of a path. | `'#2E7CF6'` |
| `colors.path.casing` | Path casing (legibility on satellite imagery). | `'#ffffff'` |
| `colors.zone.fill` | Zone fill. | `'#079A7D'` |
| `colors.zone.stroke` | Zone stroke. | `'#079A7D'` |
| `colors.graticule.line` | Coordinate grid: ordinary parallels and meridians. Optional — an older theme stays valid (falls back to the default theme). | `'#ffd54a'` |
| `colors.graticule.remarkable` | Equator, tropics, polar circles, remarkable meridians. | `'#ff8f00'` |
| `colors.graticule.label` | Coordinate label text. | `'#ffffff'` |
| `colors.graticule.labelBackground` | Label pill background. | `'rgba(0,0,0,0.55)'` |
| `colors.marquee.fill` | Marching ants **shared** by the three selection surfaces: outline of selected shapes, the selector stroke (rect/poly/lasso) and the lens area. `fill` = background veil (selector and lens only — a shape outline stays hollow), `stroke` = animated dashes, `under` = solid line beneath… | `'rgba(255,255,255,0.12)'` |
| `colors.marquee.stroke` | Marching ants **shared** by the three selection surfaces: outline of selected shapes, the selector stroke (rect/poly/lasso) and the lens area. `fill` = background veil (selector and lens only — a shape outline stays hollow), `stroke` = animated dashes, `under` = solid line beneath… | `'#000000'` |
| `colors.marquee.under` | Marching ants **shared** by the three selection surfaces: outline of selected shapes, the selector stroke (rect/poly/lasso) and the lens area. `fill` = background veil (selector and lens only — a shape outline stays hollow), `stroke` = animated dashes, `under` = solid line beneath… | `'#ffffff'` |

## `shadows` — Shadows

| Key | Description | Default |
|---|---|---|
| `shadows.sm` | Resting elements (swatches, chips). | `'0 1px 2px rgba(0,0,0,0.3)'` |
| `shadows.md` | Buttons and small surfaces. | `'0 3px 8px rgba(0,0,0,0.35),0 1px 2px rgba(0,0,0,0.3)'` |
| `shadows.lg` | Floating panels and menus. | `'0 10px 26px rgba(0,0,0,0.45),0 3px 8px rgba(0,0,0,0.3)'` |

## `radii` — Corner radii (px)

| Key | Description | Default |
|---|---|---|
| `radii.sm` | Small elements: toolbar buttons, handles. | `6` |
| `radii.md` | Panels and menus. | `10` |
| `radii.lg` | Large surfaces. | `14` |
| `radii.pill` | Pill shape (deliberately huge value). | `999` |

## `typography` — Typography

| Key | Description | Default |
|---|---|---|
| `typography.fontFamily` | Font stack for the whole map UI. | `'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'` |
| `typography.sizes.xs` | Type scale (px). Published as `--m3d-size-*`. ⚠️ Does not yet cover the whole stylesheet: 26 accidental sizes (9.5 to 22 px) remain literal there, for lack of a matching step. | `10.5` |
| `typography.sizes.sm` | Type scale (px). Published as `--m3d-size-*`. ⚠️ Does not yet cover the whole stylesheet: 26 accidental sizes (9.5 to 22 px) remain literal there, for lack of a matching step. | `12.5` |
| `typography.sizes.md` | Type scale (px). Published as `--m3d-size-*`. ⚠️ Does not yet cover the whole stylesheet: 26 accidental sizes (9.5 to 22 px) remain literal there, for lack of a matching step. | `13.5` |
| `typography.sizes.lg` | Type scale (px). Published as `--m3d-size-*`. ⚠️ Does not yet cover the whole stylesheet: 26 accidental sizes (9.5 to 22 px) remain literal there, for lack of a matching step. | `16` |
| `typography.weights.medium` | Weights, published as `--m3d-weight-*`. | `500` |
| `typography.weights.semibold` | Weights, published as `--m3d-weight-*`. | `600` |
| `typography.weights.bold` | Weights, published as `--m3d-weight-*`. | `700` |

## `markers` — Markers

| Key | Description | Default |
|---|---|---|
| `markers.size` | Sprite diameter (px). | `44` |
| `markers.ringWidth` | Ring thickness (px). | `3` |
| `markers.gradient` | Gradient on the marker body. | `true` |
| `markers.gloss` | Gloss highlight on the chip. | `true` |
| `markers.icon` | Default content of a marker: nothing, the type icon, its rank, or a node. | `'type'` |
| `markers.moveTween.duration` | Position tween (animated agent movement). | `500` |
| `markers.moveTween.easing` | Position tween (animated agent movement). | *(function)* |

## `clusters` — Default cluster geometry (donut)

| Key | Description | Default |
|---|---|---|
| `clusters.coreRadius` | Core radius (px) as a function of the total number of points. | *(function)* |
| `clusters.ringWidth` | Thickness of the segmented ring (px). | `30` |
| `clusters.strokeWidth` | Light outline of the slices (px) — it overflows the outer radius by half its width. | `2.5` |
| `clusters.segmentGap` | Angular gap between two slices (rad); `0` makes them contiguous. | `0.045` |
| `clusters.startAngle` | Angle of the first slice (rad). `Math.PI` = 9 o'clock, two slices top/bottom. | `3.141592653589793` |

## `animations` — Animation and camera-flight rhythm

| Key | Description | Default |
|---|---|---|
| `animations.enabled` | Turns off ALL JS animations (CSS has its own `prefers-reduced-motion` rule). | `true` |
| `animations.pulse.duration` | Pulse of a marker to signal. `false` turns it off. | `2000` |
| `animations.pulse.easing` | Pulse of a marker to signal. `false` turns it off. | `'ease-out'` |
| `animations.pulse.scale` | Pulse of a marker to signal. `false` turns it off. | `1.16` |
| `animations.halo.duration` | Halo expanding away from a marker (`maxScale` = final magnification). | `2600` |
| `animations.halo.easing` | Halo expanding away from a marker (`maxScale` = final magnification). | `'cubic-bezier(.2,.6,.35,1)'` |
| `animations.halo.maxScale` | Halo expanding away from a marker (`maxScale` = final magnification). | `2.1` |
| `animations.bob.duration` | Slight vertical bobbing (`amplitude` in px). | `2400` |
| `animations.bob.amplitude` | Slight vertical bobbing (`amplitude` in px). | `4` |
| `animations.markerEnter.duration` | Marker entrance (`stagger` = delay between two appearances, ms). | `460` |
| `animations.markerEnter.easing` | Marker entrance (`stagger` = delay between two appearances, ms). | `'cubic-bezier(.32,1.5,.5,1)'` |
| `animations.markerEnter.stagger` | Marker entrance (`stagger` = delay between two appearances, ms). | `30` |
| `animations.clusterEnter.duration` | Cluster entrance. | `460` |
| `animations.clusterEnter.easing` | Cluster entrance. | `'cubic-bezier(.32,1.5,.5,1)'` |
| `animations.clusterEnter.stagger` | Cluster entrance. | `55` |
| `animations.menuOpen.duration` | Opening of menus, flyouts and panels. Published as `--m3d-menu-dur`. | `200` |
| `animations.menuOpen.easing` | Opening of menus, flyouts and panels. Published as `--m3d-menu-dur`. | `'cubic-bezier(.32,1.3,.5,1)'` |
| `animations.flyDuration` | Duration of an ordinary camera flight (s) — `flyTo`, `fitBounds`. | `1` |
| `animations.flyEasing` | Easing curve of camera flights. | *(function)* |
| `animations.pan` | Lateral movement. | `0.5` |
| `animations.zoom` | Zoom change via a button. | `0.4` |
| `animations.moveTo` | “Instant” recentring (`useCamera().moveTo`). | `0.4` |
| `animations.target` | Targeting flight from a listing or a pinned favourite. | `0.8` |
| `animations.clusterOpen` | Opening a cluster (zoom to its extent). | `0.6` |
| `animations.topDown` | Switch to top-down view. | `0.5` |
| `animations.globe` | Pull back to globe view. | `1` |

## `spacing` — Spacing of floating surfaces (px)

| Key | Description | Default |
|---|---|---|
| `spacing.gap` | Gap between an anchored surface and its anchor. | `12` |
| `spacing.edge` | Minimum margin between a surface and the container edge. | `8` |
| `spacing.barInset` | Inset of the vertical bars from the edge. | `16` |

## `sizing` — Surface and icon dimensions

| Key | Description | Default |
|---|---|---|
| `sizing.lensPanelW` | Width of the lens inventory panel (px). | `252` |
| `sizing.selectionPanelW` | Width of the selection panel (px). | `236` |
| `sizing.templatesPanelW` | Width of the templates panel (px), sized after its busiest checkbox row (categories + “View”). | `352` |
| `sizing.panelMaxHeight.tags` | Maximum panel heights when space allows (px). They used to diverge with no stated reason (380 / 420 / 300 / 560 / 520). | `380` |
| `sizing.panelMaxHeight.symbols` | Maximum panel heights when space allows (px). They used to diverge with no stated reason (380 / 420 / 300 / 560 / 520). | `420` |
| `sizing.panelMaxHeight.search` | Maximum panel heights when space allows (px). They used to diverge with no stated reason (380 / 420 / 300 / 560 / 520). | `340` |
| `sizing.panelMaxHeight.settings` | Maximum panel heights when space allows (px). They used to diverge with no stated reason (380 / 420 / 300 / 560 / 520). | `560` |
| `sizing.panelMaxHeight.settingsSub` | Maximum panel heights when space allows (px). They used to diverge with no stated reason (380 / 420 / 300 / 560 / 520). | `520` |
| `sizing.panelMaxHeight.templates` | Maximum panel heights when space allows (px). They used to diverge with no stated reason (380 / 420 / 300 / 560 / 520). | `460` |
| `sizing.panelMaxHeight.catalog` | Maximum height of the catalog panel (px). | `380` |
| `sizing.catalogRowHeight` | Catalog row height (px). ⚠️ CONSTANT by contract: `visibleWindow` derives the window to render from it without measuring rows. A taller row would shift everything below it. | `34` |
| `sizing.catalogIndent` | Horizontal offset of an expanded child row (px). | `18` |
| `sizing.catalogChevronW` | Expand-chevron width (px). ⚠️ It ALSO sets the width of the gutter reserved on rows without children: the two must match, otherwise names in the same list stop aligning depending on whether the row carries a chevron. | `18` |
| `sizing.catalogPanelW` | Catalog panel width — the type menu (px). Also used as a framing margin, together with `catalogSubPanelW`: a zone framed while the catalog is open must not land underneath it. | `252` |
| `sizing.catalogSubPanelW` | Width of the second panel, the list one (px). Distinct from `catalogPanelW` although equal by default: the two surfaces sit SIDE BY SIDE on the same edge, so framing must reserve their SUM. | `252` |
| `sizing.iconSize` | Size of @mdi icons (the `@mdi/react` unit: 1 ≈ 24 px). A single value where seven coexisted hard-coded (0.5 to 0.8) with none standing out. | `0.8` |

## `tiles` — Colour treatment of the basemap (dark mode)

| Key | Description | Default |
|---|---|---|
| `tiles.filter.brightness` | `1` = unchanged; `< 1` darkens. | `0.85` |
| `tiles.filter.saturation` | `1` = unchanged; `< 1` desaturates. | `0.9` |
| `tiles.filter.contrast` | `1` = unchanged. | `1.05` |
| `tiles.filter.invert` | `0` = unchanged; `1` inverts — dramatic but rarely legible. Optional. | *(unset)* |
| `tiles.filter.hueRotate` | Hue rotation, in degrees. Optional. | *(unset)* |

## `globe` — Globe and atmosphere

| Key | Description | Default |
|---|---|---|
| `globe.background` | Background behind the globe (space). | `'#070C16'` |
| `globe.oceanColor` | Ocean of the fallback globes — the emergency one and the one beneath the 2D tiles. | `'#0F2942'` |
| `globe.hazeColor` | Colour the distant scene dissolves into in **pedestrian mode** (fog from `pedestrian.fogStartMeters` to `viewDistanceMeters`). ⚠️ This used to be the canvas background, which was right as long as the background was what you saw behind the scene; since the atmospheric sky paints at the far plane, distant façades faded towards a light background **against a blue sky**, drawing a sharp horizontal bar at eye level. With the sky off (`sky.enabled: false`), the canvas background takes the role back. A low sky's tint varies with time of day and scattering: this default targets the default sky, at midday. | `'#C4D6E4'` |
| `globe.landColor` | Landmasses of the fallback globe. | `'#4F7A45'` |
| `globe.buildingColor` | Walls of the extruded buildings (internal provider's volume). A footprint carrying its own colour (`colour` attribute) keeps it. | `'#8A8E96'` |
| `globe.buildingRoofColor` | Roofs of the extruded buildings, lighter than the walls — the top face reads at once. | `'#C2C6CE'` |
| `globe.buildingRoofLighten` | How much to lighten the roof of a footprint carrying ITS OWN colour (the `colour` attribute), as a fraction towards white. `buildingRoofColor` only applies to footprints left to the theme, and without this offset volume disappears on those. ⚠️ Was a literal in `BuildingsLayer`: an appearance decision written into a layer's code, invisible from the theme. `0` makes the roof exactly the wall colour. | `0.35` |
| `globe.buildingSunAzimuth` | Azimuth of the fake sun (degrees from north, clockwise) that modulates walls by orientation. The scene has **no** light: the term is baked into vertex colours by the extrusion worker, so it costs nothing per frame. Avoid multiples of 45°: on an exact diagonal, the four walls of an orthogonal building collapse pairwise onto the same tone. | `120` |
| `globe.buildingShadeMin` | Tone of the least-exposed wall, as a fraction of its colour. `1` disables shading. | `0.62` |
| `globe.buildingHoverColor` | Tint of a hovered building while the selection tool is active. It replaces the footprint's vertex colours but stays MODULATED by the shading baked into them: the building stands out of the neighbourhood without losing the relief of its walls. | `'#F2B441'` |
| `globe.buildingSelectColor` | Tint of the building whose context menu is open. | `'#E8613C'` |

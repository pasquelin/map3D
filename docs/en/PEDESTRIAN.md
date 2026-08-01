# Pedestrian mode — ground-level walking and first-person immersion

[Français](../fr/PEDESTRIAN.md) · **English** · [↑ Index](README.md)

A third camera driver, alongside flight (`flyTo`) and follow (`follow`): walking at eye
height. The camera drops to street level, gains keyboard movement, collision and
gravity, and loses the Google-Earth-style orbit for as long as it's active.

It needs **raycastable volume on screen** — photorealistic 3D tiles or the internal
provider's extruded buildings — never plan mode: a flat 2D basemap has no relief to
walk through at eye height.

---

## 1. In two minutes

Pedestrian mode is **already in the toolbar** as soon as 3D is available: a button in
the compass group, key `W` by default.

```tsx
<Map cesiumIonToken={TOKEN} center={PARIS} zoom={17} controls={{}} />
{/* "Pedestrian mode" button (walk icon), visible as soon as 3D is servable */}
```

Programmatic equivalent:

```tsx
const pedestrian = usePedestrian()

pedestrian.state.available   // is 3D servable? (never in plan mode)
pedestrian.enterPlacement()  // arms the cursor: the next click picks the street point
pedestrian.exit()
```

---

## 2. Two phases: aim, then walk

`enterPedestrianPlacement()` (or the button) arms a **placement cursor** —
`state.phase` becomes `'placing'`. The cursor validates the hovered point by comparing
the targeted surface to the **street level** estimated over a sampling ring around the
click: a roof sits several metres above the neighbouring street, a roadway does not.

- **Accepted**: `hitHeight - streetLevel <= maxRoofDeltaMeters` (2 m by default) — or no
  hit at all (bare ground, nothing to raycast: the normal case for the internal
  provider, where only buildings are volumes).
- **Rejected**: the point sits too far above the street (a roof), or the ground itself
  is undetermined (no tile loaded under the click).

Validation is **memoised** (`placement.refreshMs`, 33 ms, and `refreshSlopPx`, 3 px):
without it, `pointermove` would saturate the render loop with a dozen raycasts per
targeted pixel. The cursor changes shape live (`m3d-pedestrian-ok` /
`m3d-pedestrian-blocked`, colours from `theme.colors.pedestrian` — see § 10).

A click on an invalid point is **ignored without leaving the mode**: the cursor stays
"forbidden" and you aim elsewhere. A valid click flips `state.phase` to `'active'` —
you are walking.

Entering directly, without the cursor, at an already-known point:

```ts
const ok = pedestrian.enter({ lat, lng })   // false if the point isn't placeable
```

---

## 3. `usePedestrian()` and `MapHandle.pedestrian`

```ts
const pedestrian = usePedestrian()   // or map.current?.pedestrian
```

| Member | Role |
|---|---|
| `state` | reactive `PedestrianState` — re-renders the consumer on every change |
| `enterPlacement()` | arms the placement cursor |
| `enter(p)` | enters directly at a point; `false` if it isn't placeable |
| `exit()` | leaves the mode, hands control back to the orbit |
| `setImmersion(level)` | switches `'explore'` ↔ `'full'` (see § 5) |

`PedestrianState`:

| Field | Role |
|---|---|
| `mode` | `'orbit'` \| `'pedestrian'` |
| `phase` | `'placing'` (cursor armed) \| `'active'` (walking) |
| `immersion` | `'explore'` \| `'full'` |
| `available` | is the mode offerable **right now**? |
| `heading` | real heading (rad), `0` = north — `Camera.getState()` hard-codes it to `0`, this field is what tells you anything in first person |
| `pitch` | real vertical look (rad), `0` = horizon |

**Availability** — `available` is true **only** in servable 3D mode (external
photorealistic tiles or the internal extruded volume, the same rule as the controls'
3D ↔ plan toggle): never in plan mode. It is republished on every basemap switch,
including on first mount. The mode **closes itself** if the map stops being 3D while
you're walking (provider change, back to plan) — no need to listen for that
specifically, `state.mode` follows.

The `state` object is **stable** as long as nothing actually changes (same pattern as
`BasemapState`): a React consumer can put it in state without re-rendering on every
frame of the walk.

---

## 4. Walking

The keys are the **camera-movement** ones, shared with the orbit's keyboard pan
(`interaction.shortcuts.navigate`):

| Key | Action |
|---|---|
| `↑` `↓` `←` `→`, or `Z` `S` `Q` `D` | forward / backward / strafe, in the **street's** frame (the tangent plane), never the line of sight |
| `Shift` (held) | accelerate — `walkSpeed × sprintFactor` |

Two keys at once (a diagonal) do not go faster than one — movement is normalised.
Speed is `pedestrian.walkSpeed` (5 m/s by default, well above real walking so the
scenery scrolls at a legible pace at eye height), multiplied by `sprintFactor` (2)
while `Shift` is held.

**Collision** — a fan of `collision.feelers` horizontal rays (6 by default,
distributed symmetrically from −90° to +90° around the walking direction, never
behind: you cannot walk into a wall you're leaving) probes up to
`collision.radiusMeters + collision.feelerMarginMeters` ahead of you. The component of
the movement that **enters** a wall is removed, the tangent kept: you slide along the
façade instead of sticking to it — cancelling the whole movement on the slightest
graze would make walking through a city unbearable.

**Steps and slopes** — a climb of more than `collision.maxStepHeightMeters` (0.4 m) in
a single step is a **wall** (you don't climb it); a smaller climb (kerb, step) passes.
**Descent**, on the other hand, is never bounded: a slope, a staircase or a kerb you're
leaving are followed downward without limit.

**Gravity** — a single downward ray per frame (not the ~9-ray ring used by placement,
reserved for entry), smoothed over `groundSmoothing` seconds (0.25 s by default) so
that tile refinement doesn't make the eye jump. On the **internal** provider, the
roadway is a flat surface deliberately not raycastable: gravity then falls back to a
known analytic ground (no ray needed), otherwise it would stay inert whenever no
building sits underfoot. Completely undetermined ground (no fallback available)
**keeps the previous height** rather than dropping the camera.

---

## 5. Looking

At `'explore'` immersion, the look follows a **left-button drag** on the map — requiring
the button held is what keeps markers and symbols clickable, a "clean" click still counting
as a map click. At `'full'` immersion the mouse is **captured** (Pointer Lock), so the look
follows every movement **without a button** — the classic FPS view.

- `lookSpeed` (0.15°/px by default) sets the sensitivity.
- `invertY` (`true` by default) and `invertX` (`false`) invert each axis separately, in
  BOTH immersions. The vertical default follows the **map-drag** convention ("grab the
  scene": dragging down raises the view, like the orbit's pan) rather than an FPS one — an
  FPS-convention user passes `invertY: false`.
- `pitchMaxDeg` (89° by default) bounds the vertical look: at exactly 90°, the
  camera's frame degenerates.

**Two immersion levels** (`state.immersion`, driven by `setImmersion`):

| Level | Meaning |
|---|---|
| `explore` (default) | mouse visible, menus active — the look follows the drag described above |
| `full` | total immersion: **real browser fullscreen** + **Pointer Lock** (mouse captured, free look without a button), control bars **hidden**, central aiming **reticle** and an "Escape to exit" hint |

**FULLSCREEN drives immersion.** In pedestrian mode the toolbar's **fullscreen** button
(labelled "Total immersion") triggers it: the library goes into **real fullscreen**
(`requestFullscreen`, the browser chrome disappears), hides its bars and engages **Pointer
Lock**. So there is **no floating button** in the middle of the screen.

- **Enter**: the fullscreen button (or `F11`, or `interaction.shortcuts.pedestrian.immersion`
  if a key is set — see § 8). The click/press is the user gesture `requestPointerLock` demands;
  the lock is engaged once fullscreen is effective.
- **Leave**: **leaving fullscreen** (`Escape`, `F11`, or re-toggling) **leaves pedestrian
  mode** — back to orbit. A single `Escape` is enough (it releases the lock, then fullscreen,
  which exits the mode).

> The reticle takes the `theme.colors.pedestrian.reticle` colour; masking hides only the
> **control bars**, never the scene or markers (real fullscreen additionally removes the
> browser chrome — the two combine). `setImmersion` remains callable by the host, and arms the
> real fullscreen the same way.

---

## 6. Memorised view

The engine's imperative API accepts a **memorised look** (`{ heading, pitch }`,
radians) on entry, instead of picking up the heading of the camera you're leaving —
this is what makes a pedestrian view **restorable** exactly as it was left. Without
it, the initial heading picks up the current line of sight projected onto the ground,
so as not to disorient the user at the moment of the dive.

```ts
import { captureView, applyView } from 'map3d'

const view = captureView(engine)          // camera pose + basemap + tags + pedestrian view, if active
applyView(engine, view, { duration: 1.2 }) // 0 or omitted = instant; always instant if `view.pedestrian`
```

This is the mechanism the **template** manager uses to save "seen from the street,
heading south" alongside a drawing (see [TEMPLATES.md](TEMPLATES.md)): `captureView`
reads the current pedestrian pose (position, heading, pitch) and the immersion level;
`applyView` first leaves any pedestrian mode in progress, then, if the view memorised
one, re-enters it at the exact point with the restored look — never the ground
height, re-measured by raycast on every restore so it doesn't age with the tiles.
Applying a view that isn't a pedestrian one **closes the mode** on its own.

---

## 7. What changes on the map while walking

**View and fog** — the camera's far plane is set to `viewDistanceMeters` (1000 m by
default): beyond it, frustum culling cuts the tiles, which are therefore **never
requested**. Fog starts at `fogStartMeters` (700 m) and always ends at
`viewDistanceMeters`, dissolving the cut instead of leaving a sharp band at the
horizon.

That same distance **also bounds markers**: a DOM overlay keeps its screen size
regardless of distance to the camera, so an alert 700 km away would render on the
horizon line at the same size as a nearby one. A marker stops being shown exactly
where the scenery stops being shown — never over nothing (see [MARKERS.md](MARKERS.md)
for the eye-level declutter, the only mechanism left at ground level).

**Tile detail** — `tileDetailDistanceMeters` (120 m by default) is the reference
distance for level of detail, not the camera-to-ground distance: at eye height that
one is 1.70 m, which would demand maximum zoom across the whole horizon. So the
calculation is based on what you're actually looking at (the far end of the street),
not your own feet. Coverage refreshes at most once per `tileRefreshMs` (250 ms,
~4 Hz) — rebuilding it every frame would achieve nothing, the scenery hasn't moved a
step between two passes (see [TILES.md](TILES.md)).

**Draped shapes** — zones, paths and relation links stop drawing over the scenery:
they depth-test like the rest of the scene, so they stay occludable by buildings at
eye level (see [ZONES.md § 3](ZONES.md#3-draping)).

---

## 8. In the interface

The button lives in the **`pedestrian` group** of the view controls, next to the
"Globe" button — hidden (not greyed out) when the mode isn't servable, like every
button in this bar:

```tsx
<Map controls={{ buttons: { pedestrian: false } }} />   // to remove it
```

Its label switches between `labels.controls.pedestrian` ("Pedestrian mode") and
`labels.controls.pedestrianExit` ("Exit pedestrian mode") depending on `state.mode`.

**Shortcuts** — entering the mode is a toolbar button, so its key lives with the other
controls (`interaction.shortcuts.controls.pedestrian`, `W` by default):

```tsx
<MapControls shortcuts={{ pedestrian: 'e' }} />
```

In pedestrian mode the **fullscreen** button (`interaction.shortcuts.controls.fullscreen`,
`F` by default) is labelled "Total immersion" and triggers the real immersive fullscreen (see
§ 5) — it is the primary trigger. The dedicated immersion toggle
(`interaction.shortcuts.pedestrian.immersion`) stays a secondary hook: with no default key
(`false`), assigning one arms the same immersion (the `keydown` being a user gesture, it
engages the real fullscreen + Pointer Lock):

```tsx
<Map config={{ interaction: { shortcuts: { pedestrian: { immersion: 'v' } } } }} />
```

---

## 9. Settings (`config.pedestrian`)

### View and movement

| Key | Default | Role |
|---|---|---|
| `eyeHeightMeters` | `1.7` | eye height above the ground |
| `walkSpeed` | `5` | walking speed (m/s), independent of altitude |
| `sprintFactor` | `2` | multiplier while `Shift` is held |
| `lookSpeed` | `0.15` | look sensitivity (°/px of mouse movement) |
| `invertY` | `true` | inverts the vertical axis (default = map-drag convention) |
| `invertX` | `false` | inverts the horizontal axis |
| `pitchMaxDeg` | `89` | bound on the vertical look |
| `viewDistanceMeters` | `1000` | view distance — bounds the `far` plane, requested tiles, and marker display |
| `fogStartMeters` | `700` | start of the fog (always ends at `viewDistanceMeters`) |
| `nearMeters` | `0.1` | camera's near plane |
| `groundProbeMeters` | `5` | range of the ground ray under the feet |
| `tileDetailDistanceMeters` | `120` | reference distance for tile level of detail (what you're looking at, not your feet) |
| `tileRefreshMs` | `250` | minimum period between two tile-coverage updates |
| `groundSmoothing` | `0.25` | time constant (s) of the eye's vertical smoothing |

### Collision (`collision`)

| Key | Default | Role |
|---|---|---|
| `radiusMeters` | `0.3` | half-width of the body |
| `feelers` | `6` | horizontal rays fanned around the walking direction |
| `feelerMarginMeters` | `0.2` | feeler length in addition to the radius |
| `maxStepHeightMeters` | `0.4` | climbable rise per step; beyond it, a wall |

### Placement (`placement`)

| Key | Default | Role |
|---|---|---|
| `maxRoofDeltaMeters` | `2` | max tolerated gap between the targeted surface and street level |
| `ringRadiusMeters` | `20` | radius of the ground-sampling ring |
| `refreshMs` | `33` | minimum period between two cursor validations |
| `refreshSlopPx` | `3` | movement under which the previous validation is reused |

### Walking sway (`headBob`)

Camera sway effect at the pace of the step, **disabled by default**.

| Key | Default | Role |
|---|---|---|
| `enabled` | `false` | enables the effect |
| `amplitudeMeters` | `0.05` | vertical amplitude |
| `frequency` | `1.8` | oscillations per second at nominal walking speed |

### Transitions (`transitions`)

The camera **glides** from the sky down to the street on entry, and climbs back to its
starting orbital pose on exit. Setting a duration to `0` restores the instant jump.

| Key | Default | Role |
|---|---|---|
| `enterMs` | `800` | duration of the dive on entry (`0` = instant) |
| `exitMs` | `600` | duration of the climb-out on exit (`0` = instant) |

---

## 10. Theme (`theme.colors.pedestrian`)

| Key | Default | Role |
|---|---|---|
| `placeValid` | `#2E7CF6` | target shown when the aimed point is a placeable street |
| `placeBlocked` | `#d11a01` | crossed-out target when the aimed point is a roof or the sky |
| `reticle` | `#f8fafc` | central reticle of total immersion |

**Optional** sub-tree: a complete theme written before this addition stays valid, the
layer falling back to its own defaults (`ui.accent`/`ui.error`/`ui.text`).

---

## 11. What's exported

| Export | Role |
|---|---|
| `usePedestrian()` | reactive hook — see § 3 |
| `PedestrianApi` | the hook's return type, and `MapHandle.pedestrian`'s |
| `CameraMode` | `'orbit'` \| `'pedestrian'` |
| `PedestrianPhase` | `'placing'` \| `'active'` |
| `ImmersionLevel` | `'explore'` \| `'full'` |
| `PedestrianState` | see § 3 |
| `PedestrianConfig`, `PedestrianCollisionConfig`, `PedestrianPlacementConfig`, `PedestrianHeadBobConfig`, `PedestrianTransitionsConfig`, `PedestrianShortcuts` | types of `config.pedestrian` — see § 9 |
| `TemplatePedestrianView` | a pedestrian view memorised by a template (`{ heading, pitch, lat, lng, immersion }`) — see [TEMPLATES.md](TEMPLATES.md) |
| `captureView(engine)`, `applyView(engine, view, opts?)` | memorise / restore a full view, pedestrian included — see § 6 and [TEMPLATES.md](TEMPLATES.md) |

---

## See also

- [CAMERA.md](CAMERA.md) — the camera's two other drivers (`flyTo`, `follow`)
- [TILES.md](TILES.md) — tile providers, level of detail while walking
- [ZONES.md](ZONES.md) — depth-testing of draped shapes at ground level
- [MARKERS.md](MARKERS.md) — eye-level declutter
- [TEMPLATES.md](TEMPLATES.md) — saving a pedestrian view with a drawing
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [THEME.md](THEME.md) · [LABELS.md](LABELS.md)

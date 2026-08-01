# Preferences — end-user tuning

[Français](../fr/PREFERENCES.md) · **English** · [↑ Index](README.md)

A panel the **end user** opens from the map to tune 3D quality and controls, like a video
game's graphics menu. Not to be confused with `config` (what the **application** locks in,
see [CONFIG.md](CONFIG.md)) nor with the demo test bench: here it's three presets and a few
keys, nothing more.

## 1. Where and how

The panel is mounted by the toolbar's **⚙ button** (`Toolbar`), in the footer, below
"Plugins". It needs no props: as soon as a `<MapProvider>` is present (the one `<Map>`
mounts for you, or your own), the "Preferences" row appears.

It **never** touches the engine directly. Every action writes a `Preferences` object to a
persisted store (localStorage), which `<MapProvider>` merges as a **third layer**:

```
defaultConfig  <  config (application)  <  preferences (user)
```

The change is then pushed to the engine **hot**, through the same path as the `config`
prop. Direct consequences:

- **Persisted**: a setting survives a reload, replayed on mount.
- **The user wins** over the application (that's the point), but nothing is applied until a
  preference is stored — a map that was never tuned stays exactly what the application
  asked for.
- **No flash**: presets only touch settings that apply hot.

## 2. 3D quality — presets only

Four buttons, no sliders. **Auto** probes the machine once
(`navigator.hardwareConcurrency` / `deviceMemory` / `devicePixelRatio`); the other three
force the level. Each level applies this bundle of **hot** levers:

| Lever (`config`) | High | Medium | Low |
| --- | --- | --- | --- |
| `performance.pixelRatio` | min(dpr, 2) | 1 | 1 |
| `performance.adaptiveResolution.minRatio` | 0.75 | 0.5 | 0.4 |
| `performance.adaptiveResolution.targetFrameMs` | 22 | 22 | 28 |
| `performance.textureAnisotropy` | 0 (max) | 4 | 1 |
| `providers.buildings.maxViewDistance` | 5000 | 3500 | 2000 |
| `providers.buildings.maxTiles` / `maxBytes` | 80 / 448 Mi | 48 / 256 Mi | 24 / 128 Mi |
| `providers.buildings.maxRequest` | 49 | 32 | 16 |
| `sky.enabled` / `clouds.coverage` | on / 0.35 | on / 0.2 | **off** |
| `providers.tiles.retina` | on if dpr > 1 | off | off |

"High" broadly mirrors the library defaults — except for `adaptiveResolution.minRatio`,
where the preset **raises** the floor (0.75 vs 0.5 in `defaultConfig`): adaptive resolution
drops less, so the photogrammetric ground stays sharper, at a little GPU cost — a deliberate
notch for a capable machine. **Deliberately excluded**:
`performance.antialias` and `performance.powerPreference` (read at WebGL context creation —
changing them would require a remount), and the **raster** budget `tiles.maxTiles`
(lowering it reopens the flat far-field).

## 3. Controls (Preferences panel)

The *feel*, not the keys:

- **Move speed**: Slow / Normal / Fast → `camera.keyPan.speed` (0.4 / 0.8 / 1.5).
- **Map glide** (`interaction.damping`): checked, the map keeps coasting after a drag and
  eases to a stop; unchecked, it stops instantly.

## 4. Shortcuts — editing in place

Keys are changed **directly in the "Shortcuts" recap** of the same ⚙ (not in Preferences,
not in a separate block: a single key list, no duplicate). Each rebindable key shows a
**pencil** and is **clickable** to change it — the recap grid is otherwise unchanged
(movement and view are simply listed key by key).

- **Scope** — movement (`forward`, `backward`, `left`, `right`, `boost`) and view (`north`,
  `tilt`, `globe`, `zoomIn`, `zoomOut`, `fullscreen`). The rest of the recap (pan, drawing
  tools, selection, editing…) stays read-only.
- **Editing** — clicking a key arms capture (`…`); the next keystroke assigns it if **free**,
  `Escape` cancels. Default ZQSD; arrow keys always stay bound.
- **Conflict detection** — a key is **rejected** (red kbd) if it is already taken by **any
  command**: not just movement/view, but also drawing tools, the basemap toggle, the lens,
  `Space` (pan)… Reassigning "North" to `b` (which toggles the basemap) is blocked.
- **Reset keys only** — below the recap, the "Reset keys" button returns ALL reassigned
  shortcuts to their original layout, without touching quality, speed or damping. Inert until
  a key has actually been rebound.
- **Reset all** — the "Reset preferences" button (Preferences panel) also clears reassigned
  keys, on top of everything else.

## 5. For the application

The panel is enough — nothing to wire. To go further, the library exports:

```ts
import {
  PreferencesPanel,        // the panel itself, to mount in YOUR surface
  usePreferences,          // { prefs, hasStored, store } — read/write from your own UI
  preferencesToPartialConfig, // Preferences → PartialConfig (pure)
  qualityPreset, detectQuality, detectDeviceCaps, // quality presets (pure)
  defaultPreferences,
  type Preferences, type QualityLevel, type QualityChoice,
  type KeyboardLayout, type MoveSpeed, type BindableAction,
} from '@pasquelin/map3d'
```

- **Storage key**: `config.data.storageKeys.preferences` (default `m3d:preferences`) — set
  distinctly if two maps share an origin.
- **Hide the feature**: remove the toolbar's `settings` section
  (`toolbar={{ components: { settings: false } }}`) or don't show the bar.
- **Force a level from the host** without the panel: apply `qualityPreset(level)` to your
  `config` prop.

> **Known limitation**: the ⚙ lives in the drawing toolbar (it requires `<DrawLayer>`).
> Without drawing, mount `<PreferencesPanel/>` in your own surface (like `StatsPanel`) — it
> only needs a `<MapProvider>` above it.

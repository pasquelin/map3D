# Plugins — author guide

[Français](../fr/PLUGINS.md) · **English** · [↑ Index](README.md)

A **plugin** adds information to the map without touching map3D's core: its data
source, its rendering and its configuration are declared once, and the library
executes and wires them to the existing infrastructure (`MarkerLayer`, clustering,
the “Layers” filter, search…).

This document covers the `Plugin` contract, the lifecycle, configuration, the
end-user hub, performance and security on the author's side, and ends with the
**registry of official plugins**.

- Exhaustive props and real defaults → [PROPS.md](PROPS.md)
- Persistence key → [CONFIG.md](CONFIG.md)

---

## 1. Concept and mental model

**A plugin declares, map3D executes and wires.** The author writes no three.js, no
frame handling, no registry wiring for the declarative path — it supplies pure
functions (fetch, mapping, control rendering), and the library plugs them into the
existing pipeline (`DataSource`, `MarkerLayer`, `ClusterRegistry`, the tag filter).

```
Host (React app)
  <Map plugins={[myPlugin()]} pluginStorageKey?="m3d:plugins">
        │
        ├─ engine.plugins : PluginRegistry     — definitions, { enabled, config } state
        ├─ <PluginSurfaces>                    — one <PluginHost> per ENABLED plugin
        │     • path A: data.fetch → MarkerLayer
        │     • path C: engine.addLayer(plugin.layer(ctx))
        │     • enrichBuilding: orchestrated by engine.enrichment on building click
        └─ Toolbar → Settings → “Plugins” hub (toggle + auto-rendered config)
```

**The library ships no concrete plugin.** It exposes the platform (contract,
registry, hub, hooks); official plugins live outside the library (§ 9).

A plugin **must** provide at least one of `data`, `layer`, `enrichBuilding`,
`setup` — otherwise it does nothing.

> **Plugin or catalog toggle source?** Both load markers from the viewport. A plugin is
> a packaged, versioned, distributed **third-party capability** that users enable from
> the hub; a catalog toggle is a **reference set of the host application**, sitting
> beside its other sets, with no packaging and no versioning. Full decision table:
> [CATALOG.md § 4.3](CATALOG.md#43-toggle-or-plugin).

---

## 2. Anatomy of a plugin

The entry point is `definePlugin`, which infers `C` (the config type) from the
schema, so `ctx.config` is typed without any annotation:

```ts
import { definePlugin } from '@pasquelin/map3d'

export const myPlugin = () =>
  definePlugin({
    meta: {
      id: 'my-plugin',         // unique namespace: config, persistence, “Layers” tag
      name: 'My plugin',
      description: 'What the plugin does, in one sentence',
      icon: mdiMyIcon,          // @mdi/js path
      version: '1.0.0',
      author: 'me',
      homepage: 'https://…',
    },
    enabledByDefault: false,  // enabled on first mount if the user never chose
    config: [ /* § 3 */ ] as const,
    data: { /* § 4 */ },
    markerLayer: { /* § 5 */ },
    layer: (ctx) => myLayer(ctx),          // escape hatch — § 7
    enrichBuilding: async (hit, ctx) => ({ /* … */ }),  // § 6
    setup: (ctx) => {                       // global lifecycle — resources that
      const id = setInterval(() => {}, 1000)   // depend on no single path (websocket, timer)
      return () => clearInterval(id)           // teardown on disable
    },
  })
```

The `as const` on `config` is what lets `definePlugin` infer the keys and value
types (`boolean`/`number`/`string`) without a manual annotation.

**Lifecycle**: `register()` at mount (through `<Map plugins>`), `setEnabled(id,
true)` mounts the `<PluginHost>` (paths A/C, `setup`), `setEnabled(id, false)` or
`unregister()` unmounts it (in-flight fetches aborted, `layer.dispose()`, `setup`
teardown).

---

## 3. Config schema

`config?: readonly PluginField[]` is the **only** source of default values, and
the hub (library) and a plugin's dev panel (outside the library) render it
**identically** — the author writes no form.

```ts
type PluginField =
  | { key: string; label: string; help?: string; refetch?: boolean; type: 'boolean'; default: boolean }
  | { key: string; label: string; help?: string; refetch?: boolean; type: 'number'; default: number; min?: number; max?: number; step?: number }
  | { key: string; label: string; help?: string; refetch?: boolean; type: 'string'; default: string; secret?: boolean; placeholder?: string }
  | { key: string; label: string; help?: string; refetch?: boolean; type: 'select'; default: string; options: Record<string, string> }
```

| Common field | Role |
|---|---|
| `key` | Stable key in the config object (TS identifier). |
| `label` | Displayed label (hub + dev panel) — a string supplied by the plugin, not library i18n. |
| `help` | Optional short help (control tooltip). |
| `refetch` | `true` = changing this field re-triggers `data.fetch` (§ 4). Default `false` = purely visual field, no network call. |

`secret: true` (on `string` fields) masks the value in the control; the hub and
the dev panel **never** copy it to the clipboard or to logs (§ 11).

Illustrative example, a self-contained demo plugin with no network (§ 12):

```ts
config: [
  { key: 'count', type: 'number', default: 12, min: 1, max: 60, refetch: true, label: 'Point count' },
  { key: 'kind', type: 'select', default: 'poi', options: { poi: 'POI', alert: 'Alert' }, refetch: true, label: 'Type' },
  { key: 'showTitles', type: 'boolean', default: true, label: 'Show titles' },
  { key: 'note', type: 'string', default: '', placeholder: 'Free note', label: 'Note' },
] as const,
```

`count` and `kind` carry `refetch: true` (they change what is requested);
`showTitles` and `note` are cosmetic (they only change how already-loaded markers
render).

---

## 4. Data source and refresh

Path **A** (declarative) is the common case: the plugin maps its items into
`MarkerData[]`, and the library plugs that function into its existing
`DataSource` + `MarkerLayer` pipeline (debounce, cancellation, marker recycling).

```ts
data?: {
  fetch: (ctx: PluginDataContext<C>) => Promise<MarkerData[]> | MarkerData[]
  refresh?: 'viewport' | { intervalMs: number } | 'manual'
  minZoom?: number
  fetchPolicy?: Partial<FetchPolicy>
}
```

| Field | Role |
|---|---|
| `fetch` | Receives `ctx.viewport` (`{ bounds, center, zoom }`) and returns `MarkerData[]`. |
| `refresh` | `'viewport'` (default): refetched on camera move. `{ intervalMs }`: polling, **paused** while the tab is hidden. `'manual'`: refetched only through `refresh()` (§ 8). |
| `minZoom` | Zoom gate: below this zoom, no fetch. |
| `fetchPolicy` | Overrides `timeoutMs`/`retries`/`backoffMs` of `defaultPluginFetchPolicy` (10 s / 1 retry / 300 ms) — useful against a third-party API with a tight quota. |

`PluginContext<C>` (the base of `PluginDataContext`) also carries `engine` (the
`MapEngine`), `config` (resolved, typed) and `signal` (an `AbortSignal` cancelled
on disable, on unmount, or when a `refetch` field changes).

```ts
data: {
  refresh: 'viewport',
  fetch: (ctx) => {
    const { bounds } = ctx.viewport
    return fetchPOIs(bounds, ctx.config.apiKey, { signal: ctx.signal })
      .then((items) => items.map((it) => ({ id: it.id, position: it.pos, type: 'poi', title: it.name, data: it })))
  },
},
```

**Minimal refetch**: a config change only re-triggers `fetch` if a `refetch: true`
field changed; a cosmetic field only re-renders `MarkerLayer`'s props. Never a
remount on a config change.

---

## 5. Map rendering

`markerLayer?: MarkerLayerDecl` reuses the existing marker ergonomics — the library renders
`data.fetch`'s result inside an internal `<MarkerLayer>`. It is the SAME type as
`CatalogToggleSource.markerLayer` ([CATALOG.md § 4](CATALOG.md#4-toggle-sources)): one
capability is not configured two different ways depending on where it comes from.

```ts
type MarkerLayerDecl = {
  menu?: (p: MarkerData<unknown>) => MenuItem[]
  tooltip?: MarkerLayerProps<unknown>['tooltip']
  icon?: (p: MarkerData<unknown>) => string
  typeLabel?: (type: string) => string
  cluster?: { enabled: boolean }
  size?: number
}
```

The mapping to `MarkerData` (§ 4) carries the essentials: `id` (stable identity —
recycling instead of recreation), `position`, `type` (colour, search group),
`title` (searchable, displayed name), `tags` (the “Layers” filter — see
[MARKERS.md § 3](MARKERS.md#3-anatomy-of-a-markerdata) for the full type). Without
`tags`, a marker gets `['marker', type]` by default.

- **Clustering**: `cluster: { enabled: true }` registers the plugin's markers into
  the **same** grouping as the rest of the map (`engine.clusters`) — a single
  index, not one per plugin.
- **Menu** and **tooltip**: the same contracts as `<MarkerLayer menu>`/`tooltip`
  (see [MARKERS.md § 5](MARKERS.md#5-tooltip)).
- **Tags**: a plugin that tags its markers (`MarkerData.tags`) registers them into
  the “Layers” filter automatically — nothing to wire.

---

## 6. The "enrich" path at building pick

Some plugins add nothing to the map: they **enrich** a building already picked by
the library (`buildingclick`, see [BUILDINGS.md](BUILDINGS.md)).

```ts
enrichBuilding?: (hit: BuildingHit, ctx: PluginContext<C>) => Promise<BuildingEnrichmentResult>
// type BuildingEnrichmentResult = { attrs: Record<string, unknown>; tags?: string[] }
```

`hit.info` (`BuildingInfo`) carries `featureId`, `lat`/`lng` (the clicked point),
`height`/`minHeight`, `props` (attributes already surfaced by the tile provider)
and `bounds`.

map3D **orchestrates** everything:

- On `buildingclick`: **abort** of the previous pick's enrichment request, a new
  `AbortSignal`, calling `enrichBuilding` on every **enabled** plugin, per-plugin
  `{ loading, data, tags, error }` state (`EnrichmentState`).
- The click stays **instant** — emitting `buildingclick` never waits on the
  network, enrichment arrives afterwards.
- The host reads the merged result via `useBuildingEnrichment()`:

```tsx
import { useBuildingEnrichment } from '@pasquelin/map3d'

function BuildingSheet() {
  const { loading, data, tags, error, byPlugin } = useBuildingEnrichment()
  if (loading) return <Spinner />
  if (error) return <p>Error</p>
  return <AttrTable attrs={data} sources={tags} />
}
```

Mount it anywhere under `<Map>` (a side panel, a modal, `<Map>`'s `children`) — the
library doesn't attach it to any particular UI; `useBuildingEnrichment()` reads from
any child component of the map context. Unrelated to `<Map buildingMenu>`: that prop
only builds the `MenuItem[]` context menu opened on a building click (see
[BUILDINGS.md § 3](BUILDINGS.md#3-buildingmenu--the-contract)), it doesn't render any
component.

**Provenance tags**: `{ attrs, tags? }` — `tags` (default `[plugin.meta.id]`) marks
**where** each block comes from. When N plugins enrich the same building, the host
displays “Source: X” and **filters** sources through the existing “Layers”
mechanism (`engine.tags`) — no new system.

**Outside React** — the orchestrator is `engine.enrichment`, a `PluginEnrichment` (public
export): `get(pluginId)` returns one plugin's state, `merged()` the merge of the `data`
(and the union of the `tags`) of the enabled plugins not hidden by "Layers", `on(listener)`
subscribes to changes — which is what `useBuildingEnrichment()` does through
`useSyncExternalStore`. Nothing per frame: everything starts from `buildingclick`.

---

## 7. `Layer` escape hatch

For rendering that the declarative path doesn't cover (a custom WebGL overlay), a
plugin contributes a raw engine `Layer`:

```ts
layer?: (ctx: PluginLayerContext<C>) => Layer
```

`Layer` is the engine's contract (`update`/`project`/`dispose`/`setConfig?`/
`setGrounded?` — see [ENGINE.md § 3](ENGINE.md#3-writing-a-layer)): `update`
advances the 3D state, `project` writes the DOM overlays (a pure write pass, after
every read), `dispose` releases resources.

Mounted via `engine.addLayer(layer)` on enable, `engine.removeLayer(layer)` (which
calls `dispose()`) on disable.

> ⚠️ **Recreated on config change, not updated.** `Layer.setConfig` receives the
> MAP's config (`MapConfig`), not the plugin's config: the platform **recreates**
> the whole `Layer` on every plugin config change, instead of relaying that config
> through `setConfig`. This is **not** the “never remounted” guarantee of the
> markers path (§ 4) — a plugin heavy on this path should keep its `layer()`
> cheap to construct, or prefer path A/`setup` for anything that changes often.

---

## 8. The hub and user configuration

**The “Plugins” hub is the sole end-user UI surface for plugins** (no per-plugin
button) — a row in the `<Toolbar>`'s **Settings** menu (hidden if no plugin is
registered), opening a lateral sub-panel: per row, icon + name + on/off toggle,
and if the plugin has a `config`, a disclosure with **auto-rendered** controls
from the schema (§ 3) — checkbox, slider+number, `input type=password` if
`secret`, select. At the bottom, a **“Tout désactiver”** button
(`labels.plugins.clear`) turns off every active plugin at once — greyed out when
none is; the counterpart of the catalog settings' “Tout retirer”.

On the host side, `usePlugins()` gives the same programmatic access:

```tsx
import { usePlugins } from '@pasquelin/map3d'

const { plugins, byId } = usePlugins()
const p = byId('my-plugin')
p?.setEnabled(true)
p?.setConfig({ count: 30 })
p?.resetConfig()
p?.refresh()   // for data.refresh === 'manual'
```

`PluginView` carries `meta`, `enabled`, `config`, `schema`, and the
`setEnabled`/`setConfig`/`resetConfig`/`refresh` actions. `useSyncExternalStore` on
`engine.plugins`: no polling, re-render only when the plugin state changes.

**Persistence**: each plugin's `{ enabled, config }` state is written to
localStorage under `config.data.storageKeys.plugins` (default `'m3d:plugins'`,
configurable via `<Map pluginStorageKey>`, `null` to disable). Only the
**partial** (the diff from the schema defaults) is stored, to survive schema
evolutions — an unknown key at load time is ignored. **Debounced** write: never on
every `pointermove` of a slider.

---

## 9. Packaging and distribution

**The library ships no concrete plugin**: it exposes only the platform (the
`Plugin` contract, `PluginRegistry`, hub, hooks). Official plugins live **outside
the library**, in the `plugingsMap3D` monorepo (npm scope `@map3d`, one package per
plugin — `@map3d/plugin-<name>`), each with `map3d` as a **peerDependency**.

A **third-party** plugin follows the same contract, shipped as a published npm
package or as a local `file:` dependency — no remote loading at runtime.

```tsx
import { myOfficialPlugin } from '@map3d/plugin-something'
import { myOwnPlugin } from './plugins/mine'

<Map plugins={[myOfficialPlugin(), myOwnPlugin()]} />
```

**Dynamic import for heavy plugins** — a plugin bundling a heavy SDK (catalogue,
third-party rendering engine) should follow the precedent of the library's MIL-STD SDK
(~9 MB, a dependency installed with the package but loaded through `import()` on the
first symbol, outside the initial bundle): expose a factory that dynamically imports the
dead weight, so no map pays its cost without using it.

```ts
export const myHeavyPlugin = () =>
  definePlugin({
    meta: { /* … */ },
    setup: async (ctx) => {
      const { initSdk } = await import('./heavy-sdk')
      const sdk = await initSdk()
      // …
    },
  })
```

---

## 10. Performance — the 10 rules, author side

A map is a real-time rendering engine: the plugin system **must cost nothing to
the frame**. What the platform guarantees, and what remains the author's
responsibility:

1. **Reuse the viewport pipeline** — path A goes through `DataSource` + debounce +
   cancellation + marker recycling; do not reimplement your own fetch/render loop.
2. **Zero work per frame** — everything is event-driven (`'plugins'`, viewport,
   timers). Only the `layer` path (escape hatch) participates in the render loop,
   under your own responsibility.
3. **Shared clustering** — a single `ClusterRegistry` aggregates every plugin; do
   not keep your own index.
4. **Disabled plugin = zero cost** — no host mounted, no fetch, no layer, no
   timer. Guaranteed by the platform (the `<PluginHost>` unmounts).
5. **Minimal refetch** — a config change only re-triggers `fetch` if a `refetch:
   true` field changed (§ 3); never a remount on a config change.
6. **Disciplined network** — respect `ctx.signal` in your `fetch` (abort tied to
   disable, viewport change, a refetch, unmount); reuse `ctx.fetchPolicy`; if you
   poll in addition to the viewport, the platform already pauses the timer when
   `document.hidden`.
7. **Debounced persistence** — already handled by `PluginRegistry` (§ 8); do not
   write your own localStorage on every keystroke.
8. **Event-driven hub** — handled by the platform (`useSyncExternalStore`); if you
   read `usePlugins()`/`useBuildingEnrichment()` yourself, do not poll.
9. **Bundle** — a heavy plugin must be loaded through **dynamic import** (§ 9),
   never auto-imported by the library.
10. **Allocations** — if you supply `markerLayer.menu`/`tooltip`/`icon`, keep these
    functions **stable** (module-level, not recreated per render): the platform
    already memoises them on the `PluginHost` side, but a function recreated on
    every call of your factory (`myPlugin()`) would invalidate that memoisation.

---

## 11. Security

- **`secret: true`** on a `string` field masks its value in the hub and the dev
  panel; neither ever copies it to the clipboard or to logs. A third-party API key
  **must** be declared `secret`.
- **Never a hard-coded secret** in the plugin's code: the key comes from
  `ctx.config` (entered by the end user through the hub, or seeded by the host at
  registration), never from a committed constant.
- **Quotas** — a third-party API has limits; `fetchPolicy` (§ 4) moderates retries
  (default 1 retry, 300 ms backoff) instead of hammering a struggling service. A
  config field such as `maxItems`/`refreshMinutes` lets the end user tune their
  own call volume.
- A key embedded in a **browser** bundle stays visible client-side: document that
  limitation in your plugin's README if the third-party API does not support
  referrer restrictions (the same caveat as for `createGoogleRoutesProvider`, see
  [README.md](README.md#relations-real-distances-and-travel-times)).

---

## 12. Cookbook — building a demo plugin step by step

A self-contained plugin with no network (procedural), exercising path A, the 4
config field types, `refetch` vs cosmetic, and enrichment at pick. Purely
illustrative: it doesn't live in `examples/react/`, which instead wires in real
official plugins (`@map3d/plugin-geopf`, `@map3d/plugin-windy`,
`@map3d/plugin-plan-3d` — see § 13).

**1. Meta and activation**

```ts
import { mdiMapMarkerStar } from '@mdi/js'
import { definePlugin } from '@pasquelin/map3d'
import type { MarkerData } from '@pasquelin/map3d'

export const demoPlugin = () =>
  definePlugin({
    meta: {
      id: 'demo-poi',
      name: 'Demo points',
      description: 'Procedural markers + enrichment at pick (platform demo)',
      icon: mdiMapMarkerStar,
      version: '1.0.0',
      author: 'map3d',
    },
    enabledByDefault: true,   // visible with no user action, for the demo
```

**2. The config schema — the 4 field types**

```ts
    config: [
      { key: 'count', type: 'number', default: 12, min: 1, max: 60, refetch: true, label: 'Point count' },
      { key: 'kind', type: 'select', default: 'poi', options: { poi: 'POI', alert: 'Alert' }, refetch: true, label: 'Type' },
      { key: 'showTitles', type: 'boolean', default: true, label: 'Show titles' },
      { key: 'note', type: 'string', default: '', placeholder: 'Free note', label: 'Note' },
    ] as const,
```

`count` and `kind` change what is **generated** → `refetch: true`. `showTitles`
and `note` only change the appearance of already-generated points → no `refetch`.

**3. The source — path A, no network**

```ts
    data: {
      refresh: 'viewport',
      fetch: (ctx) => {
        const { bounds } = ctx.viewport
        const n = ctx.config.count            // typed number, no annotation
        const out: MarkerData[] = []
        for (let i = 0; i < n; i++) {
          // Deterministic grid within the current bounds (no Math.random: a
          // stable render doesn't recreate markers on every render).
          const fx = (i % 4) / 4 + 0.1
          const fy = Math.floor(i / 4) / Math.ceil(n / 4) + 0.05
          out.push({
            id: `demo-${i}`,
            position: { lat: bounds.south + (bounds.north - bounds.south) * fy, lng: bounds.west + (bounds.east - bounds.west) * fx },
            type: ctx.config.kind,
            title: ctx.config.showTitles ? `Demo ${i + 1}` : undefined,
            tags: ['demo-poi'],
            data: {},
          })
        }
        return out
      },
    },
    markerLayer: { cluster: { enabled: true } },
```

**4. Enrichment at pick**

```ts
    enrichBuilding: async (hit) => ({
      attrs: {
        Latitude: hit.info.lat.toFixed(5),
        Longitude: hit.info.lng.toFixed(5),
        'Height (demo)': `${Math.round(hit.info.height)} m`,
      },
      tags: ['demo-poi'],
    }),
  })
```

**5. Wiring it up**

```tsx
<Map plugins={[demoPlugin()]}>
  <BuildingSheet />
</Map>
```

This plugin never touches the network (procedural data), so it doesn't illustrate
`fetchPolicy`/`secret` — see § 4 and § 11 for the third-party-API path, and an
official plugin from the registry (§ 13) for a complete real-world example.

---

## 13. Registry of official plugins

An **official** plugin is maintained in the `plugingsMap3D` monorepo, published
under the `@map3d` npm scope, and listed here. Technically identical to a
third-party plugin — the organisation and the scope make it “official”. This table
**links** to each plugin's own documentation (its package README); it does not
duplicate it.

| Name | npm package | Link | Compatible `map3d` range |
|---|---|---|---|
| France buildings (BDTOPO) | `@map3d/plugin-geopf` | `plugingsMap3D/packages/geopf` | `>=0.1.0 <0.2.0` |
| Windy Webcams | `@map3d/plugin-windy` | `plugingsMap3D/packages/windy` | `>=0.1.0 <0.2.0` |
| 3D plan (placeholder) | `@map3d/plugin-plan-3d` | `plugingsMap3D/packages/plan-3d` | `>=0.1.0 <0.2.0` |

This registry grows with each official plugin published in `plugingsMap3D` — update
it in the same movement as their first publication.

---

## See also

- [ENGINE.md](ENGINE.md) — engine, events, registries, writing a layer
- [MARKERS.md](MARKERS.md) — `MarkerData`, clustering, the “Layers” filter
- [BUILDINGS.md](BUILDINGS.md) — building picking, `buildingMenu`, `BuildingInfo`
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md)

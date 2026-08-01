# Relations — real distances and travel times

[Français](../fr/RELATIONS.md) · **English** · [↑ Index](README.md)

`<RelationLayer>` links a marker to its neighbours **by tags**, with the **real road**
distances and durations from a routing provider.

A “Distance around” section is **grafted onto** the marker's context menu: it does not
replace it. The tag families applicable to the source are listed there, each one
opening its selection presets.

---

## 1. In two minutes

```tsx
import { createGoogleRoutesProvider, type RelationRule } from 'map3d'

// The ONLY place the domain lives: the engine only knows tags.
const RULES: RelationRule[] = [
  {
    id: 'alert-to-agents',
    label: 'Agents',                          // level-2 menu label
    from: { any: ['alert'] },                 // the source marker must satisfy this
    to: { any: ['user'], none: ['onsite'] },  // and so must candidate targets
    color: '#22c55e',                         // family chip (optional)
    mode: 'DRIVE',
    selection: { mode: 'fastest', count: 3, maxMeters: 15_000 },
    limit: { compute: 15, render: 10 },
  },
]

const provider = useMemo(() => createGoogleRoutesProvider({ apiKey, region: 'fr' }), [apiKey])

<Map
  layers={[markersLayer({ points: markers })]}
  relations={{ rules: RULES, provider }}
  markerMenu={(m, relations) => [...base(m), { separator: true }, ...(relations?.menuFor(m) ?? [])]}
/>
```

`<Map relations={…}>` mounts the engine **around** the marker layers, which is what
makes its entries reach their context menu (second argument of `markerMenu`).

> `provider` must be **stable** (`useMemo`): it determines the engine's identity.
> Passed inline, it would be recreated on every render and would wipe the open
> relations.

Manual mounting, with the render-prop form:

```tsx
<RelationLayer rules={RULES} provider={provider}>
  {(relations) => (
    <>
      <MarkerLayer points={markers} menu={(m) => [...base(m), ...relations.menuFor(m)]} />
      <RelationStatusBar nameOf={(p) => nameById(p.id)} />
    </>
  )}
</RelationLayer>
```

---

## 2. The rule

```ts
type RelationRule = {
  id: string
  label: string              // level 2 of the menu — supplied by the app, never inferred
  from: TagSelector          // condition on the SOURCE marker
  to: TagSelector            // condition on the TARGETS
  color?: string
  mode: TravelMode           // 'DRIVE' | 'WALK' | 'BICYCLE' | 'TWO_WHEELER' | 'TRANSIT'
  selection: {
    mode: 'fastest' | 'radius'
    count?: number           // fastest: links kept
    radiusMeters?: number    // radius: radius
    maxMeters: number        // 💰 cost guardrail, BEFORE any network call
  }
  limit: {
    compute: number          // 💰 items sent to routing per interaction
    render: number           // links drawn simultaneously
  }
  cutoffSeconds?: number     // real duration beyond which a link is discarded
}
```

### Tag selectors

```ts
type TagSelector = { any?: string[]; all?: string[]; none?: string[] }
```

| Clause | Meaning |
|---|---|
| `any` | at least one — **OR** semantics, the same as the “Layers” filter |
| `all` | all required |
| `none` | exclusion |

The three combine with **AND**.

### Selection

- **`fastest`** keeps the `count` fastest. The closest as the crow flies is not the
  fastest (one-way streets, a river to go around): the library **oversamples**
  (`fastestOversample`, default 3 candidates per displayed link) and **duration**
  decides.
- **`radius`** keeps everything under `radiusMeters`.

`maxMeters` is the guardrail applied **before** any network call; `limit.compute` and
`limit.render` cap the points sent to routing and the links drawn, respectively.

> 💰 Each unit of `fastestOversample` multiplies the size of the billed matrix. At `1`,
> only the immediate neighbourhood is queried — and the result stops being “the
> fastest”.

### Menu presets

The steps offered by a family's menu (“the 3 fastest”, “within 500 m”) are configured
through `menuPresets`: the right scale depends on what you are linking.

Every item shows a **hint** derived from the **actual** selection — which is what
guarantees the menu and the map count the same thing. A preset with no target is
disabled. The rule's default preset is **marked**, not preselected: nothing runs until
the user clicks.

---

## 3. What is displayed

A flat **hub** under the source marker, one **link** per target with its rank and its
`2.4 km · 9 min` label, and the **real route** when a link is clicked.

The hub carries its relation's **status bar**: it anchors right next to the marker,
follows its moves, and flips to the other side of the hub when the container edge gets
too close. Each open relation therefore has its own bar, where the eye already is.

The bar describes **what is actually on screen**, and changes with it:

| | Without a route | Route traced |
|---|---|---|
| Chip | family colour | route colour |
| Title | `source → family` | `source → chosen target` |
| Segments | family, travel mode | travel mode only |
| Measure | extent (`The 3 fastest`) | `2.4 km · 9 min` of the trip |

The family selector disappears once the target is settled — it would offer to redo a
choice already made.

Changing the **travel mode** during a trace **re-traces** it in the new mode instead of
falling back to direct links: it is the same trip asked differently. The old trace stays
visible during recomputation rather than leaving a gap.

Targets aggregated into the same **cluster** share a trunk and open into a fan, without
ever bursting the cluster or touching the zoom (beyond `fanMaxLegs`, default 5, the fan
collapses into an aggregated link).

Links **follow both ends**: a moving marker carries its link along, and beyond
`staleMeters` the times are recomputed — throughput capped by `refreshIntervalMs`, so a
fast vehicle cannot trigger more than one call per interval.

---

## 4. Colours: two questions, two answers

The **link** answers “who does this beam come from?”: it carries the colour of **its
source marker** (`theme.colors.marker[type].base`, exactly its chip's), links and hub
included — and it is resolved **on every pass**, so an agent changing status also
changes the colour of its links without reopening the relation.

The **family chip** (marker menu, status-bar toggle) answers “what does this family
target?”: it carries the colour of the **tag targeted** by the rule, resolved as in the
“Layers” panel (`theme.colors.tags`, then `tagColor`'s hashed palette).

The chosen tag is the last of `to.all` (the most restrictive:
`{ all: ['alert', 'critical'] }` → “critical”), otherwise the first of `to.any` (see
`familyTag`).

Resolution order: `rule.color` → source marker colour → `defaultColor`.

---

## 5. Dashed links, solid routes

**Search** links use a **marching dash** — the selection's marching ants, transposed
onto a 3D ribbon:

```tsx
<Map relations={{ rules, provider, linkDash: { length: 12, gap: 8, speed: 40, gapOpacity: 0.25 } }} />
```

Lengths and speed in screen pixels (`speed` = px/s **towards the target**), `false` for
a solid line.

The gap between two dashes is **not empty**: it keeps the link's colour at
`gapOpacity`, which gives it a continuous body without imposing an outline in another
tint — a dashed link therefore gets no `casingWidth`.

The **traced** route stays solid, keeps its casing and takes `routeColor`: the dash says
“candidate under evaluation”, the solid line says “here is the trip”. `routeColor` is a
navigation-style purple rather than blue — on satellite imagery, a blue trace blends
into the rivers it follows.

**One single link per marker pair.** Two opposite relations — the agent towards its
alerts, the alert towards its agents — describe the same arc and used to overlap
pixel-perfectly, the second hiding the first. Only one link is drawn now, and its
**successive dashes alternate the colours** of every relation involved: one mesh fewer,
and membership visible. The link belongs to the **last relation opened** — that is the
one carrying the label, the hover and the click. Without dashes it stays solid, in that
same relation's colour.

---

## 6. Honest values

Until routing has answered, the label shows `…`; if it fails, “Time unavailable”.

**Never** a fallback to straight-line distance: it serves to **select**, not to fill in
a travel time. A `Link` carries `distanceMeters` / `durationSeconds` as `null` until the
road value is known, plus a `status` (`pending` | `ready` | `unavailable`).

---

## 7. The routing provider

```ts
type RoutingProvider = {
  matrix(...): Promise<MatrixEntry[]>     // durations/distances in bulk
  route(...): Promise<ProviderRoute[]>    // routes for one pair, alternatives included (index 0 = main one)
  setConfig?(config: RoutingConfig): void // receives the map's providers.routing on every change
}
```

Two required methods, plus an optional `setConfig` to track the map's
`providers.routing` (endpoints, FieldMasks, `routingPreference`, locale, network)
without the application having to recreate the provider — omitted, the provider keeps
control of its own settings (server proxy, test mock). The core depends on nothing but
this contract.

> ### ⚠️ API key — read before going to production
>
> `createGoogleRoutesProvider` calls Google **from the browser**, so the key ships in
> the bundle. Google web services (Routes v2) **do not accept** HTTP-referrer key
> restrictions — only IP ones: a key embedded in a web page is usable by a third party,
> at your expense.
>
> In production, implement `RoutingProvider` against **your own backend**. No change is
> needed anywhere else.

Built-in cache: `RouteCache` (TTL + position), exported.

---

## 8. A core usable without a map

The engine is published as-is: no Three, no React, no `fetch`. It is usable server-side,
or in tests with a fake provider.

| Export | Role |
|---|---|
| `RelationEngine` | the engine, and its `RelationSnapshot` |
| `selectTargets`, `matchesSelector`, `familyTag` | tag selection |
| `buildRelationMenu` | menu construction, hints included |
| `haversineMeters`, `bearingDeg`, `greatCirclePoints`, `fanLegs`, `boundsAround` | spherical geometry |
| `decodePolyline` | Google encoded polylines |
| `RouteCache` | TTL + position cache |
| `LinkLayer` | rendering of draped links (`LinkVisual`, `LinkLayerDefaults`) |

---

## 9. `RelationApi`

`useRelations()` (throws outside a `<RelationLayer>`), or `map.current?.relations`
(`null` without the `relations` prop).

| Member | Role |
|---|---|
| `rules` | the declared rules |
| `menuFor(marker)` | entries to concatenate into the menu — `[]` if no rule applies, so it concatenates without a test |
| `run(source, rule)` | starts a relation (rule already derived from the preset) |
| `snapshots` | displayed relations — **one per source marker**, several can coexist |
| `hubHosts` | DOM containers of the hubs, indexed by source marker id: mounting a portal there is enough to follow the marker, with no position transiting through React |
| `setMode(sourceId, mode)` | switches travel mode (re-traces, does not close) |
| `routeColor` | colour of traced routes |
| `familyColor(rule)` | colour of a family (see § 4) |
| `untrace(linkOrSourceId?)` | closes the route; all of them if omitted |
| `clear(sourceId?)` | clears the relation; all of them if omitted |

---

## 10. `<RelationLayer>` props

| Prop | Role |
|---|---|
| `rules` **(required)** | the domain vocabulary |
| `provider` **(required)** | routing — **stable** (`useMemo`) |
| `width` | link width, in screen px |
| `defaultColor` | last colour fallback (yellow, readable on satellite and plan alike) |
| `linkDash` | marching dash of search links, or `false` |
| `routeColor` | colour of the traced route |
| `hoverDarken` | darkening on hover (< 1) — the family colour is darkened rather than replaced: the tint carries the meaning |
| `hubRadius` | hub radius in screen px — too small and the clear cross becomes a game of skill |
| `casingWidth` / `casingColor` | dark outline under the link (legibility on satellite); `0` to remove it |
| `minOpacity` | opacity of the lowest-ranked link — floor of the rank gradient |
| `staleMeters` | drift beyond which times and routes are recomputed; `0` = never |
| `refreshIntervalMs` | minimum interval between two recomputations of the same relation |
| `menuPresets` | steps offered by a family's menu |
| `fanMaxLegs` | beyond this, the fan collapses into an aggregated link (default 5) |
| `fastestOversample` | 💰 candidates queried per displayed link (default 3) |
| `children` | `ReactNode`, or a **function** receiving the API |

⚠️ **`statusBar` is not a `RelationLayerProps` prop.** It's an addition from `<Map
relations>` (`RelationsConfig`): the map extracts it and mounts `<RelationStatusBar>`
itself — `false` removes it, an object supplies `nameOf` and `modes` (travel modes
offered by the bar). With `<RelationLayer>` mounted by hand (§ 1), mount
`<RelationStatusBar>` yourself among its children; the layer itself doesn't know this
prop.

Real defaults: [PROPS.md](PROPS.md). Labels and templates: `labels.relations` and
`labels.duration` — see [LABELS.md](LABELS.md).

---

## See also

- [MARKERS.md](MARKERS.md) — tags, types, colours
- [ENGINE.md](ENGINE.md) — registries (`engine.markers.visualNodeOf` feeds the fans)
- [PROPS.md](PROPS.md) · [THEME.md](THEME.md) · [LABELS.md](LABELS.md)

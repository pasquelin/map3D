# map3d

**React 3D mapping library** (Three.js): globe → flat map, DOM markers/clusters, paths,
shapes, drawing tools, real-time data — **fully themable**.

**Bibliothèque React de cartographie 3D** (Three.js) : globe → carte plate,
markers/clusters DOM, tracés, formes, outils de dessin, données temps réel —
**entièrement thémable**.

<p align="center">
  📖 <b><a href="docs/fr/README.md">Documentation — Français</a></b>
  &nbsp;·&nbsp;
  📖 <b><a href="docs/en/README.md">Documentation — English</a></b>
</p>

---

## Highlights · Points clés

- **Photorealistic 3D tiles** (Google, via Cesium Ion) with an ellipsoid globe fallback.
- **Bring your own tile server** — the 2D basemap runs from Google *or* from your
  self-hosted server (plain XYZ, no key, no session, no quota), switched by configuration
  alone. Le fond 2D depuis **votre** serveur, au choix, par simple réglage.
- **DOM/CSS markers and clusters** — native animations, `:hover`, accessibility; pooled
  nodes, `translate3d` written in a single project pass.
- **Stable identity** → a moving agent *glides* instead of being recreated.
- **Viewport-driven data**: bbox refetch on move, plus live real-time updates.
- **Ground-draped shapes and paths**: terrain-anchored, stroke widths in **screen
  pixels** (constant across zoom), optional **volumetric extrusion**.
- **Full drawing editor**, Figma-style: marquee/lasso selection, resize & rotate
  handles, separate fill/stroke styles, per-tool settings, undo/redo, host-locked
  shapes, GeoJSON in/out.
- **Tag filtering** (“layers”), **unified search** (map elements + place geocoding),
  **lens tool**, **tag relations** with real routing distances and durations.
- **Coordinate graticule**: sexagesimal mesh adapting to zoom (30° → 1″), named remarkable
  lines, labels, and a smooth fade-out as the view tilts.
- **Typed light/dark theme**, `prefers-reduced-motion` honoured.
- **100 % translatable**: no hard-coded string anywhere — every label is overridable.

## Install · Installation

```bash
npm i map3d three react react-dom
```

`three` and `react`/`react-dom` (19) are **peer dependencies**.

The MIL-STD symbology SDK (`@armyc2.c5isr.renderer/mil-sym-ts-web`, ~9 MB) is a direct
dependency but loaded through a **dynamic import**: it never enters a bundle that does
not display symbols.

## Quick start · Démarrage rapide

```tsx
import { Map, markersLayer, type MarkerData } from 'map3d'

type Alert = { title: string }

const alerts: MarkerData<Alert>[] = [
  {
    id: 1,
    type: 'alert-critical',
    position: { lat: 48.8566, lng: 2.3522 },
    title: 'Intrusion',
    data: { title: 'Intrusion' },
  },
]

export function App() {
  return (
    <div style={{ height: '100vh' }}>
      <Map
        cesiumIonToken={import.meta.env.VITE_CESIUM_ION_TOKEN}
        center={{ lat: 48.8566, lng: 2.3522 }}
        zoom={13}
        layers={[markersLayer<Alert>({ points: alerts, cluster: { enabled: true } })]}
      />
    </div>
  )
}
```

## Documentation

| | Français | English |
|---|---|---|
| **Guide + index** | [docs/fr/](docs/fr/README.md) | [docs/en/](docs/en/README.md) |
| Markers | [MARKERS.md](docs/fr/MARKERS.md) | [MARKERS.md](docs/en/MARKERS.md) |
| Zones & shapes | [ZONES.md](docs/fr/ZONES.md) | [ZONES.md](docs/en/ZONES.md) |
| Drawing | [DRAWING.md](docs/fr/DRAWING.md) | [DRAWING.md](docs/en/DRAWING.md) |
| Symbols | [SYMBOLS.md](docs/fr/SYMBOLS.md) | [SYMBOLS.md](docs/en/SYMBOLS.md) |
| Relations | [RELATIONS.md](docs/fr/RELATIONS.md) | [RELATIONS.md](docs/en/RELATIONS.md) |
| Lens | [LENS.md](docs/fr/LENS.md) | [LENS.md](docs/en/LENS.md) |
| Search | [SEARCH.md](docs/fr/SEARCH.md) | [SEARCH.md](docs/en/SEARCH.md) |
| Camera | [CAMERA.md](docs/fr/CAMERA.md) | [CAMERA.md](docs/en/CAMERA.md) |
| Tiles | [TILES.md](docs/fr/TILES.md) | [TILES.md](docs/en/TILES.md) |
| Plugins | [PLUGINS.md](docs/fr/PLUGINS.md) | [PLUGINS.md](docs/en/PLUGINS.md) |
| Data | [DATA.md](docs/fr/DATA.md) | [DATA.md](docs/en/DATA.md) |
| Hooks | [HOOKS.md](docs/fr/HOOKS.md) | [HOOKS.md](docs/en/HOOKS.md) |
| Engine | [ENGINE.md](docs/fr/ENGINE.md) | [ENGINE.md](docs/en/ENGINE.md) |
| `MapConfig` | [CONFIG.md](docs/fr/CONFIG.md) | [CONFIG.md](docs/en/CONFIG.md) |
| `MapTheme` | [THEME.md](docs/fr/THEME.md) | [THEME.md](docs/en/THEME.md) |
| `MapLabels` | [LABELS.md](docs/fr/LABELS.md) | [LABELS.md](docs/en/LABELS.md) |
| Props | [PROPS.md](docs/fr/PROPS.md) | [PROPS.md](docs/en/PROPS.md) |

Language folders are named after their **ISO 639-1** code and hold the same file names
— see [docs/README.md](docs/README.md) to add one.

*Les dossiers de langue portent leur code **ISO 639-1** et contiennent les mêmes noms
de fichiers — voir [docs/README.md](docs/README.md) pour en ajouter une.*

## Example app · Exemple

```bash
pnpm install
cp examples/react/.env.example examples/react/.env   # set VITE_CESIUM_ION_TOKEN
pnpm dev:example
```

Reproduces an operator dashboard: 3D map, severity-clustered alerts refetched
on move, animated agents with camera follow, zones, drawing, light/dark toggle,
alternative neon theme, fallback globe.

## Build

```bash
pnpm build        # ESM + CJS + types (dist/)
pnpm typecheck
pnpm test
```

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free for any **noncommercial** use (personal,
research, nonprofit, education, government). **Commercial use requires a separate license from
Alban Pasquelin**, the copyright holder. Contact: alban.pasquelin@gmail.com

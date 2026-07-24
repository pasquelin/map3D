# @gosecure/map3d

Bibliothèque **React de cartographie 3D** (Three.js) : globe → carte plate, markers/clusters DOM, tracés, formes, outils de dessin, données temps réel — **entièrement thémable**.

Conçue pour le *Dashboard Opérateur* GoSecure (alertes par sévérité, agents mobiles géolocalisés), mais générique et agnostique du transport (aucune dépendance Apollo/Socket.IO).

## Points clés

- **Tuiles 3D photoréalistes** (Google via Cesium Ion) + globe ellipsoïde de repli.
- **Markers/clusters en DOM/CSS** (animations natives, `:hover`, accessibilité), pool recyclé, positionnement `translate3d` en passe projection → écriture.
- **Caméra sans inertie** : un unique lissage exponentiel (pas d'oscillation).
- **Clustering** en espace monde (supercluster), paliers de zoom discrets, clés stables (aucun clignotement).
- **Agents mobiles animés** : identité stable → le marker glisse au lieu d'être recréé.
- **Données viewport-driven** : rechargement à la bbox au déplacement + temps réel live.
- **Tracés/formes plaqués au sol** (Y=0, `polygonOffset`, épaisseur en mètres).
- **Source 3D unique** : Google Photorealistic 3D Tiles via **Cesium Ion** (un seul token).
- **Thème typé** clair/sombre, `prefers-reduced-motion` respecté.

## Installation

```bash
npm i @gosecure/map3d three react react-dom
```

`three` et `react`/`react-dom` (19) sont des **peer dependencies**.

## Démarrage rapide

```tsx
import {
  MapProvider, Map, MarkerLayer, MapControls,
  defaultTheme, type MarkerData,
} from '@gosecure/map3d'

type Alert = { title: string }

export function App() {
  const alerts: MarkerData<Alert>[] = [
    { id: 1, type: 'alert-critical', position: { lat: 48.8566, lng: 2.3522 }, data: { title: 'Intrusion' } },
  ]
  return (
    <MapProvider theme={defaultTheme} colorScheme="auto">
      <div style={{ height: '100vh' }}>
        <Map cesiumIonToken={import.meta.env.VITE_CESIUM_ION_TOKEN} center={{ lat: 48.8566, lng: 2.3522 }} zoom={13}>
          <MarkerLayer<Alert>
            points={alerts}
            getId={(m) => m.id}
            cluster={{ enabled: true, radius: 60 }}
            onSelect={(m) => console.log(m.data.title)}
          />
          <MapControls position="right" />
        </Map>
      </div>
    </MapProvider>
  )
}
```

## Données dynamiques (bbox + temps réel)

```tsx
import type { DataSource, MarkerData } from '@gosecure/map3d'

// Rechargé au déplacement (gate de zoom + debounce + annulation intégrés).
const source: DataSource<MarkerData<Alert>> = {
  minZoom: 10,
  async load(viewport, signal) {
    const { north, south, east, west } = viewport.bounds
    return fetchAlerts({ north, south, east, west }, signal) // votre API / GraphQL
  },
}

<MarkerLayer source={source} getId={(m) => m.id} cluster={{ enabled: true }} />
```

Pour le **temps réel** (positions d'agents), passez simplement des `points` qui changent : grâce à `getId` (identité stable), un changement de position **anime** le marker au lieu de le recréer.

```tsx
<MarkerLayer
  points={agents}                     // mis à jour par votre WebSocket
  getId={(m) => m.id}
  selectedId={selected}
  followId={followed}                 // la caméra suit l'agent live
  icon={(m) => agentSvg(m.data)}      // markup SVG ancré à la carte
/>
```

## API principale

| Élément | Rôle |
|---|---|
| `<MapProvider theme colorScheme>` | Thème résolu (clair/sombre + reduced-motion). |
| `<Map cesiumIonToken center zoom fallbackGlobe onViewportChange onCameraChange>` | Canvas + moteur (Cesium Ion). |
| `<MarkerLayer points/source getId cluster icon clusterIcon renderPopup menu selectedId followId onSelect>` | Markers/clusters DOM. |
| `<PathLayer paths animateHead>` | Tracés/parcours (trace GPS animée). |
| `<ShapeLayer shapes>` | Zones : cercle-rayon, polygone, rectangle-bounds. |
| `<DrawLayer tools shortcuts defaults value onChange>` | Outils de dessin + GeoJSON. |
| `<MapControls>` `<SearchBox>` `<ContextMenu>` `<Popup>` | Contrôles remplaçables. |
| Hooks | `useMap`, `useCamera`, `useViewport`, `useLiveData`, `useDrawing`, `useMapEvents`, `useTheme`. |

## Exemple complet (Dashboard GoSecure)

```bash
npm install
cp examples/react/.env.example examples/react/.env   # renseigner VITE_CESIUM_ION_TOKEN
npm run dev:example
```

Reproduit le Dashboard Opérateur : carte 3D, alertes par sévérité (clusterisées, rechargées au déplacement), agents mobiles animés + suivi caméra, zones, dessin, bascule **clair/sombre**, thème **néon** alternatif, globe de repli.

## Build

```bash
npm run build        # ESM + CJS + types (dist/)
npm run typecheck
```

Voir [THEME.md](./THEME.md) pour la référence complète du thème.

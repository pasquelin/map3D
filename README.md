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
- **Filtrage par tags (« couches »)** : markers et dessins tagués, panneau de filtre intégré aux contrôles (recherche, checkboxes, pastilles couleur, compteurs), sélection persistée.
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

## Filtrage par tags (« couches »)

Chaque marker peut porter des `tags` ; les dessins sont tagués automatiquement (`['draw', <outil>]`). Le bouton **Couches** de `<MapControls>` ouvre un panneau listant les tags présents sur la carte (recherche, checkboxes, compteurs) : cocher un ou plusieurs tags ne laisse visibles que les éléments correspondants (sémantique **OU** — « les users et tous les rectangles »). La sélection est persistée en `localStorage`.

```tsx
const agents: MarkerData<Agent>[] = [
  { id: 'a1', type: 'agent-enroute', tags: ['user', 'move'], position, data },
  { id: 'a2', type: 'agent-available', tags: ['user', 'standby'], position, data },
]

// Couleurs de repérage des pastilles du panneau (sinon palette hashée stable) :
const theme = mergeTheme(defaultTheme, {
  colors: { tags: { user: '#22c55e', move: '#06b6d4' } },
})
```

- Le filtrage des markers s'applique **avant** le clustering (les clusters reflètent le filtre) ; les dessins basculent simplement leur visibilité (aucun rebuild de géométrie).
- Accès programmatique : `useTags()` / `useTagSelection()` (ou `engine.tags` : `toggle`, `clear`, `isVisible`, `all`).
- Persistance : clé configurable via `<Map tagStorageKey>` (`null` pour désactiver, une clé par carte si plusieurs cartes cohabitent).

## Raccourcis clavier

Lettres **seules**, identiques Mac/PC (pas de ⌘/Ctrl : les navigateurs réservent ⌘T/⌘N/⌘W…), affichées dans les tooltips des boutons, ignorées pendant une saisie (recherche, formulaires).

**Contrôles carte (`<MapControls>`)** :

| Touche | Action |
|---|---|
| `N` | Nord / vue du dessus |
| `+` / `−` | Zoom avant / arrière |
| `I` | Incliner (vue 3D) |
| `G` | Retour au globe |
| `T` | Couches — filtre par tags (ouvrir/fermer) |
| `F` | Plein écran |

Remappable si une touche est déjà prise ailleurs dans votre app — même pattern que les outils de dessin :

```tsx
<MapControls shortcuts={{ layers: 'y', fullscreen: false }} />   // T → Y, F désactivé
<DrawLayer shortcuts={{ rect: 'k' }} />                          // outils de dessin
```

**Outils de dessin (`<DrawLayer>`)** : `L` ligne, `P` polygone, `R` rectangle, `C` cercle, `D` main levée, `A` flèche, `M` mesurer, `E` gomme, `Entrée` fermer le polygone, `Échap` outil navigation, `⌘Z`/`Ctrl+Z` annuler (selon la plateforme).

Un remapping est immédiatement reflété dans les tooltips (les deux barres affichent leurs raccourcis effectifs).

## API principale

| Élément | Rôle |
|---|---|
| `<MapProvider theme colorScheme>` | Thème résolu (clair/sombre + reduced-motion). |
| `<Map cesiumIonToken center zoom fallbackGlobe onViewportChange onCameraChange>` | Canvas + moteur (Cesium Ion). |
| `<MarkerLayer points/source getId cluster icon clusterIcon renderPopup menu selectedId followId onSelect>` | Markers/clusters DOM. |
| `<PathLayer paths animateHead>` | Tracés/parcours (trace GPS animée). |
| `<ShapeLayer shapes>` | Zones : cercle-rayon, polygone, rectangle-bounds. |
| `<DrawLayer tools shortcuts defaults value onChange>` | Outils de dessin + GeoJSON. |
| `<MapControls>` `<SearchBox>` `<ContextMenu>` `<Popup>` | Contrôles remplaçables (dont bouton **Couches** = filtre par tags). |
| `<TagFilterControl position tipId>` | Bouton + panneau de filtre par tags, utilisable seul hors `<MapControls>`. |
| Hooks | `useMap`, `useCamera`, `useViewport`, `useLiveData`, `useDrawing`, `useMapEvents`, `useTags`, `useTagSelection`, `useTheme`. |

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

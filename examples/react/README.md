# Exemple React — banc d'essai de `@pasquelin/map3d`

Une carte 3D plein écran et, à côté, un panneau Tweakpane qui règle **tout** : `MapConfig` en
entier, les props de `<Map>` hors config, les surfaces d'interface au bouton près, la scène
(alertes, agents, zones, tracés) et les plugins. La version publiée tourne sur
[pasquelin.github.io/map3D](https://pasquelin.github.io/map3D/), sans token.

## Prérequis

- Node ≥ 22, **pnpm** (`pnpm-workspace.yaml` à la racine du dépôt).
- `pnpm install` **à la racine** : l'exemple n'a pas de `package.json` propre, il consomme la lib
  par ses **sources** (`@pasquelin/map3d` → `src/index.ts`, alias Vite + `paths` TypeScript), donc
  chaque modification de la lib se voit à chaud (HMR).

## `.env`

```bash
cp examples/react/.env.example examples/react/.env
```

| Variable                | Rôle                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `VITE_CESIUM_ION_TOKEN` | Google Photorealistic 3D Tiles via Cesium Ion. Sans lui : globe ellipsoïde de repli. |
| `VITE_GOOGLE_MAPS_KEY`  | Fond 2D externe, trafic, recherche de lieux, routage (fournisseur `external`).       |
| `VITE_TILE_ORIGIN`      | Origine du serveur de tuiles auto-hébergé (fournisseur `internal`, le défaut).       |
| `VITE_WINDY_API_KEY`    | Clé du plugin optionnel `windy` (cf. ci-dessous). Se renseigne aussi dans le hub.    |

Toutes sont facultatives : sans aucune, la carte démarre sur le globe de repli.

## Lancer

```bash
pnpm dev:example                                   # http://localhost:5173
pnpm exec tsc -p examples/react/tsconfig.json      # typecheck de l'exemple
pnpm exec vitest run examples/react/src            # ses tests (inclus dans `pnpm test`)
pnpm exec vite build --config examples/react/vite.config.ts
```

## Plugins officiels — optionnels

Les plugins (`geopf` : bâtiments IGN au clic, `windy` : webcams, `plan-3d` : objet 3D de démo)
vivent dans un **autre dépôt**, [github.com/pasquelin/plugingsMap3D](https://github.com/pasquelin/plugingsMap3D).
L'exemple les découvre s'il est cloné **en voisin** de celui-ci :

```
Applications/
├── map3D/            ← ce dépôt
└── plugingsMap3D/    ← git clone https://github.com/pasquelin/plugingsMap3D && pnpm install
```

Sans lui, l'exemple compile et tourne à l'identique, simplement sans plugin dans le hub (bouton
puzzle de la barre). Le mécanisme : `src/plugins.ts` énumère les paquets par `import.meta.glob`
— zéro fichier trouvé, zéro plugin, aucune erreur — et `vite.config.ts` n'autorise le dossier
voisin en dev que s'il existe.

## Ce que l'exemple démontre

- **Tout en props de `<Map>`** : `toolbar`, `controls`, `search`, `dock`, `templates`, `draw`,
  `relations`, `cluster`, `layers`, `plugins`, `capture`, `theme`/`colorScheme`, `config`,
  `positionStorageKey`/`resetStoredPosition`, `onReady`/`onViewportChange`/`onCameraChange`.
- **La poignée `MapHandle`** (ref) depuis l'extérieur : caméra (`fitBounds`, `flyTo`, `panTo`),
  dessin par identité (`addShape`/`updateShape`/`getShape`), interrogation (`engine.getView()`).
- **Les hooks de contexte**, depuis des overlays hôte montés en enfants de `<Map>` :
  `useViewport`, `useMapEvents`, `useCameraCommands`, `useZoomGate`, `useTags`, `useCapture`,
  `useLens`, `useRelations` (`components/DemoPanel.tsx`), `useDrawing`/`useDrawSettings`
  (`DrawDebug`), `useBuildingEnrichment`, `useCatalogSource`, `<MarkerLayer source>` +
  `onLoadingChange`.
- **Le catalogue** (`catalogSources.ts`) : sources de navigation, de recherche et à bascule,
  inscrites sur `engine.catalog` comme le ferait un plugin.
- **Une scène temps réel** : agents animés, alertes rechargées au cadre, gomme sur les couches
  hôte `erasable`, favoris glissés dans le dock, thème clair/sombre et thème néon.

Le panneau des hooks se coupe dans l'onglet **Interface** (« panneau hooks & poignée »), comme le
moniteur de perf ou la sonde dessin.

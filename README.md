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
- **Tracés/formes drapés au sol** (hauteur d'ancre sur le terrain, traits en **px écran** constants au zoom).
- **Éditeur de dessin complet** façon Figma : sélection (clic, marquee, lasso), poignées de resize/rotation, styles fond/bordure séparés, réglages par outil persistés, undo/redo, formes verrouillables par l'hôte.
- **Source 3D unique** : Google Photorealistic 3D Tiles via **Cesium Ion** (un seul token).
- **Filtrage par tags (« couches »)** : markers et dessins tagués, panneau de filtre intégré aux contrôles (recherche, checkboxes, pastilles couleur, compteurs), sélection persistée.
- **Thème typé** clair/sombre, `prefers-reduced-motion` respecté.
- **Libellés 100 % traduisibles** : aucun texte en dur, tout est overridable via `<MapProvider labels>` (voir [LABELS.md](./LABELS.md)).

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

## Relations (distances et temps de trajet réels)

`<RelationLayer>` relie un marker à ses voisins **par tags**, avec les distances et durées **routières réelles** d'un fournisseur de routage. Une section « Distance autour » se **greffe** sur le menu contextuel du marker : elle ne le remplace pas. Les familles de tags applicables à la source y sont listées directement, chacune ouvrant ses presets de sélection.

```tsx
import { RelationLayer, RelationStatusBar, createGoogleRoutesProvider, type RelationRule } from 'map3d'

// Le SEUL endroit où vit le métier : le moteur ne connaît que des tags.
const RULES: RelationRule[] = [
  {
    id: 'alert-to-agents',
    label: 'Agents',              // libellé du niveau 2 du menu
    from: { any: ['alert'] },     // le marker source doit satisfaire ce sélecteur
    to: { any: ['user'], none: ['onsite'] }, // les cibles candidates aussi
    color: '#22c55e',             // omis → `defaultColor` de la couche
    mode: 'DRIVE',
    selection: { mode: 'fastest', count: 3, maxMeters: 15000 },
    limit: { compute: 15, render: 10 },
  },
]

const provider = useMemo(() => createGoogleRoutesProvider({ apiKey, region: 'fr' }), [apiKey])

<RelationLayer rules={RULES} provider={provider}>
  {(relations) => (
    <>
      <MarkerLayer
        points={markers}
        menu={(m) => {
          const rel = relations.menuFor(m)          // [] si aucune règle ne s'applique
          return rel.length === 0 ? base(m) : [...base(m), { separator: true }, ...rel]
        }}
      />
      <RelationStatusBar nameOf={(p) => nameById(p.id)} />
    </>
  )}
</RelationLayer>
```

**Sélecteurs de tags** — `{ any, all, none }` : `any` = au moins un (sémantique OU, celle du filtre « Couches »), `all` = tous requis, `none` = exclusion. Les trois clauses se combinent en ET.

**Sélection** — `fastest` retient les `count` plus rapides (le plus proche à vol d'oiseau n'est pas le plus rapide : on sur-échantillonne, c'est la **durée** qui tranche) ; `radius` retient tout ce qui est sous `radiusMeters`. `maxMeters` est le garde-fou de coût appliqué **avant** tout appel réseau, et `limit.compute` / `limit.render` plafonnent respectivement les points envoyés au routage et les liens dessinés.

**Ce qui s'affiche** — un socle à plat sous le marker source, un trait par cible avec son rang et son étiquette `2,4 km · 9 min`, et l'itinéraire réel au clic sur un lien. Le socle porte la **barre d'état de sa relation** : elle s'ancre juste à côté du marker, suit ses déplacements, et bascule de l'autre côté du socle quand le bord du conteneur est trop proche. Chaque relation ouverte a donc sa propre barre, à l'endroit où le regard se trouve déjà.

La barre décrit **ce qui est réellement à l'écran**, et change avec lui :

| | Sans itinéraire | Itinéraire tracé |
| --- | --- | --- |
| Pastille | couleur de la famille | couleur de l'itinéraire |
| Titre | `source → famille` | `source → cible retenue` |
| Segments | famille, mode de transport | mode de transport seul |
| Mesure | étendue (`Les 3 plus rapides`) | `2,4 km · 9 min` du trajet |

Le sélecteur de famille disparaît une fois la cible arrêtée — il proposerait de refaire un choix déjà fait. Changer le **mode de transport** pendant un tracé le **retrace** dans le nouveau mode au lieu de revenir aux traits directs : c'est le même trajet demandé autrement. L'ancien tracé reste affiché pendant le recalcul plutôt que de laisser un vide. Les cibles agrégées dans un même cluster partagent un tronc et s'ouvrent en éventail, sans jamais éclater le cluster ni toucher au zoom. Les liens suivent leurs deux extrémités : un marker qui bouge emporte son trait, et au-delà de `staleMeters` les temps sont refaits (débit plafonné par `refreshIntervalMs`).

**Honnêteté des valeurs** — tant que le routage n'a pas répondu, l'étiquette affiche `…` ; s'il échoue, « Temps indisponible ». **Jamais** de repli sur la distance à vol d'oiseau : elle sert à sélectionner, pas à remplir un temps de trajet.

**Clé d'API — à lire avant la production.** `createGoogleRoutesProvider` appelle Google depuis le navigateur, donc la clé part dans le bundle. Les web services Google (Routes v2) **n'acceptent pas** les restrictions de clé par référent HTTP — seulement par IP : une clé embarquée dans une page web est donc utilisable par un tiers, à vos frais. En production, implémentez `RoutingProvider` (deux méthodes : `matrix` et `route`) contre votre propre backend. Le core ne dépend que de ce contrat, aucune modification n'est nécessaire ailleurs.

| Export | Rôle |
| --- | --- |
| `<RelationLayer rules provider width defaultColor routeColor hubRadius casingWidth minOpacity staleMeters refreshIntervalMs>` | Monte la couche, tient l'état, fournit le contexte. `provider` doit être stable (`useMemo`). |
| `<RelationStatusBar nameOf>` | Barres d'état — **une par relation**, ancrée au socle de son marker source : segments cliquables (famille de tags, mode de transport) et effacement. Se replace seule contre les bords. |
| `useRelations()` | `{ rules, menuFor, run, snapshots, setMode, untrace, clear }` — lève hors d'un `<RelationLayer>`. |
| `RelationEngine` `selectTargets` `matchesSelector` `buildRelationMenu` | Core **headless** (ni Three, ni React, ni `fetch`) : utilisable côté serveur ou en test avec un fournisseur factice. |
| `createGoogleRoutesProvider({ apiKey, language, region })` `RoutingProvider` | Fournisseur Google Routes v2, ou le contrat à implémenter pour le vôtre. |
| `LinkLayer` `haversineMeters` `greatCirclePoints` `decodePolyline` `RouteCache` | Briques réutilisables (rendu des liens drapés, géométrie sphérique, polylignes encodées, cache TTL + position). |

Modes de transport : `DRIVE`, `WALK`, `BICYCLE`, `TWO_WHEELER`, `TRANSIT`. Libellés et gabarits sont traduisibles via `labels.relations` et `labels.duration` (cf. [Traduction des libellés](#traduction-des-libellés-labels)).

## Outils de dessin

Un éditeur de formes complet façon Figma/Photoshop, drapé sur le terrain 3D (formes ancrées au sol, traits en px écran constants au zoom).

**Dessin** : ligne, polygone (clics + Entrée), rectangle (angles arrondis réglables), cercle, main levée, flèche, règle (cote fine pointillée ⊢––⊣ avec label de distance), gomme.

**Sélection** (`V`) : clic simple (Maj+clic = ajout/retrait), ou marquee **rectangle** (`1`), **polygone** (`2`), **lasso** (`3`) — sous-menu au survol du bouton, sémantique « touche = sélectionné ». Contours en marching-ants noir/blanc (lisibles sur tout fond), bbox englobante en multi-sélection.

**Édition** : poignées façon Figma — coins (2 axes, Maj = homothétie), milieux d'arêtes (1 axe), sommets individuels (polygone/ligne/flèche/règle), drag du corps = déplacement, **Maj pendant le drag = rotation** (curseur dédié). Multi-sélection : transformations groupées dans un repère commun. Un rectangle tourné se redimensionne le long de ses axes propres.

**Panneau de style** (affiché avec un outil actif ou une sélection) : couleurs **fond et bordure séparées** (swatches superposés façon Photoshop avec échange ⇄), palette du thème + sélecteur natif, épaisseur de bordure **y compris 0** (sans bordure), style de trait (plein/tirets/pointillés), opacité de bordure ET de fond, rayon d'angle des rectangles. Sans sélection il règle les défauts de l'outil actif ; avec sélection il restyle les formes.

**Réglages par outil** (engrenage) : chaque outil garde ses propres défauts (couleurs, épaisseur, trait, opacités, rayon…), **persistés en `localStorage`** (`m3d:draw-settings`, désactivable via `settingsStorage="none"`), avec aperçu live, réinitialisation par outil ou globale, et récapitulatif des raccourcis.

**Barre espace** : maintenir Espace pendant le dessin/l'édition = **pan caméra temporaire** (le tracé en cours est gelé, pas perdu) ; Espace+Maj = rotation caméra ; relâcher = reprise exacte.

**Historique** : undo/redo complet (`⌘Z`/`⌘⇧Z`) couvrant création, édition, style, suppression, duplication. `⌘A` tout sélectionner, `⌘D` dupliquer, `Suppr` supprimer, flèches = déplacer d'1 px (Maj = 10 px).

**Formes verrouillées** : une feature GeoJSON avec `properties.locked: true` (ex. limite de zone imposée par votre API) est intouchable dans l'UI — clic dessus = flash cadenas ; « Tout effacer » la conserve, et **l'undo/redo la préserve** (ni supprimée ni déverrouillée par Ctrl+Z). Déverrouillage réservé au code hôte : `api.lock(ids)` / `api.unlock(ids)`.

**GeoJSON** : export/import via `onChange`/`value`/`toGeoJSON`/`fromGeoJSON`. Properties par forme : `kind`, `color` (bordure), `fillColor`, `width` (px, 0 = sans bordure), `fillOpacity`, `strokeOpacity`, `stroke` (`solid`/`dashed`/`dotted`), `radius` (% d'angle, rects), `locked`, `tags`. Les anciens fichiers (sans les nouveaux champs) se chargent tels quels.

```tsx
<DrawLayer
  value={zonesImposees}                        // import contrôlé (remplace tout, non annulable)
  onChange={(fc) => save(fc)}                  // GeoJSON complet, coalescé (1 émission max par frame)
  onSelectionChange={(ids) => console.log(ids)}
  settingsStorage="local"                      // ou "none"
  shortcuts={{ selectLasso: 'q', rect: false }} // remappe/désactive outils et modes de sélection
>
  <Toolbar
    position="left"
    tools={['select', 'rect', 'circle', 'arrow', 'erase']}  // outils affichés, dans l'ordre
    selectModes={['rect', 'lasso']}                          // modes du sélecteur (1 seul = pas de flyout)
    components={{ settings: false, clear: false }}           // masquer/remplacer chaque section
  />
</DrawLayer>
```

L'API `useDrawing()` expose tout : `tool/setTool`, `selectMode/setSelectMode`, `selection`, `select`, `selectAll`, `clearSelection`, `deleteSelection`, `duplicateSelection`, `setStyle`/`currentStyle`, `lock`/`unlock`, `undo`/`redo`/`canUndo`/`canRedo`, `settings` (+ `useDrawSettings()`), `toGeoJSON`/`fromGeoJSON`, `shortcuts`.

## Traduction des libellés (`labels`)

Chaque texte affiché (tooltips, aria-labels, placeholders, panneaux, label de distance de la règle) a un **défaut français** dans `defaultLabels` et s'override clé par clé via `<MapProvider labels>` (merge profond — ne passez que ce que vous traduisez) :

```tsx
<MapProvider
  labels={{
    controls: { fullscreen: 'Fullscreen' },
    toolbar: { undo: 'Undo', redo: 'Redo' },
    tools: { freehand: 'Freehand', measure: 'Measure' },
    tags: { button: 'Layers — filter by tag' },
    measure: { kilometers: '{value} km' },   // gabarits : conservez les {variables}
  }}
>
```

- `useLabels()` donne l'objet résolu à vos composants custom ; `formatLabel(template, params)` interpole les `{variables}`.
- **Référence complète des clés** (groupes `controls`, `tags`, `search`, `toolbar`, `tools`, `selectModes`, `style`, `settings`, `actions`, `keys`, `format`, `measure`, `errors`) : voir [LABELS.md](./LABELS.md).

## Raccourcis clavier

Les **outils** se choisissent par lettres seules, identiques Mac/PC ; les **actions d'édition** (annuler, tout sélectionner, dupliquer) utilisent le modificateur de la plateforme (⌘ sur Mac, Ctrl ailleurs) avec `preventDefault` ciblé. Tous sont affichés dans les tooltips des boutons et ignorés pendant une saisie (recherche, formulaires).

**Contrôles carte (`<MapControls>`)** :

| Touche | Action |
|---|---|
| `N` | Nord / vue du dessus |
| `+` / `−` | Zoom avant / arrière |
| `I` | Incliner (vue 3D) |
| `G` | Retour au globe |
| `B` | Fond de carte : bascule 3D ↔ plan |
| `T` | Couches — filtre par tags (ouvrir/fermer) |
| `F` | Plein écran |

Remappable si une touche est déjà prise ailleurs dans votre app — même pattern que les outils de dessin :

```tsx
<MapControls shortcuts={{ layers: 'y', fullscreen: false }} />   // T → Y, F désactivé
<DrawLayer shortcuts={{ rect: 'k' }} />                          // outils de dessin
```

**Outils de dessin (`<DrawLayer>`)** :

| Touche | Action |
|---|---|
| `V` | Sélectionner — `1` rectangle, `2` polygone, `3` lasso |
| `L` `P` `R` `C` `D` `A` `M` `E` | Ligne, Polygone, Rectangle, Cercle, main levée (Dessin), flèche (Arrow), Mesurer, gomme (Effacer) |
| `Espace` (maintenir) | Pan caméra temporaire (dessin gelé, pas perdu) — `Espace+Maj` = rotation caméra |
| `Maj` + glisser | Rotation de la forme (corps) / homothétie (poignée de coin) |
| `⌘Z` / `⌘⇧Z` (`Ctrl` ailleurs) | Annuler / Rétablir (création, édition, style, suppression) |
| `⌘A` / `⌘D` | Tout sélectionner / Dupliquer la sélection |
| `Suppr`/`⌫` | Supprimer la sélection |
| Flèches | Déplacer la sélection d'1 px (Maj = 10 px) |
| `Entrée` | Fermer le polygone (dessin ou marquee) |
| `Échap` | Cascade : annule le geste/tracé en cours → marquee → désélectionne → outil navigation |

Un remapping est immédiatement reflété dans les tooltips (les deux barres affichent leurs raccourcis effectifs).

## API principale

| Élément | Rôle |
|---|---|
| `<MapProvider theme colorScheme labels>` | Thème résolu (clair/sombre + reduced-motion) + libellés traduisibles ([LABELS.md](./LABELS.md)). |
| `<Map cesiumIonToken center zoom fallbackGlobe onViewportChange onCameraChange>` | Canvas + moteur (Cesium Ion). |
| `<MarkerLayer points/source getId cluster icon clusterIcon tooltip clusterTooltip menu selectedId followId onSelect selectionRing>` | Markers/clusters DOM. Infobulles au survol (`tooltip`/`clusterTooltip` — le clic = actions), `MarkerData.avatar` (photo ronde gérée), `MarkerData.new` (sonar jusqu'au clic) et `MarkerData.urgent` (viseur rouge, infobulle style urgence). Cluster inséparable au zoom max → éclaté automatiquement en éventail. |
| `<PathLayer paths animateHead>` | Tracés/parcours (trace GPS animée). |
| `<ShapeLayer shapes>` | Zones : cercle-rayon, polygone, rectangle-bounds. |
| `<DrawLayer tools shortcuts defaults settingsStorage value onChange onSelectionChange>` | Éditeur de formes complet (sélection, édition, style, undo/redo, verrouillage) + GeoJSON. |
| `<Toolbar position minZoom tools selectModes components>` | Barre de dessin entièrement paramétrable (sections masquables/remplaçables). |
| `<DrawStylePanel>` `DrawSettingsButton` | Panneau de style et réglages par outil, utilisables seuls. |
| `<MapControls>` `<ContextMenu>` | Contrôles remplaçables (boutons **Déplacement/Rotation** du drag — pivoter sans maintenir Maj —, bouton **Couches** = filtre par tags). |
| `<SearchBox onSelect search placeholder flyAltitude historyStorageKey historySize>` | Recherche de lieu : **Google Places intégré** (clé de `<Map googleMapsApiKey>`, zéro config), vol caméra au **zoom adapté au viewport** du lieu, **historique localStorage** (champ vide focalisé), navigation clavier ↑ ↓ Entrée Échap, requêtes débouncées et annulées. Provider custom via `search` (ou `createGooglePlacesSearch({ apiKey, language, region, limit })`). |
| `<TagFilterControl position tipId>` | Bouton + panneau de filtre par tags, utilisable seul hors `<MapControls>`. |
| `<ToolButton icon label tip shortcut active>` | Bouton de barre (icône, état, infobulle + `aria-label` porteurs du raccourci) — pour peupler `extraTools` / `components` avec le langage visuel des boutons natifs. |
| `AnchorHeightCache` | Hauteurs d'ancre mémoïsées (raycast amorti, retentative des tuiles absentes, invalidation 2D↔3D) pour une couche custom qui projette des éléments drapés au sol. |
| `<RelationLayer rules provider>` `<RelationStatusBar>` | Liens par tags vers les markers voisins, avec distances et durées routières réelles — cf. [Relations](#relations-distances-et-temps-de-trajet-réels). |
| Hooks | `useMap`, `useCamera`, `useViewport`, `useLiveData`, `useDrawing`, `useLens`, `useMapEvents`, `useTags`, `useTagSelection`, `useRelations`, `useDraggablePanel`, `useDraggable`, `useDropZone`, `useTheme`, `useLabels`. |

`<MapControls>` est entièrement configurable, à deux grains :

```tsx
// Grain GROUPE : masquer (false) ou remplacer (ReactNode) un groupe entier.
<MapControls components={{ view: false, zoom: <MonZoom /> }} />

// Grain BOUTON : masquer un bouton précis — son raccourci clavier est
// désactivé avec lui, un groupe vidé disparaît.
<MapControls buttons={{ rotate: false, zoomOut: false, globe: false }} />
```

Boutons : `pan`, `rotate`, `compass`, `zoomIn`, `zoomOut`, `tilt`, `topDown`, `globe`, `mode3d`, `plan`, `traffic`, `layers`, `fullscreen` — groupes : `drag`, `compass`, `zoom`, `view`, `basemap`, `layers`, `fullscreen`.

**Fond de carte (`basemap`)** — bascule entre les tuiles 3D photoréalistes et le plan 2D Google, plus le calque trafic. Ces fonds sont des services Google : **sans `googleMapsApiKey`, le groupe entier n'est pas rendu** plutôt que d'offrir des boutons inertes. Le bouton trafic n'apparaît qu'en mode plan (seul mode où le calque existe), et repasser en 3D l'éteint — le moteur s'en charge, `engine.getBasemap()` et l'événement `basemap` en sont la source de vérité.

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

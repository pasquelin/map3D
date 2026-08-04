# map3d — documentation française

**Français** · [English](../en/README.md) · [↑ Racine](../../README.md)

Bibliothèque **React de cartographie 3D** (Three.js) : globe → carte plate, markers/clusters DOM, tracés, formes, outils de dessin, données temps réel — **entièrement thémable**.

Conçue pour un *Dashboard Opérateur* (alertes par sévérité, agents mobiles géolocalisés), mais générique et agnostique du transport (aucune dépendance Apollo/Socket.IO).

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
- **Libellés 100 % traduisibles** : aucun texte en dur, tout est overridable via `<MapProvider labels>` (voir [docs/LABELS.md](LABELS.md)).

## Documentation

Cette page est la **visite guidée** : elle montre chaque domaine en action. Les guides
ci-dessous le reprennent **en profondeur**, un par domaine.

| Guide | Contenu |
|---|---|
| [MARKERS.md](MARKERS.md) | points, `MarkerData`, clustering, sélection, suivi, décor à seuil, repositionnement, dock, performance |
| [ZONES.md](ZONES.md) | zones et formes drapées, extrusion volumétrique, prédicats géodésiques, cadrage, tracés |
| [CATALOG.md](CATALOG.md) | catalogue d'entités distantes : sources paginées, agrégats à enfants, cases à trois états, persistance |
| [DRAWING.md](DRAWING.md) | outils, sélection, édition, style, historique, GeoJSON, CRUD par identité, contraintes |
| [SYMBOLS.md](SYMBOLS.md) | catalogue d'icônes au glisser-déposer, symbologie MIL-STD-2525D |
| [TEMPLATES.md](TEMPLATES.md) | sauvegardes nommées du dessin, stockage local ou API, partage, export `.m3dt` |
| [RELATIONS.md](RELATIONS.md) | liens par tags, distances et temps de trajet réels |
| [LENS.md](LENS.md) | loupe : inventaire des markers d'une zone |
| [SEARCH.md](SEARCH.md) | recherche unifiée carte + lieux |
| [CAMERA.md](CAMERA.md) | position initiale, `ready`, vols, cadrage, carte figée, fond de carte |
| [PEDESTRIAN.md](PEDESTRIAN.md) | mode piéton : marche au sol, collision, gravité, immersion première personne |
| [TILES.md](TILES.md) | fournisseur de tuiles : Google ou serveur auto-hébergé, capacités et boutons |
| [BUILDINGS.md](BUILDINGS.md) | sélection d'un bâtiment du volume interne : outil, `buildingMenu`, attributs remontés |
| [GRATICULE.md](GRATICULE.md) | grille de coordonnées : maille adaptative, lignes remarquables, étiquettes, fondu à l'inclinaison |
| [PLUGINS.md](PLUGINS.md) | guide auteur des plugins : contrat, config, source de données, enrichissement au pick, hub, registre des officiels |
| [PREFERENCES.md](PREFERENCES.md) | préférences de l'utilisateur final : presets de qualité 3D, disposition clavier, rebind déplacement/vue, persistance |
| [DATA.md](DATA.md) | viewport-driven, temps réel, tags, épinglage, persistance |
| [HOOKS.md](HOOKS.md) | tous les hooks, et ce qui fait re-rendre quoi |
| [ENGINE.md](ENGINE.md) | moteur, events, registres, couches custom |

**Références** — extraites des types et des défauts réels, donc aucun défaut annoncé
ne peut diverger de ce que la lib applique :

| Référence | Contenu |
|---|---|
| [CONFIG.md](CONFIG.md) | `MapConfig` — ce qui se **règle** : fournisseurs, gestes, budgets, stockage |
| [THEME.md](THEME.md) | `MapTheme` — ce qui se **voit** : couleurs, tailles, rythme |
| [LABELS.md](LABELS.md) | `MapLabels` — tous les **textes** et les règles de formatage |
| [PROPS.md](PROPS.md) | props des composants React |

### Par où commencer

| Vous voulez… | Allez à |
|---|---|
| poser des points sur une carte | [MARKERS.md § 1](MARKERS.md#1-en-deux-minutes) |
| afficher des périmètres | [ZONES.md § 1](ZONES.md#1-en-deux-minutes) |
| parcourir un référentiel distant (villes, zones) | [CATALOG.md § 1](CATALOG.md#1-en-deux-minutes) |
| laisser l'utilisateur dessiner | [DRAWING.md § 1](DRAWING.md#1-en-deux-minutes) |
| recharger vos données au déplacement | [DATA.md § 2](DATA.md#2-viewport-driven) |
| cadrer la carte sur du contenu | [CAMERA.md § 4](CAMERA.md#4-cadrer-fitbounds) |
| marcher au sol en première personne | [PEDESTRIAN.md § 1](PEDESTRIAN.md#1-en-deux-minutes) |
| traduire l'interface | [LABELS.md](LABELS.md) |
| adapter la charte | [THEME.md](THEME.md) |
| afficher une grille de coordonnées | [GRATICULE.md § 2](GRATICULE.md#2-lactiver) |
| servir vos tuiles depuis votre serveur | [TILES.md § 2](TILES.md#2-régler-le-serveur-interne) |
| ouvrir un menu sur un bâtiment 3D | [BUILDINGS.md § 3](BUILDINGS.md#3-buildingmenu--le-contrat) |
| écrire votre propre couche | [ENGINE.md § 3](ENGINE.md#3-écrire-une-couche) |
| ajouter un plugin (source tierce) | [PLUGINS.md § 1](PLUGINS.md#1-concept-et-modèle-mental) |

### Les trois arbres de réglages

`<Map>` accepte trois arbres, mergés profondément sur une base complète. Chacun a sa
raison de changer :

```tsx
<MapProvider
  theme={{ colors: { ui: { accent: '#0af' } } }}   // charte graphique
  labels={{ measure: imperialMeasure }}            // langue et unités
  config={{ performance: { antialias: false } }}   // machine, quota, support
>
  <Map center={…} zoom={14} />
</MapProvider>
```

La ligne de partage : on change de **thème** pour une charte, de **labels** pour une
locale, de **config** pour une clé d'API, un quota ou un support tactile. Les props
d'un composant **surchargent** ces arbres pour une instance : ne rien passer suit la
carte.

## Installation

```bash
npm i @pasquelin/map3d three react react-dom
```

`three` et `react`/`react-dom` (19) sont des **peer dependencies**.

Le SDK de symbologie MIL-STD (`@armyc2.c5isr.renderer/mil-sym-ts-web`, ~9 Mo) est une dépendance directe, mais chargée en **import dynamique** : elle n'entre dans aucun bundle qui n'affiche pas de symboles (cf. [Symboles](#symboles-catalogue-dicônes-posées-au-glisser-déposer)).

## Démarrage rapide

```tsx
import {
  MapProvider, Map, MarkerLayer, MapControls,
  defaultTheme, type MarkerData,
} from '@pasquelin/map3d'

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
            cluster={{ enabled: true }}
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
import type { DataSource, MarkerData } from '@pasquelin/map3d'

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

### Markers hors champ

Un marker sorti du cadre **reste monté** : son nœud DOM, son portail React et son `CSS2DObject` sont conservés. Seuls sont masqués d'office ceux passés **derrière la caméra** et ceux passés **derrière le globe** (occlusion d'horizon).

Ceux sortis du cadre de plus de **200 px** (`<MarkerLayer cullMargin>`, `0` pour désactiver) sont masqués en plus : le navigateur cesse d'en calculer le style, la mise en page et la composition. Un marker **créé** hors cadre n'entre même jamais dans le document — le `CSS2DRenderer` n'insère l'élément qu'au premier rendu où l'objet est visible. Mesuré sur la démo, vue initiale : **9 ancres dans le DOM au lieu de 32**, et aucun marker affiché au-delà de la marge (23 sans le cull).

Le prix est une projection par marker et par frame, le même calcul que fait déjà le `CSS2DRenderer` pour les positionner. La marge n'est pas cosmétique : plus serrée, les markers du bord clignotent pendant un pan. Un marker masqué sort aussi de la sélection au marquee — hors cadre d'au moins 200 px, aucun rectangle tracé à l'écran ne pourrait de toute façon l'atteindre.

Ce réglage ne réduit **pas** le nombre d'objets montés (le tri z du `CSS2DRenderer` porte sur tout ce qui existe). Pour borner ce nombre, deux leviers, dans cet ordre : une `source` **cadrée sur le viewport** (c'est le seul qui borne la donnée, y compris au zoom maximal où le clustering ne regroupe plus) et le **clustering**.

## Relations (distances et temps de trajet réels)

`<RelationLayer>` relie un marker à ses voisins **par tags**, avec les distances et durées **routières réelles** d'un fournisseur de routage. Une section « Distance autour » se **greffe** sur le menu contextuel du marker : elle ne le remplace pas. Les familles de tags applicables à la source y sont listées directement, chacune ouvrant ses presets de sélection.

```tsx
import { RelationLayer, RelationStatusBar, createGoogleRoutesProvider, type RelationRule } from '@pasquelin/map3d'

// Le SEUL endroit où vit le métier : le moteur ne connaît que des tags.
const RULES: RelationRule[] = [
  {
    id: 'alert-to-agents',
    label: 'Agents',              // libellé du niveau 2 du menu
    from: { any: ['alert'] },     // le marker source doit satisfaire ce sélecteur
    to: { any: ['user'], none: ['onsite'] }, // les cibles candidates aussi
    color: '#22c55e',             // pastille de la famille ; omise → couleur du tag visé
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

**Couleur des traits et des pastilles** — deux questions différentes, deux couleurs. Le **trait** répond « ce faisceau part de qui ? » : il porte la couleur de **son marker source** (`theme.colors.marker[type].base`, exactement celle de sa pastille), traits et socle compris, et elle est résolue **à chaque passe** — un agent qui change de statut change aussi la couleur de ses traits, sans rouvrir la relation. La **pastille de famille** (menu du marker, bascule de la barre d'état) répond « cette famille vise quoi ? » : elle porte la couleur du **tag visé** par la règle, résolue comme au panneau « Couches » (`theme.colors.tags`, puis la palette hashée de `tagColor`) — rien de plus à déclarer, la table de tags donnée au thème sert les deux surfaces. Le tag retenu est le dernier de `to.all` (le plus restrictif : `{ all: ['alert', 'critical'] }` → « critiques »), sinon le premier de `to.any` (cf. `familyTag`). `rule.color`, si elle est déclarée, l'emporte sur les deux ; `defaultColor` est le dernier repli.

Les traits de **recherche** sont en **pointillé défilant** (le marching-ants de la sélection, transposé au ruban 3D : `<RelationLayer linkDash={{ length, gap, speed, gapOpacity }}>` en pixels écran, `false` pour un trait plein). L'espace entre deux tirets n'est pas vide : il garde la couleur du trait à `gapOpacity` près, ce qui lui laisse un corps continu sans lui imposer un contour d'une autre teinte (un trait pointillé ne reçoit donc pas de `casingWidth`). L'itinéraire **tracé**, lui, reste plein, garde son contour et prend `routeColor` : le pointillé dit « candidat en cours d'évaluation », le trait plein dit « voilà le trajet ».

**Un seul trait par couple de markers.** Deux relations opposées — l'agent vers ses alertes, l'alerte vers ses agents — décrivent le même arc et se superposaient au pixel près, le second masquant le premier. Un seul trait est désormais dessiné, et ses **tirets successifs alternent les couleurs** de toutes les relations concernées (jusqu'à `MAX_DASH_COLORS`) : un maillage de moins, et l'appartenance visible. Le trait revient à la **dernière relation ouverte** — c'est elle qui porte l'étiquette, le survol et le clic. Sans pointillé (`linkDash={false}`) il n'y a plus de tirets à colorer : le trait reste uni, dans la couleur de cette même relation.

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
| `<RelationLayer rules provider width defaultColor linkDash routeColor hubRadius casingWidth minOpacity staleMeters refreshIntervalMs>` | Monte la couche, tient l'état, fournit le contexte. `provider` doit être stable (`useMemo`). |
| `<RelationStatusBar nameOf>` | Barres d'état — **une par relation**, ancrée au socle de son marker source : segments cliquables (famille de tags, mode de transport) et effacement. Se replace seule contre les bords. |
| `useRelations()` | `{ rules, menuFor, run, snapshots, setMode, routeColor, familyColor, untrace, clear }` — lève hors d'un `<RelationLayer>`. |
| `RelationEngine` `selectTargets` `matchesSelector` `familyTag` `buildRelationMenu` | Core **headless** (ni Three, ni React, ni `fetch`) : utilisable côté serveur ou en test avec un fournisseur factice. |
| `createGoogleRoutesProvider({ apiKey, language, region })` `RoutingProvider` | Fournisseur Google Routes v2, ou le contrat à implémenter pour le vôtre. |
| `LinkLayer` `haversineMeters` `greatCirclePoints` `decodePolyline` `RouteCache` | Briques réutilisables (rendu des liens drapés, géométrie sphérique, polylignes encodées, cache TTL + position). |

Modes de transport : `DRIVE`, `WALK`, `BICYCLE`, `TWO_WHEELER`, `TRANSIT`. Libellés et gabarits sont traduisibles via `labels.relations` et `labels.duration` (cf. [Traduction des libellés](#traduction-des-libellés-labels)).

## Outils de dessin

Un éditeur de formes complet façon Figma/Photoshop, drapé sur le terrain 3D (formes ancrées au sol, traits en px écran constants au zoom).

**Dessin** : ligne, polygone (clics + Entrée), rectangle (angles arrondis réglables), cercle, main levée, flèche, règle (cote fine pointillée ⊢––⊣ avec label de distance), gomme.

**Sélection** (`V`) : clic simple (Maj+clic = ajout/retrait), ou marquee **rectangle** (`1`), **polygone** (`2`), **lasso** (`3`) — sous-menu au survol du bouton, sémantique « touche = sélectionné ». Contours en marching-ants noir/blanc (lisibles sur tout fond), bbox englobante en multi-sélection.

**Édition** : poignées façon Figma — coins (2 axes, Maj = homothétie), milieux d'arêtes (1 axe), sommets individuels (polygone/ligne/flèche/règle), drag du corps = déplacement, **Maj pendant le drag = rotation** (curseur dédié). Multi-sélection : transformations groupées dans un repère commun. Un rectangle tourné se redimensionne le long de ses axes propres.

**Panneau de style**, ouvert par le **bloc de couleurs — dernier bouton de la barre** (les deux carrés fond/bordure, façon case couleur de Photoshop : le style courant s'y lit en permanence). Il s'ouvre au clic, jamais tout seul. Couleurs **fond et bordure séparées** (avec échange ⇄ dans le panneau), palette du thème + sélecteur natif, épaisseur de bordure **y compris 0** (sans bordure), style de trait (plein/tirets/pointillés), opacité de bordure ET de fond, rayon d'angle des rectangles. Sans sélection il règle les défauts des prochaines formes ; avec sélection il restyle celles qui sont sélectionnées.

**Réglages par outil** (engrenage) : chaque outil garde ses propres défauts (couleurs, épaisseur, trait, opacités, rayon…), **persistés en `localStorage`** (`m3d:draw-settings`, désactivable via `settingsStorage="none"`), avec aperçu live, réinitialisation par outil ou globale, et récapitulatif des raccourcis.

**Barre espace** : maintenir Espace pendant le dessin/l'édition = **pan caméra temporaire** (le tracé en cours est gelé, pas perdu) ; Espace+Maj = rotation caméra ; relâcher = reprise exacte.

**Historique** : undo/redo complet (`⌘Z`/`⌘⇧Z`) couvrant création, édition, style, suppression, duplication. `⌘A` tout sélectionner, `⌘D` dupliquer, `Suppr` supprimer, flèches = déplacer d'1 px (Maj = 10 px).

**Formes verrouillées** : une feature GeoJSON avec `properties.locked: true` (ex. limite de zone imposée par votre API) est intouchable dans l'UI — clic dessus = flash cadenas ; « Tout effacer » la conserve, et **l'undo/redo la préserve** (ni supprimée ni déverrouillée par Ctrl+Z). Déverrouillage réservé au code hôte : `api.lock(ids)` / `api.unlock(ids)`.

**GeoJSON** : export/import via `onChange`/`value`/`toGeoJSON`/`fromGeoJSON`. Properties par forme : `kind`, `color` (bordure), `fillColor`, `width` (px, 0 = sans bordure), `fillOpacity`, `strokeOpacity`, `stroke` (`solid`/`dashed`/`dotted`), `radius` (% d'angle, rects), `locked`, `tags`, `meta`. Chaque feature porte aussi son `id` (champ standard GeoJSON). Les anciens fichiers (sans les nouveaux champs) se chargent tels quels.

**Identité et métadonnées métier** : chaque forme a un `id` **stable qui survit au round-trip** export → import, et un champ libre `meta: Record<string, unknown>` transporté tel quel de bout en bout, jamais interprété ni rendu par la lib. C'est là que vit votre modèle (uuid de base, groupes, titre…).

**Events par forme** : `onShapeAdd` / `onShapeUpdate` / `onShapeDelete` sont émis **au moment du changement**, contrairement à `onChange` qui sérialise toute la collection et se coalesce à 1×/frame. `onShapeEdit` signale un **double-clic** — une intention d'ouvrir une fiche côté hôte, pas une mutation. Les deux styles cohabitent : `onChange` pour un état global contrôlé, `onShape*` pour du CRUD par identité (une mutation par forme). L'undo/redo émet aussi ces events, déduits par différence.

```tsx
<DrawLayer
  value={zonesImposees}                        // import contrôlé (remplace tout, non annulable)
  onChange={(fc) => save(fc)}                  // GeoJSON complet, coalescé (1 émission max par frame)
  onSelectionChange={(ids) => console.log(ids)}
  onShapeAdd={async (s) => {                   // CRUD par identité : une mutation par forme
    const { uuid } = await createZone(s)
    api.updateShape(s.id, { meta: { uuid } }, { silent: true })  // silent = pas de ré-émission
  }}
  onShapeUpdate={(s) => saveZone(s.meta?.uuid, s)}
  onShapeDelete={(s) => deleteZone(s.meta?.uuid)}
  onShapeEdit={(s) => openSheet(s.meta?.uuid)} // double-clic
  // Règles métier du dessin utilisateur (les mutations programmatiques y échappent).
  constraints={{ limits: perimetresAutorises, maxAreaM2: 10_000_000 }}
  onReject={(reason, s) => toast(reason === 'outOfLimits' ? 'Hors zone' : 'Trop grande')}
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

L'API `useDrawing()` expose tout : `tool/setTool`, `selectMode/setSelectMode`, `selection`, `select`, `selectAll`, `clearSelection`, `deleteSelection`, `duplicateSelection`, `setStyle`/`currentStyle`, `lock`/`unlock`, `undo`/`redo`/`canUndo`/`canRedo`, `clear`/`canErase`, `settings` (+ `useDrawSettings()`), `toGeoJSON`/`fromGeoJSON`, `shortcuts`.

**Contraintes métier** — `constraints.limits` (des `ShapeData`, comme `<ShapeLayer>`) impose que chaque forme dessinée tienne dans **au moins un** périmètre, et `constraints.maxAreaM2` plafonne son aire. Une création refusée ne laisse aucune trace (ni mesh, ni historique, ni `onChange`) ; une **édition** refusée remet la forme dans son état d'avant le geste plutôt que de la perdre — et n'émet donc pas `onShapeUpdate`. `onReject(reason, shape)` vous laisse afficher votre propre message : la lib n'affiche rien d'elle-même. `limits` ne dessine rien non plus — affichez vos périmètres avec `<ShapeLayer>` ou en formes verrouillées. Seuls les **gestes utilisateur** sont contraints : `addShape`/`updateShape`/`fromGeoJSON` injectent sans contrôle.

Les prédicats sont exportés et **géodésiques** (donc stables au pivot de caméra, contrairement à un test en coordonnées écran) : `polygonAreaM2` (excès sphérique, même méthode que `google.maps.geometry.spherical.computeArea`), `pointInRing`, `ringInsideRing`, `circleRing`, `ringOfShape`.

**CRUD par identité** — pour piloter les formes une par une depuis votre code : `getShapes()`, `getShape(id)`, `getLastShape()`, `addShape(shape, opts?)` (renvoie l'id), `updateShape(id, patch, opts?)`, `removeShape(id, opts?)`, `replaceShapes(shapes, opts?)`. Toutes acceptent `{ silent: true }`, qui **supprime toute émission d'event** — indispensable pour réinjecter une réponse de votre backend sans relancer la mutation qui vient de la produire. `addShape({ id: monUuid, … })` fait de votre identifiant métier l'id map3d directement ; `replaceShapes` émet les events par différence, là où `fromGeoJSON` remplace en bloc. Dans un patch, `style` est fusionné champ par champ mais `meta` est **remplacée** (`{ meta: { ...getShape(id)?.meta, uuid } }` pour patcher).

## Symboles (catalogue d'icônes posées au glisser-déposer)

Les **icônes d'un catalogue** se posent sur le terrain par glisser-déposer depuis la palette, puis sont déplaçables, sélectionnables, filtrables par tag et persistables — mêmes garanties que les formes de dessin, appliquées à des points.

Il n'y a **pas de couche dédiée à monter** : un symbole posé est une forme de la collection de dessin (`kind: 'symbol'`), donc `<DrawLayer>` porte l'ensemble. Il hérite ainsi de l'undo/redo, du GeoJSON et des events par forme sans que rien ne soit dupliqué.

Le graphisme est **injecté** (`SymbolRenderer`), comme les providers de recherche et de routage : la couche ne connaît que des `key` de catalogue, jamais un format de symbologie particulier. Un catalogue peut donc changer de graphisme sans invalider les données déjà enregistrées.

```tsx
const catalog: SymbolCatalog = {
  id: 'mon-catalogue',
  entries: [
    { key: 'poste', label: 'Poste de commandement', category: 'installations' },
    { key: 'hopital', label: 'Hôpital', category: 'installations' },
  ],
}

// `render` est SYNCHRONE (appelé à chaque rendu) donc mémoïsant ; le chargement
// d'un éventuel SDK passe par `ready`, après quoi la couche se re-rend.
const renderer: SymbolRenderer = {
  ready: chargerMonSdk(),
  render: (key, { size, variant } = {}) => ({ size: size ?? 40, svg: svgAncréAuCentre(key, variant) }),
}

<DrawLayer
  symbols={{ catalog, renderer }}             // `enabled: false` retire l'outil
  onShapeAdd={(s) => créerEnBase(s)}          // CRUD par identité, formes ET symboles
  onShapeUpdate={(s) => sauver(s.meta?.uuid, s)}
  onShapeDelete={(s) => supprimer(s.meta?.uuid)}
  onChange={(fc) => persister(fc)}            // ou l'état global en GeoJSON
/>
```

Les events sont ceux de la couche de dessin : un symbole s'y reconnaît à `kind === 'symbol'`, et son entrée de catalogue à `symbol.key`. L'affiliation appliquée aux poses est celle de la palette (`useDrawing().symbols.affiliation`), pas une prop.

**Le SVG doit être ancré au centre de son viewBox** — c'est une exigence, pas un confort. Les symboles MIL-STD ont un point d'ancrage interne qui n'est pas le centre de l'image (un poste de commandement pend sous son mât) : rendre le SVG brut décalerait le symbole de plusieurs pixels par rapport au terrain. Recentrer le viewBox sur l'ancre est la responsabilité du provider ; la couche place le centre de l'image sur la coordonnée.

Le rendu passe par `<MarkerLayer>` : un symbole ponctuel **est** un point à icône, donc il hérite de la projection, du pool recyclé, de la sélection marquee/lasso et du filtre « Couches » sans les réimplémenter. Les tags par défaut suivent la convention maison : `['symbol', <catégorie>]`, à côté de `['draw', <outil>]` et `['marker', <type>]`.

Il en hérite aussi le **regroupement** et le **seuil de zoom du décor** : posés à la douzaine sur une même zone, les symboles se recouvrent sans rien dire de ce qu'ils cachent, et dézoomé sur une région ils masquent les alertes. Ils participent donc au regroupement **de la carte** — le même index que les markers de l'application, si bien qu'une pastille peut mélanger les deux — et sont `static` d'office (cf. [Markers statiques](#markers-statiques-le-décor)) :

```tsx
<DrawLayer
  symbols={{
    catalog,
    renderer,
    cluster: { enabled: false },   // `{ enabled: true }` par défaut
    minZoom: 14,      // seuil de TOUTE la couche, à la place de `config.markers.staticMinZoom`
  }}
/>
```

Quand le seuil dépend du **genre** de symbole plutôt que de la couche, il se déclare sur l'entrée de catalogue — c'est elle qui sait qu'un poste de commandement structure une région là où un point de contrôle n'a de sens qu'une fois sur zone :

```tsx
entries: [
  { key: 'poste', label: 'Poste de commandement', category: 'installations', minZoom: 10 },
  { key: 'controle', label: 'Point de contrôle', category: 'installations', minZoom: 16 },
]
```

Poser une icône neuve et déplacer une icône existante sont **le même geste** sur la même zone (`useMapDropZone`) : seule la provenance de la charge diffère. Le reste passe par `useDrawing()` : son champ `symbols` expose `catalog`, `render` (vignettes), `ready`, `affiliation`/`setAffiliation`, `paletteOpen`/`setPaletteOpen` et `place(key, at, variant?)` ; le CRUD, l'historique et le GeoJSON sont ceux des formes (`addShape`, `updateShape`, `removeShape`, `undo`/`redo`, `toGeoJSON`…), symboles compris.

Les entrées `multiPoint` du catalogue (graphiques tactiques : périmètre, axe, zone) sont **ignorées au dépôt** : elles se posent par collecte de points successifs, mode qui n'est pas encore implémenté.

### Palette (`<SymbolPaletteButton>`)

Le bouton qui ouvre la palette est un **outil natif de la barre** (comme la loupe) : `<Toolbar>` le rend elle-même, `components={{ symbol: false }}` le masque.

```tsx
<DrawLayer>
  <Toolbar />
</DrawLayer>
```

Le catalogue, l'affiliation et les libellés viennent du contexte de `<DrawLayer>` : la palette n'a aucune configuration à recevoir.

Le panneau reprend le langage visuel de « Couches » (recherche, compteurs, panneau ancré du côté opposé à la barre, fermeture au clic extérieur ou Échap) et ajoute une grille par catégorie. Chaque vignette est rendue par le `SymbolRenderer` **dans l'affiliation courante** : changer d'affiliation redessine toute la palette, et le symbole posé hérite de la variante affichée. Un badge sur le bouton compte les symboles présents sur la carte.

Détails d'usage : la prise est **immédiate** sur une vignette (`longPressMs: 0` — une palette n'a pas de clic à préserver, contrairement à un marker dont le clic ouvre une fiche) ; les entrées `multiPoint` sont listées mais grisées et non saisissables, plutôt que masquées, pour ne pas faire croire à un catalogue incomplet ; et le panneau n'est monté qu'ouvert, donc fermé il n'appelle pas le renderer.

### Symbologie MIL-STD-2525D fournie

Un catalogue et un renderer prêts à l'emploi sont livrés, adossés au SDK officiel `@armyc2.c5isr.renderer` :

```tsx
import { MILSYM_CATALOG, createMilSymRenderer } from '@pasquelin/map3d'

const renderer = useMemo(() => createMilSymRenderer({ affiliation: 'friendly' }), [])

<DrawLayer symbols={{ renderer }} />   // `catalog` vaut MILSYM_CATALOG par défaut
```

`MILSYM_CATALOG` couvre **91 entrées** en 7 catégories — 80 icônes ponctuelles (`installations`, `units`, `equipment`, `air`, `events`, `control`) et 11 graphiques tactiques multi-points — avec libellés et descriptions en français. La `variant` d'un symbole est son **affiliation** : `friendly`, `hostile`, `neutral`, `unknown`.

Le SDK pèse ~9 Mo : il est chargé par **import dynamique**, donc isolé dans un chunk que seule une carte affichant des symboles télécharge. `render` reste synchrone (contrat `SymbolRenderer`) et sert depuis un cache par SIDC + taille ; il renvoie `null` jusqu'à ce que `ready` soit résolu, la couche affichant un placeholder d'ici là.

⚠️ **Piège du SIDC** — l'affiliation est le **4ᵉ** chiffre du SIDC 2525D, pas le 3ᵉ (celui-ci porte le *contexte* : réalité / exercice / simulation). L'écrire en 3ᵉ position — ce que fait `applySidcAffiliation` côté operator — produit un symbole de contexte non standard : graphisme décoré, dimensions et **point d'ancrage différents** (≈ 5 px de décalage vertical mesuré), l'affiliation restant celle du catalogue. `applyAffiliation` de map3d écrit au bon endroit ; c'est un point à corriger lors de la migration de l'operator.


## Loupe (rayon X des markers d'une zone)

Outil de **consultation** : on trace une zone rectangulaire à l'écran, et un panneau inventorie **tous les markers qu'elle couvre — y compris ceux agrégés dans un cluster**. La carte, elle, ne bouge pas : rien n'est sélectionné, aucun cluster n'est éclaté, aucune forme n'est créée (donc rien dans le GeoJSON, l'undo/redo ou le panneau de style).

Elle est **montée par la carte et active par défaut** — comme l'outil Symboles, il n'y a rien à assembler :

```tsx
<Map center={PARIS} zoom={14}>          {/* la loupe est là, touche X, bouton dans la barre */}
  <MarkerLayer points={markers} />
  <DrawLayer><Toolbar /></DrawLayer>
</Map>
```

`lens` ne sert qu'à **régler** l'outil (tout est facultatif), et `lens={false}` le retire entièrement — ni raccourci, ni bouton :

```tsx
<Map
  lens={{
    renderItem: (m) => m.data?.name ?? m.id,   // défaut : pastille de type + avatar + id
    actions: SHEET_ACTIONS,                    // en plus de « Cibler », natif
    markerTypeLabel: (t) => LABELS[t] ?? t,    // récap par type de l'en-tête
    getId: (m) => m.id,
    shortcut: 'x',                             // `null` = aucun
    targetZoom: 17,
  }}
>
```

Le bouton est un **outil natif de `<Toolbar>`** (masquable par `components={{ lens: false }}`), et `useLens()` donne `active`/`activate`/`deactivate`/`toggle` partout sous `<Map>` — pour piloter la loupe depuis votre propre UI.

**Interaction** : tant que l'outil est actif, le glissé trace la zone (retracer remplace, clic simple efface) ; la carte se navigue à la molette et à la barre espace, comme pour le dessin. La zone est déplaçable et redimensionnable, et la liste **se recalcule en direct** quand la carte défile dessous. `Échap` retire la zone, puis quitte l'outil. La loupe et les outils de dessin sont **mutuellement exclusifs** — ils partagent le même intercepteur de pointeur.

Le panneau réutilise la `<MarkerList>` du panneau de sélection : une ligne par marker, en-tête fixe avec le décompte par type, corps scrollable, croix par ligne, menu d'actions extensible.

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
- **Référence complète des clés** (groupes `controls`, `tags`, `symbols`, `search`, `toolbar`, `tools`, `selectModes`, `style`, `selection`, `markerList`, `lens`, `settings`, `actions`, `glyphs`, `modKey`, `keys`, `format`, `measure`, `duration`, `relations`, `pinned`, `plural`, `errors`) : voir [docs/LABELS.md](LABELS.md).

## Raccourcis clavier

Les **outils** se choisissent par lettres seules, identiques Mac/PC ; les **actions d'édition** (annuler, tout sélectionner, dupliquer) utilisent le modificateur de la plateforme (⌘ sur Mac, Ctrl ailleurs) avec `preventDefault` ciblé. Tous sont affichés dans les tooltips des boutons et ignorés pendant une saisie (recherche, formulaires).

**Déplacement sur la carte** — les seules touches qui agissent tant qu'elles sont **maintenues** :

| Touche | Action |
|---|---|
| `↑` `↓` `←` `→` | Avancer / reculer / dériver, **dans le repère de la vue** |
| `Z` `S` `Q` `D` | Les mêmes, en AZERTY |
| `Maj` (maintenu) | Accélérer (×3) |

« Tout droit » suit le **sol**, jamais la ligne de visée : la caméra garde son altitude,
même très inclinée. Tourner la vue tourne les touches avec elle, et elles restent actives
en **mode rotation** — la souris fait pivoter, les flèches déplacent.

La vitesse est proportionnelle à la hauteur au-dessus du sol (`camera.keyPan.speed`), donc
la carte défile à la même allure à l'écran quelle que soit l'altitude.

Les flèches reviennent au **déplacement d'une sélection de dessin** dès qu'il y en a une —
la carte se tait alors d'elle-même. Les lettres se remappent par
`interaction.shortcuts.navigate` (WASD en QWERTY, par exemple).

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
| `L` `P` `R` `C` `H` `A` `M` `E` | Ligne, Polygone, Rectangle, Cercle, main levée (`H`), flèche (Arrow), Mesurer, gomme (Effacer) |
| `Espace` (maintenir) | Pan caméra temporaire (dessin gelé, pas perdu) — `Espace+Maj` = rotation caméra |
| `Maj` + glisser | Rotation de la forme (corps) / homothétie (poignée de coin) |
| `⌘Z` / `⌘⇧Z` (`Ctrl` ailleurs) | Annuler / Rétablir (création, édition, style, suppression) |
| `⌘A` / `⌘D` | Tout sélectionner / Dupliquer la sélection |
| `Suppr`/`⌫` | Supprimer la sélection |
| Flèches | Déplacer la sélection d'1 px (Maj = 10 px) |
| `X` | Loupe — inventaire des markers d'une zone (`<Map lens={{ shortcut }}>` pour remapper) |
| `Entrée` | Fermer le polygone (dessin ou marquee) |
| `Échap` | Cascade : annule le geste/tracé en cours → marquee → désélectionne → outil navigation |

Un remapping est immédiatement reflété dans les tooltips (les deux barres affichent leurs raccourcis effectifs).

## API principale

| Élément | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|---|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `<MapProvider theme colorScheme labels>` | Thème résolu (clair/sombre + reduced-motion) + libellés traduisibles ([docs/LABELS.md](LABELS.md)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `<Map cesiumIonToken googleMapsApiKey center zoom mapMode fallbackGlobe interactive onReady onViewportChange onCameraChange>` | Canvas + moteur (Cesium Ion).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `<MarkerLayer points/source getId cluster icon typeLabel tooltip menu selectedId followId onSelect selectionRing draggable repositionable onReposition leaderLine cullMargin staticMinZoom>` | Markers/clusters DOM. Infobulles au survol déduites de `MarkerData.title`/`titleColor`/`content` (`tooltip` reste la surcharge pour un titre que du texte ne peut pas dire — le clic = actions), `MarkerData.avatar` (photo ronde gérée), `MarkerData.new` (sonar jusqu'au clic) et `MarkerData.urgent` (viseur rouge, infobulle style urgence). `typeLabel` nomme un type une fois pour toutes (rubriques de recherche, satellites de cluster). Cluster inséparable au zoom max → éclaté automatiquement en éventail.                                                                                                                                                                                                                                                                                                                                                               |
| `<Map cluster={{ enabled, size, icon, typeIcon, typeLabel, tooltip }}>` `<ClusterSurface>` | Regroupement **de la carte** : un index unique alimenté par toutes les couches (`engine.clusters`), qui rend les pastilles. L'algorithme est dans `config.clustering` ; `<MarkerLayer cluster={{ enabled: false }}>` retire une couche. |
| `<PathLayer paths animateHead>` | Tracés/parcours (trace GPS animée).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `<ShapeLayer shapes>` | Zones : cercle-rayon, polygone, rectangle-bounds — drapées au sol, ou **volumétriques** via `extrudeHeight`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `<DrawLayer tools shortcuts defaults settingsStorage value onChange onSelectionChange onShapeAdd onShapeUpdate onShapeDelete onShapeEdit>` | Éditeur de formes complet (sélection, édition, style, undo/redo, verrouillage) + GeoJSON, identité stable par forme, métadonnées métier libres et CRUD par id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `<DrawLayer symbols={{ enabled, catalog, renderer }}>` | Icônes d'un catalogue posées au **glisser-déposer** (graphisme injecté), déplaçables, taguées, undo/redo + GeoJSON — cf. [Symboles](#symboles-catalogue-dicônes-posées-au-glisser-déposer).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `<SymbolPaletteButton position tipId shortcut categoryLabel variants variant onVariantChange previewSize>` | Bouton + palette catégorisée avec recherche, sélecteur d'affiliation et vignettes saisissables (→ `<Toolbar extraTools>`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `<Toolbar position minZoom tools selectModes components>` | Barre de dessin entièrement paramétrable (sections masquables/remplaçables).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `<DrawStylePanel>` `DrawSettingsButton` | Bloc de couleurs de la barre (dernier bouton) et son panneau de style ; réglages par outil. À monter dans une `<Toolbar>`, dont ils prennent le gabarit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `<MapControls>` `<ContextMenu>` | Contrôles remplaçables (boutons **Déplacement/Rotation** du drag — pivoter sans maintenir Maj —, bouton **Couches** = filtre par tags).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `<SearchBox onSelect search placeholder flyAltitude historyStorageKey historySize limitPerGroup scope groupOrder>` | Recherche **unifiée** : les éléments de la carte (markers, zones, dessins, symboles) ET le géocodage de lieux, en une liste **rubriquée**. Les rubriques carte ne se configurent pas — les couches s'inscrivent seules au registre `engine.search` dès qu'un élément porte un `title` ; `<MarkerLayer typeLabel>` les nomme. Sélecteur de portée à pastilles, en-têtes annonçant le total avant troncature, choix d'un marker = vol caméra **+ sélection** (comme un clic) avec le menu `<Map markerMenu>` sous son bouton « … », historique localStorage re-résolu à la position courante, clavier ↑ ↓ Entrée Échap. `search` remplace le seul géocodeur (**Google Places intégré** par défaut via la clé de `<Map googleMapsApiKey>`, ou `createGooglePlacesSearch({ apiKey, language, region, limit })`) ; `false` retire la rubrique « Lieux », qui ouvre sinon toujours la liste. |
| `<TagFilterControl position tipId>` | Bouton + panneau de filtre par tags, utilisable seul hors `<MapControls>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `<ToolButton icon? label tip shortcut active>` | Bouton de barre (icône **facultative** — sans elle, le bouton n'affiche que ses `children`, pour celui dont l'aperçu EST la valeur ; état, infobulle + `aria-label` porteurs du raccourci) — pour peupler `extraTools` / `components` avec le langage visuel des boutons natifs. À coupler à `useToolbar()` : un outil applicatif doit se refermer quand la barre se replie ou qu'un outil natif prend la main (`bar.retracted \|\| bar.nativeActive`, via `useCloseWhenHidden`) et éteindre les autres en s'ouvrant (`bar.claim()`). Sans ça, deux boutons restent allumés et la barre ne dit plus où on en est.                                                                                                                                                                                                                                                                                                                                                                                 |
| `AnchorHeightCache` | Hauteurs d'ancre mémoïsées (raycast amorti, retentative des tuiles absentes, invalidation 2D↔3D) pour une couche custom qui projette des éléments drapés au sol.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `<RelationLayer rules provider>` `<RelationStatusBar>` | Liens par tags vers les markers voisins, avec distances et durées routières réelles — cf. [Relations](#relations-distances-et-temps-de-trajet-réels).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Hooks | `useMap`, `useCamera`, `useViewport`, `useLiveData`, `useDrawing`, `useDrawSettings`, `useLens`, `useMapEvents`, `useTags`, `useTagSelection`, `useRelations`, `useToolbar`, `useCloseWhenHidden`, `useDraggablePanel`, `useDraggable`, `useDropZone`, `useMapDropZone`, `useRepositionable`, `useTheme`, `useLabels`, `useConfig`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Déposer sur la carte (`useMapDropZone`)** — pendant du couple `useDraggable`/`useDropZone` quand la cible du dépôt est le **terrain** et non un panneau : la zone couvre les trois surfaces carte (canvas, markers, overlay) — jamais les barres d'outils — et le callback reçoit directement la coordonnée visée, par raycast ellipsoïde (juste en vue inclinée comme en 2D). Un dépôt à côté du globe est ignoré, faute de position à donner.

```tsx
// La palette rend ses items saisissables ; la carte les reçoit à la bonne lat/lng.
useMapDropZone<Icone>({
  accept: (p) => p.type === 'icone',
  onDrop: (payload, latLng) => poser(payload.data, latLng),
})
```

`<MapControls>` est entièrement configurable, à deux grains :

```tsx
// Grain GROUPE : masquer (false) ou remplacer (ReactNode) un groupe entier.
<MapControls components={{ compass: false, zoom: <MonZoom /> }} />

// Grain BOUTON : masquer un bouton précis — son raccourci clavier est
// désactivé avec lui, un groupe vidé disparaît.
<MapControls buttons={{ rotate: false, zoomOut: false, globe: false }} />
```

Boutons : `pan`, `rotate`, `compass`, `zoomIn`, `zoomOut`, `tilt`, `globe`, `graticule`, `mode3d`, `plan`, `traffic`, `pedestrian`, `target`, `layers`, `fullscreen` — groupes : `drag`, `compass`, `zoom`, `pedestrian`, `target`, `layers`, `fullscreen`. Le groupe `compass` réunit tout le point de vue (boussole, inclinaison, bascule `mode3d`, trafic, globe, grille) : plus de groupe `view` ni `basemap` séparé. `mode3d` est une bascule — allumé en 3D, l'éteindre repasse au plan 2D, il n'y a plus de bouton « Plan » distinct.

#### Bouton « revenir à la cible »

Un écran a souvent un point de référence — l'alerte consultée, l'événement en cours. Fournir `target` ajoute un bouton qui y ramène ; l'omettre le retire. La carte n'a pas à savoir ce que la cible représente, seulement où elle est.

```tsx
<MapControls
  target={{
    position: alerte.position,
    label: 'Revenir à l’alerte',   // défaut : labels.controls.target
    onlyWhenOutOfView: true,        // n'apparaît qu'une fois la cible sortie de l'écran
    zoom: 16,                       // absent = altitude courante conservée
  }}
/>
```

`onlyWhenOutOfView` se réévalue sur l'event `viewport` (la vue **stabilisée**), pas à chaque frame : inutile de tester pendant un vol, seule la vue posée compte.

### Zones volumétriques (`extrudeHeight`)

Une zone est drapée au sol par défaut. `extrudeHeight` (mètres au-dessus du sol) la transforme en **volume** — murs verticaux + couvercle — pour les vues inclinées où un aplat se lit mal :

```tsx
<ShapeLayer shapes={[{ kind: 'polygon', points, color: '#f59e0b', fillOpacity: 0.18, extrudeHeight: 200 }]} />
```

Le volume est monté **dans le même repère que la surface drapée** : il hérite de son ancre et de sa hauteur de terrain, déjà résolues et raffinées au fil du chargement des tuiles. Il ne peut donc pas dériver de sa base au pan — il n'a pas de position propre. Contrairement aux formes plaquées au sol, ses faces **testent la profondeur** : un bâtiment qui passe devant l'occulte correctement.

Ses arêtes (anneau du bas, montants, anneau du couvercle) sont tracées en **lignes GL de 1 px**, constantes au zoom et sans conversion px→mètres — un ruban ne tomberait jamais exactement sur un pixel. Sur une forme extrudée, ces arêtes remplacent donc le contour en ruban ; `width` ne s'applique plus qu'aux formes drapées.

**Le volume part du sol réel, pas du plan de la zone** : le terrain est échantillonné le long du contour et le bas des murs descend sous le point le plus bas, si bien qu'il ne flotte jamais au-dessus d'un creux (berge, pont, vallon). Le couvercle, lui, reste plan à `extrudeHeight` au-dessus du sol de référence de la zone. `extrudeHeight` est une propriété **de la zone** : deux zones voisines peuvent avoir des hauteurs différentes, et la changer à chaud reconstruit le volume.

N'a d'effet que sur les formes fermées (polygone, rectangle, cercle).

### Carte prête (`onReady`)

```tsx
<Map onReady={(engine) => camera.fitBounds(boundsOfMarkers(markers))} />
```

**`ready` = la projection résout des hauteurs et un cadrage vise le sol réel.** Ce n'est pas « le moteur existe » : ça, c'est `useMap()`, disponible dès le montage sans attendre les tuiles. Avant `ready`, un `fitBounds` viserait l'ellipsoïde nu.

L'event tire **une seule fois**, mais un abonné arrivé après coup le reçoit quand même immédiatement — sans quoi `onReady` marcherait au premier montage et resterait silencieux ensuite. Si une source de tuiles échoue (token invalide, réseau coupé), `ready` finit malgré tout par tomber au bout de 8 s : l'application n'est jamais suspendue à un event qui n'arrivera pas.

Autres surfaces : `engine.on('ready', cb)`, `engine.ready` (booléen synchrone), et `useMapEvents({ onReady })` pour un composant enfant qui n'est pas celui qui rend `<Map>`.

### Options portées par la donnée du marker

En plus de `position`, `type`, `tags`, `icon`/`avatar`, `new` et `urgent`, un `MarkerData` porte :

| Champ | Effet |
|---|---|
| `title` | Nom lisible, **point de vérité unique** : titre de l'infobulle, libellé des listes (loupe, panneau de sélection, dock) et texte **indexé par la recherche**. Sans lui, ces surfaces retombent sur l'id — et le marker n'est trouvable par personne. |
| `titleColor` | Teinte du titre (alerte critique, statut d'agent) — évite d'écrire du JSX pour la seule chose qu'un titre exprime au-delà de son texte. |
| `content` | Corps de l'infobulle : tout ReactNode (badges, avatar, mini-tableau). |
| `zIndex` | Priorité entre markers superposés (défaut 0). Le sélectionné et celui dont le menu est ouvert restent **au-dessus de toute valeur** : un `zIndex` métier ne peut pas enterrer ce avec quoi on interagit. |
| `selectedColor` | Couleur de l'anneau quand ce marker est le `selectedId` — l'anneau porte alors une information (statut d'un agent, source d'une alerte) au lieu d'une teinte fixe. Défaut : l'accent du thème. |
| `repositionable` | Le marker se déplace sur la carte (cf. section suivante). |
| `static` | **Décor fixe** (symbole posé, défibrillateur, borne) : masqué en dessous d'un seuil de zoom (cf. section suivante). |

`title`/`titleColor`/`content` suivent la **même règle de précédence** que `repositionable` : la prop de couche l'emporte quand elle est fournie. `<MarkerLayer tooltip>` décide alors seule de l'infobulle — y compris pour rendre `null` — et `<MarkerList renderItem>` décide seule du titre de ligne, teinte comprise. `ShapeData` et les formes dessinées portent elles aussi un `title`, à la même fin.

**Le marker sélectionné et le marker suivi échappent au filtre par tags** : masquer ce sur quoi la carte est centrée ferait disparaître la cible sans explication, et le suivi perdrait sa position en cours de route.

Côté couche, `cluster` accepte `radius`, `minPoints`, `maxZoom` et `spiderfyZoom` — ils surchargent le thème **pour cette couche**, deux cartes de la même app n'ayant pas forcément la même densité de points.

### Markers statiques (le décor)

Un défibrillateur, une borne, un symbole posé ne sont pas des événements : ce sont des **repères** qu'on consulte de près. Dézoomée sur une région, une carte qui les affiche tous se couvre de pictogrammes illisibles qui masquent ce qui, lui, demande une action.

`static` les fait disparaître sous un seuil de zoom :

```tsx
// Seuil de la config (13 par défaut)
{ id: 'dae-01', type: 'defib', position, title: 'DAE — Mairie', static: true, data }

// Seuil PROPRE à ce point : une gare structure un quartier, elle se voit de plus loin
{ id: 'dae-04', type: 'defib', position, title: 'DAE — Gare du Nord', static: { minZoom: 11 }, data }
```

Le seuil global se règle dans la config, et vaut pour tout marker déclaré `static: true` :

```tsx
<Map config={{ markers: { staticMinZoom: 13 } }} />   // 0 = jamais masqué
```

Trois choses ne changent **pas** au passage du seuil :

- **la recherche et la loupe** continuent de le trouver, et le vol y mène. Un seuil de zoom dit ce qui est *lisible*, pas ce qu'on a le droit de trouver — c'est toute la différence avec le filtre par tags, qui obéit à un choix de l'utilisateur et masque partout ;
- **le marker sélectionné ou suivi** reste affiché, comme pour le filtre par tags ;
- **au-dessus du seuil, c'est un marker ordinaire** : il se regroupe et prend sa part dans le camembert d'un cluster comme n'importe quel type.

Un statique masqué ne compte pas non plus dans le total d'un cluster : un cluster n'annonce que ce qu'il cache réellement.

Les **symboles posés** sont statiques d'office. Leur seuil suit la même cascade, du plus général au plus précis — `config.markers.staticMinZoom`, puis `<DrawLayer symbols={{ minZoom }}>` pour toute la couche, puis `minZoom` sur l'entrée de catalogue quand le seuil dépend du **genre** de symbole (un poste de commandement se voit de loin, un point de contrôle non). Le catalogue MIL-STD livré n'en déclare aucun : ses 91 entrées suivent le seuil de la couche.

### Markers repositionnables

Un marker peut être **déplacé sur la carte** pour définir une position. Le drapeau vit sur la **donnée**, parce que dans un même jeu seuls certains markers sont éditables :

```tsx
const markers = [
  { id: 'a1', type: 'alert-high', position, data },                     // fixe
  { id: 'pin', type: 'pin', position, repositionable: true, data },     // déplaçable
]

<MarkerLayer
  points={markers}
  onReposition={(m, latLng) => setForm(latLng)}       // au relâchement
  onRepositionMove={(m, latLng) => preview(latLng)}   // en continu (optionnel)
/>
```

La prop `<MarkerLayer repositionable>` (booléen ou prédicat) permet de trancher globalement ou sur un critère externe au marker (mode édition, droits) ; **fournie, elle prime** sur le champ de la donnée.

Le geste s'arme au **mouvement** (4 px), pas au long-press : le clic reste intact tant que le pointeur ne bouge pas. Le marker suit le **relief réel** (`pickLatLng`), donc reste sous le curseur en vue inclinée, avec repli sur l'ellipsoïde si le pointeur sort du globe.

**À ne pas confondre avec `draggable`**, qui est le drag-and-drop à payload (long-press → ghost → `<PinnedDock>`). Les deux gestes partent du même `pointerdown` : un marker repositionnable ignore `draggable`, même quand la couche l'active pour tous.

Pour une couche custom qui pose ses propres poignées déplaçables : `useRepositionable()`, et `engine.pickLatLngAtClient(clientX, clientY, fallbackToEllipsoid?)` pour convertir un `PointerEvent` en lat/lng.

### Carte figée (`interactive`)

```tsx
<Map interactive={false}>   // ou 'view', ou true (défaut)
```

| Mode | Caméra | Outils (dessin, loupe) | Clic carte | Markers |
|---|---|---|---|---|
| `true` | libre | actifs | émis | cliquables |
| `'view'` | **figée** | neutralisés | émis | cliquables |
| `false` | **figée** | neutralisés | supprimé | inertes |

`'view'` est l'aperçu qu'on consulte sans pouvoir le déplacer : la caméra ne bouge plus, mais markers, sélection et infobulles restent vivants. `false` rend la carte inerte. Dans les deux cas **les overlays continuent d'être rendus** — c'est une carte figée, pas une capture d'écran — et un outil resté sélectionné retrouve son état intact au dégel.

Équivalent impératif : `engine.setInteractive(mode)`, lecture par `engine.interactive`.

`interactive` fige la **carte**, pas votre UI : les contrôles de la lib restent cliquables (ils vivent hors de la surface carte). Masquez ce qui n'a plus de sens :

```tsx
<Map interactive={false}>
  <MapControls buttons={{ zoomIn: false, zoomOut: false, tilt: false, globe: false }} />
</Map>
```

### Cadrage et recentrage de la caméra

`useCamera()` (et `engine.camera`) expose, en plus de `flyTo`/`follow`/`moveTo` :

```tsx
const camera = useCamera()

// Cadre un ensemble géographique. `padding` en pixels : un nombre pour les 4 côtés,
// ou {top,right,bottom,left}. Asymétrique, il décale aussi le centre visé — le
// contenu se centre dans la zone RESTÉE visible, utile sous un panneau latéral.
camera.fitBounds(bounds, { padding: { left: 320, top: 40, right: 40, bottom: 40 } })
camera.fitBounds(bounds, { padding: 50, duration: 0 })     // instantané
camera.fitBounds(traceBounds, { minAltitude: 80 })         // cadrer un objet de quelques dizaines de mètres

camera.setCenter(p)          // instantané, altitude conservée
camera.panTo(p)              // animé, altitude conservée
camera.setZoom(16)           // échelle carte 2D (0 = monde, ~20 = rue)
camera.getZoom()
```

Les `bounds` se construisent avec les helpers exportés, tous **corrects à l'antiméridien** et tolérants aux coordonnées non finies (ils renvoient `null` plutôt qu'un cadre empoisonné) :

```ts
boundsOfLatLngs(points)          // liste de points
boundsOfMarkers(markers)         // tout objet { position }
boundsOfShapes(shapes)           // ShapeData[] (cercle, rect, polygone…)
boundsOfCircle(center, meters)   // disque géodésique
unionBounds([a, b, c])           // union, `null` ignorés
centerOfBounds(b)                // centre, antiméridien compris
altitudeForBounds(b, opts?)      // altitude cadrante (utilisée par SearchBox et fitBounds)
```

Par défaut `altitudeForBounds` borne à `[350 m, 6000 km]` avec une marge de 1.35× — des valeurs pensées pour la recherche de lieu. `minAltitude`, `maxAltitude` et `margin` les ajustent quand le contenu est plus petit (une trace GPS de 200 m).

**Fond de carte** — le bouton `mode3d` bascule entre les tuiles 3D photoréalistes et le plan 2D Google ; c'est une **bascule unique** logée dans le groupe boussole (`compass`), avec le calque trafic. Allumé en 3D, l'éteindre revient au plan (il n'y a plus de bouton « Plan » distinct). Ces fonds sont des services Google : **sans `googleMapsApiKey`, la bascule n'apparaît pas** plutôt que d'offrir un bouton inerte. Le bouton trafic n'apparaît qu'en mode plan (seul mode où le calque existe), et repasser en 3D l'éteint — le moteur s'en charge, `engine.getBasemap()` et l'événement `basemap` en sont la source de vérité.

**Mode au démarrage (`<Map mapMode>`)** — avec `googleMapsApiKey`, la carte **démarre en plan 2D** : plus lisible pour lire des positions, et le tileset 3D n'est même pas requêté tant qu'on ne bascule pas (aucune tuile photoréaliste téléchargée au chargement). `mapMode="3d"` démarre sur les tuiles photoréalistes ; sans clé Google, `'3d'` est le seul mode possible et reste le défaut.

⚠️ **Quota** — le fond 2D consomme le quota **Map Tiles API de votre clé Google**, alors que la 3D via `cesiumIonToken` est servie par Cesium Ion : démarrer en 2D *déplace* le coût, il ne le supprime pas. Deux garde-fous côté lib : pendant un vol caméra (l'intro notamment) seuls les niveaux de base sont demandés, au lieu des onze niveaux traversés ; et une tuile en échec est réessayée avec du recul (1 s puis 4 s, trois essais) au lieu d'être abandonnée — un simple `429` laissait sinon des trous définitifs dans la carte. Si vous voyez des `429 Too Many Requests`, vérifiez aussi les quotas par minute du projet dans la console Google Cloud.

## Exemple complet (Dashboard Opérateur)

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

## Traduire cette documentation

Chaque langue est un dossier de `docs/`, nommé par son code **ISO 639-1**, et contient
les **mêmes noms de fichiers** — c'est ce qui rend le passage d'une langue à l'autre
mécanique (`../fr/MARKERS.md` ↔ `../en/MARKERS.md`).

Pour ajouter une langue :

1. `cp -r docs/fr docs/<code>` puis traduisez.
2. Gardez les noms de fichiers **et les ancres de titres** (`## 4. Cadrer…`) : les
   liens croisés en dépendent.
3. Ajoutez la ligne de langue en tête de chaque fichier, et la nouvelle entrée dans
   [`docs/README.md`](../README.md) et le [README racine](../../README.md).

Ce qui **ne se traduit pas** : le code des exemples, les noms d'API, les clés de
`labels`. Ce qui se traduit : la prose, les commentaires dans les exemples, et les
libellés d'interface cités en exemple.

---

[Français](README.md) · [English](../en/README.md) · [↑ Racine](../../README.md)

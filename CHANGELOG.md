# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
La lib suit le [versionnage sémantique](https://semver.org/lang/fr/) à partir de la 1.0.0 ;
en `0.x`, une version mineure peut casser l'API — les ruptures sont listées ici.

## [Non publié]

Introduction de `MapConfig` : les valeurs qui pilotaient le comportement de la carte
depuis des littéraux dispersés dans le code deviennent un arbre de réglages unique,
surchargeable par `<Map config>` et documenté dans `docs/CONFIG.md`.

### Robustesse de publication

- Le bundle porte désormais la directive `'use client'` (banner Rollup, avant les
  imports) : `import` depuis un React Server Component (Next App Router) ne casse plus
  le build serveur. La carte étant intrinsèquement cliente (WebGL, hooks, DOM), tout
  le paquet est marqué client.
- `engines.node` fixé à `>=18` (aligné sur la chaîne de build Vite 6).
- Suppression du `package-lock.json` concurrent : un seul gestionnaire, **pnpm**
  (`pnpm-lock.yaml`), et ajout au `.gitignore` pour éviter sa régénération.

### ⚠️ Ruptures

#### `labels.measure` — renommage et nouveaux champs

Le formatage des distances était câblé sur le système métrique (bascule à 1000,
division par 1000, deux décimales, point décimal imposé par `toFixed`). Aucune
traduction ne pouvait donc produire des miles, ni le séparateur décimal d'une locale
qui n'est pas l'anglaise.

| Avant                | Après             |
| -------------------- | ----------------- |
| `measure.kilometers` | `measure.major`   |
| `measure.meters`     | `measure.minor`   |

Champs ajoutés, tous optionnels dans un override partiel : `majorThreshold` (seuil de
bascule, en mètres), `majorFactor` / `minorFactor` (diviseurs), `majorDecimals` /
`minorDecimals`, et `numberLocale` (`'auto'` par défaut, suit l'environnement).

**Migration** — un override qui ne traduisait que les gabarits :

```diff
 <Map labels={{ measure: {
-  kilometers: '{value} km',
-  meters: '{value} m',
+  major: '{value} km',
+  minor: '{value} m',
 } }} />
```

Un jeu impérial ne demande désormais aucune modification du code :

```tsx
<Map labels={{ measure: {
  major: '{value} mi', minor: '{value} ft',
  majorThreshold: 1609.344, majorFactor: 1609.344, minorFactor: 0.3048,
  majorDecimals: 1, minorDecimals: 0, numberLocale: 'en-US',
} }} />
```

Idem pour les durées : `duration.minorThreshold` et `duration.majorThreshold` rendent
réglables les deux bascules (secondes → minutes → heures), jusque-là en dur.

#### Le regroupement passe de la couche à la carte

Chaque `<MarkerLayer>` regroupait **ses** points dans son coin. Deux couches
produisaient donc deux jeux de pastilles qui s'ignoraient : un symbole posé restait
affiché seul à côté — voire par-dessus — la pastille de la couche voisine, qui pour lui
n'existait pas. Le regroupement est désormais un service de la carte (`engine.clusters`
+ une surface unique), alimenté par toutes les couches.

Réglages et apparence se déclarent donc **une fois**, sur la carte : un même nœud
agrège les points de plusieurs couches, il ne peut pas prendre deux apparences
contradictoires.

```diff
 markersLayer({
   points: allMarkers,
-  cluster: { enabled: true, maxZoom: 18 },
-  clusterTypeIcon,
-  clusterTypeLabel,
-  clusterTooltip: clusterTip,
 })
+<Map
+  config={{ clustering: { maxZoom: 18 } }}
+  cluster={{ typeIcon: clusterTypeIcon, typeLabel: clusterTypeLabel, tooltip: clusterTip }}
+/>
```

`cluster: { enabled: false }` sur une couche l'exclut du regroupement. La signature de
l'infobulle passe de `MarkerData<T>[]` à `MarkerData[]` : une pastille agrège
potentiellement plusieurs couches, aucun `data` commun n'est garanti.

`clusterTypeIcon` et `clusterTypeLabel` étaient restés **déclarés sur
`MarkerLayerProps` mais plus lus** : les passer ne faisait plus rien, en silence. Ils
sont supprimés du type — un appel resté en arrière obtient donc une erreur de
compilation, et non une prop ignorée. Leur remplacement est
`<Map cluster={{ typeIcon, typeLabel }}>`, comme ci-dessus. `typeLabel` reste sur la
couche : il y nomme un type pour la **recherche** et les lignes de liste, ce qui n'a
rien à voir avec une part de camembert.

#### `theme.camera` → `config.camera`

Les bornes de navigation (zoom min/max, inclinaison, pas de zoom, vitesse de glissé,
FOV) ne relèvent pas de l'apparence : elles décident de ce que l'utilisateur peut
atteindre. Elles passent du thème à la config, **à valeurs identiques**.

```diff
-<Map theme={{ camera: { maxZoom: 19 } }} />
+<Map config={{ camera: { maxZoom: 19 } }} />
```

#### `RelationEngine` — `fastestOversample` n'est plus un paramètre de constructeur

Appelants directs du core uniquement (`<RelationLayer>` s'en charge seul) :

```diff
-new RelationEngine(provider, cache, 5)
+const engine = new RelationEngine(provider, cache)
+engine.fastestOversample = 5
```

Le passer au constructeur obligeait à reconstruire le moteur pour le changer, donc à
jeter tous les instantanés : les liens affichés disparaissaient et leur calcul était
refacturé pour un simple entier modifié.

### Ajouté

- **Markers statiques (le décor)** — `MarkerData.static` marque ce qui ne demande
  aucune action et sert de repère : symbole posé, défibrillateur, borne. Ces markers
  disparaissent en dessous de `config.markers.staticMinZoom` (défaut `13`, `0` pour
  désactiver), là où une carte dézoomée se couvrait de pictogrammes illisibles
  masquant les alertes. `static: { minZoom }` impose un seuil **propre au marker** —
  tout le décor ne se lit pas à la même distance. Un statique masqué reste **trouvé
  par la recherche et la loupe** (un seuil de zoom dit ce qui est lisible, pas ce
  qu'on a le droit de trouver) et le marker sélectionné ou suivi échappe au seuil.
  Au-dessus, c'est un marker ordinaire : il se regroupe et prend sa part de camembert.
- **Regroupement et seuil des symboles posés** — la couche de symboles clusterise
  désormais (`<DrawLayer symbols={{ cluster: { enabled: false } }}>` pour revenir en arrière) et
  ses points sont `static` d'office. Le seuil suit une cascade du plus général au plus
  précis : `config.markers.staticMinZoom`, puis `symbols.minZoom` pour la couche, puis
  `minZoom` sur l'entrée de catalogue quand il dépend du genre de symbole.
- **`<Map config>`** — arbre de réglages complet : fournisseurs tiers (endpoints,
  FieldMasks, langue, quotas), seuils de geste, budgets de calcul, cadence de
  chargement, échelle d'empilement CSS. Merge profond sur `defaultConfig`.
- **Politique réseau commune** (`FetchPolicy`) sur les deux chemins réseau de la lib
  (routage, recherche de lieu), qui n'avaient jusqu'ici **ni timeout ni réessai** :
  une requête sans réponse restait pendante indéfiniment. Timeout par tentative,
  réessais bornés, backoff exponentiel avec part aléatoire, et aucun réessai sur un
  refus (400/401/403/404/429 — réessayer ne ferait que consommer le quota plus vite).
- **`providers.routing.headers` et `providers.places.headers`** — de quoi viser un
  proxy serveur et cesser d'exposer la clé Google côté client.
- **Tests** (`pnpm test`), **ESLint** (`pnpm lint`) et **Prettier** (`pnpm format`).

### Corrigé

- **`mergeTheme` écrivait dans `defaultTheme`.** Sans override, `deepMerge` renvoie sa
  base par référence ; la coupure des animations était appliquée par mutation, donc
  atteignait le singleton exporté publiquement. Un seul utilisateur en
  `prefers-reduced-motion: reduce` figeait les animations pour **toute** l'application,
  y compris les cartes montées ensuite.
- **`<Map config>` ne se propageait pas à chaud.** Les composants lisaient
  `engine.config` pendant leur rendu, alors que la carte pose la config sur le moteur
  depuis un effet — et les effets d'un enfant s'exécutent avant ceux de son parent. Au
  rendu où la config changeait, les enfants lisaient donc la valeur précédente, et rien
  ne les re-rendait ensuite : le fournisseur de routage, en particulier, ne recevait
  jamais ses nouveaux endpoints. La couche React lit désormais `useConfig()`.
- **Les réglages de cache de routage étaient sans effet.** `RouteCache` était construit
  une fois avec les valeurs du montage, si bien que `providers.routing.cache` (TTL,
  quantification, plafond) ne changeait rien — alors que ces trois valeurs décident du
  nombre d'appels facturés.
- **Distances mal formatées hors locale anglaise** : `toFixed` imposait le point
  décimal et gardait les zéros de fin (« 2.40 km » sous des libellés français).
- Corps des réponses en erreur non consommé avant réessai (un flux laissé ouvert par
  tentative).

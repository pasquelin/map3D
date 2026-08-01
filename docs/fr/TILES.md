# Tuiles — fournisseur externe (Google) ou serveur interne

**Français** · [English](../en/TILES.md) · [↑ Index](README.md)

Le fond de carte 2D vient soit de **votre propre serveur de tuiles** (`internal`, le
défaut), soit de **Google Map Tiles** (`external`). Le choix est un réglage : rien à
recâbler, rien à remonter.

⚠️ L'origine par défaut désigne le serveur du projet : **remplacez-la par la vôtre**.

```tsx
<Map
  center={MONACO}
  zoom={14}
  config={{ providers: { internal: { origin: 'https://tuiles.exemple.fr' }, tiles: { provider: 'internal' } } }}
/>
```

Avec `internal`, **aucune requête ne part chez Google** pour le fond : ni
`createSession`, ni clé, ni quota. Une carte 2D complète sans clé d'API devient possible.

---

## 1. Les deux fournisseurs

|                        | `external`                                | `internal` (défaut)                 |
| ---------------------- | ----------------------------------------- | ----------------------------------- |
| Source                 | Google Map Tiles                          | votre serveur (schéma XYZ)          |
| Authentification       | clé d'API + session signée                | aucune                              |
| Réglage minimal        | `<Map googleMapsApiKey>`                  | `providers.internal.origin`            |
| Calque trafic          | oui                                       | **non** (cf. § 4)                   |
| Volume (mode `'3d'`)   | tuiles 3D photoréalistes (Cesium Ion)     | bâtiments extrudés (cf. § 5)        |
| Quota                  | facturé à la tuile                        | le vôtre                            |

Le fournisseur ne change **que le fond de carte**. Recherche de lieux, routage et tuiles
3D photoréalistes restent des services externes, réglés séparément
(`providers.places`, `providers.routing`, `providers.tiles3d`).

> **Les deux fournisseurs se comportent à l'identique.** Hors des trois lignes ci-dessus —
> ce que le fournisseur *est* — rien ne dépend de lui : pick au clic, drapage des formes,
> suivi de l'altitude du sol, arrêt de la caméra sur le bâti, bornes d'inclinaison. Ce qui
> justifiait autrefois de traiter l'interne à part était son coût de lancer de rayon ; il
> est réglé à la source (cf. § 5), pas contourné par un cas particulier.

**Masquage automatique du volume en altitude.** Vus de haut, les bâtiments internes ne
couvrent que quelques pixels, et leur chargement borné laisse un « carré » de détail dans le
vide. Au-dessus de `providers.buildings.maxViewAltitude` (1 000 m **au-dessus du sol**), ils
sont masqués, **gelés et détruits** (RAM/VRAM rendues, rechargés au retour), laissant le seul
fond 2D **sans quitter le mode `'3d'`** : redescendre les fait revenir. Le critère est une
hauteur au-dessus du sol, donc **valable à toute inclinaison**. Seuls les bâtiments extrudés
internes sont concernés — pas les tuiles 3D photoréalistes. Réglé par
`providers.tiles3d.hideVolumeWhenClamped` (`false` = bâtiments toujours affichés), le fondu
par `providers.tiles3d.volumeFadeMs` (`0` = net) ; `providers.buildings.requestAltitudeFactor`
ouvre au-dessus du seuil une bande où les tuiles sont téléchargées sans être montrées, pour
que la descente les trouve prêtes.

## 2. Régler le serveur interne

Une seule valeur change entre un poste de développement et la production :

```tsx
config={{
  providers: {
    // L'origine est PARTAGÉE par le fond 2D et le volume : les deux sortent du même serveur.
    internal: { origin: 'http://localhost:8090' },   // en production : votre domaine
    tiles: {
      provider: 'internal',
      style: 'liberty',                  // nom du style rendu par le serveur
      retina: false,                     // true → tuiles @2x
    },
  },
}}
```

L'origine n'est **jamais écrite dans le code** : elle se lit dans l'environnement de
l'application hôte (`VITE_TILE_ORIGIN` dans l'exemple) et se pose dans `config`.

Le gabarit d'URL est lui aussi réglable — utile derrière un proxy, ou pour un serveur
dont les routes diffèrent :

```
providers.tiles.internalTileUrl = '{origin}/styles/{style}/{z}/{x}/{y}{r}.png'
```

| Jeton      | Remplacé par                                     |
| ---------- | ------------------------------------------------ |
| `{origin}` | `providers.internal.origin` (sans `/` final)         |
| `{style}`  | `providers.tiles.style`                           |
| `{r}`      | `@2x` si `retina`, sinon vide                      |
| `{z} {x} {y}` | coordonnées de tuile (Web Mercator, schéma XYZ) |

Ce que le serveur doit servir : des tuiles raster en `{z}/{x}/{y}`, Web Mercator, avec
les en-têtes **CORS** (`Access-Control-Allow-Origin`) — les tuiles deviennent des textures
WebGL, chargées en `crossOrigin='anonymous'`.

### Bornes de zoom

`baseZoom` (défaut 2) est le niveau toujours chargé qui couvre le globe : c'est lui qui
garantit l'absence de trou pendant que les niveaux fins arrivent. `maxZoom` (défaut 22)
borne le niveau le plus fin demandé — **à abaisser** si votre style s'arrête plus tôt,
sinon la carte réclame des tuiles qui n'existent pas.

Entre les deux, le fond descend par une **cascade** : le niveau le plus fin sur un disque
centré sous la caméra — un disque, pour que la netteté ne dépende ni du cap ni de
l'inclinaison — puis les niveaux plus grossiers sur la vue entière, chacun portant deux fois
plus loin, jusqu'au premier qui la couvre. C'est ce qui fait que
le lointain se dégrade progressivement au lieu de tomber d'un coup sur le niveau de base —
une tuile grande comme un quart de continent, soit un aplat uniforme qui se lit comme un
bug d'affichage.

Le coût en requêtes est bien moindre qu'il n'y paraît : un niveau grossier couvre une
immense surface, donc il est demandé une fois puis resservi toute la session. Seul le niveau
le plus fin se renouvelle quand on se déplace.

Cette cascade n'est pas systématique : dès qu'**un seul niveau suffit à couvrir toute
l'emprise** — vue proche du zénith, faible inclinaison — le fond passe en niveau
**uniforme** (`providers.tiles.uniformDetail`, défaut `true`) : plus de disque de détail au
centre, la netteté est la même partout, et les niveaux plus grossiers sont préchargés en
repli net pendant qu'un cran se charge. Il repasse en cascade dès que la vue est trop étalée
pour un seul niveau — l'écart entre le niveau visé et celui qui couvre toute la vue dépasse
`providers.tiles.uniformMaxSpread` (défaut `1`) — et systématiquement en mode piéton, où le
gradient près/loin à hauteur d'homme est voulu.

## 3. Basculer à chaud

Changer `provider` (ou `origin`, `style`, `retina`) remplace la source **sans remonter la
carte** : le cache de tuiles est vidé, le fond se recharge, la caméra ne bouge pas.

```tsx
const [provider, setProvider] = useState<TileProvider>('external')
;<Map config={{ providers: { internal: { origin: TILE_ORIGIN }, tiles: { provider } } }} />
```

Si le fournisseur choisi n'a pas de quoi servir — `external` sans clé, `internal` sans
`providers.internal.origin` — **aucun fond 2D n'est proposé** plutôt qu'un fond qui répondrait en erreur à
chaque tuile. La carte repasse alors en mode `'3d'`, et les boutons correspondants
disparaissent (§ 4).

## 4. Ce que l'interface propose (capacités)

Les deux fournisseurs n'offrent pas les mêmes options. Le moteur publie donc ce qui est
**possible**, et `<MapControls>` n'affiche que les boutons qui ont un sens — cf.
[ENGINE.md § BasemapState](ENGINE.md).

```ts
const { canPlan, can3d, trafficAvailable } = engine.getBasemap()
```

| Situation                                          | Bouton `2D` | Bouton `3D` | Bouton trafic   |
| -------------------------------------------------- | ----------- | ----------- | --------------- |
| `external` + clé Google + token Ion                | affiché     | affiché     | affiché en plan |
| `external` + clé Google, sans token Ion            | affiché     | **masqué**  | affiché en plan |
| `external` sans clé (token Ion seul)               | masqué      | affiché     | masqué          |
| ni clé ni token                                    | masqué      | masqué      | masqué          |
| `internal` (origine renseignée)                    | affiché     | affiché     | masqué          |
| `internal` pour la 2D, `external` sans token en 3D | affiché     | **masqué**  | masqué          |

Trois règles derrière ce tableau :

- **Chaque bouton dépend de SA destination**, pas de l'autre. `2D` demande un fond plat
  servable (`canPlan` : clé Google, ou `origin`), `3D` du volume servable (`can3d` : un
  tileset photoréaliste en `external`, du relief ou des bâtiments en `internal`). Les deux
  axes étant indépendants, l'un peut être proposé sans l'autre.
- **Le moteur applique la même règle que la barre** : `setMapMode` vers un mode sans rien
  à afficher est sans effet, y compris en usage vanilla et depuis la prop `mapMode`.
  Basculer viderait l'écran. Seule exception : si AUCUN mode n'est servable, la carte garde
  le sien et son globe de repli — il faut bien être quelque part.
- **Le trafic est une propriété de la tuile Google** (`layerTypes` demandé à la session),
  pas une surcouche transparente. Un serveur interne n'a rien à allumer :
  `setTrafficVisible(true)` y est sans effet, et le bouton n'est pas proposé — même avec
  une clé Google par ailleurs configurée.

Un hôte qui compose sa propre barre lit ces mêmes drapeaux, ou appelle la fonction pure qui
les tranche :

```ts
import { canEnterMode } from 'map3d'

const basemap = engine.getBasemap()
if (canEnterMode(basemap, '3d')) {
  /* proposer le volume */
}
```

## 5. Le volume interne — bâtiments extrudés

`providers.tiles3d.provider` décide d'où vient le volume, **indépendamment du fond 2D** :

```tsx
config={{
  providers: {
    internal: { origin: TILE_ORIGIN },
    tiles: { provider: 'internal' },
    tiles3d: { provider: 'internal' },   // 'external' = tuiles photoréalistes (Cesium Ion)
  },
}}
```

En `'internal'`, le mode `'3d'` extrude les bâtiments des tuiles vectorielles du serveur —
couche `building` du schéma OpenMapTiles, hauteurs `render_height` / `render_min_height`,
cours intérieures percées — au-dessus du fond raster, qui **reste affiché** : c'est lui
que le relief déformera. Aucun tileset photoréaliste n'est alors piloté, donc **aucune
requête ne part chez Cesium ou Google**, même si un token est configuré par ailleurs.

Il n'y a pas d'interrupteur séparé pour les bâtiments : `providers.tiles3d.provider` dit
déjà d'où vient le volume, et un second réglage ne pourrait que le contredire — en
laissant un mode `'3d'` sans rien à l'écran.

Ce qu'il faut savoir pour le régler :

- **Un seul niveau de zoom** (`providers.buildings.zoom`, 14) : c'est le `maxzoom` des
  données OpenMapTiles. Au-delà, la même tuile sert ; les bâtiments ne gagnent rien à être
  redemandés plus fins.
- **`maxViewAltitude`** (1 000 m au-dessus du sol) borne le haut : de plus haut, les
  bâtiments ne couvriraient que quelques pixels pour le prix du décodage d'une ville
  entière. `requestAltitudeFactor` (1,5) précharge au-dessus sans montrer.
- **Couleurs dans le thème** : `theme.globe.buildingColor` (façades) et
  `buildingRoofColor` (toits). Une emprise portant l'attribut `colour` garde la sienne —
  hexadécimal comme mot-clé CSS (`beige`, `silver`) — et son toit s'éclaircit de
  `buildingRoofLighten`. La scène n'a aucune lumière : c'est le contraste toit/façade,
  plus l'ombrage de `buildingSunAzimuth`, qui donne le relief.
- **`maxHeight`** (1000 m) borne les hauteurs aberrantes. `height=99999` est une faute de
  saisie courante dans OSM, et elle produisait un bâtiment de cent kilomètres : sa boîte
  englobante gardait la tuile visible en permanence et arrêtait la caméra sur un fantôme.
- **`maxBytes`** (448 Mio) borne la mémoire du cache, là où `maxTiles` ne borne qu'un
  nombre. C'est le réglage qui compte : entre une tuile de campagne et une tuile de
  centre-ville, ce que retient une tuile va de un à cent.

### Jusqu'où porte le bâti

Le volume est servi par un **disque centré sous la caméra**, de rayon plafonné par
`maxViewDistance` (5 000 m). **Au-delà, seul le fond raster subsiste** — une vue inclinée à
79° porte à des dizaines de kilomètres, et aucune couverture z14 ne l'atteindrait.

⚠️ Un disque, et non la bbox du trapèze de vue : c'est ce qui rend la couverture à la fois
**invariante** et **continue**. La bbox avait deux défauts.

Elle dépendait du **cap** : son aire croît d'un facteur ~2 entre un cap nord et un cap à 45°,
donc l'ensemble des tuiles changeait quand on tournait la caméra, sans que la vue change.

Elle explosait à l'**horizon** : l'emprise venait d'une grille de rayons lancés à travers
l'écran, et ceux qui franchissent l'horizon ne touchaient rien — ils étaient ignorés. Chaque
fois qu'une ligne entière de la grille passait au ciel, l'emprise s'effondrait d'un coup, puis
`tan(inclinaison)` la refaisait exploser jusqu'à la ligne suivante. Mesuré à 1 000 m
d'altitude : portée en dents de scie entre 2,8 et 36,3 km, deux effondrements brutaux (59° et
74°), et de 8 à 1 058 tuiles demandées à altitude constante. À 55° et 70° la carte se
ressemblait, à 60° elle n'avait rien à voir.

Un disque n'a ni l'un ni l'autre : il ne dépend d'aucun angle, et il est borné sans qu'on ait
rien à tronquer. Les tuiles dont le centre tombe hors du disque sont écartées du carré
circonscrit, ce qui rend la moitié du budget — mesuré à Paris : 32 tuiles z14 au lieu de 64.
`maxRequest` n'est plus qu'un filet.

**Le fond raster suit la même règle**, mais pour sa FINESSE : `lodLevels` choisissait le
niveau de détail de tout le fond sur cette même bbox. Un facteur 2 d'aire valant un cran
entier, le fond changeait de netteté quand on tournait ; et à 78° d'inclinaison le niveau
s'effondrait jusqu'à `baseZoom`, dont un texel couvre un quart de continent — les traînées
floues au ras du ciel venaient de là. Il se décide désormais sur un disque de même nature,
dont le rayon suit l'échelle de la vue et non le cap.

Ce n'est pas un réglage trop prudent, c'est une limite de la donnée. Les attributs 3D
n'existent qu'au `maxzoom` du schéma OpenMapTiles :

| niveau | couche `building` | attributs |
| ------ | ----------------- | --------- |
| z12    | absente           | —         |
| z13    | présente, ~9× plus légère | **aucun** |
| z14    | présente          | `render_height`, `render_min_height`, `colour`, `hide_3d` |

Un niveau de détail lointain bâti sur le z13 extruderait donc tout à `defaultHeight`, soit
des hauteurs uniformes et fausses. Trois leviers si la frontière gêne : monter
`maxViewDistance` (le pic de tuiles croît en n², donc monter `maxRequest`/`maxTiles`/`maxBytes` avec),
baisser `camera.maxTilt3d` pour que
la vue ne porte plus jusqu'à l'horizon, ou servir un jeu de tuiles portant des hauteurs
plus bas que 14.

### Ce que ça coûte, et pourquoi ça ne se voit pas

Une tuile z14 dense (Paris) porte 52 000 sommets d'emprises, soit ~131 000 triangles et
~231 000 sommets à produire. Cinq mécanismes font que cette charge ne touche pas la boucle
de frame :

- **Tout le pipeline dans un pool de Web Workers.** Téléchargement, décodage MVT,
  construction des tampons **et arbre de collision** se font hors du thread principal, et
  les tampons reviennent par transfert (pas de copie). Les workers sont empaquetés en blob
  autonome au build de la lib : rien à configurer côté bundler de l'hôte, aucun asset à
  servir. Là où `Worker` n'existe pas (rendu serveur, tests), le même code tourne en repli
  sur le thread principal.
- **Un BVH par tuile, construit côté worker.** La carte lance trois rayons par frame sur la
  surface affichée (garde caméra, suivi d'altitude, drapage des formes). En force brute,
  une seule tuile coûtait 5,7 ms par rayon ; avec l'arbre, ~0,004 ms. C'est ce qui met le
  volume interne au niveau du `TilesRenderer` externe, dont les tuiles ont déjà leur propre
  hiérarchie. **Le construire coûte ~41 ms par tuile dense** : tant que c'était fait au
  montage, cela valait 97 % du coût d'une tuile et faisait sauter des frames. Il arrive
  désormais tout construit, et le poser coûte ~0,05 ms — un facteur ~800.
- **Plusieurs workers.** Le pipeline complet pèse ~60 ms par tuile dense : un fil unique
  les sérialiserait, et les bâtiments apparaîtraient plus lentement qu'avant. Mesuré sur
  24 tuiles z14 parisiennes — 1430 ms à un worker, 587 ms à trois, 559 ms à quatre, puis
  plus rien, et une **régression** à huit. `providers.buildings.workerPoolSize` (4) règle
  le nombre ; le pool se borne de lui-même au nombre de cœurs moins un.
- **Montage étalé.** Ce qui reste sur le thread principal — développer les couleurs (~1 ms),
  poser l'arbre (~0,05 ms), pousser les tampons au GPU — est étalé par
  `providers.buildings.mountPerFrame` (2).
- **Géométrie en repère local, quantifiée.** Les sommets sont exprimés en mètres autour du
  centre de la tuile, et c'est la matrice du mesh qui les pose sur le globe. Une position
  ECEF vaut ~6,4 × 10⁶ m : en `Float32` sa résolution tombe à ~0,4 m, soit l'épaisseur
  d'une façade. Ces mètres locaux sont ensuite quantifiés en `int16` normalisé
  (`positionPrecision`) : deux fois moins d'octets, pour ~4 cm de résolution.
- **Chargements annulables.** Une tuile évincée pendant son téléchargement l'interrompt,
  côté réseau comme côté worker : une navigation rapide laissait sinon la file entièrement
  occupée à extruder des tuiles déjà sorties de la vue.

Le décodeur MVT et les workers sont chargés en **import dynamique** — un hôte qui garde le
volume photoréaliste ne les télécharge jamais. C'est ce qui rend soutenable le poids de
three-mesh-bvh dans le blob : il fait passer celui-ci de 13 à 71 Ko gzip, mais **seul un
hôte qui affiche le volume interne le paie**, une fois.

> **Nombre de workers.** `workerPoolSize` ne sert à rien au-delà de
> `providers.buildings.maxInflight` (4 par défaut) : la file ne lance pas plus de
> téléchargements que ça, et les workers en trop resteraient oisifs. Les deux réglages se
> montent ensemble.

> **CSP.** Les workers sont montés depuis un `Blob` : une politique de sécurité doit
> autoriser `worker-src blob:` (ou `child-src blob:`). Sans cela, la création échoue et tout
> bascule sur le thread principal — quelques centaines de millisecondes de gel par tuile. La
> lib l'écrit alors une fois dans la console, pour que ce ne soit pas confondu avec une
> machine lente.

## 6. Brancher un autre fournisseur

`TiledGlobeLayer` ne connaît qu'un contrat, `TileSource` : donner l'URL d'une tuile, et
préparer ce dont cette URL a besoin. Les deux sources livrées l'implémentent, et rien
n'empêche d'en écrire une troisième (proxy d'entreprise, cache local, signature maison).

```ts
import { createTileSource, type TileSource } from 'map3d'

export type TileSource = {
  tileUrl(z: number, x: number, y: number): string
  ensureSession(traffic: boolean): Promise<void> // no-op si rien à signer
  setConfig(cfg: TilesConfig, origin: string): void
  readonly supportsTraffic: boolean
}
```

`createTileSource(cfg, origin, apiKey?)` rend la source correspondant à `cfg.provider`, ou
`null` quand le fournisseur n'a rien pour servir.

---

## Voir aussi

- [BUILDINGS.md](BUILDINGS.md) — désigner un bâtiment de ce volume interne
- [PEDESTRIAN.md](PEDESTRIAN.md) — niveau de détail des tuiles en marche
- [CONFIG.md](CONFIG.md) — toutes les clés de `providers.tiles`
- [ENGINE.md](ENGINE.md) — `BasemapState`, événement `basemap`
- [PROPS.md](PROPS.md) — boutons de `<MapControls>`

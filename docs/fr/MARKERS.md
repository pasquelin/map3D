# Markers — guide complet

**Français** · [English](../en/MARKERS.md) · [↑ Index](README.md)

Un **marker** est un point à identité stable posé sur le globe, rendu en **DOM/CSS**
(et non en sprite WebGL) : il hérite des animations natives, du `:hover`, de
l'accessibilité et du texte sélectionnable, au prix d'un nœud par point visible.

Ce document couvre la donnée (`MarkerData`), la couche (`<MarkerLayer>`), le
clustering, la sélection, le repositionnement, le décor à seuil et les surfaces qui
consomment les markers (recherche, loupe, dock).

- Props exhaustives et défauts réels → [PROPS.md](PROPS.md)
- Seuils, budgets, quotas → [CONFIG.md](CONFIG.md)
- Couleurs, tailles, animations → [THEME.md](THEME.md)

---

## 1. En deux minutes

```tsx
import { Map, markersLayer, type MarkerData } from 'map3d'

type Agent = { statut: string }

const agents: MarkerData<Agent>[] = [
  {
    id: 'a1',
    type: 'agent-available',
    position: { lat: 48.8566, lng: 2.3522 },
    title: 'Dupont',            // nom lisible : infobulle, listes, RECHERCHE
    tags: ['user', 'standby'],  // filtre « Couches »
    data: { statut: 'dispo' },
  },
]

<Map
  center={{ lat: 48.8566, lng: 2.3522 }}
  zoom={14}
  layers={[
    markersLayer<Agent>({
      points: agents,
      cluster: { enabled: true },
      selectedId: selected,
      onSelect: (m) => setSelected(m?.id ?? undefined),
      typeLabel: (t) => LIBELLES[t] ?? t,
    }),
  ]}
/>
```

`markersLayer<Agent>({…})` est la **fabrique typée** : `layers` étant hétérogène, son
type public voit `data` comme `unknown` ; la fabrique déplace le générique sur
l'appel, si bien que `icon`, `menu` et `tooltip` reçoivent `MarkerData<Agent>`.

Le montage manuel reste possible — `<MarkerLayer>` sous `<Map>` — mais il vous laisse
l'ordre d'imbrication à charge (relations autour des markers, loupe au-dessus de
tout). Voir [§ 14](#14-couche-déclarative-ou-composant).

---

## 2. Fournir les points : `points` ou `source`

Les deux props sont **exclusives**.

| | `points` | `source` |
|---|---|---|
| Origine | un tableau que vous tenez | un `DataSource` interrogé par la lib |
| Rechargement | à vous (état React, WebSocket) | au déplacement de la caméra (bbox) |
| Gate de zoom | à vous | `minZoom` de la source |
| Annulation | à vous | `AbortSignal` fourni |

```ts
const source: DataSource<MarkerData<Alert>> = {
  minZoom: 10,                                   // en deçà : aucun chargement
  async load(viewport, signal) {
    const { north, south, east, west } = viewport.bounds
    return fetchAlerts({ north, south, east, west }, signal)
  },
}

<MarkerLayer source={source} cluster={{ enabled: true }} />
```

`load` est rappelé après **stabilisation** de la caméra (anti-rebond et annulation de
la requête précédente sont intégrés — cf. `data.fetch` dans [CONFIG.md](CONFIG.md)).

Pour du **temps réel** (positions d'agents), passez des `points` qui changent : grâce
à l'identité stable, un changement de `position` **anime** le marker au lieu de le
recréer.

> Une `source` cadrée sur le viewport est le **seul** levier qui borne réellement la
> quantité de données — le clustering ne regroupe plus au zoom maximal, et le cull
> masque sans démonter. Voir [§ 13](#13-performance).

---

## 3. Anatomie d'un `MarkerData`

```ts
type MarkerData<T = unknown> = {
  id: string | number
  position: LatLng
  type: string
  title?: string
  titleColor?: string
  content?: ReactNode
  tags?: string[]
  avatar?: string
  icon?: string
  new?: boolean
  urgent?: boolean
  repositionable?: boolean
  static?: boolean | { minZoom: number }
  zIndex?: number
  selectedColor?: string
  data: T
}
```

| Champ | Effet | Lu par |
|---|---|---|
| `id` | **Identité stable**, indépendante de la position : au changement de `position`, le marker est *translaté en douceur* au lieu d'être recréé. Clé métier (uuid d'agent), pas un index de tableau. | tout |
| `position` | `{ lat, lng }`. Le marker est ancré à sa coordonnée géographique (repère ECEF) : il ne dérive pas au pan ni au tilt. | tout |
| `type` | Catégorie → couleur via `theme.colors.marker[type]` (repli `marker.default`). Sert aussi de clé de **rubrique de recherche** et de part de camembert dans un cluster. | thème, cluster, recherche |
| `title` | **Nom lisible — point de vérité unique** : titre de l'infobulle, libellé des lignes de liste (loupe, sélection, dock) et **texte indexé par la recherche**. Absent, ces surfaces retombent sur l'id, et le marker n'est trouvable par personne. Volontairement `string` et non `ReactNode` : un nom doit pouvoir être comparé, trié, cherché. | infobulle, listes, recherche |
| `titleColor` | Teinte du titre (alerte critique, statut d'agent) — évite d'écrire du JSX pour la seule chose qu'un titre exprime au-delà de son texte : sa gravité. | infobulle, listes, recherche |
| `content` | Corps de l'infobulle : tout `ReactNode` (badges, avatar, mini-tableau). | infobulle |
| `tags` | Filtrage « Couches ». Absent → `['marker', type]` (règle interne), sans quoi le marker disparaîtrait dès qu'un filtre est actif. | filtre de tags, relations |
| `avatar` | URL de **photo** : pastille ronde cerclée de la couleur du type, prioritaire sur `icon`. Recadrée (un portrait supporte le rond). | marker, listes, dock |
| `icon` | URL / data-URI d'un **pictogramme**, affiché **entier** dans les listes. Renseigné d'office pour les symboles, dont le graphisme *est* l'identité. | listes, dock |
| `new` | Animation sonar autour du marker jusqu'au premier clic dessus (état « vu » tenu par la couche, pour la session). | marker |
| `urgent` | Viseur rouge animé tant que le drapeau est vrai — conçu pour attirer l'œil immédiatement. | marker |
| `repositionable` | Ce marker se déplace à la souris (cf. [§ 11](#11-markers-repositionnables)). | geste |
| `static` | Décor fixe : disparaît sous un seuil de zoom (cf. [§ 8](#8-décor-à-seuil-static)). | affichage |
| `zIndex` | Priorité entre markers superposés (défaut `0`, le plus haut devant). Le marker **sélectionné** et celui dont le **menu est ouvert** restent au-dessus de toute valeur : un `zIndex` métier ne peut pas enterrer ce avec quoi on interagit. | rendu |
| `selectedColor` | Couleur de l'anneau quand ce marker est le `selectedId`. Absente = accent du thème. Permet de faire porter à l'anneau une information (statut, source de l'alerte). | rendu |
| `data` | **Votre** objet métier, jamais interprété par la lib — ce que reçoivent vos callbacks. | vous |

### Helpers exportés

```ts
boundsOfMarkers(markers)          // cadre englobant → camera.fitBounds
markerColorOf(theme, type)        // la MÊME résolution de couleur que la lib
tagColorOf(theme, tag)            // idem pour un tag (thème, puis palette hashée)
```

`markerColorOf` est publié pour qu'un marker, une liste ou un panneau écrits par
l'application s'accordent avec ceux de la lib au lieu de refaire la chaîne de repli.

> Les règles de résolution `tags` (`['marker', type]` par défaut) et `static` →
> seuil sont **internes** : la lib les applique, elle ne les expose pas. Écrivez
> `m.tags ?? ['marker', m.type]` si vous devez les reproduire.

---

## 4. Rendu d'un marker

### Le gabarit

Par défaut un marker est une **pastille** (`theme.markers.size`, `ringWidth`,
`gradient`, `gloss`) colorée par son `type`, posée au bout d'une **tige verticale**
avec un point au sol.

```tsx
<MarkerLayer leaderLine={false} />   // l'icône coïncide avec sa coordonnée
```

La tige (`leaderLine`, défaut `true`) soulève le contenu au-dessus de la position :
un badge d'alerte reste lisible sans masquer le point qu'il marque. À passer à
`false` quand l'icône **doit** coïncider avec sa coordonnée — c'est le cas des
symboles tactiques, dont le point d'ancrage est porté par le graphisme lui-même.

> `leaderLine` décide de la **structure DOM** d'un nœud à sa création : ce n'est pas
> un réglage vivant, contrairement à `cullMargin`.

### Où le marker se pose

`settleToGround` (défaut `true`) pose le marker sur la surface réelle et non sur
l'ellipsoïde — sans quoi il « glisse » vers la rue parallèle au pan (parallaxe). La
hauteur retenue est le **niveau de rue**, jamais un toit : sous fournisseur interne
elle est lue analytiquement (la nappe raster, plate et non raycastable), sous tuiles
photoréalistes c'est le minimum d'une couronne de
`performance.groundSample.radiusMeters`. La nuance ne se voit pas d'en haut ; à
hauteur d'homme, un marker calé sur un toit flotte à trente mètres au-dessus de vous.

### Icône custom

```tsx
<MarkerLayer icon={(m) => `<svg viewBox="0 0 40 40">…</svg>`} />
```

`icon` renvoie du **markup SVG**, rendu en `<img>` DOM ancrée à la carte
(`svgToDataUri` est exporté, et idempotent — une source déjà encodée passe telle
quelle).

### Taille et anneaux

| Prop | Défaut | Rôle |
|---|---|---|
| `size` | `theme.markers.size` | diamètre du sprite |
| `selectionRing` | `size + 4` | anneau de **multi-sélection** — à régler quand l'icône SVG occupe moins que sa boîte, pour que l'anneau reste collé au visuel |

Un `avatar` remplit tout le gabarit : son anneau part de `size + 12`, sans le facteur
de pastille que `selectionRing` porte pour les sprites.

---

## 5. Infobulle

L'information vit **au survol** ; le clic est réservé aux actions (sélection, menu).

**Sans rien faire**, l'infobulle se construit à partir de la donnée :
`title` (teinté par `titleColor`) en titre, `content` en corps. Un marker sans
`title` ni `content` n'a pas d'infobulle.

```tsx
<MarkerLayer
  tooltip={(m) =>
    m.data.silencieux ? null : { title: <Badge sev={m.data.sev} />, content: <Fiche m={m} /> }
  }
/>
```

Fournie, la prop `tooltip` **décide seule** — y compris pour rendre `null`. À réserver
aux titres que du texte ne peut pas dire : `titleColor` couvre déjà le cas courant.

### Infobulle de cluster

Le cluster construit la sienne : le décompte par type au survol d'une **part** du
donut, le total sur le cœur. Elle se règle sur la carte — `<Map cluster={{ tooltip }}>`
pour la remplacer, `<Map cluster={{ typeLabel }}>` pour nommer les types qui y
apparaissent (cf. [§ 10](#10-regroupement-clusters)).

---

## 6. Menu contextuel

```tsx
<Map
  markerMenu={(m, relations) => [
    { label: 'Ouvrir la fiche', onClick: () => ouvrir(m.data) },
    { separator: true },
    ...relations?.menuFor(m) ?? [],
  ]}
/>
```

`markerMenu` est **partagé par les trois surfaces** qui proposent un menu de marker :
le marker sur la carte, l'inventaire de la loupe et le panneau de sélection. Un
marker offre ainsi les mêmes actions où qu'on le rencontre, déclarées une seule fois.

Le second argument porte les entrées du moteur de relations (« Distance autour ›
Agents »), `null` sans `relations`.

Surcharges par surface, quand elles doivent différer :

| Surface | Prop |
|---|---|
| carte | `layers[].menu` / `<MarkerLayer menu>` |
| loupe | `toolbar.lens.menu` |
| panneau de sélection | `draw.selectionBadges.markerMenu` |

Les deux listings ajoutent **« Cibler » en tête d'eux-mêmes** — inutile de le prévoir.

Le menu s'ouvre au **clic droit** sur la carte, et via le bouton « … » des listes.

---

## 7. Sélection et suivi

### Sélection simple — contrôlée

```tsx
const [selected, setSelected] = useState<string | number>()

<MarkerLayer
  selectedId={selected}
  onSelect={(m) => setSelected(m?.id ?? undefined)}   // ⚠️ traiter le cas null
/>
```

`selectedId` est **contrôlé** : la couche ne le change jamais d'elle-même, elle
signale. La règle de `onSelect` est uniforme — **tout clic qui ne sélectionne pas un
marker rend `null`** (carte nue comme cluster).

> Sans traiter le cas `null`, l'anneau ne partirait qu'en cliquant un autre marker,
> et survivrait à l'ouverture d'un cluster — y compris quand le marker sélectionné
> est justement celui qui vient d'y être absorbé.

La couleur de l'anneau vient de `MarkerData.selectedColor`, sinon de l'accent du
thème.

### Multi-sélection au marquee

L'outil **Sélection** de `<Toolbar>` (rectangle, polygone, lasso) sélectionne aussi
les markers : la couche s'inscrit d'elle-même au registre `engine.selectables`.
Seuls les markers **individuellement visibles** sont atteignables — un cluster n'est
jamais sélectionné en bloc, et un marker masqué par le cull sort de la sélection.

Les ids sélectionnés se lisent dans `useDrawing().markerSelection`, et les vignettes
du panneau de sélection les affichent (cf. `draw.selectionBadges`).

### Suivi caméra

```tsx
<MarkerLayer followId={agentSuivi} />
```

La caméra reste centrée sur ce marker tant que la prop est fournie. Si la cible
disparaît momentanément (clusterisée, masquée par un filtre), la caméra **rend la
main** au lieu de se figer, et le suivi reprend à sa réapparition.

### Exemptions

Le marker **sélectionné** et le marker **suivi** échappent au filtre par tags **et**
au seuil des statiques : masquer ce sur quoi la carte est centrée ferait disparaître
la cible sans explication, et le suivi perdrait sa position en cours de route.

---

## 8. Décor à seuil (`static`)

Un objet **fixe du décor** — symbole posé, défibrillateur, borne — est un repère
qu'on consulte de près, pas un événement qui demande une action.

```ts
{ id: 'dae-12', type: 'dae', static: true,             position, data }  // seuil de la config
{ id: 'chu',    type: 'hopital', static: { minZoom: 9 }, position, data }  // seuil propre
```

| Forme | Seuil |
|---|---|
| `true` | `config.markers.staticMinZoom` (défaut **13**) |
| `{ minZoom: n }` | `n` — propre à ce marker (`0` = visible à tout zoom) |

Tout le décor ne se lit pas à la même distance : un hôpital mérite d'apparaître bien
avant une borne d'incendie, et c'est la **donnée** qui le sait, pas un réglage global.

**Une seule conséquence** : le marker disparaît de la carte sous son seuil. Visible,
c'est un marker comme un autre — cluster et camembert le traitent exactement comme
les autres types, et un statique masqué cesse du même geste de gonfler le total des
clusters (un cluster ne compte jamais que ce qu'il cache réellement).

> **`static` n'est pas le filtre de tags.** Le seuil dit ce qui est **lisible** ; le
> filtre obéit à un **choix de l'utilisateur** et masque partout, recherche comprise.
> Un statique masqué reste cherchable et atteignable : chercher « défibrillateur »
> doit le trouver et y voler quel que soit le zoom.

### Où se règle le seuil

Du plus général au plus précis — chaque niveau ne sert que si le précédent ne suffit
pas :

| Niveau | Où | Quand s'en servir |
|---|---|---|
| Config | `config.markers.staticMinZoom` | le décor de toute la carte |
| Couche | `<MarkerLayer staticMinZoom>` | cette couche-ci — une couche de décor et une couche d'alertes n'ont pas le même horizon de lisibilité |
| Donnée | `MarkerData.static: { minZoom }` | ce point-ci ; il garde le dernier mot |

### Les symboles posés

Ils sont `static` d'office, et **participent au regroupement de la carte** comme
n'importe quelle couche — donc se mêlent aux markers de l'application dans la même
pastille (`<DrawLayer symbols={{ cluster: { enabled: false } }}>` pour les en retirer
et revenir à un marker par symbole). Leur seuil
suit la même cascade, avec `<DrawLayer symbols={{ minZoom }}>` pour le niveau couche
et `SymbolEntry.minZoom` pour le niveau donnée — c'est **votre** catalogue qui sait
qu'un poste de commandement structure une région là où un point de contrôle n'a de sens
qu'une fois sur zone.

> `MILSYM_CATALOG` ne déclare **aucun** `minZoom` : ses 91 entrées partagent le seuil de
> la couche. Pour un horizon par genre de symbole, fournissez votre propre catalogue (ou
> dérivez le sien en ajoutant `minZoom` aux entrées voulues).

Le coût du gate est nul quand personne ne s'en sert : sans marker `static`, la couche
ne s'abonne pas à la caméra. Et l'état suivi est un **franchissement**, pas un zoom —
un re-render par traversée de seuil, pas un par frame de molette.

---

## 9. Tags et filtre « Couches »

```ts
{ id: 'a1', type: 'agent-enroute',   tags: ['user', 'move'],    position, data }
{ id: 'a2', type: 'agent-available', tags: ['user', 'standby'], position, data }
```

- Sans `tags`, un marker reçoit `['marker', type]`.
- Le filtre est en **OU** : cocher `user` et `rect` laisse visibles « les users **et**
  tous les rectangles ».
- Il s'applique **avant** le clustering : les clusters reflètent le filtre.
- Le bouton **Couches** de `<MapControls>` liste les tags réellement présents
  (recherche, cases à cocher, pastilles, compteurs). La sélection est persistée
  (`<Map tagStorageKey>`, `null` pour désactiver).
- Couleur d'une pastille : `theme.colors.tags[tag]`, sinon une palette **hashée
  stable** (`tagColor`) — même couleur d'une session à l'autre sans rien stocker.

Accès programmatique : `useTags()` / `useTagSelection()`, ou `engine.tags`
(`toggle`, `clear`, `isVisible`, `all`, `report`).

---

## 10. Regroupement (clusters)

**Un cluster est une propriété de la CARTE, pas d'une couche.** Ce qui se superpose à
l'écran devient une pastille, quelle que soit la couche d'origine des points : markers
de l'application et symboles posés se regroupent ensemble, et le camembert mélange
leurs types.

```tsx
<Map
  config={{ clustering: { radius: 60, minPoints: 2, maxZoom: 18, spiderfyZoom: 19 } }}
  cluster={{ typeIcon, typeLabel, tooltip }}   // apparence ; `false` coupe tout
  layers={[markersLayer({ points })]}          // participe d'office
/>
```

| Où | Quoi |
|---|---|
| `config.clustering` | l'algorithme : `radius` (px écran), `minPoints`, `maxZoom`, `spiderfyZoom` |
| `<Map cluster>` | l'apparence : `icon`, `typeIcon`, `typeLabel`, `tooltip`, `size` — `false` coupe le regroupement |
| `<MarkerLayer cluster={{ enabled: false }}>` | retire UNE couche du regroupement (un point de suivi qu'on veut toujours voir seul) |

Le partage des rôles : la carte décide **où est le regroupement**, chaque couche décide
**à quoi ressemblent ses markers** (icône, menu, infobulle, drag). Une couche ne pose
donc que ce que la surface lui laisse — le reste est dans une pastille.

L'infobulle reçoit `MarkerData[]` **sans donnée typée** : une pastille peut agréger des
markers de plusieurs couches, rien ne garantit un `data` commun.

### Ce que la lib fait au-delà du regroupement géographique

1. **Clustering monde, pas viewport** — supercluster reçoit des bounds monde. En vue
   oblique, les bounds du viewport n'atteignent pas l'horizon : une alerte lointaine
   disparaîtrait. Ce qui est hors champ est géré par la projection et l'occlusion du
   globe, pas par un filtre de boîte.
2. **Déclutter écran** — le clustering géographique n'empêche pas deux clusters de se
   **superposer** à l'écran en vue inclinée (l'un derrière l'autre). Ils sont
   projetés, triés par profondeur, et fusionnés dans le cluster **de devant** :
   aucune information ne reste cachée en arrière-plan.
3. **Éventail automatique** — au-delà de `maxZoom`, tout nœud encore fusionné est un
   chevauchement écran : il est décollé en éventail, chaque marker gardant son propre
   fil vertical vers son point au sol. Replié dès qu'on dézoome.
4. **Au ras du sol, le déclutter seul** — en mode piéton il ne reste que lui, et c'est le
   seul qui ait un sens à hauteur d'homme : ce qui se superpose à l'œil devient une
   pastille, où que soient les points. Le regroupement géographique s'éteint de lui-même
   (le zoom dérivé de l'altitude passe au-delà de `maxZoom`) et l'éventail est coupé — son
   rayon vient d'une résolution de carte 2D sous la caméra, qui ne dit rien de la distance
   d'un marker en vue rasante. Le déclutter, lui, projette alors à la **hauteur réelle** du
   point : à hauteur d'homme, l'écart entre le sol et l'ellipsoïde pèse plusieurs écrans.
   Rien à régler : c'est le signal de vue rasante que le moteur diffuse aux couches (cf.
   [ENGINE § 3](ENGINE.md#3-écrire-une-couche)).
5. **Borné par la portée de vue** — markers ET pastilles disparaissent au-delà de
   `pedestrian.viewDistanceMeters`, la borne du `far` et de la fin du brouillard. Un
   overlay DOM garde sa taille écran quelle que soit la distance : sans cette borne, les
   alertes d'une ville à 700 km s'alignaient sur l'horizon au gabarit de celles d'en face.

### Apparence

Le cluster par défaut est un **donut** : un cœur portant le total, entouré d'un
anneau segmenté par type (`theme.clusters` : `coreRadius(total)`, `ringWidth`,
`strokeWidth`, `segmentGap`, `startAngle` ; `theme.colors.cluster` pour les teintes).

Le donut est rendu par la lib ; ce qui se règle, c'est **ce qu'il montre d'un type** —
et ça se règle sur la **carte**, pas sur une couche, puisqu'une pastille peut agréger
plusieurs couches :

```tsx
<Map
  cluster={{
    icon: (c) => `<svg …>${c.total}</svg>`,        // remplace le camembert
    typeIcon: (type) => <path d={ICONES[type]} />, // fragment SVG 0 0 24 24, currentColor
    typeLabel: (type) => LIBELLES[type],           // nom d'un type dans l'infobulle
    tooltip: (c, membres, segmentType) => ({ … }), // `null` = pas d'infobulle
    size: 52,                                       // défaut : theme.markers.size × 1.18
  }}
/>
```

`ClusterInfo` porte `{ total, counts, types, position }`, `types` étant trié par
compte décroissant (dominant en premier). C'est ce que reçoit `<DefaultCluster>`,
exporté pour un rendu maison.

---

## 11. Markers repositionnables

Déplacer un marker à la souris pour **définir une position** (le point qu'on pose
dans un formulaire, un symbole placé à la main).

```tsx
const markers = [
  { id: 'a1',  type: 'alert-high', position, data },                     // fixe
  { id: 'pin', type: 'pin',        position, repositionable: true, data }, // déplaçable
]

<MarkerLayer
  points={markers}
  onReposition={(m, latLng) => enregistrer(m.id, latLng)}  // au relâchement
  onRepositionMove={(m, latLng) => apercu(latLng)}         // en continu (optionnel)
/>
```

Le drapeau vit sur la **donnée** parce que dans un même jeu, seuls certains markers
sont éditables. La prop `<MarkerLayer repositionable>` (booléen ou prédicat) tranche
globalement ou sur un critère externe au marker (mode édition, droits) et **prime**
alors sur le champ de la donnée.

- Le geste s'arme au **mouvement** (`interaction.repositionSlopPx`, ~4 px), pas au
  long-press : le clic reste intact tant que le pointeur ne bouge pas.
- Le marker suit le **relief réel** : il reste sous le curseur en vue inclinée, avec
  repli sur l'ellipsoïde si le pointeur sort du globe.
- **À ne pas confondre avec `draggable`** ([§ 12](#12-drag-and-drop-vers-un-dock)),
  qui est le drag-and-drop à payload. Les deux gestes partent du même `pointerdown` :
  tant que la tige est affichée ils cohabitent (repositionnement depuis le **point au
  sol**, saisie vers le dock depuis l'**icône**) ; sans tige, le repositionnement
  prend le pas.

Pour une couche custom : `useRepositionable()` et
`engine.pickLatLngAtClient(clientX, clientY, fallbackToEllipsoid?)`.

---

## 12. Drag-and-drop vers un dock

```tsx
<Map
  layers={[markersLayer({ points: agents, draggable: (m) => m.type === 'agent-available' })]}
  dock={{
    items: epingles,
    onPin: (payload) => ajouter(payload.id),
    onUnpin: (id) => retirer(id),
    onReorder: (ids) => reordonner(ids),
  }}
/>
```

`draggable` (`true` ou prédicat) rend les markers saisissables au **long-press**
(`interaction.longPressMs`) : le clic normal reste préservé, le ghost accroché au
curseur réutilise l'icône du marker, et les **clusters ne sont jamais saisissables**.

> L'absence de `dock` a une conséquence voulue au-delà de l'affichage : plus aucune
> zone n'accepte un marker, donc les markers cessent d'être saisissables. Un geste
> sans destination n'est pas proposé.

`<PinnedDock>` est **contrôlée** : `items` vient de l'application, qui persiste ce
qu'elle veut — la lib ne stocke rien. Un `PinnedItem` porte
`{ id, position?, type?, color?, label?, avatar?, icon?, data? }`.

Briques génériques : `useDraggable` (rendre saisissable), `useDropZone` (zone
réceptrice), `useMapDropZone` (dépôt **sur le terrain**, qui livre la lat/lng visée
par raycast ellipsoïde).

---

## 13. Performance

| Levier | Effet | Borne ce que… |
|---|---|---|
| `source` cadrée sur le viewport | la donnée lointaine n'est jamais chargée | …vous chargez ✅ |
| `cluster` | n nœuds au lieu de n markers | …vous montez |
| `cullMargin` (défaut **200 px**) | masque (`display:none`) ce qui est hors cadre | …le navigateur calcule |

**Le cull en détail.** Un marker sorti du cadre reste **monté** : son nœud DOM, son
portail React et son `CSS2DObject` sont conservés. Au-delà de la marge il est masqué,
donc le navigateur cesse d'en calculer le style, la mise en page et la composition.
Un marker **créé** hors cadre, lui, n'entre jamais dans le document (le
`CSS2DRenderer` n'insère l'élément qu'au premier rendu visible). Mesuré sur la démo,
vue initiale : **9 ancres dans le DOM au lieu de 32**.

Un marker masqué **sort aussi de la sélection au marquee** : hors cadre d'au moins
cette marge, aucun rectangle tracé à l'écran ne pourrait de toute façon l'atteindre.

`cullMargin={0}` désactive le cull. La marge n'est pas cosmétique : plus serrée, les
markers du bord clignotent pendant un pan. Contrairement à `leaderLine`, c'est un
réglage **vivant** — le changer à chaud ne reconstruit rien.

Sont masqués d'office, sans réglage : les markers passés **derrière la caméra** et
ceux passés **derrière le globe** (occlusion d'horizon).

Le cull ne réduit **pas** le nombre d'objets montés (le tri z du `CSS2DRenderer`
porte sur tout ce qui existe) : pour ça, il faut le clustering, et surtout la source
cadrée.

---

## 14. Couche déclarative ou composant

```tsx
// Déclaratif — <Map> monte tout dans le bon ordre d'imbrication
<Map layers={[markersLayer<Agent>({ id: 'agents', points: agents })]} relations={{ rules, provider }} />

// Manuel — vous placez les couches vous-même
<Map>
  <RelationLayer rules={rules} provider={provider}>
    <MarkerLayer points={agents} />
  </RelationLayer>
</Map>
```

`MarkersSpec` = `MarkerLayerProps` + un `id` de couche (**à fournir dès que la liste
peut être réordonnée ou filtrée** : sans lui c'est l'indice qui sert, et une couche
insérée en tête recyclerait l'état de sa voisine) + un `menu` qui reçoit un **second
argument** : l'API du moteur de relations, ou `null`.

C'est ce second argument qui remplace la render-prop de `<RelationLayer>` : sans
enfants, il faut bien que les entrées « Distance autour › » parviennent au menu.

---

## 15. Ce que les markers alimentent tout seuls

Aucune configuration n'est nécessaire pour ces intégrations — la couche s'inscrit aux
registres du moteur à son montage.

| Surface | Registre | Ce qui est vu |
|---|---|---|
| **Recherche** | `engine.search` | markers portant un `title`, **post-filtre tags**. Une rubrique par `type` (`marker:<type>`), nommée par `typeLabel` et colorée par `theme.colors.marker[type]`. Un marker sans `title` est écarté, jamais indexé sous son id. |
| **Loupe** | `engine.markers` | **tous** les markers d'un cadre géo, clusters compris (données sources). Sert aussi `visualNodeOf` (le nœud qui agrège un marker) au moteur de relations. |
| **Marquee** | `engine.selectables` | les markers **individuellement visibles** à l'écran. |
| **Couches** | `engine.tags` | les tags de **tous** les points, même masqués par le seuil des statiques. |
| **Regroupement** | `engine.clusters` | les points **posés** de la couche — c'est `<ClusterSurface>` qui décide lesquels deviennent une pastille (cf. [§ 10](#10-regroupement-clusters)). |

`typeLabel` nomme un type **une fois pour toutes** : rubrique de recherche et
sous-titre des lignes de liste. Dans une pastille de cluster, c'est
`<Map cluster={{ typeLabel }}>` qui nomme les parts.

---

## 16. Listes de markers

`<MarkerList>` est la liste partagée par la loupe et le panneau de sélection : une
ligne par marker, en-tête avec décompte par type, corps scrollable, croix par ligne,
menu d'actions.

```tsx
<MarkerList
  markers={markers}
  getId={(m) => m.id}
  renderItem={(m) => <b>{m.title}</b>}          // défaut : title, sinon l'id
  renderSubtitle={(m) => m.data.reference}       // défaut : le type via markerTypeLabel
  markerTypeLabel={(t) => LIBELLES[t]}
  onRemove={(id) => retirer(id)}
  onTarget={(m) => ouvrir(m)}                    // défaut : vol caméra
  actions={[{ id: 'fiche', label: 'Ouvrir', run: (m) => ouvrir(m) }]}
  menu={(m) => MENU(m)}                          // prime sur `actions`
/>
```

Le repère visuel d'une ligne suit partout la même règle — **photo > icône > pastille
de couleur** — porté par le composant `<Swatch>`, exporté.

---

## 17. Recettes

**Cadrer sur l'ensemble des markers, une fois la carte prête**

```tsx
<Map
  onReady={() => {
    const b = boundsOfMarkers(agents)
    if (b) camera.fitBounds(b, { padding: { left: 320, top: 40, right: 40, bottom: 40 } })
  }}
/>
```

`onReady` (et non le montage) : avant lui, un `fitBounds` viserait l'ellipsoïde nu au
lieu du sol réel.

**Faire porter une information à l'anneau de sélection**

```ts
{ id, type: 'agent', selectedColor: agent.enRetard ? '#ef4444' : undefined, position, data }
```

**Deux couches de markers dans la même carte**

```tsx
layers={[
  markersLayer<Alert>({ id: 'alertes', points: alertes, cluster: { enabled: true } }),
  markersLayer<Agent>({ id: 'agents',  points: agents,  typeLabel: (t) => AGENTS[t] }),
]}
```

Chaque couche a sa propre entrée dans les registres (tags, recherche, inventaire) :
elles ne se marchent pas dessus.

**Marker qui doit rester devant tous les autres**

```ts
{ id: 'courant', type: 'pin', zIndex: 100, position, data }
```

**Désactiver l'infobulle d'un seul marker** — `tooltip: (m) => (m.data.muet ? null : …)`.

---

## Voir aussi

- [ZONES.md](ZONES.md) — zones, formes drapées et tracés
- [DRAWING.md](DRAWING.md) — dessin utilisateur, sélection et édition
- [LENS.md](LENS.md) — loupe (inventaire des markers d'une zone)
- [SEARCH.md](SEARCH.md) — recherche unifiée
- [RELATIONS.md](RELATIONS.md) — liens par tags et itinéraires réels
- [PEDESTRIAN.md](PEDESTRIAN.md) — déclutter et bornes de vue à hauteur d'homme
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [THEME.md](THEME.md) · [LABELS.md](LABELS.md)

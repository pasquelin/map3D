# Zones, formes et tracés — guide complet

**Français** · [English](../en/ZONES.md) · [↑ Index](README.md)

Une **zone** est une géométrie posée sur le globe et **drapée sur le relief** :
polygone, rectangle, cercle, ligne, flèche. Elle épouse le terrain, ses traits ont
une épaisseur en **pixels écran** (constante au zoom, comme sur toute carte), et elle
peut devenir un **volume** pour les vues inclinées.

Trois chemins mènent à une zone, et ils ne se recouvrent pas :

| Chemin | Composant | Pour quoi |
|---|---|---|
| **Donnée** — vos zones, affichées telles quelles | `<ShapeLayer shapes>` | périmètres venus du backend, secteurs, isochrones. Rendu + recherche, **aucune interaction**. |
| **Dessin** — l'utilisateur trace | `<DrawLayer>` | zones créées, éditées, sélectionnables, undo/redo, GeoJSON. Cf. [DRAWING.md](DRAWING.md). |
| **Contrainte** — un périmètre qui borne le dessin | `draw.constraints.limits` | « on ne dessine que dans ces zones ». Ne dessine rien lui-même. |

Le reste de ce document couvre le premier chemin, la géométrie qu'il partage avec les
deux autres, et les tracés (`<PathLayer>`) qui en sont le cousin ouvert.

---

## 1. En deux minutes

```tsx
import { Map, shapesLayer, type ShapeData } from '@pasquelin/map3d'

const zones: ShapeData[] = [
  { kind: 'circle',  id: 'z1', title: 'Périmètre A', center: PARIS, radiusMeters: 800 },
  { kind: 'polygon', id: 'z2', title: 'Secteur nord', points: [...], color: '#f59e0b', fillOpacity: 0.18 },
  { kind: 'rect',    id: 'z3', bounds: { north, south, east, west }, extrudeHeight: 120 },
]

<Map center={PARIS} zoom={14} layers={[shapesLayer({ id: 'zones', shapes: zones })]} />
```

Montage manuel équivalent : `<Map><ShapeLayer shapes={zones} /></Map>`.

---

## 2. `ShapeData` — anatomie

```ts
type ShapeData = {
  // identité (facultative, mais cf. § 5)
  id?: string | number
  title?: string
  // style
  color?: string
  width?: number          // épaisseur du contour, en PIXELS ÉCRAN
  fillOpacity?: number
  extrudeHeight?: number  // mètres au-dessus du sol → volume
} & (
  | { kind: 'polygon'; points: LatLng[] }
  | { kind: 'line';    points: LatLng[] }
  | { kind: 'arrow';   points: LatLng[] }
  | { kind: 'rect';    bounds: Bounds }
  | { kind: 'circle';  center: LatLng; radiusMeters: number }
)
```

### Les cinq variantes

| `kind` | Géométrie | Fermée | Remplissage | Extrusion |
|---|---|---|---|---|
| `polygon` | `points[]` | ✅ | ✅ | ✅ |
| `rect` | `bounds` (N/S/E/O) | ✅ | ✅ | ✅ |
| `circle` | `center` + `radiusMeters` | ✅ | ✅ | ✅ |
| `line` | `points[]` | ❌ | — | — |
| `arrow` | `points[]` (tête au dernier point) | ❌ | — | — |

Un polygone est **fermé implicitement** : ne répétez pas le premier point en fin de
liste. Un cercle est polygonisé au rendu à `config.performance.circleSegments`
(défaut 64).

### Style

| Champ | Défaut | Note |
|---|---|---|
| `color` | `theme.colors.zone.stroke` | sert au contour **et** au remplissage |
| `width` | `6` | **pixels écran** — converti en mètres à la résolution courante, à chaque rebuild |
| `fillOpacity` | `0.22` | `0` = pas de remplissage (contour seul) |
| `extrudeHeight` | `0` | cf. [§ 4](#4-zones-volumétriques-extrudeheight) |

> `theme.colors.zone` déclare `fill` **et** `stroke`, mais `<ShapeLayer>` ne consomme
> que `stroke` : le remplissage est cette même couleur, peinte à `fillOpacity`. Pour
> deux teintes distinctes, posez `color` sur la forme.

### Identité et nom

`id` et `title` ne servent **pas** au rendu — ils servent à être trouvé.

- `title` est le **nom lisible**, exactement comme `MarkerData.title` : c'est ce que
  la recherche indexe et ce que les listes affichent. Sans lui, une zone n'est
  trouvable par personne.
- `id` identifie la zone dans les résultats de recherche (repli : le `title`).

Une zone **anonyme** est rendue normalement, simplement invisible pour la recherche —
« polygon-3 » n'est pas un résultat utile.

---

## 3. Le drapage

Une forme n'est pas plaquée sur une sphère théorique : elle est construite dans un
**plan tangent local** (repère ENU) ancré à une hauteur de terrain résolue par
raycast, puis raffinée au fil du chargement des tuiles.

Ce que ça implique, concrètement :

- **Le contour épouse le relief** — un périmètre à flanc de colline ne traverse pas la
  pente.
- **La forme se reconstruit** quand la résolution change assez (bande d'hystérésis sur
  l'épaisseur en mètres) ou quand la hauteur d'ancre se précise. Ce n'est pas un
  recalcul par frame.
- **Tant que les tuiles manquent**, un repli est utilisé sans être mémoïsé : la
  fenêtre reste ouverte jusqu'à résolution réelle.
- **Les formes drapées ne testent pas la profondeur** : elles se dessinent par-dessus
  le terrain, donc restent lisibles dans un creux. Les **volumes**, eux, testent la
  profondeur (cf. § 4). Exception : en **mode piéton**, les formes drapées aussi
  testent la profondeur, pour rester occultables par le bâti à hauteur d'homme.

Le protocole est mutualisé (`DrapedLayer`) entre zones, tracés et liens de relation.
Une couche custom qui projette ses propres éléments drapés peut réutiliser
`AnchorHeightCache` plutôt que d'en réécrire les précautions (raycast amorti,
retentative des tuiles absentes, invalidation 2D ↔ 3D).

---

## 4. Zones volumétriques (`extrudeHeight`)

Une zone est drapée au sol par défaut. `extrudeHeight` (mètres **au-dessus du sol**)
la transforme en volume — murs verticaux + couvercle — pour les vues inclinées où un
aplat se lit mal.

```tsx
<ShapeLayer shapes={[{ kind: 'polygon', points, color: '#f59e0b', fillOpacity: 0.18, extrudeHeight: 200 }]} />
```

**Ancrage.** Le volume est monté **dans le même repère ENU que la surface drapée** :
il hérite de son ancre et de sa hauteur de terrain, déjà résolues et raffinées. Il n'a
pas de position propre, donc il ne peut pas dériver de sa base au pan.

**Le bas part du sol réel, pas du plan de la zone.** Le terrain est échantillonné le
long du contour (16 points, un raycast chacun, **au build seulement**) et le bas des
murs descend sous le point le plus bas mesuré, plus 8 m d'enfouissement pour rester
enterré entre deux échantillons. Sans ça, sur un terrain qui descend (berge, pont,
vallon), le bas des murs se retrouverait suspendu au-dessus du creux — précisément ce
que la forme drapée masquait, puisqu'elle se dessine par-dessus tout. Terrain inconnu
(tuiles absentes) → repli sur le plan de l'ancre, le drape sera reconstruit.

Le **couvercle** reste plan, à `extrudeHeight` au-dessus du sol de référence de la
zone.

**Les arêtes remplacent le contour.** Anneau du bas, montants et anneau du couvercle
sont tracés en **lignes GL de 1 px**, constantes au zoom et sans conversion
px → mètres (un ruban ne tomberait jamais exactement sur un pixel). Sur une forme
extrudée, `width` ne s'applique donc plus.

**Profondeur.** Les faces d'un volume testent la profondeur : un bâtiment qui passe
devant l'occulte correctement.

**Portée.** N'a d'effet que sur les formes **fermées** (polygone, rectangle, cercle) —
sur une ligne ou une flèche, elle produirait un mur sans épaisseur. Une valeur non
finie (`NaN` venu d'un calcul amont) est ramenée à `0`, ce qui rend le contour drapé
plutôt que de faire perdre son tracé à la forme.

`extrudeHeight` est une propriété **de la zone** : deux zones voisines peuvent avoir
des hauteurs différentes, et la changer à chaud reconstruit le volume.

---

## 5. Recherche

`<ShapeLayer>` s'inscrit d'elle-même au registre `engine.search` :

- une zone **nommée** (`title`) est cherchable, une zone anonyme est ignorée ;
- la rubrique est `shape` (libellé : `labels.search.groups.shape`), colorée par le
  contour de la zone ;
- chaque entrée porte son **emprise** — c'est ce qui fait **cadrer** la zone au choix,
  au lieu de survoler son centre à une altitude arbitraire.

Rien à configurer : il suffit de nommer les zones. Voir [SEARCH.md](SEARCH.md).

---

## 6. Cadrage : les helpers de `Bounds`

Tous **corrects à l'antiméridien** et tolérants aux coordonnées non finies (ils
renvoient `null` plutôt qu'un cadre empoisonné qui ferait viser le néant).

```ts
boundsOfShape(shape)             // une forme, quelle que soit sa variante
boundsOfShapes(shapes)           // un ensemble
boundsOfCircle(center, meters)   // disque géodésique
boundsOfLatLngs(points)          // liste de points
boundsOfMarkers(markers)         // tout objet { position }
unionBounds([a, b, c])           // union, `null` ignorés
centerOfBounds(b)                // centre, antiméridien compris
lngSpanDeg(b)                    // largeur en degrés de longitude
altitudeForBounds(b, opts?)      // altitude cadrante
```

```tsx
const b = boundsOfShapes(zones)
if (b) camera.fitBounds(b, { padding: { left: 320, top: 40, right: 40, bottom: 40 } })
```

`altitudeForBounds` borne par défaut à `[350 m, 6000 km]` avec une marge de 1.35× —
des valeurs pensées pour la recherche de lieu. `margin`, `minAltitude` et
`maxAltitude` les ajustent quand le contenu est plus petit (une zone de 200 m).

Voir [CAMERA.md](CAMERA.md) pour le cadrage complet (padding asymétrique, durées).

---

## 7. Prédicats géodésiques

Exportés et **géodésiques** — donc stables au pivot de caméra, contrairement à un test
en coordonnées écran. C'est ce que la lib elle-même utilise pour les contraintes de
dessin.

```ts
ringOfShape(shape, segments?)      // toute forme → un anneau de LatLng (cercle polygonisé, rect développé)
pointInRing(p, ring)               // ray casting ; un point sur le bord est ACCEPTÉ
ringInsideRing(inner, outer)       // inclusion (test sur les sommets de `inner`)
ringsOverlap(a, b)                 // chevauchement d'aire (sommet strict + arêtes croisées) ; adjacence permise
polygonAreaM2(ring)                // aire par excès sphérique
circleRing(center, meters, segs?)  // disque → anneau
predicateSegments(renderSegments)  // densité de prédicat sûre face à une densité de rendu
PREDICATE_CIRCLE_SEGMENTS          // 64
```

`ringOfShape` ramène les cinq variantes à un seul type d'entrée : les prédicats n'ont
ainsi qu'un cas à traiter.

`polygonAreaM2` emploie la méthode de Chamberlain & Duquette — la **même** que
`google.maps.geometry.spherical.computeArea`, donc des valeurs comparables. L'anneau
est supposé fermé implicitement et simple : une aire n'a pas de sens sur un contour
qui se recoupe.

> **Densité de prédicat ≠ densité de rendu.** `PREDICATE_CIRCLE_SEGMENTS` (64) est
> distincte de `config.performance.circleSegments` : rendre la première configurable
> exposerait un réglage capable de changer une **réponse booléenne**, là où la seconde
> ne change qu'un lissé. L'invariant est qu'elle ne soit jamais plus grossière que le
> rendu — un polygone inscrit rétrécit quand on lui retire des sommets, donc tester
> avec moins de segments qu'on n'en dessine rendrait « hors zone » un point
> visiblement à l'intérieur. `predicateSegments(n)` fait tenir l'invariant au lieu de
> seulement l'énoncer.
>
> `ringInsideRing` teste les **sommets** de `inner` : exact pour des contours
> convexes, suffisant pour une zone dessinée dans un périmètre. Un contour concave
> dont une arête sort entre deux sommets passerait — densifiez `inner` si la précision
> doit être meilleure.

```ts
// « Cette alerte est-elle dans un de mes secteurs ? »
const dedans = zones.some((z) => pointInRing(alerte.position, ringOfShape(z)))
```

---

## 8. Zones dessinées par l'utilisateur

Une zone **dessinée** n'est pas un `ShapeData` : c'est un `DrawnShape` de la
collection de dessin, avec une identité stable, un style plus riche (fond et bordure
séparés, style de trait, rayon d'angle), des tags, un verrou et des métadonnées
métier. Elle est sélectionnable, éditable, annulable et exportable en GeoJSON.

Tout est dans [DRAWING.md](DRAWING.md). Deux points de jonction ici :

**Limiter le dessin à des périmètres.** `constraints.limits` prend des `ShapeData` —
le même type qu'affiche `<ShapeLayer>` :

```tsx
<Map
  layers={[shapesLayer({ shapes: perimetres })]}   {/* les AFFICHER : c'est à vous */}
  draw={{
    constraints: { limits: perimetres, maxAreaM2: 10_000_000 },
    onReject: (raison) => toast(raison === 'outOfLimits' ? 'Hors zone' : 'Trop grande'),
  }}
/>
```

`limits` ne dessine rien : la couche de dessin s'en sert comme prédicat. Affichez vos
périmètres avec `<ShapeLayer>` (ou en formes **verrouillées** dans le dessin, si vous
voulez qu'ils vivent dans la même collection). Seuls les **gestes utilisateur** sont
contraints — `addShape`, `updateShape` et `fromGeoJSON` injectent sans contrôle.

**Choisir la bonne couche.**

| Besoin | Couche |
|---|---|
| Afficher des zones venues du backend | `<ShapeLayer>` |
| Les rendre cliquables / sélectionnables | `<DrawLayer>` (via `addShape` / `value`) |
| Les rendre intouchables mais dans la même collection | `<DrawLayer>` + `locked: true` |
| Les rendre extrudées | `<ShapeLayer>` (`extrudeHeight` n'existe pas côté dessin) |
| **Parcourir un référentiel distant** et en poser des éléments | le catalogue — cf. [CATALOG.md](CATALOG.md) |

---

## 9. Tracés (`<PathLayer>`)

Le cousin **ouvert** de la zone : un ruban drapé au sol, avec contour de lisibilité et
point courant animé. Pensé pour une trace GPS ou un parcours.

```tsx
<PathLayer
  paths={[{ id: 'trace-1', points: trace, color: '#22d3ee', width: 6, casing: true }]}
  animateHead                      // pulsation du point courant (défaut true)
/>
```

```ts
type PathData = {
  id?: string | number
  points: LatLng[]
  color?: string        // défaut theme.colors.path.base
  width?: number        // px écran, défaut 6
  casing?: boolean      // contour sombre sous le ruban
  casingColor?: string  // défaut theme.colors.path.casing
}
```

Le contour (`casing`) n'est pas cosmétique : sur imagerie satellite, un trait sans
contour se perd dans le fond. Même raison que le `casingWidth` des liens de relation.

`<PathLayer>` ne s'inscrit **pas** à la recherche (un tracé n'a pas de nom) et n'est
pas interactif.

---

## 10. Thème

| Clé | Effet |
|---|---|
| `colors.zone.stroke` | contour **et** remplissage par défaut d'une zone, couleur de la rubrique de recherche |
| `colors.zone.fill` | déclarée, non consommée par `<ShapeLayer>` (cf. § 2) |
| `colors.path.base` / `colors.path.casing` | tracés |
| `colors.draw.default` / `colors.draw.palette` | formes **dessinées** — cf. [DRAWING.md](DRAWING.md) |

Changer le thème à chaud reconstruit les formes qui n'ont pas de `color` propre.
Référence complète : [THEME.md](THEME.md).

---

## 11. Recettes

**Un cercle de rayon autour d'un point, cadré à l'écran**

```tsx
const zone: ShapeData = { kind: 'circle', center: alerte.position, radiusMeters: 500, title: 'Périmètre' }

<Map layers={[shapesLayer({ shapes: [zone] })]} onReady={() => camera.fitBounds(boundsOfShape(zone)!, { padding: 60 })} />
```

**Un bâtiment en volume, lisible en vue inclinée**

```ts
{ kind: 'polygon', points: emprise, color: '#38bdf8', fillOpacity: 0.15, extrudeHeight: 45 }
```

**Un contour sans remplissage**

```ts
{ kind: 'polygon', points, fillOpacity: 0, width: 3 }
```

**Cadrer toutes les zones et tous les markers ensemble**

```ts
const b = unionBounds([boundsOfShapes(zones), boundsOfMarkers(agents)])
if (b) camera.fitBounds(b, { padding: 80 })
```

**Refuser une saisie hors périmètre, côté application**

```ts
const ring = ringOfShape(perimetre)
const valide = ringInsideRing(ringOfShape(zoneSaisie), ring)
```

**Aire d'une zone, en m²** — `polygonAreaM2(ringOfShape(zone))`.

---

## Voir aussi

- [DRAWING.md](DRAWING.md) — dessin utilisateur, édition, GeoJSON, contraintes
- [MARKERS.md](MARKERS.md) — points et clusters
- [CAMERA.md](CAMERA.md) — cadrage, vols, fond de carte
- [CATALOG.md](CATALOG.md) — parcourir un référentiel distant et en poser des zones
- [SEARCH.md](SEARCH.md) — recherche unifiée
- [PEDESTRIAN.md](PEDESTRIAN.md) — pourquoi les formes drapées testent la profondeur en marche
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [THEME.md](THEME.md)

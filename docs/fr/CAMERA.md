# Caméra, vue et fond de carte

**Français** · [English](../en/CAMERA.md) · [↑ Index](README.md)

Comment on arrive quelque part, comment on y reste, et ce qu'on regarde en y étant.

---

## 1. Position initiale

```tsx
<Map center={{ lat: 48.8566, lng: 2.3522 }} zoom={14} />
```

`zoom` est l'**échelle Web Mercator** familière : `0` = monde, `~21` = niveau rue.
Conversions exportées : `altitudeForZoom(zoom)` et `zoomForAltitude(m)`.

### Intro

Par défaut, la carte démarre en **vue globe** et descend en vol animé vers
`center`/`zoom`, façon Google Earth. `intro={false}` la coupe.

Pendant le vol, l'altitude de destination est **ré-ancrée** au fil du raffinement des
tuiles : la hauteur du sol se précise pendant la descente, donc l'atterrissage est
exact. Réglages : `config.startup` (`introDuration`, `introAltitudeFactor`,
`introMaxWaitMs`, `introFadeMs`).

### Position mémorisée

```tsx
<Map positionStorageKey="m3d:pos:dashboard" resetStoredPosition={false} />
```

Une position mémorisée **remplace** `center`/`zoom` au montage **et coupe l'intro** —
on ne rejoue pas une arrivée quand on reprend une session. `resetStoredPosition`
l'efface au montage. Sans la prop, aucune persistance.

Une clé **distincte par carte** si plusieurs `<Map>` cohabitent sur le même origin.
L'écriture est anti-rebondie (`config.data.positionSaveDebounceMs`).

---

## 2. « La carte est prête » (`ready`)

```tsx
<Map onReady={(engine) => camera.fitBounds(boundsOfMarkers(markers)!)} />
```

**`ready` = la projection résout des hauteurs, et un cadrage vise le sol réel.**

Ce n'est **pas** « le moteur existe » : ça, c'est `useMap()`, disponible dès le
montage sans attendre les tuiles. Avant `ready`, un `fitBounds` viserait l'ellipsoïde
nu.

L'event tire **une seule fois**, mais un abonné arrivé après coup le reçoit **quand
même immédiatement** — sans quoi `onReady` marcherait au premier montage et resterait
silencieux ensuite.

Si une source de tuiles échoue (token invalide, réseau coupé), `ready` finit malgré
tout par tomber (`config.startup.readyMaxWaitMs`, ~8 s) : l'application n'est jamais
suspendue à un event qui n'arrivera pas.

Autres surfaces : `engine.on('ready', cb)`, `engine.ready` (booléen synchrone), et
`useMapEvents({ onReady })` pour un composant enfant.

---

## 3. Déplacer la caméra

```ts
const camera = useCamera()   // ou engine.camera, ou map.current?.camera
```

| Commande | Effet |
|---|---|
| `flyTo(dest, opts?)` | vol vers `{ lat?, lng?, altitude? }` |
| `panTo(p, opts?)` | recentre **en douceur**, altitude inchangée |
| `setCenter(p)` | recentre **instantanément**, altitude inchangée |
| `moveTo(dest, opts?)` | recentre/altitude, durée courte du thème |
| `setZoom(z, opts?)` | zoom façon carte 2D ; le point visé ne bouge pas |
| `getZoom()` | zoom courant |
| `fitBounds(bounds, opts?)` | cadre un ensemble géographique (cf. § 4) |
| `follow(getPos)` | suit une cible ; renvoie la fonction d'arrêt |
| `getState()` | `{ lat, lng, altitude, heading, tilt }` |

`useCamera().state` est l'état **réactif** (re-rend son consommateur à chaque
mouvement — l'événement `camera` est émis par frame tant que la caméra bouge) ; la
poignée `map.current?.camera`, elle, ne re-rend rien — c'est la différence entre les
deux chemins.

Un troisième chemin pour le cas courant : `useCameraCommands()` rend les **commandes
seules**, d'identité stable et sans abonnement. Un bouton qui ne fait que `flyTo` n'a
aucune raison de se re-rendre soixante fois par seconde pendant un pan.

**Garde-fous appliqués à toute destination** : jamais au-dessus de `maxAltitude`,
jamais sous `sol réel + config.camera.minGroundClearance` (le sol est échantillonné
sur les tuiles, avec un cache court — le géoïde négatif de la mer Morte reste
légitime). Le zoom molette ne passe pas par là : il est couvert par l'anti-collision
des contrôles.

### Suivi

```tsx
<MarkerLayer followId={agentSuivi} />          // déclaratif
const stop = camera.follow(() => agent.position)  // impératif
```

Si la cible disparaît momentanément (clusterisée, masquée par un filtre), la caméra
**rend la main** aux contrôles au lieu de se figer, et reprend à sa réapparition.
L'altitude est bornée par `config.camera.followAltitude`.

---

## 4. Cadrer (`fitBounds`)

```ts
camera.fitBounds(bounds, { padding: { left: 320, top: 40, right: 40, bottom: 40 } })
camera.fitBounds(bounds, { padding: 50, duration: 0 })   // instantané
camera.fitBounds(traceBounds, { minAltitude: 80 })       // objet de quelques dizaines de mètres
```

**`padding` agit en deux temps** : il réduit la surface utile (donc recule la caméra),
et **décale le centre visé** quand il est asymétrique — le contenu se centre alors dans
la zone **restée visible** et non dans le viewport entier. C'est ce qu'il faut sous un
panneau latéral.

Un padding absurde (plus large que le viewport) est ramené à une bande minimale plutôt
que de diviser par ~0.

### Construire des `bounds`

Tous les helpers sont **corrects à l'antiméridien** et renvoient `null` plutôt qu'un
cadre empoisonné si les coordonnées ne sont pas finies.

```ts
boundsOfLatLngs(points)          // liste de points
boundsOfMarkers(markers)         // tout objet { position }
boundsOfShape(shape) / boundsOfShapes(shapes)
boundsOfCircle(center, meters)   // disque géodésique
unionBounds([a, b, c])           // union, `null` ignorés
centerOfBounds(b)
lngSpanDeg(b)
altitudeForBounds(b, opts?)      // altitude cadrante
```

`altitudeForBounds` borne par défaut à **[350 m, 6000 km]** avec une marge de **1.35×**
— des valeurs pensées pour la recherche de lieu. `margin`, `minAltitude` et
`maxAltitude` les ajustent quand le contenu est plus petit (une trace GPS de 200 m
resterait sinon cadrée trop haut). Les défauts globaux vivent dans
`config.camera.fitBounds`.

---

## 5. Suivre la vue

```tsx
<Map onViewportChange={(v) => refetch(v.bounds)} onCameraChange={(s) => setAltitude(s.altitude)} />
```

| Event | Cadence | Usage |
|---|---|---|
| `viewport` | après **stabilisation** de la caméra (`config.data.viewportDebounceMs`) | brancher un refetch |
| `camera` | **à chaque mouvement** | affichage d'état — *jamais* de réseau ici |

Hooks équivalents : `useViewport(cb, opts?)` et `useMapEvents({ onViewportChange,
onCameraChange, onClick, onReady })`.

Un `Viewport` porte `{ bounds, center, zoom }`.

Son `zoom` est l'échelle **réellement perçue** : il se déduit de la distance caméra → point
visé, pas de l'altitude. La nuance compte en vue inclinée, où `altitude = distance × cos(tilt)`
— à 85°, l'altitude tombe au dixième sans que l'écran change, et un zoom qui la suivrait
gagnerait 3,5 niveaux, assez pour franchir des seuils comme `clustering.maxZoom`. À plat les
deux coïncident : le point visé est sous la caméra. En vue rasante (mode piéton), la distance
est bornée par `pedestrian.tileDetailDistanceMeters` — sinon le regard porterait à l'horizon
et l'échelle lue serait celle du point de fuite.

### Afficher la vue (`readout`)

Le bloc de lecture donne à l'écran ce que ces événements portent, **plus l'orientation** :
altitude de l'œil, point au sol sous lui, cap, inclinaison, zoom — **sur une ligne**, dans
le coin demandé. Il ne retombe sur deux lignes que si la carte est trop étroite pour la
sienne.

```tsx
<Map readout />                                        {/* coin haut droit, les 6 grandeurs */}
<Map readout={{ corner: 'bottom-left', fields: ['heading', 'tilt'] }} />
```

| Prop | Rôle | Défaut |
|---|---|---|
| `corner` | `'top-right'` · `'top-left'` · `'bottom-right'` · `'bottom-left'` | `'top-right'` |
| `fields` | Grandeurs affichées, dans l'ordre : `altitude`, `latitude`, `longitude`, `heading`, `tilt`, `zoom` | les six |
| `refreshMs` | Cadence maximale d'écriture | `config.performance.readoutRefreshMs` (120) |
| `className` | Classe en plus de `m3d-readout` | — |

Une grandeur retirée de `fields` n'est pas seulement masquée : elle n'est plus calculée.

Les deux angles de l'orientation, en degrés :

| Grandeur | Ce qu'elle dit | Plage |
|---|---|---|
| `heading` | La direction **regardée** — `0°` au nord, croissant vers l'est. Jamais `360°` : c'est le nord, et il s'écrit `0°`. | `[0, 360[` |
| `tilt` | L'inclinaison — `0°` la caméra regarde **à la verticale** (vue du dessus), `90°` elle regarde **l'horizon**. | `[0, 90]` en pratique |

**Il ne re-rend jamais.** La carte produit un état caméra à chaque frame ; en faire de
l'état React ferait de ce petit bloc le composant le plus coûteux de l'arbre. Il pose donc
son DOM une fois et confie l'écriture des valeurs à une couche du moteur, dans la passe
`project()` — celle des overlays —, à la cadence ci-dessus.

C'est aussi ce qui rend le cap juste. L'événement `camera` porte un seuil **métier** qui
ignore délibérément l'orientation : tourner sur place ne change ni latitude, ni longitude,
ni altitude, donc rien n'est émis. Un cap branché dessus resterait figé pendant toute une
rotation — précisément le geste qu'on le regarde faire.

Les textes, les décimales et la locale des nombres sont dans `labels.readout` (cf.
[LABELS.md](LABELS.md)). L'altitude, elle, n'a pas de système d'unités à elle : elle suit
`labels.measure`, comme toute distance de la lib — une carte en impérial la lit en pieds
sans rien redire. Les coordonnées gardent le **point** décimal par défaut, même sous une
interface française : une coordonnée se recopie ailleurs.

Le bloc laisse passer les gestes de carte ; seules les valeurs restent sélectionnables,
pour qu'une coordonnée puisse être copiée.

Pour l'afficher **hors** de la carte (bandeau maison, panneau d'exploitation),
`<CameraReadout>` est exporté — il n'a besoin que du contexte carte — et
`makeReadoutFormatter(labels)` donne les mêmes formateurs sans aucun DOM.

### Panneau de diagnostic — `<StatsPanel>`

Le menu **« Réglages »** de la barre d'outils porte une ligne **« Infos »** qui ouvre un panneau : ce que la vue contient, ce qu'elle coûte, ce qu'elle retient. Il **absorbe** les grandeurs de `<CameraReadout>` — c'est pourquoi l'exemple éteint le bandeau par défaut.

| Section | Ce qu'elle donne |
| --- | --- |
| **Caméra** | lat, lng, altitude, zoom, cap, inclinaison — les mêmes que le bandeau, nommées par `labels.readout` |
| **Contenu affiché** | markers peints / au total, pastilles, formes, tracés, liens, dessins |
| **Rendu** | images par seconde, frames peintes, appels de rendu, triangles, textures, géométries, échelle de résolution |
| **Tuiles et mémoire** | tuiles en cache, en chargement, mémoire retenue, workers d'extrusion |

⚠️ **Tout est compté DANS LA VUE**, pas dans ce que l'hôte a posé. `markers au total` est la seule exception, et elle est là pour être comparée à `markers affichés` : c'est leur écart qui révèle un cull ou un regroupement qui ne fait pas son travail.

Chaque valeur se colore en vert, jaune ou rouge selon [`performance.statThresholds`](CONFIG.md) — une grandeur sans seuil reste incolore, car une latitude n'a pas de bonne valeur. Les teintes viennent de [`theme.colors.ui.stat`](THEME.md).

```tsx
// Dans sa propre surface, plutôt que dans le menu :
import { StatsPanel } from 'map3d'
;<StatsPanel sections={['render', 'tiles']} refreshMs={250} />
```

Comme `<CameraReadout>`, **il ne re-rend jamais** : il pose son DOM une fois et deux couches du moteur écrivent les cellules. Un panneau de performance rafraîchi par `useState` mesurerait ce qu'il a lui-même causé.


---

## 6. Carte figée (`interactive`)

```tsx
<Map interactive={false} />   // ou 'view', ou true (défaut)
```

| Mode | Caméra | Outils (dessin, loupe) | Clic carte | Markers |
|---|---|---|---|---|
| `true` | libre | actifs | émis | cliquables |
| `'view'` | **figée** | neutralisés | émis | cliquables |
| `false` | **figée** | neutralisés | supprimé | inertes |

`'view'` est l'aperçu qu'on consulte sans pouvoir le déplacer : la caméra ne bouge
plus, mais markers, sélection et infobulles restent vivants. `false` rend la carte
inerte.

Dans les deux cas, **les overlays continuent d'être rendus** — c'est une carte figée,
pas une capture d'écran — et un outil resté sélectionné retrouve son état intact au
dégel.

`interactive` fige la **carte**, pas votre UI : les contrôles de la lib restent
cliquables (ils vivent hors de la surface carte). Masquez ce qui n'a plus de sens :

```tsx
<Map interactive={false} controls={{ buttons: { zoomIn: false, zoomOut: false, tilt: false, globe: false } }} />
```

Équivalent impératif : `engine.setInteractive(mode)`, lecture par
`engine.interactive`.

---

## 7. Fond de carte

Deux fonds, plus un calque :

| | Source | Quota |
|---|---|---|
| **3D photoréaliste** | Google Photorealistic 3D Tiles, via `cesiumIonToken` (Cesium Ion) ou `googleMapsApiKey` (direct) | Cesium Ion, ou Google |
| **Plan 2D** | Google Map Tiles | **votre clé Google** |
| **Trafic** | calque du plan 2D | Google |

```tsx
<Map googleMapsApiKey={KEY} mapMode="plan" />   // ou "3d"
```

**Mode au démarrage.** Avec `googleMapsApiKey`, la carte **démarre en plan 2D** : plus
lisible pour lire des positions, et le tileset 3D n'est même pas requêté tant qu'on ne
bascule pas. `mapMode="3d"` démarre sur les tuiles photoréalistes ; sans clé Google,
`'3d'` est le seul mode possible et reste le défaut.

**Sans `googleMapsApiKey`, il n'y a pas de bascule 2D ↔ 3D** — le bouton « 3D » ne paraît
que si son mode de destination est servable, jamais inerte. Ce **bouton unique** (avec le
trafic) vit dans le **groupe boussole** : allumé en 3D, cliquer dessus éteint la 3D et
revient au plan, exactement comme l'ancien bouton « 2D ». Le bouton trafic n'apparaît qu'en
mode plan (seul mode où le calque existe), et repasser en 3D l'éteint : le moteur s'en
charge, `engine.getBasemap()` et l'event `basemap` en sont la source de vérité
(`{ mode, traffic, trafficAvailable }`).

**Globe de repli.** `fallbackGlobe` (défaut `true`) affiche un ellipsoïde uni quand
aucune tuile n'est disponible : la carte reste une carte même sans réseau ni token.

> ### ⚠️ Quota
>
> Le fond 2D consomme le quota **Map Tiles API de votre clé Google**, alors que la 3D
> via `cesiumIonToken` est servie par Cesium Ion : démarrer en 2D **déplace** le coût,
> il ne le supprime pas.
>
> Deux garde-fous côté lib : pendant un vol caméra (l'intro notamment) seuls les
> niveaux de base sont demandés, au lieu des onze niveaux traversés ; et une tuile en
> échec est réessayée avec du recul (1 s puis 4 s, trois essais) au lieu d'être
> abandonnée — un simple `429` laissait sinon des trous définitifs dans la carte.
>
> Si vous voyez des `429 Too Many Requests`, vérifiez aussi les quotas **par minute**
> du projet dans la console Google Cloud. Réglages : `config.providers.tiles`.

---

## 8. Les contrôles (`<MapControls>`)

```tsx
<Map controls={{ position: 'right' }} />
<Map controls={false} />
```

Boutons : `pan`, `rotate`, `compass`, `zoomIn`, `zoomOut`, `tilt`, `globe`, `graticule`,
`mode3d`, `plan`, `traffic`, `pedestrian`, `target`, `layers`, `fullscreen`.
Groupes : `drag`, `compass`, `zoom`, `pedestrian`, `target`, `layers`, `fullscreen`.

Le groupe `compass` réunit tout le **point de vue** : boussole (nord / vue du dessus),
inclinaison, bascule `mode3d`, trafic, retour au globe et grille — il n'y a plus de groupe
`view` ni `basemap` séparé. `mode3d` est une **bascule** : allumé en 3D, l'éteindre repasse au
plan 2D (plus de bouton « Plan » distinct). Grain fin : masquer `mode3d` coupe le retour à la
3D, masquer `plan` coupe le passage au plan (utile en fond externe pour verrouiller la 3D).

⚠️ `camera.maxTilt3d` et `camera.maxTilt2d` (tous deux 0,44π ≈ 79,2° par défaut) ne bornent
pas que la caméra : le **fondu du graticule** s'exprime en fraction de ce plafond. Les
resserrer déplace donc l'angle auquel la grille disparaît — cf.
[GRATICULE.md § 4](GRATICULE.md#4-comment-le-fondu-marche).

```tsx
// Grain GROUPE : masquer (false) ou remplacer (ReactNode)
<MapControls components={{ compass: false, zoom: <MonZoom /> }} />

// Grain BOUTON : son raccourci est désactivé avec lui ; un groupe vidé disparaît
<MapControls buttons={{ rotate: false, zoomOut: false, globe: false }} />
```

### Raccourcis

| Touche | Action |
|---|---|
| `N` | nord / vue du dessus |
| `+` / `−` | zoom avant / arrière |
| `I` | incliner |
| `G` | retour au globe |
| `B` | fond de carte : 3D ↔ plan |
| `T` | panneau « Couches » |
| `F` | plein écran |

```tsx
<MapControls shortcuts={{ layers: 'y', fullscreen: false }} />   // remappe / désactive
```

Lettres **seules** (pas de ⌘/Ctrl : les navigateurs réservent ⌘T/⌘N/⌘W…), identiques
Mac/PC, affichées dans les tooltips, ignorées pendant une saisie. Défauts sans
collision avec les outils de dessin — cf. `config.interaction.shortcuts.controls`.

### Bouton « revenir à la cible »

Un écran a souvent un point de référence — l'alerte consultée, l'événement en cours.
Fournir `target` ajoute un bouton qui y ramène ; l'omettre le retire. La carte n'a pas
à savoir ce que la cible représente, seulement où elle est.

```tsx
<MapControls
  target={{
    position: alerte.position,
    label: 'Revenir à l’alerte',   // défaut : labels.controls.target
    onlyWhenOutOfView: true,
    zoom: 16,                       // absent = altitude courante conservée
  }}
/>
```

`onlyWhenOutOfView` se réévalue sur l'event `viewport` (la vue **stabilisée**), pas à
chaque frame : inutile de tester pendant un vol, seule la vue posée compte.

---

## 9. Recettes

**Cadrer tout le contenu de la carte à l'ouverture**

```tsx
<Map onReady={() => {
  const b = unionBounds([boundsOfMarkers(agents), boundsOfShapes(zones)])
  if (b) camera.fitBounds(b, { padding: 80 })
}} />
```

**Piloter depuis l'extérieur, sans écrire de composant enfant**

```tsx
const map = useRef<MapHandle>(null)
<Map ref={map} … />
map.current?.camera.fitBounds(bounds, { padding: 60 })
```

**Reprendre la session de l'utilisateur** — `positionStorageKey`, et rien d'autre.

**Convertir un `PointerEvent` en lat/lng** —
`engine.pickLatLngAtClient(clientX, clientY, fallbackToEllipsoid?)`.

---

## Voir aussi

- [DATA.md](DATA.md) — recharger les données au déplacement
- [ZONES.md](ZONES.md) — cadrer sur une zone
- [ENGINE.md](ENGINE.md) — events, projection, interception de pointeur
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [THEME.md](THEME.md)

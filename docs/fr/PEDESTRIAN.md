# Mode piéton — marche au sol et immersion première personne

**Français** · [English](../en/PEDESTRIAN.md) · [↑ Index](README.md)

Un troisième pilote de la caméra, à côté du vol (`flyTo`) et du suivi (`follow`) : la
marche à hauteur d'homme. La caméra descend au niveau de la rue, gagne un déplacement
au clavier, une collision et une gravité, et perd l'orbite façon Google Earth le temps
d'y être.

Il faut du **volume raycastable à l'écran** — tuiles 3D photoréalistes ou bâtiments
extrudés du fournisseur interne — jamais le mode plan : un fond 2D n'a pas de relief à
parcourir à hauteur d'homme.

---

## 1. En deux minutes

Le mode piéton est **déjà dans la barre** dès que la 3D est disponible : un bouton dans
le groupe boussole, touche `W` par défaut.

```tsx
<Map cesiumIonToken={TOKEN} center={PARIS} zoom={17} controls={{}} />
{/* bouton « Mode piéton » (icône marche), visible dès que la 3D est servable */}
```

Équivalent programmatique :

```tsx
const pedestrian = usePedestrian()

pedestrian.state.available   // 3D servable ? (jamais en mode plan)
pedestrian.enterPlacement()  // arme le curseur : le clic suivant choisit le point de rue
pedestrian.exit()
```

---

## 2. Deux phases : viser, puis marcher

`enterPedestrianPlacement()` (ou le bouton) arme un **curseur de placement** —
`state.phase` passe à `'placing'`. Le curseur valide le point survolé en comparant la
surface visée au **niveau de rue** estimé sur une couronne d'échantillonnage autour du
clic : un toit domine la rue voisine de plusieurs mètres, une chaussée non.

- **Accepté** : `hitHeight - niveauDeRue <= maxRoofDeltaMeters` (2 m par défaut) — ou
  aucun impact du tout (sol nu, rien à raycaster : c'est le cas normal du fournisseur
  interne, où seuls les bâtiments sont des volumes).
- **Refusé** : le point domine trop la rue (un toit), ou le sol lui-même est
  indéterminé (aucune tuile chargée sous le clic).

La validation est **mémoïsée** (`placement.refreshMs`, 33 ms, et `refreshSlopPx`, 3 px) :
sans ça, `pointermove` saturerait la boucle de rendu avec une dizaine de raycasts par
pixel visé. Le curseur change de forme en direct (`m3d-pedestrian-ok` /
`m3d-pedestrian-blocked`, couleurs de `theme.colors.pedestrian` — cf. § 10).

Un clic sur un point invalide est **ignoré sans quitter le mode** : le curseur reste
« interdit » et vous visez ailleurs. Un clic valide fait passer `state.phase` à
`'active'` — vous marchez.

Entrer directement, sans curseur, à un point déjà connu :

```ts
const ok = pedestrian.enter({ lat, lng })   // false si le point n'est pas posable
```

---

## 3. `usePedestrian()` et `MapHandle.pedestrian`

```ts
const pedestrian = usePedestrian()   // ou map.current?.pedestrian
```

| Membre | Rôle |
|---|---|
| `state` | `PedestrianState` réactif — re-rend le consommateur à chaque changement |
| `enterPlacement()` | arme le curseur de placement |
| `enter(p)` | entre directement à un point ; `false` s'il n'est pas posable |
| `exit()` | quitte le mode, rend la main à l'orbite |
| `setImmersion(level)` | bascule `'explore'` ↔ `'full'` (cf. § 5) |

`PedestrianState` :

| Champ | Rôle |
|---|---|
| `mode` | `'orbit'` \| `'pedestrian'` |
| `phase` | `'placing'` (curseur armé) \| `'active'` (on marche) |
| `immersion` | `'explore'` \| `'full'` |
| `available` | le mode est-il proposable **maintenant** ? |
| `heading` | cap réel (rad), `0` = nord — `Camera.getState()` le rend à `0` en dur, il faut ce champ pour en savoir quelque chose en première personne |
| `pitch` | regard vertical réel (rad), `0` = horizon |

**Disponibilité** — `available` est vrai **uniquement** en mode 3D servable (tuiles
photoréalistes externes ou volume extrudé interne, même règle que la bascule 3D ↔ plan
des contrôles) : jamais en mode plan. Elle se republie à chaque bascule de fond, y
compris au premier montage. Le mode se **referme de lui-même** si la carte cesse d'être
3D pendant qu'on marche (changement de fournisseur, retour au plan) — inutile de
l'écouter pour ça, `state.mode` suit.

L'objet `state` est **stable** tant que rien ne change réellement (même patron que
`BasemapState`) : un consommateur React peut le mettre en état sans se re-rendre à
chaque frame de marche.

---

## 4. Marcher

Les touches sont celles du **déplacement caméra**, partagées avec le pan clavier de
l'orbite (`interaction.shortcuts.navigate`) :

| Touche | Action |
|---|---|
| `↑` `↓` `←` `→`, ou `Z` `S` `Q` `D` | avancer / reculer / dériver, dans le repère de la **rue** (le plan tangent), jamais celui de la ligne de visée |
| `Maj` (maintenu) | accélérer — `walkSpeed × sprintFactor` |

Deux touches à la fois (diagonale) ne vont pas plus vite qu'une seule — le déplacement
est normalisé. La vitesse est `pedestrian.walkSpeed` (5 m/s par défaut, largement
au-dessus de la marche réelle pour que le décor défile à un rythme lisible à hauteur
d'homme), multipliée par `sprintFactor` (2) touche `Maj` maintenue.

**Collision** — un éventail de `collision.feelers` rayons horizontaux (6 par défaut,
répartis symétriquement de −90° à +90° autour de la direction de marche, jamais
derrière : on ne peut pas entrer dans un mur qu'on quitte) sonde jusqu'à
`collision.radiusMeters + collision.feelerMarginMeters` devant vous. La composante du
déplacement qui **entre** dans un mur est retirée, la tangente conservée : vous longez
la façade au lieu de vous y coller — annuler tout le déplacement au moindre frôlement
rendrait la marche en ville insupportable.

**Marches et pentes** — une montée de plus de `collision.maxStepHeightMeters` (0,4 m)
en un pas est un **mur** (vous ne montez pas) ; une montée plus faible (trottoir,
marche) passe. La **descente**, elle, n'est jamais bornée : une pente, un escalier ou
un trottoir qu'on quitte se suivent vers le bas sans limite.

**Gravité** — un seul rayon descendant par frame (pas la couronne à ~9 rayons du
placement, réservée à l'entrée), lissé sur `groundSmoothing` secondes (0,25 s par
défaut) pour que le raffinement des tuiles ne fasse pas sautiller l'œil. Sur le
fournisseur **interne**, la chaussée est une nappe plate délibérément non raycastable :
la gravité retombe alors sur un sol analytique connu (aucun rayon nécessaire), sans quoi
elle resterait inerte dès qu'aucun bâtiment n'est sous les pieds. Un sol totalement
indéterminé (aucun repli disponible) **garde la hauteur précédente** plutôt que de faire
tomber la caméra.

---

## 5. Regarder

En immersion `'explore'`, le regard suit un **glisser bouton gauche enfoncé** sur la carte
— exiger le bouton est ce qui garde markers et symboles cliquables, un clic « propre »
restant un clic carte. En immersion `'full'`, la souris étant **capturée** (Pointer Lock),
le regard suit chaque mouvement **sans bouton** — la vue FPS classique.

- `lookSpeed` (0,15°/px par défaut) règle la sensibilité.
- `invertY` (`true` par défaut) et `invertX` (`false`) inversent chaque axe
  séparément, dans les DEUX immersions. Le défaut vertical suit la convention du **glisser
  de carte** (« attraper la scène » : tirer vers le bas relève la vue, comme le pan de
  l'orbite) et non celle d'un FPS — un adepte de la convention FPS passe `invertY: false`.
- `pitchMaxDeg` (89° par défaut) borne le regard vertical : à 90° pile, le repère de la
  caméra dégénère.

**Deux niveaux d'immersion** (`state.immersion`, piloté par `setImmersion`) :

| Niveau | Sens |
|---|---|
| `explore` (défaut) | souris visible, menus actifs — le regard suit le glisser décrit ci-dessus |
| `full` | immersion totale : **vrai plein écran** navigateur + **Pointer Lock** (souris capturée, regard libre sans bouton), barres de contrôle **masquées**, **réticule** central de visée et rappel « Échap pour quitter » |

**C'est le PLEIN ÉCRAN qui gère l'immersion.** En mode piéton, le bouton **plein écran** de
la barre (libellé « Immersion totale ») déclenche l'immersion : la lib passe en **vrai plein
écran** (`requestFullscreen`, le chrome du navigateur disparaît), masque ses barres et engage
le **Pointer Lock**. Il n'y a donc **pas de bouton flottant** au milieu de l'écran.

- **Entrer** : bouton plein écran (ou `F11`, ou `interaction.shortcuts.pedestrian.immersion`
  si une touche est configurée — cf. § 8). Le clic/appui est le geste utilisateur qu'exige
  `requestPointerLock` ; le verrou est engagé une fois le plein écran effectif.
- **Sortir** : **quitter le plein écran** (`Échap`, `F11`, ou re-bascule) **quitte le mode
  piéton** — retour à l'orbite. Un seul `Échap` suffit (il relâche le verrou puis le plein
  écran, ce qui sort du mode).

> Le réticule prend la couleur `theme.colors.pedestrian.reticle` ; le masquage ne cache que
> les **barres de contrôle**, jamais la scène ni les markers (le vrai plein écran, lui, retire
> le chrome du navigateur — les deux se cumulent). `setImmersion` reste appelable par l'hôte,
> et arme alors le vrai plein écran de la même façon.

---

## 6. Vue mémorisée

L'API impérative du moteur accepte un **regard mémorisé** (`{ heading, pitch }`,
radians) à l'entrée, au lieu de reprendre l'azimut de la caméra qu'on quitte — c'est ce
qui rend une vue piéton **restituable** telle qu'on l'avait laissée. Sans lui, le cap
initial reprend l'axe de visée courant projeté au sol, pour ne pas désorienter
l'utilisateur au moment de la plongée.

```ts
import { captureView, applyView } from 'map3d'

const vue = captureView(engine)           // pose caméra + fond + tags + vue piéton, si active
applyView(engine, vue, { duration: 1.2 }) // 0 ou omis = instantané ; toujours instantané si `vue.pedestrian`
```

C'est le mécanisme qu'emploie le gestionnaire de **templates** pour sauvegarder « vu
depuis la rue, cap sud » avec un dessin (cf. [TEMPLATES.md](TEMPLATES.md)) :
`captureView` lit la pose piétonne courante (position, cap, tangage) et le niveau
d'immersion ; `applyView` quitte d'abord un mode piéton en cours, puis, si la vue en
mémorisait un, y rentre au point exact avec le regard restitué — jamais la hauteur de
sol, remesurée par raycast à chaque restitution pour ne pas vieillir avec les tuiles.
Appliquer une vue qui n'est pas piétonne **referme le mode** de lui-même.

---

## 7. Ce qui change sur la carte pendant la marche

**Vue et brouillard** — le plan lointain de la caméra se cale sur
`viewDistanceMeters` (1000 m par défaut) : au-delà, le frustum culling coupe les
tuiles, qui ne sont donc **jamais demandées**. Le brouillard démarre à
`fogStartMeters` (700 m) et finit toujours à `viewDistanceMeters`, pour dissoudre la
coupure au lieu de laisser une frange nette à l'horizon.

Cette même distance **borne aussi les markers** : un overlay DOM garde sa taille écran
quelle que soit la distance à la caméra, si bien qu'une alerte à 700 km s'afficherait
sur la ligne d'horizon au même gabarit qu'une toute proche. Un marker cesse d'être
affiché là où le décor cesse de l'être — jamais au-dessus du vide (cf.
[MARKERS.md](MARKERS.md) pour le déclutter à hauteur d'homme, seul mécanisme qui
subsiste au ras du sol).

**Détail des tuiles** — `tileDetailDistanceMeters` (120 m par défaut) est la distance
de référence du niveau de détail, et non la distance caméra → sol : à hauteur d'homme
celle-ci vaut 1,70 m, ce qui réclamerait le zoom maximal sur tout l'horizon. On
raisonne donc sur ce qu'on regarde réellement (le bout de la rue), pas sur ses pieds.
La couverture est rafraîchie au plus une fois par `tileRefreshMs` (250 ms, ~4 Hz) — la
reconstruire à chaque frame ne servirait à rien, le décor n'a pas bougé d'un pas entre
deux passes (cf. [TILES.md](TILES.md)).

**Formes drapées** — zones, tracés et liens de relation cessent de se dessiner
par-dessus le décor : ils testent la profondeur comme le reste de la scène, pour rester
occultables par le bâti à hauteur d'homme (cf. [ZONES.md § 3](ZONES.md#3-le-drapage)).

---

## 8. Dans l'interface

Le bouton vit dans le **groupe `pedestrian`** des contrôles de vue, à côté du bouton
« Globe » — masqué (et non grisé) quand le mode n'est pas servable, comme tous les
boutons de cette barre :

```tsx
<Map controls={{ buttons: { pedestrian: false } }} />   // pour le retirer
```

Son libellé bascule entre `labels.controls.pedestrian` (« Mode piéton ») et
`labels.controls.pedestrianExit` (« Quitter le mode piéton ») selon `state.mode`.

**Raccourcis** — l'entrée dans le mode est un bouton de barre, donc sa touche vit avec
les autres contrôles (`interaction.shortcuts.controls.pedestrian`, `W` par défaut) :

```tsx
<MapControls shortcuts={{ pedestrian: 'e' }} />
```

En mode piéton, le **bouton plein écran** (`interaction.shortcuts.controls.fullscreen`, `F`
par défaut) prend le libellé « Immersion totale » et déclenche le vrai plein écran immersif
(cf. § 5) — c'est le déclencheur principal. La bascule d'immersion dédiée
(`interaction.shortcuts.pedestrian.immersion`) reste un raccord secondaire : sans touche par
défaut (`false`), lui en attribuer une arme la même immersion (le `keydown` étant un geste
utilisateur, il engage le vrai plein écran + le Pointer Lock) :

```tsx
<Map config={{ interaction: { shortcuts: { pedestrian: { immersion: 'v' } } } }} />
```

---

## 9. Réglages (`config.pedestrian`)

### Vue et déplacement

| Clé | Défaut | Rôle |
|---|---|---|
| `eyeHeightMeters` | `1.7` | hauteur de l'œil au-dessus du sol |
| `walkSpeed` | `5` | vitesse de marche (m/s), indépendante de l'altitude |
| `sprintFactor` | `2` | multiplicateur pendant `Maj` maintenu |
| `lookSpeed` | `0.15` | sensibilité du regard (°/px souris) |
| `invertY` | `true` | inverse l'axe vertical (défaut = convention du glisser de carte) |
| `invertX` | `false` | inverse l'axe horizontal |
| `pitchMaxDeg` | `89` | borne du regard vertical |
| `viewDistanceMeters` | `1000` | distance de vue — borne le `far`, les tuiles demandées et l'affichage des markers |
| `fogStartMeters` | `700` | début du brouillard (finit toujours à `viewDistanceMeters`) |
| `nearMeters` | `0.1` | plan proche de la caméra |
| `groundProbeMeters` | `5` | portée du rayon de sol sous les pieds |
| `tileDetailDistanceMeters` | `120` | distance de référence du niveau de détail des tuiles (celle qu'on regarde, pas celle de ses pieds) |
| `tileRefreshMs` | `250` | période minimale entre deux mises à jour de la couverture de tuiles |
| `groundSmoothing` | `0.25` | constante de temps (s) du lissage vertical de l'œil |

### Collision (`collision`)

| Clé | Défaut | Rôle |
|---|---|---|
| `radiusMeters` | `0.3` | demi-largeur du corps |
| `feelers` | `6` | rayons horizontaux en éventail autour de la direction de marche |
| `feelerMarginMeters` | `0.2` | longueur des palpeurs en plus du rayon |
| `maxStepHeightMeters` | `0.4` | montée franchissable d'un pas ; au-delà, un mur |

### Placement (`placement`)

| Clé | Défaut | Rôle |
|---|---|---|
| `maxRoofDeltaMeters` | `2` | écart max toléré entre la surface visée et le niveau de rue |
| `ringRadiusMeters` | `20` | rayon de la couronne d'échantillonnage du sol |
| `refreshMs` | `33` | période minimale entre deux validations du curseur |
| `refreshSlopPx` | `3` | déplacement en deçà duquel la validation précédente est réutilisée |

### Balancement de la marche (`headBob`)

Effet de balancement de la caméra au rythme du pas, **désactivé par défaut**.

| Clé | Défaut | Rôle |
|---|---|---|
| `enabled` | `false` | active l'effet |
| `amplitudeMeters` | `0.05` | amplitude verticale |
| `frequency` | `1.8` | oscillations par seconde à vitesse de marche nominale |

### Transitions (`transitions`)

La caméra **glisse** du ciel à la rue à l'entrée, et remonte à sa pose orbitale de départ à
la sortie. Mettre une durée à `0` rétablit le saut instantané.

| Clé | Défaut | Rôle |
|---|---|---|
| `enterMs` | `800` | durée de la plongée à l'entrée (`0` = instantané) |
| `exitMs` | `600` | durée de la remontée à la sortie (`0` = instantané) |

---

## 10. Thème (`theme.colors.pedestrian`)

| Clé | Défaut | Rôle |
|---|---|---|
| `placeValid` | `#2E7CF6` | cible affichée quand le point visé est une rue posable |
| `placeBlocked` | `#d11a01` | cible barrée quand le point visé est un toit ou le ciel |
| `reticle` | `#f8fafc` | réticule central de l'immersion totale |

Sous-arbre **optionnel** : un thème complet écrit avant son ajout reste valide, la
couche retombant sur ses propres replis (`ui.accent`/`ui.error`/`ui.text`).

---

## 11. Ce qui est exporté

| Export | Rôle |
|---|---|
| `usePedestrian()` | hook réactif — cf. § 3 |
| `PedestrianApi` | type de retour du hook, et de `MapHandle.pedestrian` |
| `CameraMode` | `'orbit'` \| `'pedestrian'` |
| `PedestrianPhase` | `'placing'` \| `'active'` |
| `ImmersionLevel` | `'explore'` \| `'full'` |
| `PedestrianState` | cf. § 3 |
| `PedestrianConfig`, `PedestrianCollisionConfig`, `PedestrianPlacementConfig`, `PedestrianHeadBobConfig`, `PedestrianTransitionsConfig`, `PedestrianShortcuts` | types de `config.pedestrian` — cf. § 9 |
| `TemplatePedestrianView` | vue piéton mémorisée par un template (`{ heading, pitch, lat, lng, immersion }`) — cf. [TEMPLATES.md](TEMPLATES.md) |
| `captureView(engine)`, `applyView(engine, view, opts?)` | mémoriser / restituer une vue complète, pédestre comprise — cf. § 6 et [TEMPLATES.md](TEMPLATES.md) |

---

## Voir aussi

- [CAMERA.md](CAMERA.md) — les deux autres pilotes de la caméra (`flyTo`, `follow`)
- [TILES.md](TILES.md) — fournisseurs de tuiles, niveau de détail en marche
- [ZONES.md](ZONES.md) — test de profondeur des formes drapées au ras du sol
- [MARKERS.md](MARKERS.md) — déclutter à hauteur d'homme
- [TEMPLATES.md](TEMPLATES.md) — sauvegarder une vue piéton avec un dessin
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [THEME.md](THEME.md) · [LABELS.md](LABELS.md)

# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
La lib suit le [versionnage sémantique](https://semver.org/lang/fr/) à partir de la 1.0.0 ;
en `0.x`, une version mineure peut casser l'API — les ruptures sont listées ici.

## [Non publié]

### Signature « map3D » (attribution)

Une signature **« map3D »** est désormais apposée en **bas à droite** de la carte, liée au
dépôt et à sa licence. Elle est **peinte dans le canvas WebGL** (après le rendu de la carte,
dans `MapEngine.tick`) : insensible au CSS et au DOM de l'hôte, elle ne se masque pas par
`display:none` ni par retrait d'un nœud. Un doublon DOM transparent (`WatermarkLink`) pose
par-dessus la seule **zone de clic** vers le dépôt — le masquer n'ôte que le clic, jamais les
pixels. Conforme à la mention requise par la licence **PolyForm-Noncommercial**.

- **Montée automatiquement par `<Map>`**, affichée par défaut. Le **contenu** (texte, URL,
  style) reste hors `config`/`theme`/`labels` à dessein — un réglage surchargeable serait un
  vecteur de suppression de l'attribution.
- **`config.watermark.enabled`** (défaut `true`) coupe la signature (marque peinte + lien) —
  interrupteur **réservé aux clients sous licence commerciale** ; sous PolyForm-Noncommercial,
  la retirer viole la licence. Type public `WatermarkConfig`.
- Coût par frame : un seul quad texturé (`depthTest:false`), zéro allocation.

### Publication npm

- Le paquet est renommé **`@pasquelin/map3d`** (l'unscoped `map3d` est déjà pris sur npm).
  Import : `import { … } from '@pasquelin/map3d'`.
- Publication **automatisée** : un tag `vX.Y.Z` (via `npm version`) déclenche le workflow
  `.github/workflows/release.yml` (valide, build, `npm publish --provenance`). Requiert le
  secret repo `NPM_TOKEN`.

### Grille de coordonnées (graticule)

Parallèles et méridiens drapés sur le globe, à **maille adaptative** sur l'échelle
sexagésimale d'un atlas (30° en vue globe → 1″ en vue rue), avec les lignes remarquables
nommées (Équateur, tropiques, cercles polaires, méridien d'origine, 180ᵉ) et leurs étiquettes
de coordonnées. Elle **s'estompe en fondu** quand la vue s'incline au-delà de ce qu'une grille
supporte — bande exprimée en fraction du plafond d'inclinaison du mode, parce qu'il vaut 79,2°
en volume mais 36° en carte plate.

Guide : [docs/fr/GRATICULE.md](docs/fr/GRATICULE.md) · [EN](docs/en/GRATICULE.md).

**Ajouts**

- `<GraticuleLayer />` (**monté automatiquement par `<Map>`** — l'hôte n'a rien à placer dans
  les enfants ; le composant reste exporté pour un montage impératif sans `<Map>`),
  `useGraticule()`, `MeasureToolButton`, types `GraticuleConfig` / `CoordFormat` / `MeasureTool`.
- Moteur : `engine.setGraticuleVisible()` / `getGraticuleVisible()` / `setGraticuleMounted()`
  et l'event `graticule`. L'état vit là parce que trois commandes le pilotent.
- `config.graticule` (30 réglages), `theme.colors.graticule` (optionnel, repli sur le thème
  par défaut), `labels.measureTools` et `labels.graticule`.
- `config.style.zIndex.graticuleLabel`, `interaction.shortcuts.controls.graticule` (`K`) et
  `labels.controls.graticule`.
- `core/math` : `smoothstep` et `approach` (lissage exponentiel indépendant de la cadence),
  extraits pour cesser d'être réécrits à chaque site de fondu.

**Ruptures**

- L'outil **Règle** de la barre de dessin gagne un **sous-menu** (`<Toolbar measureTools>`,
  nouvelle section `'measure'` dans `components`). Il ne compte qu'une rangée aujourd'hui, donc
  il ne s'ouvre pas et le bouton agit directement — le châssis est en place pour la suivante.
- Nouveau bouton `graticule` dans le groupe `view` de `<MapControls>` : c'est de LÀ que la
  grille se pilote, et non de la barre de dessin, qui se replie sous le zoom 11 — précisément
  là où la grille sert le plus. `buttons={{ graticule: false }}` le retire.
- Un thème ou un jeu de libellés **complet** écrit à la main doit fournir les nouvelles clés
  (`labels.measureTools`, `labels.graticule`) ; `theme.colors.graticule` reste optionnel.

**Correctifs au passage**

- `Dropdown` : un panneau ouvert allume désormais toujours son bouton (`active || open`) — le
  filtre de tags était le seul menu de la barre à ne pas le faire.
- Templates : les tags des formes d'un template chargé sont **révélés** si un filtre
  « Couches » actif les masquait (`TagFilter.add()`).

### Performance — ne peindre que ce qui change

Chantier mesuré de bout en bout : le moteur ne consommait qu'~1 ms de JS par frame sur un
budget de 8,3 ms, et repeignait pourtant une image identique 60 fois par seconde. Ce qui
coûtait était ailleurs — la traversée du tileset par le renderer d'overlays, la remontée
des matrices par marker, les raycasts de sol redemandés à chaque frame.

- **Rendu à la demande** (`performance.renderOnDemand`, actif par défaut). La boucle
  continue de tourner — les couches avancent, les tuiles arrivent, les gestes répondent —
  mais les deux passes de RENDU sont sautées tant que rien n'a changé. Une couche signale
  son travail en cours par `ctx.invalidate()`, l'hôte par `MapEngine.invalidate()`, et un
  filet (`maxIdleMs`, 1 s) borne le prix d'un mouvement que personne n'aurait signalé.
  ⚠️ Un hôte qui écrit **directement** dans la scène three.js doit appeler `invalidate()`,
  ou couper le réglage.
- **Résolution adaptative** (`performance.adaptiveResolution`). Sous la cadence visée, le
  canvas est peint à moins de pixels et remonte dès que la carte respire : c'est le seul
  levier qui rende du temps GPU en proportion — diviser le ratio par deux, c'est diviser
  par quatre les pixels à remplir. La charge est mesurée sur l'intervalle entre frames, la
  seule grandeur qui voie un GPU saturé.
- **Overlays sortis du tileset.** Les markers vivaient sous `tiles.group` : le
  `CSS2DRenderer` traversait le tileset photoréaliste entier, deux fois par frame, pour
  trouver quelques dizaines de nœuds. Ils ont désormais leur propre scène, dont les
  matrices descendent UNE fois par frame, et une caméra jumelle porte l'élargissement
  near/far (`performance.overlayDepth`) au lieu de déborner celle du rendu.
- **Niveau de rue mémoïsé** (`Projection.sampleGroundHeightCached`,
  `performance.groundSample.cacheMaxCells`). Un appel coûte neuf raycasts BVH, et la pose
  des markers en réclamait un par marker et par frame. `Camera` y remplace son cache maison
  à une entrée, qui était aveugle aux changements d'époque.
- **Compteurs de rendu** : `MapEngine.stats()` (type `MapStats`) — appels de rendu,
  triangles, mémoire, overlays suivis, part de frames réellement peintes et résolution
  courante. De quoi juger une optimisation au lieu de la supposer.
- `performance.powerPreference` (défaut `'high-performance'`) réclame le GPU dédié : sur un
  portable à double carte, le défaut du navigateur laissait volontiers la 3D plein écran
  sur le circuit intégré.

### Corrigé

- **Le zoom de `MapView` suivait l'altitude, pas l'échelle perçue.** `altitude =
  distance × cos(tilt)` : s'incliner la faisait chuter sans que rien ne change à l'écran, et
  le zoom grimpait d'autant — mesuré, 14,75 à plat contre 18,46 à 85°, de quoi franchir
  `clustering.maxZoom` et éteindre tous les regroupements. Il dérive maintenant de la
  distance au point visé. Affecte les clusters, le décor `static` et l'événement `viewport`.
- **Markers masqués en vue rasante.** Le cull lisait « derrière la caméra » sur `z > 1` en
  NDC, qui signifie aussi « au-delà du far » — que le mode piéton resserre à la distance de
  vue. Le verdict se prend désormais sur le sens de visée, qui ne dépend d'aucune borne de
  profondeur. Au ras du sol, l'occlusion par l'horizon (qui masquait tout marker posé plus
  haut que les yeux, donc tous les toits) cède la place à la portée de vue.
- **Markers posés sur les toits sous fournisseur interne.** Le sol y est une nappe raster
  plate et non raycastable : échantillonner ne ramenait que des toits. Le court-circuit
  analytique, jusque-là réservé au placement piéton, vit maintenant dans `Projection` — une
  seule porte pour tous les consommateurs du niveau de rue.
- **Calottes polaires** (`providers.tiles.fillPoles`, défaut `true`). Web Mercator s'arrête
  à ±85,0511° : il restait à chaque pôle une calotte de ~550 km de rayon où affleurait la
  sphère de repli, soit un disque couleur d'océan au milieu de l'Antarctique. Les tuiles de
  la rangée extrême portent désormais une ligne de sommets posée AU pôle, à la coordonnée de
  texture du bord — sans requête ni texture supplémentaire.

### ⚠️ Correctifs de mémoire et de collision (revue avant publication)

Quatre défauts trouvés en relecture du volume interne, dont deux qui se voyaient à l'écran.

- **Fuite de mémoire GPU et bâtiments fantômes.** Les deux calques tuilés gardaient la
  garde de fin de chargement sur la présence de la **clé**, pas sur l'identité de la tuile.
  Une tuile évincée pendant son chargement, puis redemandée, réapparaissait sous un objet
  neuf ; le chargement de l'ancienne trouvait alors sa clé occupée, se croyait vivant, et
  montait son mesh sur un objet que plus rien ne référençait — hors du cache, donc jamais
  masqué, jamais évincé, jamais libéré. Un bloc de bâtiments figé au mauvais endroit et ses
  ~5 Mo, à chaque occurrence.
- **Volumes masqués toujours raycastés.** `Raycaster` de Three ne teste **pas** `visible` :
  masquer un groupe ne le retire pas du chemin des rayons. En mode plan avec volume interne
  — la configuration par défaut —, les arbres de collision des bâtiments cachés restaient
  donc sur le trajet des trois rayons par frame : la garde caméra s'arrêtait sur des toits
  invisibles, et un clic sur la carte plate rendait le point d'impact d'un toit au lieu du
  sol, décalé de toute la parallaxe. Les deux calques sortent désormais du graphe quand ils
  sont masqués.
- **Le budget mémoire ne bornait rien.** `maxTiles` compte des tuiles, or ce que retient
  une tuile de volume va de un à cent entre la campagne et un centre-ville : les 36
  autorisées pouvaient peser 175 Mo. `providers.buildings.maxBytes` (256 Mio) et
  `providers.tiles.maxBytes` (256 Mio) bornent la mémoire réelle — tampons GPU **et** arbre
  de collision, que `geometry.dispose()` ne connaît pas.
- **Hauteurs aberrantes.** La hauteur venait brute de la donnée ; `height=99999`, faute de
  saisie courante dans OSM, produisait un bâtiment de cent kilomètres, dont l'englobant
  gardait la tuile visible en permanence. `providers.buildings.maxHeight` (1000 m) la borne.

#### L'aplat uniforme au loin, la vraie cause

La cascade de détail s'arrêtait au niveau `covering` — celui qui couvre toute la vue dans
le budget — et ce niveau-là n'était demandé **que sur l'emprise**. Or l'emprise est déduite
de raycasts sur l'ellipsoïde : à l'horizon, le rayon rase la surface et elle s'arrête bien
avant ce que l'œil voit. Passé cette limite, plus aucun niveau intermédiaire n'était
demandé — seulement le niveau de base, dont **un texel étiré couvre des centaines de
kilomètres**. D'où la bande uniforme qui restait au ras du ciel, exactement là où la
cascade croyait n'avoir plus rien à combler.

Les anneaux descendent désormais jusqu'au niveau de base, sans dépendre de la justesse de
l'emprise. `providers.tiles.maxTiles` passe de 500 à 700 en conséquence : sous l'ancien
plafond, ces niveaux grossiers se faisaient évincer par les tuiles fines aussitôt demandés.
Le coût reste modeste — un anneau de 5 tuiles porte déjà 25 000 km à z3, et les niveaux
grossiers sont chargés une fois puis resservis toute la session.

#### Une seule file de tuiles

`core/TileQueue` réunit présence, concurrence, backoff, éviction LRU et annulation, pour le
fond raster comme pour le volume. Les deux calques en portaient chacun leur copie — `pump`
et `retryOrFail` identiques mot pour mot, `evict` à une constante près : c'est ainsi que le
défaut d'identité ci-dessus existait en deux exemplaires. La file se teste seule, sans WebGL.

- **Chargements annulables.** Une tuile évincée en cours de route interrompt son
  téléchargement, côté réseau comme côté worker (message d'abandon). Une navigation rapide
  laissait sinon la file entièrement occupée à extruder des tuiles déjà sorties de la vue.
- **Montage étalé** — `mountPerFrame` (1 pour le volume). Développer les couleurs et
  construire l'arbre de collision restent sur le thread principal : `MeshBVH` dépend de
  three, et l'embarquer dans le worker y tirerait le moteur entier. Deux tuiles qui
  aboutissaient dans la même frame additionnaient donc leurs ~20 ms en un gel franc.
- **Positions quantifiées** — `positionPrecision` (`'int16'` par défaut). Les mètres locaux
  deviennent des entiers normalisés : **deux fois moins d'octets** sur le plus gros tampon,
  pour ~4 cm de résolution — sous la précision de la donnée OSM. `'float32'` reste
  disponible. (three-mesh-bvh gère nativement un attribut normalisé, ce qu'un test
  verrouille.)
- **Un matériau partagé** au lieu d'un par tuile, et l'ombrage arrondi plutôt que tronqué
  sur huit bits — le demi-pas perdu se voyait en banding sur les grandes façades sombres.

#### `can3d` enfin appliqué

Publié, documenté et testé, il n'était **lu nulle part** : la barre proposait le bouton
« 3D » dès qu'un fond plat était servable. Un hôte en fond interne sans tileset
photoréaliste se voyait donc offrir un bouton qui, une fois cliqué, masquait le fond pour ne
rien mettre à la place. `canEnterMode(state, mode)` — exportée — est désormais la table de
vérité unique du rendu du bouton, de son raccourci **et** de `engine.setMapMode`, qui refuse
maintenant un mode vide dans les deux sens (le retour forcé vers `'3d'` était le seul traité,
et il laissait au passage le calque trafic allumé sous un mode qui ne le sert pas).

#### Réglages qui n'en étaient pas

Six valeurs de comportement ou d'apparence vivaient en littéraux : `theme.globe.buildingRoofLighten`,
`providers.internal.elevationEpsilon`, `providers.{tiles,buildings}.evictEvery` et
`evictSlack`. Toutes exposées, toutes réglables depuis le panneau de l'exemple.

#### Divers

- Le déplacement au clavier ne consomme plus que les **flèches** : consommer `z`/`q`/`s`/`d`
  sur `window` volait ces touches à l'application hôte partout dans la page.
- `setKeyNavEnabled(enabled, owner?)` compte les suspensions par demandeur : un consommateur
  qui se démonte ne rend plus les flèches à la caméra sous le nez d'un autre.
- `navAxis` n'alloue plus d'objet par frame.
- Le repli d'extrusion sur le thread principal (CSP sans `worker-src blob:`, worker
  interrompu) **le dit** une fois dans la console — c'était indiscernable d'une machine lente.

### Fournisseur de tuiles interne (serveur auto-hébergé)

Le fond de carte 2D pouvait venir d'un seul endroit : l'API Google Map Tiles, clé
obligatoire. `providers.tiles.provider` ouvre le choix — `'internal'` (votre serveur, simples URLs XYZ
sur `providers.internal.origin`, sans session, sans clé, sans quota) ou `'external'`
(Google). Voir
[docs/fr/TILES.md](docs/fr/TILES.md).

- **Le fond 2D ne dépend plus d'une clé Google.** Le calque tuilé était monté sous
  condition de `googleMapsApiKey` : le fond 2D restait donc indisponible pour TOUTE la
  session, et renseigner une origine interne à chaud n'y pouvait rien. Il est désormais
  toujours monté, et c'est sa source qui peut manquer.
- **Bascule à chaud.** Changer de fournisseur, d'origine, de style ou de densité remplace
  la source et vide le cache sans remonter la carte.
- `providers.tiles3d.provider` fait le même choix pour le **volume** (mode `'3d'`), et sur
  `'internal'` **aucun tileset photoréaliste n'est monté** — plus rien ne streame ni ne se
  facture chez le fournisseur externe, même si un token traîne dans la config.
- Deux valeurs codées en dur dans `TiledGlobeLayer` deviennent des réglages :
  `providers.tiles.baseZoom` (2) et `maxZoom` (22, qui était le plafond de Google roadmap).
- `providers.tiles.retina` demande les tuiles internes en `@2x`.

#### Capacités du fond de carte diffusées

`BasemapState` (événement `basemap`) gagne `canPlan` et `can3d`. La paire de boutons 2D/3D
ne change pas de comportement : elle reste proposée dès qu'un fond plat est servable — clé
Google **ou** origine interne — et bascule carte ↔ volume quels que soient les fournisseurs
des deux côtés. Seul le **bouton trafic** disparaît hors fournisseur externe : le trafic est
une propriété de la tuile Google, pas une surcouche, et `setTrafficVisible(true)` est un
no-op quand la source ne le sert pas. `engine.supportsBasemap2d` est conservé comme alias de
`canPlan`.

#### Volume interne — bâtiments extrudés depuis les tuiles vectorielles

`providers.tiles3d.provider = 'internal'` remplace les tuiles 3D photoréalistes par des
bâtiments reconstruits depuis les tuiles vectorielles du serveur : couche `building` du
schéma OpenMapTiles, hauteurs `render_height` / `render_min_height`, cours intérieures
percées, couleurs dans `theme.globe.buildingColor` / `buildingRoofColor`.

- Le fond raster **reste affiché** en mode `'3d'` interne : c'est lui que le relief
  déformera, et sans lui la bascule 3D donnait un écran vide.
- Aucun tileset photoréaliste n'est piloté dans ce mode — donc **aucune requête** vers
  Cesium ou Google, même avec un token configuré.
- Le décodeur MVT est chargé en **import dynamique**, comme le catalogue de symboles.
- Pas de drapeau `enabled` : `providers.tiles3d.provider` dit déjà d'où vient le volume.
- `@mapbox/vector-tile`, `pbf` et `earcut` deviennent des **dépendances déclarées**. Les
  deux premières étaient importées sans figurer dans `package.json` : elles ne
  fonctionnaient que par la remontée d'une dépendance transitive, à une version qui se
  trouvait avoir l'export attendu. `pbf` passe en 5.x (`PbfReader` remplace l'export par
  défaut).

#### Performance du volume interne

La première version rendait la carte inutilisable dès que le volume interne était affiché
— et, à cause du choix de la cible de rayons, **aussi en mode plan**. Trois causes,
mesurées sur une vraie tuile z14 parisienne (52 000 sommets d'emprises, ~131 000
triangles) :

- **Les rayons de la carte tapaient dans une géométrie non accélérée.** Le groupe du
  `TilesRenderer` répond par la hiérarchie de volumes de ses tuiles ; la surface
  reconstruite localement, elle, n'était qu'un `THREE.Group` — Three testait chaque
  triangle et collectait TOUS les impacts avant de les trier. Or la carte lance trois
  rayons par frame (garde caméra de `GlobeControls`, suivi d'altitude, drapage des
  formes). Chaque tuile de bâtiments porte désormais un **BVH** (`three-mesh-bvh`, posé par
  instance — jamais en monkey-patch de `THREE.Mesh.prototype`) : **5,7 ms → 0,015 ms par
  rayon**. Effet de bord : `firstHitOnly`, posé depuis toujours par `Projection`, devient
  enfin effectif — c'est un drapeau three-mesh-bvh, que le raycast de Three ignore.
- **Le fond raster était devenu raycastable par accident.** Sous `TilesGroup`, ses tuiles
  ne l'étaient pas — le `raycast()` du groupe arrêtait la traversée. Les sortir de là a mis
  jusqu'à `maxTiles` meshes sans arbre sur le chemin de chaque rayon, dont les tuiles de
  base, dont la sphère englobante couvre un quart de globe : ~25 000 tests de triangles par
  frame, pour rien. Le fond et la sphère « océan » sont désormais explicitement insensibles
  aux rayons : ce sont des surfaces PLATES à hauteur connue, que `Projection.flatHeight` et
  le repli ellipsoïde rendent déjà analytiquement. Seuls les bâtiments sont un vrai volume,
  et eux portent un BVH.
- **L'extrusion gelait le thread principal.** Décodage et construction des tampons
  (~231 000 sommets) partent dans un **Web Worker**, empaqueté en blob autonome au build de
  la lib — rien à configurer côté hôte, aucun asset à servir. Sans `Worker` (rendu serveur,
  tests), le même code sert de repli sur le thread principal.

### Déplacement au clavier

Les flèches (et **ZQSD**) déplacent la carte tant qu'elles sont maintenues. Ce sont les
seuls raccourcis de la lib à agir en continu : les autres sont des commandes ponctuelles
déclenchées au `keydown`, ce qui ne peut pas rendre un mouvement — la vitesse dépendrait de
la cadence de répétition du système. L'état des touches vit donc dans le moteur
(`core/NavKeys`), et la boucle le consomme au prorata du temps écoulé.

- **Dans le repère de la VUE** : « tout droit » suit le SOL, jamais la ligne de visée —
  sinon on plonge dans le décor à 79° d'inclinaison. Tourner la vue tourne les touches
  avec elle.
- **Actif en mode rotation**, ce qui est tout l'intérêt : la souris fait pivoter, les
  flèches déplacent. Le clavier étant indépendant du pointeur, ça vient sans condition.
- **Vitesse proportionnelle à la hauteur au-dessus du sol** (`camera.keyPan.speed`, 0,8
  hauteur-sol par seconde ; `boost` ×3 avec Maj), comme `dragSpeed` pour la souris.
- Un vol programmé ou l'intro cèdent la main dès qu'une touche est enfoncée.
- Les flèches reviennent au **déplacement d'une sélection de dessin** dès qu'il y en a une :
  `<DrawLayer>` appelle `engine.setKeyNavEnabled(false)`, le moteur ne pouvant pas deviner
  un état qui appartient à cette couche.
- `blur` relâche tout : un changement d'onglet ne délivre pas le `keyup`, et la carte
  partait sinon en translation infinie au retour.

#### ⚠️ Rupture — la main levée passe de `D` à `H`

`interaction.shortcuts.draw.freehand` valait `'d'`, désormais pris par le déplacement. `'h'`
comme « main levée », et il était libre. Un test verrouille l'absence de collision entre les
deux tables. À rebasculer par la config si l'application n'active pas les lettres.

#### Anticipation du mode FPS

`GlobeControls` embarque déjà un mode vol complet — `enableFlight`, W/S/A/D/Q/E, Maj pour
accélérer, et une vitesse **déjà mise à l'échelle de la hauteur au-dessus du sol**
(`_getFlightSpeedScale`). Il ne conviendrait pas ici (il translate selon les axes propres de
la caméra, donc plonge dans le décor en vue inclinée ; il écoute son `domElement`, donc
exige le focus ; et ses touches sont câblées en dur, dont trois prises par le dessin), mais
c'est la base toute trouvée de la navigation FPS à venir.

D'où le découpage : `interaction.shortcuts.navigate` porte les LIAISONS, `core/NavKeys`
l'état et l'axe, `MapEngine.applyKeyNav` le seul modèle de déplacement. Le jour venu, seul
ce dernier change.

#### ⚠️ Cascade de détail du fond raster — fin de l'aplat uniforme au loin

Au loin, la carte devenait un aplat vert uniforme, franchement lisible comme un bug. Le
calque ne connaissait que **deux niveaux** : la base (`baseZoom`, 2) et UN niveau cible,
rabaissé jusqu'à ce que son compte de tuiles tienne sur l'emprise entière. Or en vue
inclinée l'emprise porte jusqu'à l'horizon : le niveau cible s'effondrait vers la base, et
tout ce que le cache ne couvrait pas déjà tombait d'un coup sur une tuile grande comme un
quart de continent.

`providers.tiles.lodRing` (**nouveau**, 5) introduit une vraie cascade : le niveau le plus
fin autour du point visé, puis un anneau à chaque cran plus grossier — chacun portant deux
fois plus loin — jusqu'au premier niveau qui couvre toute la vue. La dégradation devient
progressive, et il y a toujours quelque chose de plus net que la base.

- Le surcoût en requêtes est modeste : un niveau grossier couvre une immense surface, donc
  il est demandé une fois puis resservi toute la session. Seul le niveau le plus fin se
  renouvelle en se déplaçant.
- Le choix des niveaux est sorti en fonction pure, `lodLevels`, testée à part : c'est la règle
  qui décide de ce qu'on voit au loin.
- Les couronnes du fond ET du volume se centrent sur le sol sous le **centre de l'écran**
  (`MapEngine.aimPoint`), pas sous la caméra.

#### Couverture du bâti — deux correctifs et une limite de donnée

Au loin, la carte redevenait plate d'un coup, avec une frontière irrégulière. Ni near/far
ni LOD : deux bugs, plus une limite qui, elle, n'est pas corrigeable.

- **L'éviction ne s'est jamais déclenchée.** `update` montrait TOUTE tuile prête et la
  marquait « vue cette frame », sans regarder l'emprise. Or `evict` écarte justement les
  tuiles vues cette frame : la liste de candidates restait vide, `maxTiles` ne servait à
  rien, et le cache grossissait sans plafond. Ce qui avait été chargé ailleurs restait par
  ailleurs affiché — l'étendue du bâti était celle de l'historique de navigation, pas celle
  de la vue, d'où la frontière irrégulière. `TiledGlobeLayer` faisait bien ce test de vue ;
  `BuildingsLayer` l'avait perdu.
- **Le budget se dépensait derrière l'observateur.** La couronne de tuiles était centrée sur
  `view.center`, le point au sol sous la CAMÉRA. En vue inclinée à 79°, on regarde loin
  devant : elle vise désormais le sol sous le centre de l'écran (intersection analytique de
  l'ellipsoïde, gratuite par frame).
- **Portée** : `maxRequest` 9 → 25 (5×5 tuiles, ~8 km à Paris), `maxTiles` 24 → 36. Au-delà,
  le fond raster reste seul, et ce n'est pas un réglage timide : les attributs 3D du schéma
  OpenMapTiles n'existent qu'au `maxzoom`. Vérifié sur le serveur — z12 n'a pas de couche
  `building`, z13 en a une ~9× plus légère mais **sans aucun attribut**, donc sans hauteur.
  Il n'existe pas de niveau de détail lointain à moindre coût. Cf.
  [docs/fr/TILES.md § 5](docs/fr/TILES.md).

#### ⚠️ Plancher de descente — trois réglages de caméra qui ne faisaient rien

`camera.minZoom`, `camera.maxZoom` et `camera.minGroundClearance` étaient **déclarés,
documentés, et branchés nulle part** hors des vols programmés. Le seul garde-fou réel sur
la molette était le `cameraRadius` de `GlobeControls`, jamais réglé : **5 mètres**. On
descendait donc au ras du pavé, nez contre une façade, sans plus rien voir — et la
documentation de `maxZoom` promettait exactement l'inverse (« au-delà la caméra entre dans
le bâti 3D »).

- `camera.maxZoom3d` (**nouveau**, 18 ≈ 153 m au-dessus du sol) borne la descente en
  volume. Distinct de `maxZoom`, qui reste le plancher du mode plan : une carte plate se lit
  d'autant mieux qu'on s'en approche, un volume non. Même paire que `maxTilt3d` / `maxTilt2d`.
- Le plancher passe par `GlobeControls.minDistance`, qui borne la distance caméra ↔ **point
  visé** — donc juste aussi en vue inclinée, là où une borne d'altitude ne dirait rien.
- `minGroundClearance` alimente `cameraRadius` : la garde au sol vaut enfin pour la molette
  et le pan, pas seulement pour `flyTo`.
- `minZoom` et `maxDistanceFactor` bornaient le même éloignement en deux unités, l'un des
  deux étant ignoré. Le plus contraignant gagne désormais ; à valeurs par défaut inchangées,
  le dézoom ne bouge pas.
- Ces bornes dépendant du mode, `applyModeVisibility` rejoue `applyCameraLimits` au lieu
  d'en recopier la seule inclinaison — le plancher restait sinon figé sur le mode de départ.

Les quatre réglages sont exposés dans le panneau de l'exemple.

#### Ombrage des façades

`theme.globe.buildingSunAzimuth` (120°) et `buildingShadeMin` (0,62) modulent chaque façade
selon son orientation. Le contraste toit/façade ne suffisait pas : toutes les façades d'un
quartier partageaient une teinte unique, et les volumes se lisaient comme une nappe grise.

Le terme est **cuit dans les couleurs de sommets par le worker** — la scène n'a toujours
aucune lumière, et la frame ne paie rien. L'azimut par défaut évite volontairement les
multiples de 45° : sur une diagonale exacte, les quatre façades d'un bâtiment orthogonal
tombent deux par deux sur la même teinte et l'angle redevient invisible. `buildingShadeMin`
à `1` désactive l'ombrage.

- **Correctif** : `<Map>` ne transmettait **aucune** couleur de bâtiment au moteur. Un hôte
  qui posait `theme.globe.buildingColor` ne voyait rien — le moteur retombait toujours sur
  `defaultTheme`. Les quatre valeurs sont désormais passées, comme `oceanColor`.

Au passage :

- **Géométrie en repère local.** Les sommets sont exprimés en mètres autour du centre de la
  tuile, et la matrice du mesh les pose sur le globe. Une position ECEF vaut ~6,4 × 10⁶ m :
  en `Float32` sa résolution tombe à ~0,4 m, soit l'épaisseur d'une façade — les murs
  tremblaient. Les échelles locales sont mesurées sur le vrai ellipsoïde par différences
  finies, de sorte qu'aucune géodésie n'est recopiée dans le worker.
- **Budgets revus** : `maxTiles` 64 → 36, `maxRequest` 24 → 25, `maxInflight` 4 → 2. Les
  anciennes valeurs étaient calquées sur celles du fond raster, sans rapport avec ce que
  pèse une tuile de volume. Les bornes du panneau de réglages suivent.
- **Les deux fournisseurs sont ISO.** Le coût du rayon avait justifié des chemins de code
  distincts (drapage court-circuité, suivi d'altitude gelé) ; il est réglé à la source, et
  `applyModeVisibility` ne conditionne plus au fournisseur que ce qui EST le fournisseur.
  Fond raster et volumes partagent en outre une même altitude de sol, au lieu de deux
  références qui pouvaient diverger.

### ⚠️ Rupture — le fournisseur par défaut devient `'internal'`

`providers.tiles.provider` et `providers.tiles3d.provider` valent désormais `'internal'`,
et `providers.internal.origin` désigne le serveur de tuiles du projet
(`https://map.gosecure.site`). Une carte tourne donc **sans aucune clé d'API**, fond 2D et
volume compris.

Conséquences pour un hôte existant :

- une application qui comptait sur le fond Google doit poser
  `config={{ providers: { tiles: { provider: 'external' }, tiles3d: { provider: 'external' } } }}` ;
- un hôte tiers **doit** remplacer `providers.internal.origin` par son propre serveur : le
  défaut désigne une infrastructure privée, pas un service public.

L'origine vit dans un nœud **`providers.internal`** à elle, et non plus sous
`providers.tiles` : elle sert au fond 2D comme au volume, qui sortent du même serveur —
la ranger sous « tuiles 2D » la faisait passer pour un réglage du seul fond de carte.

### ⚠️ Rupture — `GoogleTileSource.ensureSession`

Sa signature passe de `Promise<string>` à `Promise<void>` : le token de session vit dans
l'objet, que `tileUrl` lit déjà. C'est ce qui permet à cette classe de tenir le contrat
`TileSource` commun au fournisseur interne, lequel n'a aucun token à produire. Seul
`TiledGlobeLayer` l'appelait, et il ignorait la valeur renvoyée.

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

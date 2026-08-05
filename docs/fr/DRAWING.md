# Dessin — guide complet

**Français** · [English](../en/DRAWING.md) · [↑ Index](README.md)

Un éditeur de formes façon Figma, **drapé sur le terrain 3D** : les formes sont
stockées en lat/lng, ancrées au sol, et leurs traits ont une épaisseur en pixels
écran constante au zoom.

`<DrawLayer>` porte la collection, l'historique, la sélection, l'édition, le style,
les contraintes, le GeoJSON **et les symboles posés** — un symbole est une forme
`kind: 'symbol'`, pas une couche à part (cf. [SYMBOLS.md](SYMBOLS.md)).

---

## 1. En deux minutes

```tsx
<Map
  center={PARIS}
  zoom={15}
  draw={{
    onShapeAdd: (s) => creerZone(s),
    onShapeUpdate: (s) => sauver(s.meta?.uuid, s),
    onShapeDelete: (s) => supprimer(s.meta?.uuid),
  }}
  toolbar={{ tools: ['select', 'rect', 'circle', 'polygon', 'erase'] }}
/>
```

`<Map draw={…}>` monte la couche **et** la barre d'outils dans le bon ordre.
`draw={false}` retire le dessin **et** la barre qui le pilote.

Montage manuel :

```tsx
<Map>
  <DrawLayer onChange={(fc) => save(fc)}>
    <Toolbar position="left" />
  </DrawLayer>
</Map>
```

---

## 2. Les outils

| Outil | Touche | Forme produite |
|---|---|---|
| Sélection | `V` | — (cf. § 3) |
| Ligne | `L` | polyligne ouverte |
| Polygone | `P` | clics successifs + `Entrée` pour fermer |
| Rectangle | `R` | angles arrondis réglables |
| Cercle | `C` | centre + rayon |
| Main levée | `H` | tracé continu |
| Flèche | `A` | polyligne + tête |
| Règle | `M` | cote fine pointillée ⊢––⊣ avec label de distance — **parent d'un sous-menu** (cf. ci-dessous) |
| Gomme | `E` | supprime au clic ou par marquee — **parent d'un sous-menu** (cf. ci-dessous) |
| Symboles | `Y` | ouvre la palette (cf. [SYMBOLS.md](SYMBOLS.md)) |

La **règle ouvre un sous-menu au survol**, comme le bouton Sélection — mais avec une
seule rangée disponible par défaut (`measure`), le sous-menu **ne s'ouvre pas** : le
bouton agit directement. La grille de coordonnées a quitté ce sous-menu pour les
contrôles de vue (`shortcuts.controls.graticule`, touche `K`), dont elle survit au repli
de la barre — cf. [GRATICULE.md](GRATICULE.md).

```tsx
<Toolbar measureTools={['measure']} />   // une seule rangée = pas de sous-menu
```

### Gomme (ponctuelle / sélection)

La **gomme ouvre un sous-menu au survol** (comme la sélection), avec deux modes :

- **Gomme** (ponctuelle) : un clic efface l'élément sous le curseur.
- **Gomme sélection** : un marquee (rectangle / polygone / lasso, comme le sélecteur) efface **tout ce qu'il touche**.

Les deux modes suppriment **exactement le même ensemble** : dessins, mesures et symboles. Les **markers ne sont jamais effacés** ; les **formes verrouillées** non plus. Le sous-mode du marquee (rect/poly/lasso) est celui du sélecteur (`selectMode`).

**Couches hôte (routes / zones).** Une route (`<PathLayer>`) ou une zone (`<ShapeLayer>`) n'est effaçable que si sa donnée porte `erasable: true` (opt-in, protégé par défaut). La lib ne mute pas vos props : elle remonte l'`id` des objets hôte effacés via `onErase`, à vous de les retirer de votre state.

```tsx
<Map
  layers={[shapesLayer({ shapes }), pathsLayer({ paths })]} // shapes/paths avec `erasable: true`
  draw={{
    onErase: (r) => {
      // r.shapes      : objets de la lib DÉJÀ retirés (dessins/mesures/symboles)
      // r.paths       : ids des routes hôte à retirer de VOTRE state
      // r.hostShapes  : ids des zones hôte à retirer de VOTRE state
      const goneShapes = new Set(r.hostShapes)
      const gonePaths = new Set(r.paths)
      setShapes((prev) => prev.filter((s) => !goneShapes.has(s.id)))
      setPaths((prev) => prev.filter((p) => !gonePaths.has(p.id)))
    },
  }}
/>
```

**Limiter la gomme.** `config.erase.targets` (un booléen par catégorie, tout `true` par défaut) restreint ce qu'elle peut effacer, dans les **deux** modes :

```tsx
<Map config={{ erase: { targets: { measure: false, path: false } } }} />
// la gomme n'efface plus les mesures ni les routes ; les markers ne sont jamais concernés
```

Catégories : `drawing`, `measure`, `symbol` (objets de la lib), `path`, `shape` (couches hôte — `path`/`shape` partagent le vocabulaire de `config.selection.selectable`).

**« Tout effacer » a le MÊME périmètre que la gomme.** La rangée « Tout effacer » du
sous-menu est la gomme sans geste : elle efface les objets hôte comme les formes de la lib,
respecte `erase.targets`, épargne verrouillées et masquées, et émet `onErase` — c'est à
votre application d'y retirer ses routes et ses zones, exactement comme après un coup de
gomme. `useDrawing().clear()` fait la même chose depuis le code.

**La gomme se retire quand elle n'a rien à mordre.** Par défaut
(`config.toolbar.autoHide.erase`), le bouton n'est pas grisé mais **absent** tant qu'aucune
cible autorisée n'est à l'écran — les catégories interdites par `erase.targets` ne comptent
donc pas. Elle reparaît dès qu'un objet effaçable arrive, y compris depuis vos données
(`<PathLayer>` / `<ShapeLayer>` avec `erasable: true`). Tant qu'elle est masquée, son
raccourci (`E`) ne l'arme pas ; et si sa dernière cible disparaît alors qu'elle est active,
l'outil est relâché plutôt que de rester armé sans bouton pour en sortir.

```tsx
<Map config={{ toolbar: { autoHide: { erase: false } } }} />  // gomme toujours visible
```

```tsx
<Toolbar tools={['select', 'rect', 'circle', 'arrow', 'erase']} />  // affichés, dans cet ordre
<DrawLayer tools={['select', 'rect']} />                            // AUTORISÉS (filtre aussi setTool)
```

`<DrawLayer tools>` borne ce qui est possible ; `<Toolbar tools>` borne ce qui est
**affiché**. Le panneau « Réglages » liste les outils réellement activés — retirer un
outil de la barre ne le laisse pas réglable dans un panneau qui l'ignore.

**Barre espace** : maintenir `Espace` pendant un tracé ou une édition = **pan caméra
temporaire** (le tracé en cours est gelé, pas perdu) ; `Espace+Maj` = rotation
caméra ; relâcher = reprise exacte.

---

## 3. Sélection

Trois marquees, sous le même bouton `V` (flyout au survol) :

| Mode | Touche | Geste |
|---|---|---|
| `rect` | `1` | rectangle |
| `poly` | `2` | polygone (clics + `Entrée`) |
| `lasso` | `3` | tracé libre |
| `bâtiment` | `4` | désigne un bâtiment du volume 3D interne (outil du moteur, cf. [BUILDINGS.md](BUILDINGS.md)) — quitte le dessin |

Sémantique **« touche = sélectionné »** : il suffit qu'un marquee effleure une forme.
Clic simple pour sélectionner une forme, `Maj+clic` pour ajouter/retirer.

```tsx
<Toolbar selectModes={['rect', 'lasso']} />   // un seul mode = pas de flyout
```

La sélection porte sur les **formes**, les **markers**, les **tracés** (`PathLayer`) et
les **clusters** — chaque couche s'inscrit au registre `engine.selectables`. Les
populations se lisent séparément :

```ts
const { selection, markerSelection, pathSelection, clusterGroups, selectionDetails } = useDrawing()
```

### Ce qui est sélectionnable

| Type | Sélectionnable | Clé de config | Note |
|---|---|---|---|
| Marker (et symbole posé) | oui | `marker` | — |
| Forme dessinée (`line`/`polygon`/`rect`/`circle`/`freehand`/`arrow`/`measure`) | oui | — | gérée par `locked`/filtre « Couches » |
| **Tracé** (`PathLayer`) | oui | `path` | même **contour pointillé** (marching-ants) que les formes |
| **Cluster** (pastille) | oui → groupe pliable des enfants | `cluster` | clic = **zoom** hors outil sélection |
| Zone (`ShapeLayer`) | non | *(réservé)* | — |
| Lien / relation (`LinkLayer`) | non | *(réservé)* | clic = tracer un itinéraire |
| Bâtiment 3D | non (picking dédié) | — | cf. [BUILDINGS.md](BUILDINGS.md) |
| Grille, HUD, fond de carte | non | — | décor |

**Cluster** : le sélectionner (clic quand l'outil sélection est actif, ou marquee sur la
pastille) sélectionne **tous ses markers enfants**, affichés dans une **rangée pliable**.
Hors outil sélection, un clic sur pastille **zoome** (comportement inchangé). Au zoom, le
clustering se recompose : tant que **le même cluster** (mêmes membres) existe à l'écran, sa
rangée et son anneau suivent ; dès qu'il n'existe plus tel quel (splitté ou fusionné), la
rangée **disparaît** et ses membres restent sélectionnés, **listés à plat**.

**Marker `static` masqué par le zoom** : un marker de décor (`MarkerData.static`, cf.
[MARKERS.md](MARKERS.md)) qui passe **sous son seuil** disparaît de la carte **et de la
sélection** — ce qui n'est plus affiché n'est plus sélectionné (le compteur du panneau
retombe en conséquence). Re-zoomer le fait réapparaître, **non re-sélectionné**.

### Limiter la sélection (`config.selection.selectable`)

Un booléen par type (tout `true` par défaut), respecté par **tous** les outils :

```tsx
// N'autoriser que les markers (ni tracés ni clusters) dans ce contexte :
<Map config={{ selection: { selectable: { path: false, cluster: false } } }} />
```

`SELECTABLE_KINDS` (export public) énumère les types pour construire sa propre UI.

Contours en **marching-ants** noir/blanc (lisibles sur tout fond, y compris satellite
et neige — cf. `theme.colors.marquee`), bbox englobante en multi-sélection. Markers,
clusters et tracés partagent ce **même** pointillé ; plusieurs sélectionnés qui se
**recouvrent** fusionnent en une **silhouette d'union** unique (les pointillés internes
ne se croisent pas).

Les **vignettes de sélection** (`draw.selectionBadges`) listent ce qui est sélectionné via
**deux briques uniques** : `SelectionGroup` (en-tête pliable) et `SelectionRow` (la ligne).
Une ligne a partout la **même structure** — `[icône] titre/sous-titre · menu « … » · croix ✕` —
que ce soit un marker, un tracé, une forme ou un enfant de cluster ; seul le contenu varie
(l'icône, et le menu : « Cibler » partout, « Supprimer » sur une forme). La **croix ✕**
d'une ligne la **désélectionne** ; celle d'un en-tête de groupe désélectionne le groupe
entier. Formes groupées par `kind`, tracés sous « Tracés », clusters en « Cluster (N) »
dépliable listant ses enfants. Montées d'office ; `selectionBadges: false` les retire.

---

## 4. Édition

Poignées façon Figma :

| Geste | Effet |
|---|---|
| poignée de coin | redimensionne sur 2 axes (`Maj` = homothétie) |
| poignée de milieu d'arête | redimensionne sur 1 axe |
| poignée de sommet | déplace un point (polygone, ligne, flèche, règle) |
| glisser le corps | déplace |
| `Maj` + glisser le corps | **rotation** (curseur dédié) |
| flèches | déplace de `1 px` (`Maj` = `10 px`) |

En multi-sélection, les transformations sont **groupées dans un repère commun**. Un
rectangle tourné se redimensionne le long de ses **axes propres**.

---

## 5. Style

Le **dernier bouton de la barre est le bloc de couleurs** : les deux carrés fond/bordure,
façon case couleur de Photoshop. Le style courant s'y lit en permanence, et un clic ouvre le
panneau — qui ne s'ouvre QUE comme ça. Dessiner ou sélectionner ne fait plus surgir de
surface sur la carte.

- Couleurs **fond et bordure séparées** (swatches superposés façon Photoshop, échange ⇄
  dans le panneau), palette du thème (`theme.colors.draw.palette`) + sélecteur natif.
- Épaisseur de bordure **y compris 0** (remplissage seul).
- Style de trait : `solid` / `dashed` / `dotted`.
- Opacité de bordure **et** de fond.
- Rayon d'angle des rectangles (% du petit côté, 0–50).

**Sans sélection**, le panneau règle les défauts des prochaines formes ; **avec
sélection**, il restyle celles qui sont sélectionnées (son titre les compte). Ce qu'il
montre suit le type de forme : le rayon d'angle n'apparaît que pour les rectangles.

```ts
const { setStyle, currentStyle, selectionHasRect } = useDrawing()
setStyle({ color: '#f43f5e', width: 4, stroke: 'dashed' })
```

`currentStyle` est le **commun** de la sélection (un champ hétérogène est absent),
sinon les défauts de l'outil.

### Paliers (`presets`)

Ce sont des choix produit, pas des constantes : la densité d'un plan cadastral
n'appelle pas les mêmes épaisseurs qu'un croquis tactique.

```tsx
<Map draw={{ presets: { widths: [0, 1, 3, 6], fillOpacities: [0, 0.2, 0.5] } }} />
```

| Palier | Défaut |
|---|---|
| `widths` | `[0, 2, 4, 8, 14]` |
| `strokeOpacities` | `[0.25, 0.5, 0.75, 0.95]` |
| `fillOpacities` | `[0, 0.3, 0.6, 1]` |
| `radii` | `[0, 10, 25, 50]` |

### Réglages par outil (engrenage)

Chaque outil garde ses **propres** défauts (couleurs, épaisseur, trait, opacités,
rayon), **persistés en localStorage** avec aperçu live, réinitialisation par outil ou
globale, et récapitulatif des raccourcis.

```tsx
<Map draw={{ settingsStorage: 'none' }} />                        // pas de persistance
<Map draw={{ settingsStorageKey: 'm3d:draw-settings:carte-b' }} /> // deux cartes cohabitent
```

Défaut de la clé : `m3d:draw-settings`. **À distinguer dès que deux cartes cohabitent
sur le même origin** — sans clé propre, la dernière à changer un réglage l'impose à
l'autre. Même précaution que `positionStorageKey` et `tagStorageKey`.

Résolution effective d'un réglage : `base (thème/props) < particularités de l'outil <
overrides utilisateur`. La règle, par exemple, a une épaisseur fine et une opacité
propres — c'est une cote, pas un trait de dessin.

Lecture réactive : `useDrawSettings()`.

---

## 6. Historique

Undo/redo complet couvrant **création, édition, style, suppression, duplication**.

| Raccourci | Action |
|---|---|
| `⌘Z` / `Ctrl+Z` | annuler |
| `⌘⇧Z` / `Ctrl+Y` | rétablir |
| `⌘A` | tout sélectionner |
| `⌘D` | dupliquer |
| `Suppr` / `⌫` | supprimer |

Les events par forme (`onShapeAdd/Update/Delete`) sont **aussi émis par l'undo/redo**,
déduits par différence : votre backend reste synchrone avec la carte.

> Chaque geste pousse un snapshot de la collection dans l'historique, qui le **clone**
> (`structuredClone`). Les valeurs de `meta` doivent donc être sérialisables — une
> fonction, un `Symbol` ou un nœud DOM y feraient échouer le clonage, donc le geste.
> Stockez un identifiant, pas un callback ni une instance vivante.

---

## 7. La forme, vue de l'application

```ts
type DrawnShape = {
  id: string
  kind: DrawTool
  title?: string          // nom lisible — indexé par la recherche
  points: LatLng[]
  closed: boolean
  style: DrawStyle        // { color, fillColor, width, fillOpacity, strokeOpacity, stroke, radius }
  tags: string[]          // défaut ['draw', kind] — ['symbol', clé] pour un symbole
  locked?: boolean
  meta?: ShapeMeta        // Record<string, unknown> — VOTRE modèle, opaque pour la lib
  symbol?: { key: string; variant?: string }   // kind: 'symbol' uniquement
}
```

C'est la **monnaie d'échange** des events et du CRUD. Le type interne `Drawing` reste
à plat pour le rendu ; vous ne le voyez jamais.

**Identité stable** : l'`id` d'une forme **survit au round-trip** export → import
(`Feature.id`, champ standard GeoJSON).

**Métadonnées métier** : `meta` est transportée telle quelle de bout en bout, jamais
interprétée ni rendue. C'est là que vit votre modèle (uuid de base, groupes, actif…).

---

## 8. Events : deux styles qui cohabitent

| Event | Quand | Charge |
|---|---|---|
| `onChange` | après chaque mutation, **coalescé à 1×/frame** | la collection entière en GeoJSON |
| `onShapeAdd` / `onShapeUpdate` / `onShapeDelete` | **au moment** du changement | une `DrawnShape` |
| `onShapeEdit` | **double-clic** sur une forme | une `DrawnShape` — *rien n'a changé* |
| `onSelectionChange` | changement de sélection | `(ids, markerIds, pathIds)` |
| `onReject` | forme refusée par les contraintes | `(reason, shape)` |

`onChange` sert un état **global contrôlé** ; `onShape*` sert du **CRUD par identité**
(une mutation par forme). `onShapeEdit` est une **intention** d'ouvrir une fiche côté
hôte, pas une mutation.

```tsx
<DrawLayer
  onShapeAdd={async (s) => {
    const { uuid } = await createZone(s)
    api.updateShape(s.id, { meta: { uuid } }, { silent: true })   // ⚠️ silent
  }}
  onShapeEdit={(s) => ouvrirFiche(s.meta?.uuid)}
/>
```

---

## 9. CRUD par identité

```ts
const api = useDrawing()   // ou map.current?.drawing

api.getShapes()                              // DrawnShape[]
api.getShape(id)                             // DrawnShape | null
api.getLastShape()                           // celle qui vient d'être dessinée
api.addShape(shape, opts?)                   // → id (votre uuid si vous le fournissez)
api.updateShape(id, patch, opts?)            // → boolean
api.removeShape(id, opts?)                   // → boolean
api.replaceShapes(shapes, opts?)             // events émis PAR DIFFÉRENCE
api.lock(ids) / api.unlock(ids)
api.toGeoJSON() / api.fromGeoJSON(fc)        // remplacement en bloc
```

**`{ silent: true }` supprime *toute* émission d'event** (granulaire **et**
`onChange`) : indispensable pour réinjecter une réponse de votre backend sans
relancer la mutation qui vient de la produire.

Dans un patch, `style` est **fusionné champ par champ** mais `meta` est **remplacée** :

```ts
api.updateShape(id, { meta: { ...api.getShape(id)?.meta, uuid } })
```

`title: ''` retire le nom.

`replaceShapes` émet par différence, là où `fromGeoJSON` remplace en bloc.

---

## 10. GeoJSON

```tsx
<DrawLayer value={collectionControlee} onChange={(fc) => persister(fc)} />
```

`value` fait autorité sur le dessin (import contrôlé, non annulable).

Properties par feature : `kind`, `title`, `color` (bordure), `fillColor`, `width`
(px, `0` = sans bordure), `fillOpacity`, `strokeOpacity`, `stroke`, `radius`,
`locked`, `tags`, `meta`, `symbol`. Chaque feature porte son `id` standard.

Géométries : `LineString` (formes ouvertes), `Polygon` (fermées), `Point` (symboles).

Les anciens fichiers, sans les champs récents, se chargent tels quels.

---

## 11. Formes verrouillées

Une forme `locked: true` — la limite de zone imposée par votre API — est
**intouchable dans l'UI** : ni sélection, ni édition, ni gomme, ni « Tout effacer ».
Clic dessus = flash cadenas.

L'**undo/redo la préserve** : `Ctrl+Z` ne la supprime pas et ne la déverrouille pas.
Seuls `fromGeoJSON` / `value` et `api.lock` / `api.unlock` la changent — le
déverrouillage est réservé au code hôte.

---

## 12. Contraintes métier

```tsx
<Map
  draw={{
    constraints: { limits: perimetresAutorises, maxAreaM2: 10_000_000, noOverlap: true },
    onReject: (reason, shape) =>
      toast({ outOfLimits: 'Hors zone', maxArea: 'Trop grande', overlap: 'Chevauchement interdit' }[reason]),
  }}
/>
```

| Contrainte | Règle |
|---|---|
| `limits: ShapeData[]` | la forme doit tenir entièrement dans **au moins un** périmètre |
| `maxAreaM2` | aire maximale d'une forme **fermée** (les lignes ouvertes ne sont pas concernées) |
| `noOverlap` | refuse une forme **fermée** qui en chevauche une autre (fermée) de la couche ; l'adjacence bord à bord reste permise (les lignes ouvertes ne sont pas concernées) |

Le motif transmis à `onReject` (`DrawRejectReason`) vaut `'outOfLimits'`, `'maxArea'` ou
`'overlap'` selon la contrainte enfreinte.

- Une **création** refusée ne laisse aucune trace : ni mesh, ni historique, ni `onChange`.
- Une **édition** refusée remet la forme dans son état d'avant le geste plutôt que de
  la perdre — et n'émet donc pas `onShapeUpdate`.
- `onReject` vous laisse afficher **votre** message : la lib n'affiche rien d'elle-même.
- `limits` **ne dessine rien** : affichez vos périmètres avec `<ShapeLayer>` ou en
  formes verrouillées.
- Seuls les **gestes utilisateur** sont contraints. `addShape`, `updateShape` et
  `fromGeoJSON` injectent sans contrôle : quand l'application injecte une forme, elle
  sait ce qu'elle fait, et refuser silencieusement ses données serait pire que tout.

Les prédicats sont exportés et géodésiques — cf. [ZONES.md § 7](ZONES.md#7-prédicats-géodésiques).

---

## 13. Tags et filtre « Couches »

Les formes dessinées sont taguées d'office : `['draw', <kind>]`, et
`['symbol', <clé de catalogue>]` pour un symbole. Dans le panneau « Couches »,
l'utilisateur veut filtrer « les hôpitaux », pas « les symboles » en bloc.

Contrairement aux markers, un dessin masqué par le filtre **bascule simplement sa
visibilité** — aucune géométrie n'est reconstruite.

`tags` est patchable (`updateShape(id, { tags: [...] })`).

---

## 14. Raccourcis

Les **outils** se choisissent par lettres seules, identiques Mac/PC ; les **actions
d'édition** utilisent le modificateur de la plateforme (⌘ sur Mac, Ctrl ailleurs) avec
`preventDefault` ciblé. Tous sont affichés dans les tooltips et ignorés pendant une
saisie.

```tsx
<Map draw={{ shortcuts: { selectLasso: 'q', rect: false } }} />   // remappe / désactive
```

Défauts (`config.interaction.shortcuts.draw` et `.edit`) :

| Touches | Action |
|---|---|
| `V` `1` `2` `3` | sélection, rectangle, polygone, lasso |
| `L` `P` `R` `C` `H` `A` `M` `E` `Y` | ligne, polygone, rect, cercle, main levée (`H`), flèche, mesure, gomme, symboles |
| `Entrée` | fermer le polygone (dessin ou marquee) |
| `Échap` | cascade : annule le geste en cours → marquee → désélectionne → outil navigation |

Un remapping est immédiatement reflété dans les tooltips.

---

## 15. La barre (`<Toolbar>`)

```tsx
<Toolbar
  position="left"
  minZoom={12}                                   // en deçà, la barre glisse hors écran
  tools={['select', 'rect', 'circle']}
  selectModes={['rect', 'lasso']}
  components={{ settings: false, clear: false }} // masquer / remplacer une section
  extraTools={<MonOutil />}                      // vos outils, dans le langage de la barre
/>
```

Sections (`components`) : `navigate`, `select`, `symbol`, `measure`, `erase`, `lens`,
`plugins`, `stylePanel`, `settings`, `undo`, `redo`, `clear`. `false` masque, un
`ReactNode` remplace. ⚠️ `stylePanel` est le **bloc de couleurs, dernier bouton de la barre**
(et non plus une surface flottante à côté d'elle) : le remplacer y pose votre propre nœud. ⚠️ `clear` n'est plus un bouton de la barre mais la **rangée « Tout
effacer » du sous-menu de la gomme** : `components={{ clear: false }}` retire cette rangée,
et retirer l'outil `erase` de `tools` emporte la commande avec lui.

**La barre ne montre que ce qui sert.** Par défaut, la gomme — et avec elle sa rangée
« Tout effacer » — n'apparaît que si une de ses cibles autorisées est à l'écran
(`config.toolbar.autoHide.erase`) ; **« Annuler » et « Rétablir » se retirent de même tant
qu'il n'y a rien à défaire ni à refaire** (`autoHide.history`), au lieu de rester grisés.
Une carte sans rien d'effaçable ne montre pas de gomme, et une carte vierge ne montre pas
deux flèches inertes. Le raccourci clavier, lui, ne dépend jamais de la barre, et le
masquage explicite par `components` reste prioritaire.

```tsx
<Map config={{ toolbar: { autoHide: { erase: false, history: false } } }} />   // tout visible
```

**La barre qui se replie relâche tout ce qu'elle pilote** et revient à la main : un
outil resté armé continuerait d'intercepter les gestes, si bien qu'en dézoomant on se
retrouverait à tracer des formes sur une carte où plus aucun bouton ne permet d'en
sortir. **Ses menus se referment avec elle** — un panneau resté seul au milieu de la
carte, sans le bouton qui l'a ouvert, n'aurait plus rien pour le refermer.

### Poser son propre outil dans la barre

```tsx
const bar = useToolbar()
const [open, setOpen] = useState(false)

useCloseWhenHidden(bar.retracted || bar.nativeActive, setOpen)   // se refermer (inutile avec <Dropdown>)

<ToolButton
  icon={mdiChartBox}
  label="Statistiques"
  active={open}
  onClick={() => { if (!open) bar.claim(); setOpen(!open) }}      // éteindre les autres
/>
```

Sans ça, deux boutons restent allumés et la barre ne dit plus où on en est.
`ToolbarApi` porte `{ retracted, nativeActive, claim(), el, activeToolEl, publishActiveTool }` —
les trois derniers servent d'**ancres** à une surface de l'hôte : la barre elle-même, ou le
bouton de l'outil actif pour une surface qui se rapporte à cet outil-là.

---

## 16. `DrawingApi` — la référence

Obtenue par `useDrawing()` (lève hors d'un `<DrawLayer>`) ou par
`map.current?.drawing` (`null` si `draw={false}`).

| Groupe | Membres |
|---|---|
| Outil | `tool`, `setTool`, `tools`, `shortcuts` |
| Sélection | `selectMode`, `setSelectMode`, `selection`, `markerSelection`, `pathSelection`, `clusterGroups`, `selectionDetails`, `select`, `deselectMarkers`, `deselectPaths`, `deselectClusterGroup`, `deselectClusterMember`, `clearSelection`, `selectAll`, `deleteSelection`, `duplicateSelection`, `selectionHasRect`, `selectionBoxEl` |
| Style | `setStyle`, `currentStyle`, `settings` |
| Verrou | `lock`, `unlock` |
| Historique | `undo`, `redo`, `canUndo`, `canRedo`, `clear`, `canErase` |
| Sérialisation | `toGeoJSON`, `fromGeoJSON` |
| CRUD | `getShapes`, `getShape`, `getLastShape`, `addShape`, `updateShape`, `removeShape`, `replaceShapes` |
| Symboles | `symbols` — cf. [SYMBOLS.md](SYMBOLS.md) |

---

## 17. Recettes

**Dessiner par programme, sans passer par l'utilisateur**

```ts
const id = api.addShape({
  kind: 'circle',
  points: [centre, bordure],
  style: { color: '#22c55e', fillOpacity: 0.2 },
  meta: { uuid },
})
```

**Afficher les périmètres de l'API en formes intouchables**

```ts
api.replaceShapes(perimetres.map((p) => ({ ...p, locked: true })), { silent: true })
```

**Ouvrir une fiche au double-clic** — `onShapeEdit={(s) => ouvrir(s.meta?.uuid)}`.

**Deux cartes dans la même app** — donnez à chacune ses clés :
`settingsStorageKey`, `tagStorageKey`, `positionStorageKey`.

---

## Voir aussi

- [ZONES.md](ZONES.md) — zones de données, extrusion, prédicats
- [SYMBOLS.md](SYMBOLS.md) — catalogue d'icônes posées au glisser-déposer
- [MARKERS.md](MARKERS.md) — multi-sélection des markers
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [THEME.md](THEME.md) · [LABELS.md](LABELS.md)

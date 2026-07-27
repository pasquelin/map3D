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
| Main levée | `D` | tracé continu |
| Flèche | `A` | polyligne + tête |
| Règle | `M` | cote fine pointillée ⊢––⊣ avec label de distance |
| Gomme | `E` | supprime au clic |
| Symboles | `Y` | ouvre la palette (cf. [SYMBOLS.md](SYMBOLS.md)) |

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

Sémantique **« touche = sélectionné »** : il suffit qu'un marquee effleure une forme.
Clic simple pour sélectionner une forme, `Maj+clic` pour ajouter/retirer.

```tsx
<Toolbar selectModes={['rect', 'lasso']} />   // un seul mode = pas de flyout
```

La sélection porte sur les **formes** *et* sur les **markers** — les couches de
markers s'inscrivent au registre `engine.selectables`. Les deux se lisent séparément :

```ts
const { selection, markerSelection, selectionDetails } = useDrawing()
```

Contours en **marching-ants** noir/blanc (lisibles sur tout fond, y compris satellite
et neige — cf. `theme.colors.marquee`), bbox englobante en multi-sélection.

Les **vignettes de sélection** (`draw.selectionBadges`) listent ce qui est
sélectionné : formes groupées par `kind`, markers en lignes avec leur menu. Montées
d'office ; `selectionBadges: false` les retire.

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

Le panneau de style s'affiche avec un outil actif ou une sélection.

- Couleurs **fond et bordure séparées** (swatches superposés façon Photoshop, échange ⇄),
  palette du thème (`theme.colors.draw.palette`) + sélecteur natif.
- Épaisseur de bordure **y compris 0** (remplissage seul).
- Style de trait : `solid` / `dashed` / `dotted`.
- Opacité de bordure **et** de fond.
- Rayon d'angle des rectangles (% du petit côté, 0–50).

**Sans sélection**, le panneau règle les défauts de l'outil actif ; **avec
sélection**, il restyle les formes.

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
| `onSelectionChange` | changement de sélection | `(ids, markerIds)` |
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
    constraints: { limits: perimetresAutorises, maxAreaM2: 10_000_000 },
    onReject: (reason, shape) => toast(reason === 'outOfLimits' ? 'Hors zone' : 'Trop grande'),
  }}
/>
```

| Contrainte | Règle |
|---|---|
| `limits: ShapeData[]` | la forme doit tenir entièrement dans **au moins un** périmètre |
| `maxAreaM2` | aire maximale d'une forme **fermée** (les lignes ouvertes ne sont pas concernées) |

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

| | |
|---|---|
| `V` `1` `2` `3` | sélection, rectangle, polygone, lasso |
| `L` `P` `R` `C` `D` `A` `M` `E` `Y` | ligne, polygone, rect, cercle, main levée, flèche, mesure, gomme, symboles |
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

Sections (`components`) : `navigate`, `select`, `symbol`, `lens`, `stylePanel`,
`settings`, `undo`, `redo`, `clear`. `false` masque, un `ReactNode` remplace.

**La barre qui se replie relâche tout ce qu'elle pilote** et revient à la main : un
outil resté armé continuerait d'intercepter les gestes, si bien qu'en dézoomant on se
retrouverait à tracer des formes sur une carte où plus aucun bouton ne permet d'en
sortir.

### Poser son propre outil dans la barre

```tsx
const bar = useToolbar()
const [open, setOpen] = useState(false)

useCloseWhenHidden(bar.retracted || bar.nativeActive, setOpen)   // se refermer

<ToolButton
  icon={mdiChartBox}
  label="Statistiques"
  active={open}
  onClick={() => { if (!open) bar.claim(); setOpen(!open) }}      // éteindre les autres
/>
```

Sans ça, deux boutons restent allumés et la barre ne dit plus où on en est.
`ToolbarApi` = `{ retracted, nativeActive, claim() }`.

---

## 16. `DrawingApi` — la référence

Obtenue par `useDrawing()` (lève hors d'un `<DrawLayer>`) ou par
`map.current?.drawing` (`null` si `draw={false}`).

| Groupe | Membres |
|---|---|
| Outil | `tool`, `setTool`, `tools`, `shortcuts` |
| Sélection | `selectMode`, `setSelectMode`, `selection`, `markerSelection`, `selectionDetails`, `select`, `deselectMarkers`, `clearSelection`, `selectAll`, `deleteSelection`, `duplicateSelection`, `selectionHasRect` |
| Style | `setStyle`, `currentStyle`, `settings` |
| Verrou | `lock`, `unlock` |
| Historique | `undo`, `redo`, `canUndo`, `canRedo`, `clear` |
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

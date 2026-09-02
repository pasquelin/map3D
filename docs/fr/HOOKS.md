# Hooks — référence

**Français** · [English](../en/HOOKS.md) · [↑ Index](README.md)

Tous les hooks doivent être appelés **sous `<Map>`** (ils consomment le contexte
carte). Ceux marqués « lève » jettent une erreur hors de la couche qui les fournit —
c'est volontaire : un `null` silencieux transformerait une erreur de montage en bug
d'exécution lointain.

---

## Contexte

| Hook | Retour | Note |
|---|---|---|
| `useMap()` | `MapEngine` | disponible **dès le montage**, sans attendre les tuiles |
| `useTheme()` | `MapTheme` | thème résolu (clair/sombre + `prefers-reduced-motion`) |
| `useLabels()` | `MapLabels` | libellés résolus — chaque texte de la lib passe par là |
| `useConfig()` | `MapConfig` | réglages résolus, **toujours complets** |
| `usePreferences()` | `{ prefs, hasStored, store }` | résolu par `<MapProvider>` ; `store` vaut `null` hors d'une carte — cf. [PREFERENCES.md § 5](PREFERENCES.md#5-pour-lapplication) |

> **`useConfig()` plutôt que `engine.config` dans la couche React.** Le moteur reçoit
> la config depuis un effet de `<Map>`, et les effets d'un enfant s'exécutent **avant**
> ceux de son parent : au render où `<Map config>` change, `engine.config` porte encore
> la valeur de la frame précédente, et aucun re-render ne viendra corriger ce qui
> l'aurait lue.
>
> Pour une closure qui survit à son render (handler abonné une fois, boucle
> d'animation), gardez la valeur dans une **ref rafraîchie à chaque render**.

---

## Caméra et vue

### `useCamera(): UseCameraResult`

```ts
const { state, flyTo, follow, moveTo, fitBounds, setCenter, panTo, setZoom, getZoom } = useCamera()
```

`state` est **réactif** : le consommateur se re-rend à chaque mouvement de caméra —
l'événement `camera` est émis **par frame** tant qu'elle bouge.

### `useCameraCommands(): CameraCommands`

```ts
const { flyTo, fitBounds, setZoom } = useCameraCommands()
```

Les **commandes seules**, d'identité stable : ce hook ne s'abonne à rien et ne re-rend
jamais. C'est le chemin d'un bouton « recentrer » ou d'un menu qui pilote la vue sans
l'afficher — passer par `useCamera` pour un seul `flyTo` ferait re-rendre tout le
sous-arbre soixante fois par seconde pendant un pan. Pour piloter hors React, la
poignée `map.current?.camera` reste disponible.

### `usePedestrian(): PedestrianApi`

```ts
const { state, enterPlacement, enter, exit, setImmersion } = usePedestrian()
```

Mode piéton / première personne : `state` (réactif) plus les commandes. L'état vient de
l'**événement**, pas d'une lecture au rendu : la carte peut quitter le mode d'elle-même
(Échap dans le canvas, bascule 2D), et un consommateur qui ne suivrait que ses propres
appels afficherait un bouton actif sur un mode déjà quitté. `enter(p)` rend `false` si
le point n'est pas posable.

### `useViewport(cb, opts?)`

```ts
useViewport((v) => refetch(v.bounds), { minZoom: 12, debounce: 500 })
```

S'abonne à la vue **stabilisée** (façon `idle`). Sans `debounce`, la cadence de la
carte s'applique (`config.data.viewportDebounceMs`) — la même que `useLiveData`.

### `useMapEvents(handlers)`

```ts
useMapEvents({ onClick, onCameraChange, onViewportChange, onReady })
```

Abonnement déclaratif. `onReady` est **rejoué** si la carte l'était déjà.

### `useZoomGate(thresholds): (minZoom) => boolean`

Gate booléen sur une liste de seuils — ce qui masque les markers `static`. Ne re-rend
qu'au **franchissement** d'un seuil, pas à chaque mouvement.

### `useCapture(): (opts?: CaptureOptions) => Promise<Blob>`

```ts
const capture = useCapture()
const blob = await capture({ format: 'png', scale: 2 })
```

Capture l'image de la carte depuis un composant sous `<Map>`. La fonction renvoyée
injecte le rasteriseur d'overlay de la prop `capture` (markers/labels composés
par-dessus la 3D) et émet la trace `onCapture` ; une option d'appel explicite l'emporte
sur l'injection (ex. `overlay: false` force une capture 3D seule). Sans prop `capture`,
la capture reste possible, **en 3D seule**. Les défauts (`format`, `quality`, `scale`,
`background`) viennent de `config.capture`. Identité **stable** tant que le moteur et la
prop `capture` ne changent pas : ce hook ne s'abonne à rien et ne re-rend jamais. Le
pendant impératif est `handle.capture()` ; le cœur, `engine.capture()` — cf.
[PROPS.md](PROPS.md#poignée-impérative--maphandle-ref-et-usecapture) et
[CONFIG.md § capture](CONFIG.md#capture--capture-dimage-de-la-carte).

---

## Données

### `useLiveData(source, opts?)`

```ts
const { data, loading } = useLiveData(source, { debounce: 800 })
```

Charge une `DataSource` selon la vue : anti-rebond, gate `minZoom`, annulation de la
requête précédente, amorçage avec la vue courante. Découplé du transport.

### `useTags()` / `useTagSelection()`

Deux hooks, deux raisons de se re-rendre :

| Hook | Se re-rend quand |
|---|---|
| `useTags()` | le **registre** change (des tags apparaissent ou disparaissent de la carte) |
| `useTagSelection()` | la **sélection** change (l'utilisateur coche) |

Les deux renvoient le même `TagFilter` (`isVisible`, `toggle`, `clear`, `all`,
`selected`, `isActive`, `report`, `unreport`). Un panneau qui liste les tags veut le
premier ; une couche qui filtre veut le second.

### `usePlugins(): { plugins, byId }`

Vue réactive des plugins enregistrés (`meta`, `enabled`, `config`, `schema`, plus
`setEnabled` / `setConfig` / `resetConfig` / `refresh`). Ne se recompose qu'au
changement du registre. Détail dans [PLUGINS.md](PLUGINS.md).

### `useBuildingEnrichment(): BuildingEnrichment`

État d'enrichissement du dernier bâtiment piqué : `loading`, `data` (attrs fusionnés des
enrichisseurs actifs), `tags` (union des provenances), `error`, et `byPlugin(id)` pour le
détail. Se re-rend aux transitions `loading→data→error` et au changement du filtre
« Couches ». À lire dans le composant qu'ouvre `<Map buildingMenu>` — voir
[BUILDINGS.md](BUILDINGS.md) et [PLUGINS.md](PLUGINS.md).

### `useCatalog(side?): CatalogApi`

```ts
const catalog = useCatalog() // side: 'left' | 'right' (défaut 'right')
catalog.toggle(source, item, { fit: true })
catalog.setMany(source, items, true)
catalog.clear()
```

Sélection et gestes du catalogue : `selection`, `isShown`, `isPending`, `hasError`,
`toggle`, `setMany(source, items, shown, { fit })`, `clear`, `shapes` (formes à passer à
`<ShapeLayer>`), `markers` (points posés par les éléments affichés) et
`toggleSource(id, on?)` (allume/éteint un jeu à bascule). `side` réserve la marge de cadrage
du côté où s'ouvre le panneau. Détail dans [CATALOG.md § 10](CATALOG.md#10-recettes).

Pour les **agrégats** (cf. [CATALOG.md § 5.2](CATALOG.md#52-agrégats-et-enfants)) :
`rememberGroup(source, parentId, children)` retient de quoi un groupe est fait — c'est ce
qui permet à sa case d'être juste une fois repliée, et après réouverture du panneau —, et
`groupState(parentKey)` en rend l'état dérivé (`{ state, shown, total }`). Un agrégat
n'entre jamais dans la sélection.

⚠️ Pour **lire** l'état d'un jeu à bascule, c'est `useCatalogToggle` ci-dessous — pas
`useCatalog()`, qui rend un objet neuf à chaque mutation du catalogue et re-rendrait donc
l'appelant à chaque géométrie qui arrive.

### `useCatalogToggle(id: string): { on: boolean; loading: boolean; toggle: () => void }`

État d'UN jeu à bascule et le geste qui le retourne. Deux instantanés **scalaires**
(`useSyncExternalStore`) : React court-circuite le rendu tant que les deux booléens ne
bougent pas. C'est le hook qu'utilise la lib pour ses propres lignes de menu.

```tsx
const { on, loading, toggle } = useCatalogToggle('defibs')
```

`loading` dit qu'une requête est **en vol**, jamais un nombre d'éléments chargés — cf.
[CATALOG.md § 4.2](CATALOG.md#42-le-volume-chargé-nest-pas-le-volume-affiché).

### `useCatalogSourceCount(id: string): number`

Combien d'éléments de CETTE source sont sur la carte — le compte que la lib affiche sur
chaque ligne du menu des types. Instantané **scalaire**, comme `useCatalogToggle` : la ligne
ne se re-rend que quand son chiffre bouge.

```tsx
const shown = useCatalogSourceCount('zone-groups')
```

⚠️ Jamais sur une source à **bascule** : ce qu'elle charge dépasse structurellement ce qui
est visible (cf. [CATALOG.md § 4.2](CATALOG.md#42-le-volume-chargé-nest-pas-le-volume-affiché)).

### `useCatalogClear(): () => void`

Vide la carte de tout ce que le catalogue y peint — éléments cochés **et** jeux allumés.
Un geste seul, **sans abonnement** : un bouton « Tout retirer » n'a pas à se re-rendre à
chaque géométrie qui arrive. Son état désactivé se lit ailleurs (le compte actif).

### `useCatalogSources(): readonly CatalogSource[]` / `useCatalogSource(id: string | null): CatalogSource | undefined`

Sources de catalogue déclarées (`engine.catalog`), réactif à l'inscription ou au retrait
d'une source (`useSyncExternalStore` sur le jeton du registre : aucun recalcul au
re-rendu de l'hôte, seulement à une mutation réelle). `useCatalogSource(id)` isole une
source de cette même liste par son id — `undefined` si `id` vaut `null` ou si la source
est absente (retirée entre-temps). Utile pour lire les métadonnées (`label`, `icon`,
`total`…) d'**une** source connue sans s'abonner à la liste entière ni la filtrer à la
main — voir `StatsOverlay` dans `examples/react/` (encart de diagnostic affichant le
total de la source « villes »).

### `useCatalogSettings(): CatalogSettingsApi`

Réglages persistés du catalogue (`persist`, `fitOnAdd`) + `setPersist` / `setFitOnAdd` —
partagés avec `useCatalog`, jamais désynchronisés.

---

## Dessin, loupe, relations

### `useDrawing(): DrawingApi` — *lève* hors `<DrawLayer>`

Toute l'API de dessin : outil, sélection, style, historique, CRUD, GeoJSON, symboles.
Détail dans [DRAWING.md § 16](DRAWING.md#16-drawingapi--la-référence).

### `useDrawSettings(): DrawSettings`

Réglages **par outil** (persistés), en lecture réactive : `get(tool)`, `set(tool,
patch)`, `reset(tool?)`, `isCustomized(tool)`.

### `useGraticule(): GraticuleApi`

Bascule de la grille de coordonnées — `{ visible, setVisible, toggle }`. Lit l'état **au
moteur** : trois commandes la pilotent (sous-menu Mesures, bouton des contrôles, raccourci),
un état React local aurait divergé. Cf. [GRATICULE.md](GRATICULE.md).

### `useLens(): LensApi` — *lève* hors `<LensLayer>`

`{ active, activate, deactivate, toggle, shortcut }`.

### `useRelations(): RelationApi` — *lève* hors `<RelationLayer>`

`{ rules, menuFor, run, snapshots, hubHosts, setMode, routeColor, familyColor,
untrace, clear }`. Détail dans [RELATIONS.md § 9](RELATIONS.md#9-relationapi).

### `useTemplates(options?): TemplatesView` — sous `<MapProvider>`

`{ templates, categories, defaultCategories, defaultApply, allowExport, saveView,
defaultSaveView, busy, saveCurrent, updateFromDrawing, apply, rename, remove, refresh, exportFile, importFile }`.
Vue réactive + actions du gestionnaire de sauvegardes de dessin (localStorage seul ou
provider API). Détail dans [TEMPLATES.md § 8](TEMPLATES.md#8-hook-usetemplates).

### `useToolbar(): ToolbarApi`

```ts
const bar = useToolbar()   // { retracted, nativeActive, claim() }
```

Ce qu'un outil doit savoir de la barre qui le porte. **Hors d'une `<Toolbar>`, tout est
inerte** : un bouton monté seul n'a personne à qui céder la main.

### `useCloseWhenHidden(hidden, close)`

Referme une surface quand la barre se replie ou qu'un outil natif prend la main. Le
contrat d'un outil applicatif tient en deux lignes :

```tsx
const bar = useToolbar()
const [open, setOpen] = useState(false)
useCloseWhenHidden(bar.retracted || bar.nativeActive, setOpen)
<ToolButton active={open} onClick={() => { if (!open) bar.claim(); setOpen(!open) }} />
```

Sans ça, deux boutons restent allumés et la barre ne dit plus où on en est.

---

## Gestes

### `useDraggable(opts)`

```ts
const { onPointerDown, className } = useDraggable({
  payload: { type: 'marker', id, data },
  ghost: <Vignette />,
  longPressMs: 0,     // défaut : config.interaction.longPressMs
  slop: 8,            // défaut : config.interaction.dragSlopPx
  disabled: false,
})
```

**Si aucune zone n'accepte la charge** — typiquement une carte sans dock — le hook rend
un `onPointerDown` inerte et aucune classe : l'élément garde son clic et son
`touch-action` normaux. Sinon l'utilisateur obtiendrait un fantôme sous le curseur et
un relâchement sans effet, c'est-à-dire un geste qui a l'air cassé.

Le hook se réévalue quand des zones se montent ou se démontent : la prise ne reste ni
morte après l'arrivée d'une dock, ni allumée après son départ.

### `useDropZone(opts)`

```ts
const { dropProps, isOver } = useDropZone({ id: 'm3d-pinned', accept, onDrop })
<div {...dropProps} />
```

Le hit-test passe par l'attribut `data-m3d-drop`, jamais par un rectangle écran
maintenu : robuste au layout, au resize et au scroll. `isOver` ne reflète que le survol
par une charge **acceptée**.

### `useMapDropZone(opts)`

```ts
const { isOver } = useMapDropZone({ accept, onDrop: (payload, latLng, point) => poser(payload, latLng) })
```

Pendant du couple ci-dessus quand la cible est le **terrain** : la zone couvre le canvas
et l'overlay HTML — **jamais le calque des markers** (un marker peut flotter au-dessus
d'une autre zone, ex. la dock, et détournerait alors son dépôt vers la carte) ni les
barres d'outils — et le callback reçoit la coordonnée visée par **raycast ellipsoïde**
(juste en vue inclinée comme en 2D). Un dépôt à côté du globe est ignoré, faute de
position à donner.

### `useRepositionable(opts)`

Déplacement libre d'un élément **ancré à la carte** (≠ drag-and-drop à payload) : le
geste s'arme au mouvement, suit le relief réel, et livre la position au relâchement.

```ts
useRepositionable({ id, layer, slop, onStart, onMove, onDrop })
```

`onStart` est notifié **une fois par geste**, jamais sur un simple clic : l'hôte peut y
refermer les surfaces ancrées au marker, qu'aucun clic extérieur ne viendra plus
congédier.

### `useDraggablePanel(defaultPos?)`

```ts
const { panelRef, style, gripProps, pinned, reset } = useDraggablePanel({ x, y })
<div ref={panelRef} style={style}><button {...gripProps} /></div>
```

Panneau flottant déplaçable par une poignée, clampé au conteneur, re-clampé au resize —
**invariant : un panneau épinglé reste dans le conteneur même quand celui-ci
rétrécit**. `defaultPos` positionne le panneau *tant qu'il n'est pas épinglé* (utile
pour l'ancrer à un élément mobile) ; `reset()` le ré-aimante.

Partagé par le panneau de sélection et l'inventaire de la loupe — même geste, une seule
implémentation.

---

## Couches custom

Il n'y a **pas de hook public** pour ça : une couche se monte avec les méthodes du
moteur, dans un effet.

```tsx
const engine = useMap()
useEffect(() => {
  const layer = new MaCouche(engine.annotations, engine.projection)
  engine.addLayer(layer)
  return () => engine.removeLayer(layer)
}, [engine])
```

`<ShapeLayer>` et `<PathLayer>` passent en interne par `useLayer` / `useLayerSync`,
qui factorisent ce patron — **ils ne sont pas exportés**. Le patron complet (dont la
resynchronisation des données) est dans [ENGINE.md § 3](ENGINE.md#3-écrire-une-couche).

---

## Voir aussi

- [ENGINE.md](ENGINE.md) — le moteur, ses events et ses registres
- [MARKERS.md](MARKERS.md) · [ZONES.md](ZONES.md) · [DRAWING.md](DRAWING.md)
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md)

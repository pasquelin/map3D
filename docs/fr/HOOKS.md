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

`state` est **réactif** : le consommateur se re-rend à chaque mouvement de caméra. Pour
piloter sans re-rendre, utilisez la poignée `map.current?.camera`.

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

---

## Dessin, loupe, relations

### `useDrawing(): DrawingApi` — *lève* hors `<DrawLayer>`

Toute l'API de dessin : outil, sélection, style, historique, CRUD, GeoJSON, symboles.
Détail dans [DRAWING.md § 16](DRAWING.md#16-drawingapi--la-référence).

### `useDrawSettings(): DrawSettings`

Réglages **par outil** (persistés), en lecture réactive : `get(tool)`, `set(tool,
patch)`, `reset(tool?)`, `isCustomized(tool)`.

### `useLens(): LensApi` — *lève* hors `<LensLayer>`

`{ active, activate, deactivate, toggle, shortcut }`.

### `useRelations(): RelationApi` — *lève* hors `<RelationLayer>`

`{ rules, menuFor, run, snapshots, hubHosts, setMode, routeColor, familyColor,
untrace, clear }`. Détail dans [RELATIONS.md § 9](RELATIONS.md#9-relationapi).

### `useTemplates(options?): TemplatesView` — sous `<MapProvider>`

`{ templates, categories, defaultCategories, defaultApply, allowExport, busy,
saveCurrent, updateFromDrawing, apply, rename, remove, refresh, exportFile, importFile }`.
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

Pendant du couple ci-dessus quand la cible est le **terrain** : la zone couvre les
trois surfaces carte (canvas, markers, overlay) — jamais les barres d'outils — et le
callback reçoit la coordonnée visée par **raycast ellipsoïde** (juste en vue inclinée
comme en 2D). Un dépôt à côté du globe est ignoré, faute de position à donner.

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

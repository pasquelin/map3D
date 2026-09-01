# Données — viewport, temps réel, tags, épinglage

**Français** · [English](../en/DATA.md) · [↑ Index](README.md)

Comment la donnée entre dans la carte, comment elle en sort, et ce que l'utilisateur
peut en faire.

---

## 1. Trois régimes de données

| Régime | Qui décide | Mécanique |
|---|---|---|
| **Statique** | vous | un tableau `points` / `shapes` que vous tenez |
| **Viewport-driven** | la carte | une `DataSource` rechargée à la bbox |
| **Temps réel** | votre transport | des `points` qui changent, animés par identité stable |

Les trois se mélangent : une couche en `source`, une autre en `points` temps réel.

---

## 2. Viewport-driven

```ts
type DataSource<T> = {
  minZoom?: number
  load(viewport: Viewport, signal: AbortSignal): Promise<T[]>
}

type Viewport = { bounds: Bounds; center: LatLng; zoom: number }
```

```tsx
const source: DataSource<MarkerData<Alert>> = {
  minZoom: 10,
  async load({ bounds }, signal) {
    return fetchAlerts(bounds, signal)
  },
}

<MarkerLayer source={source} cluster={{ enabled: true }} />
```

Ce que le contrôleur fait pour vous, et qu'il ne faut donc pas refaire :

1. **Anti-rebond** entre l'arrêt de la caméra et la demande
   (`config.data.viewportDebounceMs`, surchargeable).
2. **Gate de zoom** : sous `minZoom`, aucun chargement — pas même une requête annulée.
3. **Annulation** de la requête précédente dès qu'une nouvelle vue arrive
   (`AbortSignal`).
4. **Amorçage** avec la vue courante au montage, sans attendre un premier mouvement.

Le tout est **découplé du transport** : Apollo, REST, gRPC-web, peu importe — `load`
est une promesse.

Hook direct, si vous voulez la donnée sans passer par une couche :

```ts
const { data, loading } = useLiveData(source, { debounce: 800 })
```

Et le contrôleur nu, hors React : `ViewportController` (`push`, `setSource`,
`dispose`). Ses options (`ViewportControllerOptions`) : `debounce` (ms) et `onError?:
(error: unknown) => void`, appelé quand `source.load` échoue — jamais pour une requête
abandonnée par une vue plus récente. <!-- audit: à vérifier à la fusion (cœur) -->

### Juste s'abonner à la vue

```ts
useViewport((v) => refetch(v.bounds), { minZoom: 12, debounce: 500 })
```

L'event `viewport` est émis à l'**inactivité** de la caméra (façon `idle`), pas à
chaque frame. Pour un affichage haute fréquence, c'est `camera` qu'il faut — et surtout
**pas** de réseau dedans. Cf. [CAMERA.md § 5](CAMERA.md#5-suivre-la-vue).

---

## 3. Temps réel

Passez simplement des `points` qui changent : grâce à l'identité stable (`id`, ou
`getId`), un changement de `position` **anime** le marker au lieu de le recréer.

```tsx
<MarkerLayer
  points={agents}          // mis à jour par votre WebSocket
  selectedId={selected}
  followId={followed}      // la caméra suit l'agent live
  icon={(m) => agentSvg(m.data)}
/>
```

La durée et la courbe du glissement viennent de `theme.markers.moveTween`.

**Ce qui rend ça tenable sur un flux dense**, et qui explique quelques choix d'API :

- Les nœuds DOM sont **recyclés** (pool) et positionnés en `translate3d`, en une passe
  projection → écriture.
- Les titres normalisés pour la recherche sont mémoïsés **par objet marker** : un tick
  reconstruit le tableau mais préserve la plupart des références, donc ne renormalise
  que ce qui a changé.
- Les **rubriques** de recherche et les **compteurs de tags** sont *déclarés* et
  comparés avant émission : un tick GPS qui ne change aucune rubrique ne re-rend
  personne.
- Le recalcul du clustering est **throttlé** (~11 Hz) pendant un mouvement continu ;
  les clusters, ancrés en 3D, suivent la carte à 60 fps quand même. Un appel de traîne
  garantit l'état final une fois la caméra immobile.

`diffById(previous, next, getId)` est exporté (`{ entered, updated, exitedKeys }`) pour
une couche custom qui veut le même recyclage.

---

## 4. Tags et filtre « Couches »

Un tag est une **étiquette de visibilité** choisie par l'utilisateur, pas une
catégorie de rendu (ça, c'est le `type` d'un marker).

```ts
{ id: 'a1', type: 'agent-enroute', tags: ['user', 'move'], position, data }
```

| Élément | Tags par défaut |
|---|---|
| marker | `['marker', <type>]` |
| forme dessinée | `['draw', <outil>]` |
| symbole posé | `['symbol', <catégorie>]` |

Le bouton **Couches** de `<MapControls>` (touche `T`) ouvre un panneau listant les tags
**réellement présents** sur la carte : recherche, cases à cocher, pastilles, compteurs.

- Sémantique **OU** : cocher `user` et `rect` laisse « les users **et** tous les
  rectangles ».
- Aucun tag coché = **aucun filtre** (tout visible).
- Un élément **sans tag** est masqué dès qu'un filtre est actif — d'où les tags par
  défaut ci-dessus.
- Markers : le filtre s'applique **avant** le clustering (les clusters reflètent le
  filtre). Dessins : simple bascule de visibilité, aucune géométrie reconstruite.
- Le marker **sélectionné** et le marker **suivi** sont exemptés.
- Persistance en `localStorage` : `<Map tagStorageKey>` (`null` pour désactiver, une
  clé par carte si plusieurs cohabitent).
- Un tag sélectionné mais **absent** de la carte (sélection persistée d'une session
  dont les données ont changé) est listé à compte `0` — sinon il filtrerait sans
  qu'aucune case ne permette de le décocher.

### Couleurs

`theme.colors.tags[tag]`, sinon une **palette hashée déterministe** (`tagColor`) : un
tag garde sa couleur entre les sessions et entre les couches sans rien stocker.
Résolveur unique : `tagColorOf(theme, tag)`.

```tsx
<MapControls tagLabel={(t) => LIBELLES_TAGS[t] ?? t} />   // libellé lisible
<TagFilterControl />                                      // le panneau, hors <MapControls>
```

### Accès programmatique

```ts
const tags = useTags()          // re-rend sur changement du REGISTRE (tags présents)
const sel  = useTagSelection()  // re-rend sur changement de la SÉLECTION

sel.isVisible(['user'])   // ce que la lib elle-même appelle
sel.toggle('user')
sel.clear()
tags.all()                // TagEntry[] = { tag, count }[]
```

Hors React : `engine.tags`. Une couche custom déclare ses tags avec
`engine.tags.report(sourceId, countTags(items, (i) => i.tags))` et les retire avec
`unreport` à son démontage.

---

## 5. Épingler (dock des favoris)

```tsx
<Map
  layers={[markersLayer({ points: agents, draggable: true })]}
  dock={{
    items: epingles,                       // dérivés des ids que VOUS stockez
    onPin: (payload) => ajouter(payload.id),
    onUnpin: (id) => retirer(id),
    onReorder: (ids) => reordonner(ids),
    onPinClick: (item) => ouvrir(item),
    flyOnClick: true,
    flyZoom: 16,
  }}
/>
```

La dock est **contrôlée** : la lib ne stocke rien.

> L'absence de `dock` a une conséquence voulue au-delà de l'affichage : plus aucune
> zone n'accepte un marker, donc les markers **cessent d'être saisissables**. Un geste
> sans destination n'est pas proposé.

`PinnedItem` = `{ id, position?, type?, color?, label?, avatar?, icon?, data? }`. Le
carré par défaut prend la couleur du `type` (ou `color`), affiche l'`avatar` en cover,
sinon l'`icon` centrée, sinon l'initiale du `label`.

### Le drag-and-drop générique

Le dock n'est qu'un consommateur : le mécanisme est public.

```ts
// Rendre un élément saisissable
const { onPointerDown, className } = useDraggable({
  payload: { type: 'icone', id: entry.key, data: entry },
  ghost: <Vignette entry={entry} />,
  longPressMs: 0,        // une palette n'a pas de clic à préserver
})

// Recevoir sur un panneau
useDropZone({ id: 'ma-zone', accept: (p) => p.type === 'icone', onDrop: (p, point) => … })

// Recevoir sur le TERRAIN — la lat/lng visée est fournie
useMapDropZone({ accept: (p) => p.type === 'icone', onDrop: (p, latLng) => poser(p.data, latLng) })
```

`useMapDropZone` couvre le canvas et l'overlay HTML — **jamais le calque des markers**
(un marker peut flotter au-dessus d'une autre zone, ex. la dock, et détournerait alors
son dépôt vers la carte) **ni les barres d'outils**. Un dépôt à côté du globe est
ignoré : il n'y a alors pas de position à donner.

État de vérité : `engine.drag` (`DragRegistry`) — zones, payload typé, phase du geste.

---

## 6. Persistance : la carte des clés

Tout est en `localStorage`, tout est désactivable, et **tout doit être distingué si
deux cartes cohabitent sur le même origin**.

| Quoi | Prop | Défaut |
|---|---|---|
| position caméra | `<Map positionStorageKey>` | *aucune* (pas de persistance) |
| filtre « Couches » | `<Map tagStorageKey>` | `m3d:tag-filter` |
| réglages de dessin | `draw.settingsStorageKey` (+ `settingsStorage: 'none'`) | `m3d:draw-settings` |
| historique de recherche | `search.historyStorageKey` | `m3d:search-history` |
| favoris épinglés | — | **rien** : c'est vous qui stockez |

Un stockage indisponible (SSR, mode privé) est traité comme absent, jamais comme une
erreur.

---

## 7. Recettes

**Charger par bbox et animer en temps réel dans la même carte**

```tsx
layers={[
  markersLayer<Alert>({ id: 'alertes', source: alertesParBbox, cluster: { enabled: true } }),
  markersLayer<Agent>({ id: 'agents',  points: agentsLive, followId: suivi }),
]}
```

**Gate de zoom pour une couche POI** — `source.minZoom = 15`. Rien ne part sous ce
seuil.

**Refetch manuel sur un autre critère** — `useViewport((v) => refetch(v), { minZoom })`
et gardez la main sur la requête.

**Masquer une famille d'éléments par défaut** — il n'y a pas de sélection initiale de
tags : le filtre part vide (tout visible) ou repart de ce qui est persisté. Pour un
état initial, préfiltrez vos `points`.

---

## Voir aussi

- [MARKERS.md](MARKERS.md) — identité stable, cull, clustering
- [CAMERA.md](CAMERA.md) — events `viewport` et `camera`
- [ENGINE.md](ENGINE.md) — registres et couches custom
- [CONFIG.md](CONFIG.md) — cadences, budgets, clés de stockage

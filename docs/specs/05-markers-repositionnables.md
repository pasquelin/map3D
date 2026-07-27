# BLOQUANT 4 — Markers repositionnables

> Statut : implémenté. `pnpm typecheck` vert (lib + exemple).

## Le besoin

`components/fields/FieldLatLngMap.tsx` et `views/parameters/ViewDetail.tsx` affichent un
marker qu'on déplace pour définir une lat/lng ; l'ancien code lit
`markerRef.current.position` et met à jour le formulaire.

L'audit a élargi le périmètre : **MilSym repositionne aussi des markers**, à trois endroits
(`hooks/milsym/useMilSymLayer.ts:174, 192, 505` — `marker.addListener('dragend', …)`). Ce
n'est donc pas un marker unique de formulaire mais **plusieurs markers déplaçables au sein
d'un même jeu**, aux côtés de markers qui ne le sont pas.

## Le drapeau vit sur la donnée

C'est le point structurant. Dans un même `MarkerLayer` cohabitent des markers qui reflètent
un état non modifiable (alertes, agents géolocalisés) et des markers éditables (le point
qu'on pose, un symbole placé à la main). Le caractère déplaçable appartient donc au
**marker**, pas à la couche :

```ts
type MarkerData<T> = {
  …
  /** Ce marker peut être déplacé sur la carte pour définir une nouvelle position. */
  repositionable?: boolean
}
```

```tsx
const markers = [
  { id: 'a1', type: 'alert-high', position, data },                        // fixe
  { id: 'pin', type: 'pin', position, repositionable: true, data },        // déplaçable
]

<MarkerLayer points={markers} onReposition={(m, latLng) => setForm(latLng)} />
```

La prop de couche `repositionable?: boolean | ((p) => boolean)` reste disponible pour
trancher globalement ou sur un critère externe au marker (mode édition de l'écran, droits
de l'utilisateur). **Si elle est fournie, elle prime** sur le champ de la donnée ; sinon
c'est le marker qui décide. Une seule règle, énoncée dans les deux docs.

## Exclusion mutuelle avec `draggable`

`MarkerLayer.draggable` existait déjà, mais c'est **le drag-and-drop à payload** :
long-press → ghost → `DragRegistry` → `DropZone` (dock de favoris). Sémantique « emporter
vers ailleurs », pas « déplacer sur la carte ».

Les deux gestes partent du même `pointerdown` sur le même nœud DOM : ils ne peuvent pas
cohabiter. **Un marker repositionnable ignore `draggable`**, y compris quand la couche
active `draggable` pour tout le monde. C'est ce que démontre l'exemple : tous les markers
sont saisissables au long-press, `pin-editable` seul se déplace librement.

## Déclenchement au mouvement, pas au long-press

`useDraggable` s'arme après ~250 ms d'appui — correct pour « emporter », car il faut
distinguer l'intention d'un pan de carte.

`useRepositionable` s'arme au **franchissement d'un seuil de 4 px**. C'est le geste attendu
d'une poignée qu'on déplace (et celui de Google Maps), et il ne concurrence pas le clic :
tant que le pointeur n'a pas bougé, le clic passe normalement. Un attente de 250 ms sur une
poignée donnerait au contraire une impression de blocage.

Le `pointerdown` a lieu sur le DOM du marker, pas sur le canvas — `GlobeControls` ne le
reçoit donc jamais et la carte ne pane pas sous le geste. Aucune neutralisation nécessaire.

## Suivi de la surface

Le suivi passe par `engine.pickLatLngAtClient(clientX, clientY, true)`, nouvelle méthode
publique (le canvas est privé, et toute couche DOM externe a le même besoin — MilSym en
particulier). Elle convertit les coordonnées **client** d'un `PointerEvent` en lat/lng.

Le marker colle donc au **relief réel** et reste sous le curseur en vue inclinée. Le second
paramètre active le repli sur l'intersection ellipsoïde : sans lui, sortir le curseur dans
le ciel figerait le geste en pleine action.

## Pourquoi la position ne passe pas par React pendant le geste

Deux mécanismes ajoutés au core `MarkerLayer` :

- **`moveItemNow(id, p)`** — pose immédiate, sans le tween de 500 ms de `setItems`. Un
  point doit coller au curseur, pas le rattraper.
- **`setPinned(id, bool)`** — `setItems` ignore la position d'un marker épinglé. Sans ça,
  chaque rendu React rejouerait l'ancienne position (l'hôte ne l'a pas encore mise à jour)
  et le marker sauterait sous le doigt.

L'hôte reste la source de vérité : au relâchement, `onReposition` lui livre la position, il
met à jour ses données, l'épinglage tombe et le cycle normal reprend.

`onRepositionMove` est disponible pour un aperçu live (champ de formulaire qui suit le
geste). `pointercancel` (geste volé par le navigateur) relâche l'épinglage **sans** livrer
de position : le marker retombe sur la donnée de l'hôte, inchangée.

## Correspondance

| Ancienne carte | map3d |
|---|---|
| `marker.draggable = true` (Google) | `MarkerData.repositionable: true` |
| `marker.addListener('dragend', …)` + lecture de `.position` | `onReposition(marker, latLng)` |
| lecture continue pendant le drag | `onRepositionMove(marker, latLng)` |
| `map.setOptions({ draggableCursor })` | classe `.m3d-repositionable` (grab) / `.m3d-repositioning` (grabbing) |

## Critères d'acceptation

- [x] Un marker repositionnable renvoie une `LatLng` au drop.
- [x] Distinction nette avec le DnD `draggable`, sans conflit possible.
- [x] `pnpm typecheck` vert.
- [x] Exemple « pose ta position » : un seul marker déplaçable parmi des markers fixes,
      au sein d'une couche où `draggable` est actif pour tous.

## Non vérifié

Rien n'a été contrôlé dans un navigateur (`pnpm dev:example` non lancé). En particulier :
la précision du suivi **en vue inclinée** (critère explicite du prompt), le comportement
tactile, et le cas d'un marker repositionnable absorbé par un cluster pendant le geste.
Ce dernier point est un angle mort connu : le marker n'existe plus comme nœud, `moveItemNow`
devient un no-op silencieux. À traiter si la migration met des markers repositionnables
dans une couche clusterisée — `FieldLatLngMap` et `parameters` n'en ont qu'un seul, sans
clustering.

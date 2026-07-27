# BLOQUANT 1 — Identité métier, métadonnées ouvertes et events par forme

> Statut : implémenté. `pnpm typecheck` vert (lib + exemple).

## Le besoin

`operator/src/views/companyZones/ViewDetail.tsx` fait du CRUD par `uuid` : chaque zone
dessinée, éditée ou supprimée déclenche une mutation GraphQL portant l'identité et les
métadonnées de la zone. L'ancienne carte fusionnait l'objet Google vivant avec un `Shape`
métier (`Object.assign(polygon, shape)`) — les métadonnées voyageaient donc avec la forme.

Trois autres modules en dépendent : `selectZones/SelectZone.tsx`,
`SelectZoneGroup.tsx` et `SelectZoneGeographical.tsx`, qui appellent
`getZones()`, `addNewZone()`, `removeZone()` et `removeZoneUuid()`.

État initial de `map3d` : `DrawLayer` n'exposait qu'un `onChange(geojson)` **agrégé**, le
type `GeoJSONFeature.properties` était **fermé**, et `fromGeoJSON()` régénérait un id via
`nextId()` — **l'identité était perdue à chaque round-trip**.

## Ce qui a été livré

### 1. Identité préservée

`toGeoJSON()` émet `Feature.id` (champ standard GeoJSON, pas une extension maison).
`fromGeoJSON()` **réutilise l'id fourni** ; il ne régénère que si l'id est absent ou déjà
pris dans la collection en cours de construction.

`nextId()` est devenu une méthode d'instance qui **vérifie l'unicité contre `byId`**. Le
compteur global seul ne suffisait plus : importer `draw-7` dans une session neuve
collisionnait avec la 8e forme dessinée.

`fromGeoJSON()` ne détruit plus la sélection en vigueur — les ids survivant à l'import,
`selection.prune()` ne retire que ce qui a réellement disparu.

### 2. Métadonnées ouvertes

```ts
type ShapeMeta = Record<string, unknown>
```

Portée par `Drawing.meta`, sérialisée dans `properties.meta`, transportée telle quelle et
**jamais interprétée ni rendue** par la lib. C'est là que l'hôte loge `uuid`, `groups`,
`title`, `active`.

### 3. Events par forme

```ts
onShapeAdd?:    (shape: DrawnShape) => void
onShapeUpdate?: (shape: DrawnShape) => void
onShapeDelete?: (shape: DrawnShape) => void
onShapeEdit?:   (shape: DrawnShape) => void
```

Émis **au moment du changement**, pas dans `flushEmit` — c'était le piège : ce flush est
coalescé à 1×/frame, des events granulaires posés là auraient été agrégés comme `onChange`
et n'auraient servi à rien.

Points d'émission couverts : `commitLive` (dessin terminé), `duplicateSelected`,
`addShape` → **add** · `commitEdit` (géométrie), `setStyleForSelection`, `setLocked`,
`updateShape` → **update** · `deleteSelected`, `clear`, `eraseAt` (gomme), `removeShape`
→ **delete**.

`onShapeEdit` correspond à `onZoneEdit` de l'Operator, qui est un **double-clic** ouvrant
une fiche (`Map.tsx:519-523`) — une intention, pas une mutation. L'event n'est pas
consommé : sélection et édition sur place suivent leur cours.

**Undo/redo émettent aussi des events granulaires**, déduits par différence
(`emitDiff`). Ce n'est pas une exigence de l'Operator — l'ancienne carte n'avait pas
d'undo. Mais map3d en a un : sans ce diff, un Ctrl+Z défaisant une création laisserait en
base une zone absente de la carte, silencieusement.

### 4. API par identité

```ts
getShapes(): DrawnShape[]
getShape(id): DrawnShape | null
getLastShape(): DrawnShape | null
addShape(shape: NewShape, opts?): string
updateShape(id, patch: ShapePatch, opts?): boolean
removeShape(id, opts?): boolean
replaceShapes(shapes: NewShape[], opts?): void
```

Disponible sur le core `DrawLayer` **et** sur `useDrawing()`.

**`{ silent: true }`** n'émet aucun event (ni granulaire, ni `onChange`). C'est le portage
du flag `withEvent` de l'ancienne carte, utilisé à 4 endroits :
`clearZones(false)`, `addNewZone(zone, true, false)`, `removeZone(zone, false)`,
`removeZoneUuid(uuid, false)`. Sans lui, réinjecter la réponse du backend relancerait la
mutation qui vient de la produire.

`replaceShapes` émet par **différence** (contrairement à `fromGeoJSON` qui remplace en
bloc) : une app qui synchronise depuis son backend voit exactement ce qui a bougé.

`updateShape` invalide hauteur de drapage et résolution mémoïsée **uniquement si la
géométrie change** — même précaution que `commitEdit`, sans quoi la forme resterait drapée
à la hauteur de son ancien emplacement.

`meta` est **remplacée**, pas fusionnée. Pour patcher :
`updateShape(id, { meta: { ...getShape(id)?.meta, uuid } })`. Le style, lui, est fusionné
champ par champ (c'est un patch au sens de `DrawStyle`).

## Correspondance avec l'ancienne API

| Ancienne carte | map3d | Note |
|---|---|---|
| `getZones()` | `getShapes()` | |
| `getLastZone()` | `getLastShape()` | |
| `setLastZoneOptions({uuid, groups, color})` | `updateShape(id, { meta, style })` | l'id vient de `onShapeAdd`, plus besoin de « dernière zone » |
| `addNewZone(shape, panTo, withEvent)` | `addShape(shape, { silent })` | le cadrage se fait via `fitBounds` (BLOQUANT 2) |
| `updateZoneUuid(shape)` | `updateShape(id, patch)` | jamais appelée dans l'Operator |
| `removeZone` / `removeZoneUuid(uuid, withEvent)` | `removeShape(id, { silent })` | l'id map3d **est** l'uuid si l'hôte l'impose à la création |
| `replaceZones(shapes)` | `replaceShapes(shapes)` | jamais appelée dans l'Operator |
| `clearZones(withEvent)` | `clear()` / `replaceShapes([], { silent })` | |
| `disableEditing()` | `clearSelection()` | l'édition map3d découle de la sélection — aucune API nouvelle |
| `onZoneAdd` | `onShapeAdd` | |
| `onZoneUpdate` | `onShapeUpdate` | |
| `onZoneDelete` | `onShapeDelete` | |
| `onZoneEdit` | `onShapeEdit` | double-clic |
| `onZonesUpdate` | `onChange` | agrégé, déjà présent |

**Note d'identité** : `addShape({ id: uuid, ... })` fait de l'uuid métier l'id map3d
directement. Les vues `selectZones` qui manipulent des zones par `uuid` peuvent alors
utiliser `removeShape(uuid)` sans table de correspondance. Pour les formes dessinées à la
main, l'id est généré et l'uuid vit dans `meta` — le lien se fait dans `onShapeAdd`.

## Critères d'acceptation

- [x] Cycle dessin → `onShapeAdd` (id stable) → `updateShape(id, { meta })` → `removeShape(id)`.
- [x] Export/import GeoJSON conserve `id` et `meta`.
- [x] `pnpm typecheck` vert.
- [x] Exemple dans `examples/react` : les 4 events sont branchés, `onShapeAdd` simule le
      retour d'uuid du backend et le rattache en `silent`. `checkRoundTrip()` est exposé en
      console et rapporte le nombre d'identités/meta perdues (attendu : 0).

## Ce qui n'est pas couvert

Aucun event granulaire sur `fromGeoJSON()` : c'est un remplacement en bloc piloté par
l'hôte, qui sait déjà ce qu'il injecte. `onChange` reste émis. Utiliser `replaceShapes()`
si le diff est voulu.

# IMPORTANT 6 — Contraintes de dessin

> Statut : implémenté. `pnpm typecheck` vert (lib + exemple).

## Le besoin, redimensionné par l'audit

Le prompt demandait quatre contraintes. L'audit de l'Operator en a écarté deux :

| Contrainte | Verdict | Détail |
|---|---|---|
| **Confinement aux limites** | à porter | `Map.tsx:468`, actif dès qu'`addLimitsZones` est fourni. 2 vues : `companyZones/ViewDetail`, `map/ViewDetail` |
| **Aire maximale** | à porter | `maxAreaM2`, 1 vue (`map/ViewDetail`) |
| **Anti-collision** | **abandonnée** | `Map.tsx:473` la garde derrière `noCollisionAllowed`, prop que **personne ne passe**. Elle protège un chemin mort |
| **Opacité des limites** | **caduque** | `setOpacityLimitsZones` n'avait que `MapTools` comme appelant, et `MapTools` est abandonné au profit de la `Toolbar` map3d |

Porter l'anti-collision aurait signifié écrire — et maintenir — les six prédicats
d'intersection par paire de types (`circlePolygonCollide`, `rectangleCircleCollide`…)
de `utils/map.ts`, pour une fonctionnalité qu'aucune vue n'active.

## Pourquoi une nouvelle couche géométrique

`layers/draw/hitTest.ts` contient déjà `pointInPolygon` et `segmentsIntersect`, mais **en
coordonnées écran**. Les réutiliser aurait produit un verdict dépendant de la caméra : une
zone jugée « dans les limites » serait devenue hors limites au simple pivot de la vue.

D'où `src/core/geodesy.ts`, en lat/lng et mètres :

```ts
polygonAreaM2(ring): number          // excès sphérique (Chamberlain & Duquette)
pointInRing(p, ring): boolean        // ray casting, longitudes déroulées
ringInsideRing(inner, outer): boolean
circleRing(center, radiusMeters, segments?): LatLng[]
```

`polygonAreaM2` utilise **la même méthode que `google.maps.geometry.spherical.computeArea`**,
donc des valeurs comparables à celles que l'ancienne carte affichait — un `maxAreaM2` migré
tel quel garde le même seuil effectif.

Les longitudes sont déroulées sur un axe continu avant chaque test planaire : sans ça, une
zone à cheval sur ±180° donnerait des résultats absurdes.

Les points **exactement sur un bord sont acceptés** (tolérance ~0.1 mm) : une forme dessinée
en s'aimantant à la limite ne doit pas être refusée pour un arrondi flottant.

## L'API

```tsx
<DrawLayer
  constraints={{ limits: zonesAutorisees, maxAreaM2: 10_000_000 }}
  onReject={(reason, shape) => toast(messages[reason])}
/>
```

`limits` prend des `ShapeData` — le même type que `<ShapeLayer>`. La forme doit tenir dans
**au moins un** périmètre, pas dans leur union : deux limites disjointes ne doivent pas
autoriser une zone qui chevaucherait le vide entre les deux.

`limits` **ne dessine rien**. L'affichage des périmètres reste à l'hôte (`<ShapeLayer>`, ou
des formes verrouillées via `properties.locked`) — la lib n'impose pas de rendu à des
données dont elle ne connaît que le rôle de contrainte.

`onReject` ne déclenche aucun affichage : la lib n'a pas de système de toast, et l'hôte a
le sien. Motifs : `'outOfLimits' | 'maxArea'`.

## Ce qui est contraint, et ce qui ne l'est pas

**Seuls les gestes utilisateur** — création (`commitLive`) et édition (`commitEdit`,
poignées comme flèches du clavier).

**Pas les mutations programmatiques** (`addShape`, `updateShape`, `replaceShapes`,
`fromGeoJSON`) : quand l'application injecte ses propres données, elle sait ce qu'elle
fait, et les refuser silencieusement serait pire que tout. C'est aussi ce que faisait
l'ancienne carte, dont la validation vivait dans le handler de dessin.

**Pas l'outil règle** (`measure`), qui mesure sans rien délimiter.

## Deux comportements de refus distincts

**À la création**, la contrainte est évaluée **avant toute trace** : ni mesh, ni entrée
d'historique, ni `onChange`. Le geste est comme s'il n'avait pas eu lieu.

**À l'édition**, la forme est **remise dans son état d'avant le geste** plutôt que
supprimée — l'utilisateur ne doit pas perdre une zone existante en la déplaçant mal.
D'où `editGuard`, une copie des points capturée au début du geste (via le `snapshotBefore`
de `EditController`, et explicitement dans `nudgeSelection` qui ne passe pas par lui).

Conséquence voulue : une forme restaurée **n'émet pas `onShapeUpdate`**. Du point de vue de
l'hôte, rien n'a changé — seul `onReject` le prévient.

## Correspondance

| Ancienne carte | map3d |
|---|---|
| `addLimitsZones` (contrainte) | `constraints.limits` |
| `addLimitsZones` (affichage) | `<ShapeLayer shapes={limites}>` |
| `isShapeInLimits` (`utils/map.ts`) | `ringInsideRing` + `ringOfShape` |
| `maxAreaM2` + toast | `constraints.maxAreaM2` + `onReject('maxArea')` |
| `getShapeArea` / `getPolygonArea` | `polygonAreaM2` (même méthode que Google) |
| `isPointInLimit` (`utils/map.ts`, hors carte) | `pointInRing` |
| `noCollisionAllowed` / `isShapeOnShape` | **non porté** (code mort) |
| `setOpacityLimitsZones` | **caduc** (`MapTools` abandonné) ; masquer les limites passe par le filtre de tags |

## Limite connue de l'implémentation

`ringInsideRing` teste les **sommets** de la forme intérieure. C'est exact pour des
contours convexes et suffisant pour une zone dessinée dans un périmètre — le cas métier.
Un contour **concave** dont une arête sortirait entre deux sommets passerait au travers.
Couvrir ce cas demanderait un test d'intersection arête à arête, pour un gain nul sur des
périmètres réels. Les cercles sont polygonisés à 48 segments, donc leur bord est approché
par une corde : une forme tangente au bord intérieur d'un cercle peut être acceptée à
quelques centimètres près.

## Critères d'acceptation

- [x] Une zone hors des limites est annulée et `onReject('outOfLimits')` est appelé.
- [x] Une zone trop grande est annulée et `onReject('maxArea')` est appelé.
- [x] Une édition refusée restaure la forme au lieu de la perdre.
- [x] Les prédicats sont géodésiques, donc stables au pivot de caméra.
- [x] `pnpm typecheck` vert.
- [x] Exemple : le dessin est confiné au cercle de démo, avec un plafond de 10 km².

## Non vérifié

Pas de contrôle en navigateur. En particulier : le ressenti du refus à l'édition (la forme
« saute » à sa position d'avant, ce qui peut surprendre sans le toast de l'hôte), et la
justesse des aires calculées face aux valeurs qu'affichait l'ancienne carte.

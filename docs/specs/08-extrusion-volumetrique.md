# MINEUR 15 (promu) — Extrusion volumétrique des formes

> Statut : implémenté. `pnpm typecheck` et `pnpm build` verts. **Rendu non vérifié
> visuellement.**

## Le besoin

`operator/src/components/map/Map3D.tsx` extrude ses zones : tous les sommets à
`altitude: 200`, `extruded: true`, `AltitudeMode.RELATIVE_TO_GROUND`, vue inclinée à 60°.
Trois vues l'utilisent : `VoiceAlertResultDisplay`, `ViewFormConfim`, `ViewDangerMap` — des
écrans de **confirmation**, où le volume sert à rendre la zone évidente.

`Map3D` est un composant autonome (il n'utilise pas `Map.tsx`) dont la seule prop est
`zones`. C'est donc le cas de migration le plus simple — à condition de conserver le
volume, sans quoi ces trois écrans passeraient à un aplat au sol.

## L'API

```ts
type ShapeStyle = {
  …
  /** Hauteur d'extrusion en mètres au-dessus du sol. Absent ou 0 = drapé (défaut). */
  extrudeHeight?: number
}
```

```tsx
<ShapeLayer shapes={[{ kind: 'polygon', points, color, fillOpacity: 0.18, extrudeHeight: 200 }]} />
```

Additif et sans effet sur l'existant : sans le champ, le rendu est strictement celui
d'avant. N'a de sens que pour les formes fermées — sur une ligne, un mur sans épaisseur
n'apporterait rien.

## Le point critique : aucune dérive possible par rapport au sol

C'est le risque signalé, et connu sur ce genre de couche : une géométrie qui « glisse » au
pan parce qu'elle est ancrée à une hauteur différente de la surface visible (parallaxe).

La parade tient à une décision de structure : **le volume est monté dans le même groupe ENU
que la surface drapée**, pas dans un objet parallèle.

```
enu (groupe ENU, base posée à la hauteur de drapage résolue)
├── remplissage au sol      y = 0
├── contour au sol          y = 0
├── murs du prisme          y = 0 → extrudeHeight
├── couvercle               y = extrudeHeight
└── liseré du couvercle     y = extrudeHeight
```

Conséquences directes :

- **Une seule ancre, une seule hauteur.** Le prisme n'a pas de position propre : ses
  sommets sont des coordonnées locales dans un repère dont `DrapedLayer` garantit déjà le
  placement. Il ne peut pas diverger de la base — il n'a rien à diverger.
- **Le raffinement des tuiles est hérité.** Quand la hauteur du sol se précise (streaming
  LOD), `DrapeSync.applyBasis` repose la matrice du groupe : tout le contenu monte ou
  descend ensemble, sans déformation ni rebuild.
- **Le rebuild d'hystérésis est hérité.** Un changement de résolution reconstruit le drape
  via `rebuildDrape`, qui **réutilise la hauteur mémoïsée** — le prisme est reconstruit
  avec, jamais avec une hauteur fraîchement devinée.
- **Aucun second système de positionnement** n'a été introduit. C'est le point sur lequel
  une régression serait la plus facile à créer, et la plus pénible à diagnostiquer.

## Le volume part du sol, pas du plan de l'ancre

Premier rendu à l'écran : sur une zone à cheval sur la Seine, le bas des murs
**flottait au-dessus du pont** au lieu de sortir du sol.

La cause : une forme drapée n'a qu'**une seule hauteur de terrain**, échantillonnée à son
ancre (le centre). C'est suffisant tant qu'elle est plaquée au sol — elle se dessine par
dessus tout, sans test de profondeur, donc l'écart ne se voit pas. Dès qu'on en fait un
volume, l'écart devient visible partout où le terrain descend sous le niveau du centre :
berge, pont, vallon.

Correction — `extrudeBaseY` échantillonne le sol le long du contour (au plus 16 points, un
raycast chacun, **au build uniquement**), retient le plus bas, et fait démarrer les murs
8 m en dessous. Le volume est ainsi enterré partout où le terrain remonte entre deux
échantillons, et ne flotte nulle part.

Ce qui est volontairement conservé :

- **Le bas reste plan.** Faire onduler la base avec le terrain demanderait une
  triangulation sur un contour gauche, pour un résultat invisible (la partie basse est
  sous terre par construction).
- **Le couvercle reste à `extrudeHeight` au-dessus de l'ancre.** La hauteur demandée est
  donc mesurée depuis le sol de référence de la zone, pas depuis chaque sommet. Sur un
  terrain très accidenté le couvercle peut donc s'approcher du sol côté haut — c'est le
  comportement le plus prévisible pour un plafond de zone.
- **Terrain inconnu** (tuiles pas encore chargées) → repli sur le plan de l'ancre ; le
  drape est reconstruit quand les hauteurs se résolvent, via le mécanisme habituel.

## Les arêtes : des lignes GL, pas des rubans

Les traits de la lib sont des **rubans** (`ribbon`) : une géométrie dont l'épaisseur est
exprimée en mètres, recalculée depuis une épaisseur écran à la résolution courante, et
reconstruite quand le zoom franchit une bande d'hystérésis. C'est ce qu'il faut pour un
trait épais qui reste constant au zoom.

Pour une arête **de 1 px**, c'est le mauvais outil : la conversion px→mètres ne tombera
jamais exactement sur un pixel, et le rebuild d'hystérésis coûterait pour un trait dont
l'épaisseur ne varie pas.

D'où `prismEdges` + `edgeMaterial`, qui rendent les arêtes en `THREE.LineSegments`. WebGL
ignore `linewidth` et trace toujours 1 pixel : ce qui est d'ordinaire une limitation est
ici exactement l'effet voulu — 1 px pile, constant, sans aucune conversion.

Trois familles d'arêtes : l'anneau du bas, les montants verticaux à chaque sommet, l'anneau
du couvercle. **Sur une forme extrudée, l'anneau du bas remplace le contour drapé en
ruban** : garder un ruban de 6 px à la base sous des arêtes de 1 px donnerait un volume
visuellement bancal. Une forme non extrudée conserve son contour en ruban, inchangé.

## Le matériau : pourquoi pas `flatMaterial`

`flatMaterial` (celui des formes drapées) a `depthTest: false` — voulu : un marquage au sol
doit se dessiner par-dessus les tuiles quel que soit le relief.

Appliqué à un volume, ce réglage donnerait n'importe quoi : les faces arrière se
peindraient par-dessus les faces avant, et le prisme flotterait devant les bâtiments qui
sont pourtant entre lui et la caméra.

D'où `volumeMaterial` :

- `depthTest: true` — le volume est correctement occulté par le bâti qui passe devant ;
- `depthWrite: false` — les faces d'un même prisme ne s'occultent pas entre elles, on voit
  bien au travers ;
- `side: DoubleSide` — l'intérieur du volume reste visible quand la caméra y entre.

L'opacité des murs est plancher-née à 0.12 : une zone réglée à `fillOpacity: 0` (contour
seul) donnerait sinon un volume totalement invisible, ce qui rendrait `extrudeHeight` sans
effet apparent.

## Correspondance

| Ancien `Map3D` | map3d |
|---|---|
| `Polygon3DElement` + `extruded: true` | `ShapeData.extrudeHeight` |
| `altitude: 200` sur chaque sommet | `extrudeHeight: 200` |
| `AltitudeMode.RELATIVE_TO_GROUND` | comportement natif (le drapage est relatif au sol réel) |
| couleurs codées en dur par type de zone | `color` / `fillOpacity` par forme, ou le thème |
| `calculateBounds` + `calculateOptimalRange` | `boundsOfShapes` + `camera.fitBounds` (BLOQUANT 2) |
| `tilt: 60` | `engine.tiltBy()` ou la vue courante |

## Critères d'acceptation

- [x] `extrudeHeight` produit un volume ; absent, le rendu est inchangé.
- [x] Le volume partage l'ancre et la hauteur de drapage de la surface — pas de second
      ancrage, donc pas de dérive structurellement possible.
- [x] `pnpm typecheck`, `pnpm build` et `pnpm build:example` verts.
- [x] Exemple : un polygone extrudé à 200 m à côté du cercle drapé, pour comparer.

## À vérifier visuellement (non fait)

`pnpm dev:example`, vue inclinée, sur la zone orange :

1. **Pan soutenu** — la base du volume doit rester collée au sol, sans glisser par rapport
   au cercle bleu drapé voisin. C'est le test du risque signalé.
2. **Zoom avant/arrière franc** — au franchissement de la bande d'hystérésis, le prisme est
   reconstruit : vérifier qu'il ne saute pas en hauteur.
3. **Chargement des tuiles** — au premier affichage, la hauteur du sol n'est pas encore
   résolue ; le volume doit se recaler proprement avec la surface, pas indépendamment.
4. **Occultation** — un bâtiment devant le volume doit le masquer, et non l'inverse.
5. **Bascule 2D ↔ 3D** — en vue plane nadir, le volume se réduit visuellement à son
   emprise au sol, ce qui est attendu.

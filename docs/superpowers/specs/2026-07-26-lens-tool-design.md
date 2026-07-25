# Design — Outil Loupe (rayon X de markers)

Date : 2026-07-26
Statut : validé (brainstorming), prêt pour plan d'implémentation
Portée : lib `map3D` uniquement (l'intégration exemple React puis operator suit le
workflow map3D habituel : lib → exemple → operator).

## 1. Objectif

Ajouter un outil **« loupe »** dans la barre d'outils de dessin (`Toolbar`), en
**item principal** (au même niveau que `rect`, `polygon`, `circle`…), **pas** dans le
flyout du sélecteur.

L'outil trace une **zone rectangulaire** et **inventorie tous les markers contenus dans
la zone**, y compris ceux **agrégés dans des clusters** — un « rayon X » de markers. Le
résultat s'affiche dans un **panneau-liste à droite** de la zone, une **ligne par
marker**.

C'est un outil de **consultation (read-only)** : il ne modifie pas la carte, ne
sélectionne rien de lui-même. La liste expose toutefois des **actions par ligne**
(dont « Sélectionner » dès maintenant), conçues pour être **extensibles**.

## 2. Comportement fonctionnel

### 2.1 Ce que la loupe ramasse
- **Uniquement des markers.** Les formes géométriques (lignes, polygones, cercles,
  flèches, mesures…) sont ignorées.
- **Y compris les markers cachés dans les clusters.** Si un cluster de 30 markers est
  dans la zone, les 30 markers réels apparaissent dans la liste — pas le cluster.
- **La carte ne change pas** : les clusters restent affichés tels quels. Seul le panneau
  inventorie (pas d'éclatement visuel des clusters sur la carte).

### 2.2 Cycle de vie de la zone
- Le geste de tracé est identique au sélecteur rectangle (clic-glissé qui dessine la
  zone).
- Une fois tracée, **la zone persiste** avec son panneau ouvert.
- Elle est **déplaçable** (drag-n-drop) et **redimensionnable** (poignées) ; à chaque
  déplacement/redimensionnement **la liste se recalcule en direct**.
- La liste **se recalcule aussi** quand la carte bouge/zoome (les clusters changent).
- Un **bouton « retirer »** ferme la zone et le panneau.
- **Une seule** zone loupe à la fois : retracer remplace la précédente.
- L'outil loupe est **mutuellement exclusif** avec les outils de dessin : activer la
  loupe désactive l'outil de dessin courant et inversement.

### 2.3 Panneau-liste (à droite de la zone)
- **En-tête fixe** (ne défile pas) : compteur « N markers » + récap du décompte par type
  (ex. « 12 agents · 5 alertes ») + bouton fermer la zone.
- **Corps scrollable** à hauteur bornée : **1 ligne par marker**, ergonomique à 50+
  éléments.
- Rendu d'une ligne **configurable** par l'app via `renderItem`, avec un rendu **par
  défaut** minimal : pastille de couleur du `type` (+ avatar si présent) + `id`.
- **Actions extensibles** (voir §4.4) : « Sélectionner » et « Tout sélectionner » livrés
  d'origine.
- Respecte le design system de la lib (classes `m3d-*`, `theme`, `labels`/i18n).

## 3. Principe directeur : réutilisation maximale (zéro duplicate)

Contrainte explicite : **optimisé, sans duplication de code**. Chaque besoin s'appuie sur
une brique existante.

| Besoin | Brique existante réutilisée |
|---|---|
| Markers cachés dans les clusters | `ClusterEngine.getLeaves()` / `leafMarkerIds()` (mémoïsé) |
| Métadonnées marker + couleur du type | `SelectableRegistry` (`engine.selectables`), `theme.colors.marker` |
| Action « Sélectionner » | `SelectionManager` (`extSel`) existant |
| Move / resize de la zone | `EditController` (déjà découplé via contrat host) |
| Panneau flottant déplaçable | Logique de drag de `SelectionBadges` → **extraite en hook** |
| Langage visuel de la liste | Classes `m3d-panel`, `m3d-tagrow`, pastille, croix |
| Projection écran ↔ géo, format rect | `Projection`, format `points` diagonal + `diagonalToCorners` |

## 4. Architecture

Approche retenue : **couche séparée `LensLayer`** (pas d'extension du modèle `Drawing`).
La loupe ne crée **aucun `Drawing`** → elle reste hors export GeoJSON, undo/redo et
styles. Aucun cas spécial `'lens'` disséminé dans le modèle de dessin.

### 4.1 Fournisseur d'inventaire de markers (point clé « voir dans les clusters »)

Le `ClusterEngine` vit dans `MarkerLayer`, pas globalement. Pour que la loupe voie **tous**
les markers d'une bbox (individuels **et** agrégés), on introduit un **registre
d'inventaire** `engine.markerInventory` (`MarkerInventoryRegistry`) sur `MapEngine`, sur le
même patron que `SelectableRegistry` / `engine.tags` :

- `MarkerLayer` s'enregistre comme fournisseur et répond à une requête par bornes géo :
  `markersInBounds(bounds: Bounds): MarkerData[]`, résolue depuis ses **données sources**
  (pas depuis l'état de clustering écran) — donc indépendante du fait qu'un marker soit
  visuellement clusterisé ou non.
- `LensLayer` **consomme** ce registre. Les couches ne se connaissent jamais entre elles.

Conséquence : **zéro duplication** de la logique de clustering ; la loupe interroge la
source de vérité.

> Note d'implémentation : si plusieurs couches marker cohabitent, l'inventaire concatène
> les fournisseurs (comme `SelectableRegistry.items()`).

### 4.2 `LensLayer` (core `Layer`, à côté de `DrawLayer`)

Responsabilités :
- Détient l'état : `zone: RectRegion | null` (2 coins géo), actif/inactif.
- **Tracé** : intercepteur pointeur (`down`/`move`/`up`) qui crée/étend la zone (même
  logique diagonale qu'un rect ; pas de `Drawing` créé).
- **Édition** : move/resize **délégués à `EditController`**, alimenté par un **host
  minimal** exposant la seule zone loupe comme cible éditable (pas de rotation, pas de
  multi-forme). Réutilise poignées de resize, curseurs et conversion écran↔géo existants.
- **Inventaire** : à chaque changement (tracé/move/resize/caméra), calcule la bbox géo de
  la zone, appelle `engine.markerInventory.markersInBounds(bounds)`, puis filtre finement les
  markers réellement à l'intérieur du rectangle (le rect peut être non aligné sur la bbox
  si un jour on autorise la rotation — pour l'instant axis-aligned). Émet un événement de
  changement d'inventaire.
- **Rendu overlay** : le rectangle de la zone + ses poignées + bouton fermer.
- **Exclusivité** : coordination avec `DrawLayer` pour qu'un seul outil soit actif.

Ce que `LensLayer` **ne fait pas** : aucun `Drawing`, aucune entrée d'undo/redo, aucune
sérialisation GeoJSON, aucun style de forme.

### 4.3 `useDraggablePanel` (hook extrait de `SelectionBadges`)

Les ~90 lignes de mécanique de panneau flottant de `SelectionBadges` (position épinglée,
drag clampé au conteneur via poignée, re-clamp au resize via `ResizeObserver`) sont
**extraites en un hook partagé** `useDraggablePanel`.

- `SelectionBadges` est **refactoré** pour l'utiliser → on **supprime** du duplicate
  existant (pas seulement on en évite pour le neuf).
- `LensPanel` l'utilise également.
- Le hook retourne l'essentiel (ref du panneau, style de position, handlers de poignée) et
  reste agnostique du contenu.

### 4.4 `LensPanel` (React)

- Positionné **à droite de la zone** ; déplaçable via `useDraggablePanel`.
- **En-tête** : compteur + récap par type + bouton fermer.
- **Corps scrollable** : liste `1 ligne / marker`, rendu via `renderItem` (défaut :
  pastille couleur du type + avatar + id).
- **Système d'actions déclaratif** (extensibilité — exigence forte) :

  ```ts
  type LensActionContext = {
    marker: MarkerData          // pour une action par-ligne
    markers: MarkerData[]       // inventaire courant complet (actions globales)
    close(): void               // ferme la zone loupe
  }
  type LensAction = {
    id: string
    label: string               // via labels/i18n
    icon?: string               // chemin mdi
    scope: 'row' | 'global'     // par-ligne vs barre d'actions du panneau
    run(ctx: LensActionContext): void
  }
  ```

  - Actions livrées d'origine :
    - **`select`** (`scope: 'row'`) → pousse le marker dans `SelectionManager` (`extSel`),
      donc dans la sélection carte existante (badges compris).
    - **`select-all`** (`scope: 'global'`) → pousse tout l'inventaire courant.
  - Ajouter une future action = fournir un objet `LensAction` en prop, **sans toucher au
    composant**.

### 4.5 Intégration `Toolbar`

`Toolbar` itère aujourd'hui sur `tools: DrawTool[]`. La loupe n'étant pas un
`DrawTool`, on ajoute un **mécanisme léger d'« outils externes »** : un item principal
déclaré hors de l'union `DrawTool`, avec son propre état actif/toggle et son icône (loupe,
ex. `mdiMagnify`). Cela :
- garde le modèle `Drawing`/export/undo pur ;
- est **extensible** à de futurs outils non-dessin sans nouvelle plomberie.

### 4.6 Wrapper React `<LensLayer>`

Composant de montage (à l'image de `<MarkerLayer>` / `<DrawLayer>`) qui instancie la
couche et le panneau, et expose les props publiques : `renderItem`, `actions`
(supplémentaires), `labels`, éventuels réglages (taille max du panneau…). Contrôlé,
i18n via le système `labels`.

## 5. Flux de données (résumé)

```
Tracé/Move/Resize/Pan
        │
        ▼
LensLayer: bbox géo de la zone
        │  engine.markerInventory.markersInBounds(bounds)
        ▼
MarkerLayer (fournisseur) → MarkerData[] (source, clusters inclus)
        │  filtrage fin dans le rectangle
        ▼
LensLayer: inventaire courant  ──émet──▶  LensPanel (liste + actions)
                                              │ action "select"
                                              ▼
                                        SelectionManager.extSel → sélection carte
```

## 6. Décisions tranchées (défauts)

- **Une seule** zone loupe active à la fois (retracer remplace).
- L'action « Sélectionner » **alimente la sélection carte existante** (badges compris) via
  `SelectionManager`.
- Recalcul de l'inventaire **en direct** (tracé, move, resize, pan/zoom).
- Structure de liste : **plate**, 1 ligne / marker, avec **en-tête récap par type**.
- **Pas** d'éclatement visuel des clusters sur la carte (liste seule).
- **Pas** d'effet loupe optique (magnification du terrain) dans ce premier jet — le point
  d'extension existe (surface dédiée à `LensLayer`) pour l'ajouter plus tard sans refonte.

## 7. Hors périmètre (mais prévu pour l'avenir)

- Effet loupe **optique** (second passage de rendu Three.js à FOV réduit sur la zone) :
  faisable mais coûteux et sans valeur immédiate — la surface `LensLayer` le permettra.
- Actions supplémentaires dans le panneau (exporter, épingler, filtrer…) : le système
  `LensAction` est conçu pour les accueillir sans modifier le composant.
- Éclatement visuel local des clusters dans la zone.

## 8. Livrables (dans l'ordre du workflow map3D)

1. **Lib `map3D/src`** : registre d'inventaire + `MarkerLayer` fournisseur, `LensLayer`
   (core) + wrapper React, `useDraggablePanel` (+ refacto `SelectionBadges`), `LensPanel`,
   système `LensAction`, bouton « outil externe » dans `Toolbar`, styles `m3d-*`,
   labels i18n, exports `index.ts`, build `dist`.
2. **Exemple `map3D/examples/react`** : démo de l'outil loupe (validation visuelle).
3. **Operator** : intégration seulement une fois la feature visible et fonctionnelle dans
   l'exemple.

## 9. Critères d'acceptation

- L'item loupe apparaît comme **outil principal** dans `Toolbar` et s'active/désactive
  en exclusion des outils de dessin.
- Tracer une zone au-dessus d'un cluster liste **tous** ses markers individuels.
- Les formes géométriques n'apparaissent **jamais** dans la liste.
- La zone est déplaçable et redimensionnable, la liste se recalcule en direct ; un pan/zoom
  qui change le clustering met la liste à jour.
- Le panneau est à droite de la zone, en-tête fixe + corps scrollable, propre à 50+
  markers.
- « Sélectionner » depuis une ligne ajoute le marker à la sélection carte (badge visible).
- Aucune régression : la loupe n'apparaît pas dans l'export GeoJSON, l'undo/redo ni le
  panneau de style ; `SelectionBadges` fonctionne à l'identique après extraction du hook.

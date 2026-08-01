# Symboles — guide complet

**Français** · [English](../en/SYMBOLS.md) · [↑ Index](README.md)

Les **icônes d'un catalogue** se posent sur le terrain par glisser-déposer depuis une
palette, puis sont déplaçables, sélectionnables, filtrables par tag et persistables —
mêmes garanties que les formes de dessin, appliquées à des points.

**Il n'y a pas de couche à monter.** Un symbole posé est une forme de la collection de
dessin (`kind: 'symbol'`) : `<DrawLayer>` porte l'ensemble, et le symbole hérite de
l'undo/redo, du GeoJSON et des events par forme sans que rien ne soit dupliqué.

---

## 1. Prêt à l'emploi

La symbologie **MIL-STD-2525D** est fournie et **active par défaut** :

```tsx
<Map center={PARIS} zoom={15} draw={{}} toolbar={{}} />
{/* bouton « Symboles » dans la barre, touche Y, catalogue MIL-STD */}
```

Pour désactiver l'outil : `draw={{ symbols: { enabled: false } }}`.

---

## 2. Le graphisme est injecté

La couche ne connaît que des **clés de catalogue**, jamais un format de symbologie.
Même patron que les fournisseurs de recherche et de routage : un catalogue peut
changer de graphisme sans invalider les données déjà enregistrées.

```ts
type SymbolCatalog = {
  id: string                                  // ex. 'mil-std-2525d' — tracé dans le GeoJSON
  entries: SymbolEntry[]
  variantColors?: Record<string, string>      // { friendly: '#00A8FF', … }
}

type SymbolEntry = {
  key: string            // identifiant STABLE — c'est lui qui est stocké
  label: string
  category: string       // groupe de rangement dans la palette (chaîne libre)
  description?: string
  keywords?: string[]    // termes supplémentaires pour la recherche de la palette
  multiPoint?: boolean   // graphique tactique (périmètre, axe, zone)
  minPoints?: number
  color?: string
  minZoom?: number       // seuil d'apparition du symbole POSÉ (cf. § 6)
  tags?: string[]        // défaut ['symbol', category]
}

type SymbolRenderer = {
  render: (key: string, opts?: { size?: number; variant?: string }) => RenderedSymbol | null
  ready?: Promise<void>
}
```

```tsx
const catalog: SymbolCatalog = {
  id: 'mon-catalogue',
  entries: [
    { key: 'poste',   label: 'Poste de commandement', category: 'installations' },
    { key: 'hopital', label: 'Hôpital', category: 'installations', minZoom: 9 },
  ],
}

const renderer: SymbolRenderer = {
  ready: chargerMonSdk(),
  render: (key, { size, variant } = {}) => ({ size: size ?? 40, svg: svgAncreAuCentre(key, variant) }),
}

<Map draw={{ symbols: { catalog, renderer } }} />
```

`render` est **synchrone** (appelé à chaque rendu React) : mémoïsez côté provider. Le
chargement d'un éventuel SDK passe par `ready`, après quoi la couche se re-rend ;
`render` peut renvoyer `null` d'ici là, la couche affiche un placeholder discret.

> ### ⚠️ Le SVG doit être ancré au **centre de son viewBox**
>
> C'est une exigence, pas un confort. Les symboles MIL-STD ont un point d'ancrage
> interne qui n'est pas le centre de l'image — un poste de commandement pend sous son
> mât. Rendre le SVG brut décalerait le symbole de plusieurs pixels par rapport au
> terrain. **Recentrer le viewBox sur l'ancre est la responsabilité du provider** ;
> la couche, elle, place le centre de l'image sur la coordonnée.

Corollaire de rendu : un symbole posé garde en revanche sa **tige** (`leaderLine` à sa
valeur par défaut) — c'est elle qui sépare l'icône, saisissable au long-press vers un
dock, du point au sol, qui pilote le repositionnement (cf.
[MARKERS.md § 11](MARKERS.md#11-markers-repositionnables)).

---

## 3. La symbologie MIL-STD-2525D fournie

```tsx
import { MILSYM_CATALOG, createMilSymRenderer } from '@pasquelin/map3d'

const renderer = useMemo(() => createMilSymRenderer({ affiliation: 'friendly' }), [])

<Map draw={{ symbols: { renderer } }} />   // `catalog` vaut MILSYM_CATALOG par défaut
```

`MILSYM_CATALOG` couvre **91 entrées** en 7 catégories — 80 icônes ponctuelles
(`installations`, `units`, `equipment`, `air`, `events`, `control`) et 11 graphiques
tactiques multi-points — avec libellés et descriptions **en français**.

La `variant` d'un symbole est son **affiliation** : `friendly`, `hostile`, `neutral`,
`unknown`. Couleurs de repérage dans `MILSYM_AFFILIATION_COLORS`.

**Poids et chargement.** Le SDK `@armyc2.c5isr.renderer/mil-sym-ts-web` pèse ~9 Mo. Il
est chargé en **import dynamique**, donc isolé dans un chunk que seule une carte
affichant des symboles télécharge — et jamais au simple montage de `<DrawLayer>` : le
chargement est déclenché par l'ouverture de la palette ou par la présence d'un symbole
posé. `render` reste synchrone et sert depuis un cache par SIDC + taille.

### ⚠️ Piège du SIDC

L'affiliation est le **4ᵉ** chiffre du SIDC 2525D, pas le 3ᵉ — celui-ci porte le
*contexte* (0 réalité, 1 exercice, 2 simulation).

L'écrire en 3ᵉ position produit un symbole de contexte non standard : graphisme
décoré, dimensions et **point d'ancrage différents** (≈ 5 px de décalage vertical
mesuré), l'affiliation restant celle du catalogue. `applyAffiliation` de map3d écrit
au bon endroit ; `applySidcAffiliation` côté operator ne le fait pas — c'est un point
à corriger à la migration.

```ts
applyAffiliation(sidc, 'hostile')   // → sidc.substring(0,3) + '6' + sidc.substring(4)
milSymSidc(key, affiliation)        // SIDC final d'une entrée du catalogue
```

---

## 4. La palette

Le bouton qui ouvre la palette est un **outil natif de la barre** (comme la loupe) :
`<Toolbar>` le rend elle-même, `components={{ symbol: false }}` le masque.

```tsx
<DrawLayer>
  <Toolbar />
</DrawLayer>
```

Le catalogue, l'affiliation et les libellés viennent du contexte de `<DrawLayer>` :
**la palette n'a aucune configuration à recevoir**.

Le panneau reprend le langage visuel de « Couches » — recherche, compteurs par
catégorie, panneau ancré du côté opposé à la barre, fermeture au clic extérieur ou
`Échap` — et ajoute une grille par catégorie.

Chaque vignette est rendue par le `SymbolRenderer` **dans l'affiliation courante** :
changer d'affiliation redessine toute la palette, et le symbole posé hérite de la
variante affichée.

Détails d'usage, et pourquoi :

- Chaque vignette affiche le **nom du symbole sous l'icône** (tronqué à deux lignes,
  nom complet au survol) : un pictogramme MIL-STD seul ne dit pas de quoi il s'agit.
- La prise est **immédiate** sur une vignette (`longPressMs: 0`) — une palette n'a pas
  de clic à préserver, contrairement à un marker dont le clic ouvre une fiche.
- Les entrées `multiPoint` sont **listées mais grisées** plutôt que masquées, pour ne
  pas faire croire à un catalogue incomplet. Elles sont **ignorées au dépôt** : elles
  se posent par collecte de points successifs, mode qui n'est pas encore implémenté.
- Le panneau n'est monté qu'ouvert : fermé, il n'appelle pas le renderer.

Les textes (bouton, catégories, affiliations) ne passent pas par le catalogue : ils
sont dans `labels.symbols` — cf. [LABELS.md](LABELS.md).

---

## 5. Poser, déplacer, persister

Poser une icône neuve et déplacer une icône existante sont **le même geste** sur la
même zone (`useMapDropZone`) : seule la provenance de la charge diffère.

```ts
const { symbols } = useDrawing()

symbols.enabled              // false si l'outil est désactivé
symbols.catalog              // catalogue courant
symbols.render(key, opts?)   // vignette — null tant que le graphisme n'est pas chargé
symbols.ready                // false tant que le renderer se charge
symbols.affiliation          // variante appliquée aux poses
symbols.setAffiliation(v)
symbols.paletteOpen          // publié par le bouton, jamais relu par lui
symbols.setPaletteOpen(open)
symbols.place(key, at, variant?)   // pose un symbole → id, ou null
```

Le reste est le CRUD des formes : `addShape`, `updateShape`, `removeShape`,
`undo`/`redo`, `toGeoJSON`… symboles compris.

Les events sont ceux de la couche de dessin — un symbole s'y reconnaît à
`kind === 'symbol'`, et son entrée de catalogue à `symbol.key` :

```tsx
<Map
  draw={{
    onShapeAdd: (s) => (s.kind === 'symbol' ? creerSymbole(s.symbol!.key, s.points[0]) : creerZone(s)),
    onShapeUpdate: (s) => sauver(s.meta?.uuid, s),
    onShapeDelete: (s) => supprimer(s.meta?.uuid),
  }}
/>
```

---

## 6. Ce dont un symbole hérite

Le rendu passe par `<MarkerLayer>` : un symbole ponctuel **est** un point à icône, donc
il hérite de la projection, du pool recyclé, du cull, de la sélection marquee/lasso et
du filtre « Couches » sans les réimplémenter.

| Trait | Comportement |
|---|---|
| **Tags** | `['symbol', <catégorie>]` par défaut, ou `entry.tags` — à côté de `['draw', <outil>]` et `['marker', <type>]`. Dans « Couches », on filtre « les hôpitaux », pas « les symboles » en bloc. |
| **Seuil de zoom** | Un symbole posé est du **décor** (`MarkerData.static`) : il disparaît sous un seuil. Cascade : `entry.minZoom` → `<DrawLayer symbols={{ minZoom }}>` → `config.markers.staticMinZoom`. ⚠️ `MILSYM_CATALOG` ne déclare **aucun** `entry.minZoom` : ses 91 entrées suivent le seuil de la couche. Un horizon par genre de symbole suppose votre propre catalogue. |
| **Icône de liste** | `MarkerData.icon` est renseigné d'office : pour un symbole, le graphisme **est** l'identité — une pastille de couleur ne dirait rien de ce qui est posé. |
| **Regroupement** | Les symboles participent au regroupement **de la carte**, avec les markers de l'application : une même pastille peut les mélanger. `draw.symbols.cluster = { enabled: false }` les en retire ; l'apparence des pastilles est sur `<Map cluster>`. |
| **Recherche** | via le nom de la forme, rubrique `draw` — cf. [SEARCH.md](SEARCH.md). |
| **Menu contextuel** | Un symbole posé ouvre **au clic** le **même menu qu'un marker** (`<Map markerMenu>`, cf. [MARKERS.md § 6](MARKERS.md#6-menu-contextuel)) — parité stricte, clic sur l'icône **ou** sur le point au sol. La lib y ajoute d'office **« Supprimer »** en tête (en rouge, `danger`) : elle seule possède la forme, donc peut l'effacer. |
| **Gomme** | L'outil **Gomme** (`E`) efface un symbole comme n'importe quelle forme, au clic sur son **icône ou son point au sol** — là où le hit-test géométrique du moteur, lui, l'ignore (un symbole est un marker DOM qui capte le clic). |
| **Historique / GeoJSON** | ceux des formes ; `symbol: { key, variant }` est préservé au round-trip. |

Rendu manuel : `<SymbolMarkers>` est exporté (monté par `<DrawLayer>`) pour une
présentation custom — l'état, lui, reste dans la collection de dessin.

---

## 7. Recettes

**Catalogue métier minimal, sans MIL-STD**

```tsx
<Map draw={{ symbols: { catalog: monCatalogue, renderer: monRenderer } }} />
```

Le SDK MIL-STD n'est alors jamais chargé : il ne part qu'avec `createMilSymRenderer`.

**Imposer l'affiliation au montage** — `createMilSymRenderer({ affiliation: 'friendly' })`,
puis `symbols.setAffiliation(v)` pour la suite.

**Poser depuis votre propre UI**

```ts
const { symbols } = useDrawing()
symbols.place('hopital', { lat, lng })
```

**Recevoir un dépôt ailleurs sur la carte** — `useMapDropZone({ accept, onDrop })`,
qui livre la lat/lng visée par raycast ellipsoïde (juste en vue inclinée comme en 2D).

---

## Voir aussi

- [DRAWING.md](DRAWING.md) — la collection, les events, le CRUD, le GeoJSON
- [MARKERS.md](MARKERS.md) — `static`, tags, cull, sélection
- [LABELS.md](LABELS.md) — `labels.symbols`

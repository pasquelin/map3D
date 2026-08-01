# Catalogue — parcourir un référentiel distant

**Français** · [English](../en/CATALOG.md) · [↑ Index](README.md)

Un **catalogue** est un référentiel d'entités géographiques que la carte ne détient pas :
vos zones, vos groupes de zones, les 36 000 communes de France, les départements, les
régions. On le parcourt, on le cherche, et on pose sur la carte ce qu'on veut y voir.

La différence avec tout le reste tient en une phrase : **map3D ne connaît aucune API,
seulement un contrat de source.** Vous écrivez une `CatalogSource` qui sait lister,
paginer et rendre une géométrie ; la lib assure la recherche, la virtualisation,
l'affichage drapé, la persistance et le cadrage. Un type à 36 699 entrées coûte le même
code qu'un type à 5.

| Besoin | Où aller |
|---|---|
| Afficher des zones que vous avez déjà en mémoire | [ZONES.md](ZONES.md) — `<ShapeLayer>` |
| Trouver ce qui est **déjà sur la carte** | [SEARCH.md](SEARCH.md) — recherche unifiée |
| **Parcourir un référentiel distant** et en poser des éléments | ce document |

---

## 1. En deux minutes

```tsx
import { Map, type CatalogSource } from 'map3d'
import { mdiCityVariantOutline } from '@mdi/js'

const villes: CatalogSource = {
  id: 'cities',
  label: 'Villes',
  icon: mdiCityVariantOutline,
  total: 36699,

  async list({ query, cursor, limit, signal }) {
    const r = await fetch(`/api/villes?q=${query}&cursor=${cursor ?? ''}&limit=${limit}`, { signal })
    const { items, total, next } = await r.json()
    return { items: items.map((v) => ({ id: v.id, title: v.nom })), total, nextCursor: next }
  },

  async geometry(id, signal) {
    const r = await fetch(`/api/villes/${id}/contour`, { signal })
    const { points } = await r.json()
    return [{ kind: 'polygon', points, title: 'Contour' }]
  },
}
```

Puis inscrivez-la sur le moteur — exactement comme le ferait un plugin :

```tsx
<Map center={PARIS} zoom={12} onReady={(engine) => engine.catalog.register(villes)} />
```

Le bouton **Catalogue** apparaît dans la barre de contrôles, aux côtés de « Couches » et
« Templates ». Sans source déclarée, il ne se rend pas.

---

## 2. `CatalogSource` — anatomie

```ts
type CatalogSource = {
  id: string                  // identité stable : préfixe de clé, valeur persistée
  label: string               // libellé du menu — la lib ne traduit aucun nom de type
  icon: string                // chemin @mdi/js
  family?: string             // regroupe les entrées du menu
  total?: number              // compte affiché SANS déclencher de requête

  list(req: CatalogRequest): Promise<CatalogPage>
  geometry(id: CatalogId, signal: AbortSignal): Promise<ShapeData[]>
  children?(id: CatalogId, req: CatalogRequest): Promise<CatalogPage>
  actions?: readonly CatalogAction[]
}

type CatalogRequest = {
  query: string        // déjà normalisée : « reseau » doit trouver « Réseau »
  cursor?: string      // rendu par la page précédente ; absent = première page
  limit: number        // config.catalog.pageSize
  signal: AbortSignal  // abandonné dès que la requête devient obsolète
}

type CatalogPage = {
  items: readonly CatalogItem[]
  total?: number       // absent ⇒ le compteur retombe sur le nombre chargé
  nextCursor?: string  // absent ⇒ dernière page
}
```

**Le curseur est opaque pour la lib.** Décalage, jeton, clé du dernier élément : elle le
rend tel quel à la requête suivante et n'en suppose rien.

**`total` n'est jamais calculé.** Le menu affiche « 36 699 » sans avoir ouvert le type —
si vous ne le fournissez pas, il n'affiche pas de compte, il ne va pas le chercher.

> **⚠️ `geometry` doit répondre pour les éléments de `list` ET pour ceux de `children`.**
> Un enfant déplié appartient à la même source que son parent, et c'est cette méthode-là
> qu'on appellera pour lui. Une source qui n'indexerait que ses racines rendrait un
> tableau vide sur chaque enfant — donc une case qui n'affiche rien, sans erreur.

---

## 3. `CatalogItem`, badges et actions

```ts
type CatalogItem = {
  id: CatalogId
  title: string
  icon?: string
  color?: string
  badges?: readonly CatalogBadge[]
  bounds?: Bounds        // présent ⇒ cadrer sans charger la géométrie
  disabled?: boolean     // ligne inerte : ni cadrage, ni affichage, ni action
  hasChildren?: boolean
}

type CatalogBadge = {
  icon?: string
  text?: string
  color?: string
  label: string          // infobulle ET nom accessible — requis
}
```

**Un statut ne se rend pas en badge.** Un élément indisponible côté métier est une ligne
`disabled` : grisée en entier, nom compris. Une colonne de coches vertes n'apprend rien
que l'absence de grisé ne dise déjà, et elle mange la largeur du nom.

**`bounds` évite un aller-retour par clic.** Fourni, le cadrage est immédiat ; absent, la
géométrie est chargée d'abord. Sur un référentiel où la bbox est connue, c'est la
différence entre un cadrage instantané et une requête par élément survolé.

**Les actions** sont rendues en icônes à droite, plafonnées par
`config.catalog.maxInlineActions` (défaut 2) — au-delà, c'est le nom qui disparaîtrait.
Les suivantes sont ignorées, avec un avertissement en console.

```ts
actions: [
  {
    id: 'edit',
    icon: mdiPencilOutline,
    label: 'Modifier la zone',
    run: (item) => ouvrirEditeur(item.id),
    hidden: (item) => item.disabled === true,
  },
]
```

---

## 4. Agrégats et enfants

Un « groupe de zones » n'est pas une notion de la lib : c'est un élément dont
**`geometry` rend plusieurs formes**. Cocher le groupe les affiche ensemble, décocher les
retire ensemble.

Déclarez `hasChildren` et fournissez `children` pour qu'il devienne **dépliable** :

```ts
children: async (id, { signal }) => {
  const r = await fetch(`/api/groupes/${id}/zones`, { signal })
  return { items: (await r.json()).map((z) => ({ id: z.id, title: z.nom })) }
}
```

La case d'un agrégat est alors **dérivée de ses enfants** : tous affichés → cochée ;
aucun → décochée ; une partie → **indéterminée**. Cocher l'agrégat coche ses enfants (en
les chargeant s'il le faut, même replié) ; en décocher un le fait passer en indéterminé.
L'agrégat lui-même n'entre pas dans la sélection — sinon la même zone serait comptée deux
fois et un décochage d'enfant ne dirait rien.

**Un seul niveau de descente.** `children` s'applique aux racines ; un petit-enfant n'est
pas inséré. Le besoin (groupe → zones) est plat, et la récursion exigerait une pagination
par niveau pour un cas qui ne se présente pas.

**Une même zone peut appartenir à deux entrées** — un groupe et le référentiel des zones.
La carte ne la peint qu'une fois : les formes sont dédoublonnées par `ShapeData.id`, et
elle survit au décochage de l'une tant que l'autre la référence.

---

## 5. Pagination, recherche et volumes

La liste est **virtualisée** : seules les lignes visibles sont rendues, quel que soit le
nombre d'entrées. Une sentinelle en bas demande la page suivante avant d'atteindre le
bord, et jamais deux pages ne sont en vol.

La recherche est **amortie** (`config.catalog.debounceMs`, défaut 250 ms), chaque requête
obsolète est **abandonnée** (`AbortSignal`), et une réponse arrivée dans le désordre est
**jetée**. `AbortController` seul n'y suffirait pas : une promesse déjà résolue exécute
son `then` même après l'abandon, et une réponse lente à « par » écraserait la réponse
rapide à « paris ».

Rien n'est demandé tant que le panneau n'est pas ouvert.

| Situation | Comportement |
|---|---|
| `list` échoue | bandeau + « Réessayer » ; les pages déjà chargées restent visibles |
| `geometry` échoue | l'élément ressort de la sélection, badge d'erreur sur la ligne |
| `children` échoue | la ligne se replie ; le reste de la liste est intact |
| Aucun résultat | « Aucun résultat » (recherche) ou « Aucun élément » (source vide) |

---

## 6. Affichage, cadrage et persistance

Ce que vous affichez devient une **forme drapée** ordinaire : elle épouse le relief,
suit le thème, et **entre dans la recherche** — une zone posée depuis le catalogue est
ensuite trouvable par son nom (cf. [ZONES.md § 5](ZONES.md#5-recherche)). Une forme sans
`title` reçoit celui de son élément de catalogue.

**Deux gestes distincts sur une ligne :**

| Geste | Effet |
|---|---|
| Clic sur le **nom** | bascule l'affichage **et** cadre la caméra |
| La **case** | bascule seulement (le cadrage suit le réglage « cadrer à l'ajout ») |

C'est ce qui permet d'ajouter cinq éléments d'affilée sans que la vue saute, tout en
gardant un geste direct pour « montre-moi celui-là ».

**Persistance.** Ce qui est affiché survit au rechargement : seules les **clés** sont
retenues (`config.data.storageKeys.catalog`), et les géométries sont redemandées à la
source. Une géométrie est la réponse d'une API à un instant donné — la resservir depuis
un stockage local afficherait un périmètre que le backend a peut-être déplacé depuis. Une
entrée devenue introuvable est retirée silencieusement.

L'utilisateur règle tout cela depuis l'engrenage de la barre d'outils : *conserver entre
les sessions*, *cadrer à l'ajout*, *tout retirer*.

---

## 7. Config, thème, libellés

```ts
config.catalog = {
  pageSize: 50,            // éléments demandés par page
  debounceMs: 250,         // 💰 anti-rebond de la recherche : le levier direct sur le volume d'appels
  maxInlineActions: 2,     // actions rendues en ligne
  overscanRows: 4,         // lignes rendues hors écran de chaque côté de la fenêtre virtuelle
  prefetchMarginPx: 200,   // 💰 distance au bas de liste qui déclenche la page suivante
  persistDebounceMs: 250,  // anti-rebond de l'écriture de la sélection dans le stockage
}
config.data.storageKeys.catalog          // 'm3d:catalog'         — la sélection
config.data.storageKeys.catalogSettings  // 'm3d:catalog-settings' — les réglages
config.interaction.shortcuts.controls.catalog  // 'c'
```

| Thème | Rôle |
|---|---|
| `sizing.catalogRowHeight` | hauteur d'une ligne — **constante**, la virtualisation en dépend |
| `sizing.catalogIndent` | décalage d'une ligne enfant |
| `sizing.catalogChevronW` | largeur du chevron de dépliage — aussi la gouttière des lignes sans enfants |
| `sizing.catalogPanelW` | largeur du panneau des types |
| `sizing.catalogSubPanelW` | largeur du panneau de la liste — avec `catalogPanelW`, la marge de cadrage réservée |
| `sizing.panelMaxHeight.catalog` | hauteur maximale |

Tous les textes vivent dans `labels.catalog` (cf. [LABELS.md](LABELS.md)). Les **noms des
types** n'y sont pas : ils viennent de `CatalogSource.label`, que vous fournissez.

---

## 8. Déclarer une source depuis un plugin

`engine.catalog` est un registre comme `engine.tags` ou `engine.search` : un plugin y
inscrit ses sources et rend la fonction de retrait.

```ts
useEffect(() => {
  const off = engine.catalog.register(maSource)
  return off
}, [engine])
```

Une source retirée emporte ce qu'elle avait posé sur la carte — sinon des zones que plus
aucun panneau ne sait retirer resteraient à l'écran.

---

## 9. Recettes

**Un référentiel dont la bbox est connue** — cadrage sans requête :

```ts
items: villes.map((v) => ({ id: v.id, title: v.nom, bounds: v.bbox }))
```

**Un type sans recherche distante** (petit référentiel déjà en mémoire) :

```ts
list: async ({ query, cursor, limit }) => {
  const f = query ? tout.filter((z) => normalize(z.title).includes(normalize(query))) : tout
  const start = cursor ? Number(cursor) : 0
  const page = f.slice(start, start + limit)
  return { items: page, total: f.length, nextCursor: start + page.length < f.length ? String(start + page.length) : undefined }
}
```

**Deux familles dans le menu** — `family` les sépare, dans l'ordre d'inscription :

```ts
{ id: 'zones', family: 'Mes zones', … }
{ id: 'cities', family: 'Territoires', … }
```

**Piloter la sélection depuis l'application** :

```tsx
const catalog = useCatalog()
catalog.toggle(source, item, { fit: true })
catalog.setMany(source, items, true)
catalog.clear()
```

**Afficher les métadonnées d'UNE source connue** (icône, libellé, `total`) sans
s'abonner à la liste entière — un encart de diagnostic, une légende :

```tsx
const source = useCatalogSource('cities')
// undefined tant que la source n'est pas (encore) inscrite sur `engine.catalog`
if (source) console.log(source.label, source.total)
```

---

## Voir aussi

- [ZONES.md](ZONES.md) — les formes que le catalogue pose sur la carte
- [SEARCH.md](SEARCH.md) — recherche de ce qui est déjà affiché
- [PLUGINS.md](PLUGINS.md) — déclarer une source depuis un plugin
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [THEME.md](THEME.md) · [LABELS.md](LABELS.md)

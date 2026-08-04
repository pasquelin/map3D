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
import { Map, type CatalogSource } from '@pasquelin/map3d'
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

Une source relève de l'un de **deux régimes**, et c'est `kind` qui les distingue :

```ts
type CatalogSource = CatalogBrowseSource | CatalogToggleSource

type CatalogSourceBase = {
  id: string                  // identité stable : préfixe de clé, valeur persistée
  label: string               // libellé du menu — la lib ne traduit aucun nom de type
  icon: string                // chemin @mdi/js
  family?: string             // regroupe les entrées du menu
  total?: number              // compte affiché SANS déclencher de requête
}

// Le régime de PARCOURS : une liste paginée, une case par élément.
type CatalogBrowseSource = CatalogSourceBase & {
  kind?: 'browse'             // DÉFAUT — une source écrite sans `kind` est un parcours
  list(req: CatalogRequest): Promise<CatalogPage>
  geometry(id: CatalogId, signal: AbortSignal): Promise<ShapeData[]>
  markers?(id: CatalogId, signal: AbortSignal): Promise<MarkerData[]>
  children?(id: CatalogId, req: CatalogRequest): Promise<CatalogPage>
  actions?: readonly CatalogAction[]
}

// Le régime de BASCULE : un interrupteur, chargé au cadre visible — cf. § 4.
type CatalogToggleSource = CatalogSourceBase & {
  kind: 'toggle'
  source: DataSource<MarkerData>
  markerLayer?: { icon?; tooltip?; menu?; typeLabel?; cluster?; size? }
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

**`markers` pose des POINTS**, là où `geometry` pose des formes. Les deux sont demandées
sur le même geste et retirées ensemble ; un élément peut n'avoir que l'une des deux. Les
points entrent dans le regroupement, le filtre « Couches » (via `tags`) et la recherche
(via `title`) comme n'importe quel marker — et le cadrage du clic sur le nom porte sur
l'union des formes ET des points.

**`actions` n'existe que sur une source de parcours** : une action reçoit le
`CatalogItem` sur lequel elle porte, et une source à bascule n'a pas d'éléments.

### 2.1 Régime « index » — quand l'hôte peint déjà

`checkable: false` déclare un **référentiel que l'application affiche elle-même**. La liste
ne sert plus qu'à le parcourir, y chercher, **cadrer** et agir dessus :

```ts
const zonesDeLEntreprise: CatalogBrowseSource = {
  id: 'zones',
  label: 'Zones',
  icon: mdiShapePolygonPlus,
  checkable: false, // ← la ligne perd sa case ; le nom CADRE au lieu de poser
  list: (req) => api.zones(req),
  geometry: (id) => api.contour(id), // chemin de cadrage des items sans `bounds`
  actions: [{ id: 'edit', icon: mdiPencil, label: 'Modifier', run: (item) => ouvrirFiche(item.id) }],
}
```

Le cas type : des zones **éditables**, montées par l'hôte dans `<DrawLayer>` — la seule
couche où une forme est sélectionnable et modifiable (cf. [ZONES.md](ZONES.md)). Elles sont
sur la carte **en permanence** ; une case n'aurait rien à exprimer, et si elle posait
vraiment, la même zone serait peinte deux fois par deux couches qui ne se connaissent pas.

| Ce qui change | Ce qui ne change pas |
| --- | --- |
| Pas de case — et **pas de gouttière réservée**, comme le chevron d'une source qui ne déplie pas | Chevron, enfants et sections : déplier reste utile |
| Le clic sur le nom **cadre** (`item.bounds` s'il est fourni, sinon `geometry` le temps de mesurer, sans rien poser) | Actions de ligne — c'est le principal intérêt du régime |
| Rien n'entre en sélection ni en persistance ; le badge du bouton ne compte pas ces lignes, « Tout retirer » ne les concerne pas | `disabled` : une ligne inerte le reste (ni cadrage ni action) |

L'`aria-label` du nom devient `labels.catalog.focus` (« Centrer sur {label} ») et
`aria-pressed` disparaît : il n'y a plus d'état à deux positions à annoncer.

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
  group?: string         // ouvre une section nommée dans la liste — cf. § 5.1
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

## 4. Sources à bascule

Certains référentiels ne se parcourent pas. Trente-six mille défibrillateurs ne se cochent
pas un par un : on les **allume d'un interrupteur**, et c'est la **vue** qui décide de ce
qui est chargé.

```tsx
import { mdiHeartPulse } from '@mdi/js'
import type { CatalogToggleSource } from '@pasquelin/map3d'

const defibs: CatalogToggleSource = {
  id: 'defibs',
  kind: 'toggle',                    // ← ce qui change tout
  label: 'Défibrillateurs',
  icon: mdiHeartPulse,
  total: 36699,                      // le jeu de référence, pas la vue

  source: {
    minZoom: 12,                     // 💰 sous ce zoom, AUCUNE requête
    load: async ({ bounds }, signal) => {
      const r = await fetch(`/api/dae?bbox=${bbox(bounds)}`, { signal })
      const points = await r.json()
      return points.map((p) => ({
        id: p.id, position: p.pos, type: 'defib', title: p.nom, tags: ['dae'], data: p,
      }))
    },
  },

  markerLayer: { cluster: { enabled: true } },
}
```

`source` est la **`DataSource<MarkerData>` de la lib**, inchangée (cf.
[DATA.md](DATA.md)) : anti-rebond, gate `minZoom`, `AbortSignal` et rejet des réponses
hors-ordre sont déjà assurés par `ViewportController`. Vous n'écrivez que le `load`.

`markerLayer` est un **`MarkerLayerDecl`** — le MÊME type que `Plugin.markerLayer`
([PLUGINS.md § 5](PLUGINS.md#5-rendu-carte)), pour qu'une capacité ne se règle pas de deux
façons selon d'où elle vient :

```ts
type MarkerLayerDecl = {
  menu?: (p: MarkerData) => MenuItem[]
  tooltip?: MarkerLayerProps<unknown>['tooltip']
  icon?: (p: MarkerData) => string
  typeLabel?: (type: string) => string
  cluster?: { enabled: boolean }
  size?: number
}
```

Sous-ensemble volontaire de `MarkerLayerProps` : ce qui décide de l'**apparence**, jamais
ce qui décide de la donnée (`points`/`source`) ni de la sélection, que la lib pilote. Les
points entrent dans le **même** regroupement (`engine.clusters`), le **filtre « Couches »**
(via `MarkerData.tags`) et la **recherche unifiée** (via `MarkerData.title`) que tout le
reste de la carte.

**Discriminer une liste hétérogène** — `isToggleSource` et `isBrowseSource` sont la paire
de gardes publiques :

```ts
import { isBrowseSource, isToggleSource } from '@pasquelin/map3d'

sources.filter(isToggleSource)   // `s.source` y est typé
sources.filter(isBrowseSource)   // `s.list` / `s.geometry` y sont typés
```

⚠️ `isBrowseSource` teste `kind !== 'toggle'`, **pas** `=== 'browse'` : `kind` étant
optionnel côté parcours, tester l'égalité ferait disparaître toute source écrite avant
l'arrivée des bascules. C'est la NÉGATION qui est correcte, et c'est pourquoi la lib fournit
la garde plutôt que de vous laisser écrire le test.

### 4.1 Ce que fait la ligne

|  | `browse` | `toggle` |
|---|---|---|
| Chevron, sous-liste, recherche | oui | **non** |
| Clic sur le **nom** | bascule **et** cadre la caméra | bascule, **sans cadrage** |
| Clic sur la **case** | bascule seul | bascule |
| `total` affiché | oui | oui |
| État de chargement | — | oui |
| **Nombre d'éléments chargés** | — | **jamais** — cf. § 4.2 |
| `children`, `bounds`, `disabled`, `actions` | oui | sans objet |

Pas de cadrage sur une bascule, et ce n'est pas un oubli : sur un jeu piloté par la vue,
c'est la vue qui décide du contenu. La cadrer sur son propre contenu reviendrait à faire
décider au contenu de la vue qui le détermine.

Éteint, un jeu n'a **aucune couche montée** : ni contrôleur, ni écoute de la vue, ni
requête. Un référentiel à 36 000 points ne coûte rien tant qu'on n'y touche pas.

### 4.2 Le volume chargé n'est pas le volume affiché

L'emprise transmise à `load` est **délibérément plus large que l'écran**. `computeBounds`
élargit la bbox de `config.performance.boundsMargin` (défaut `0.15`, soit **+30 % en
latitude ET en longitude**, ≈ **+69 % de surface**) et l'échantillonne sur une grille 5×5
qui capte le sol jusqu'à l'horizon en vue inclinée — pour ne jamais masquer un marker
réellement visible, et pour que rien ne surgisse au moindre déplacement.

Une source à bascule charge donc **structurellement plus que ce qu'on voit**. C'est voulu.

> **N'affichez jamais le nombre d'éléments chargés.** Posé à côté d'une carte qui en
> montre trois, un « 142 » se lit « 142 affichés » : on cherche les 139 manquants et on
> conclut à un bug de rendu. La lib ne l'affiche nulle part, et votre interface ne le doit
> pas davantage.
>
> `total` est en revanche légitime : c'est le volume du **jeu de référence**, stable et
> vérifiable, sans rapport avec la vue. L'**état de chargement** aussi : il dit quelque
> chose de vrai.

### 4.3 Bascule ou plugin

Les deux chargent des markers au viewport. Ce qui les sépare n'est pas technique :

| | **Catalog `toggle`** | **Plugin** |
|---|---|---|
| Ce que c'est | un **jeu de référence de l'application hôte** | une **capacité tierce** |
| Qui l'écrit | vous, dans votre app | un auteur, souvent quelqu'un d'autre |
| Distribution | aucune — c'est du code de l'app | packagé, **versionné**, publié (npm) |
| Configuration | en dur dans votre code | **schéma déclaratif auto-rendu** (`config`) |
| Où l'utilisateur l'active | panneau **Catalogue**, avec vos autres jeux | hub **Plugins** |
| Cycle de vie | monté par `<Map>` | `register` / `setEnabled` / `unregister` |

En une phrase : **un jeu de référence de plus dans votre panneau → `toggle` ; une
capacité qu'on installe, met à jour et désinstalle → plugin** ([PLUGINS.md](PLUGINS.md)).

### 4.4 Échecs

Un chargement qui échoue laisse le jeu courant **intact** et éteint l'indicateur : rien
n'est signalé à l'utilisateur. Le régime de parcours, lui, sort l'élément de la sélection et
allume une pastille d'erreur sur sa ligne — il a un élément sur quoi la poser, une bascule
n'en a pas. Si votre jeu doit signaler ses pannes, faites-le depuis votre `load`.

### 4.5 Persistance

L'état **allumé/éteint** survit au rechargement, dans un **champ distinct** de la charge
(`config.data.storageKeys.catalog`) — jamais mêlé aux clés d'éléments, qui porteraient
sinon un identifiant de source en collision avec un identifiant d'élément. Un jeu dont la
source n'est plus inscrite est éteint en silence, comme une clé orpheline.

Les markers, eux, ne sont **jamais** sérialisés : ils sont redemandés à la source au
premier cadre.

---

## 5. Sections, agrégats et enfants

### 5.1 Sections nommées

`CatalogItem.group` ouvre un **intertitre** dans la liste au changement de valeur :

```ts
items: [
  { id: 'z4', title: 'SDF Ext SO',      group: 'Stade de France' },
  { id: 'z5', title: 'SDF - Ext NE',    group: 'Stade de France' },
  { id: 'z7', title: 'Centre Westfield', group: 'La Défense' },   // ← ouvre une section
]
```

> **⚠️ La lib ne trie pas.** Elle ouvre une section quand `group` change d'un élément au
> suivant — **c'est à vous de servir vos éléments déjà groupés**. Une source qui les rend
> en désordre verra le même intitulé revenir plus bas, ce qui est l'affichage fidèle de ce
> qu'elle a rendu.
>
> Ce n'est pas une limitation mais la condition de la **pagination** : trier supposerait de
> tenir le jeu complet, alors que les pages arrivent au fil du défilement. Une page qui
> arrive prolonge la section en cours au lieu d'en rouvrir une identique.

Un élément sans `group` n'ouvre aucune section : une source peut n'en grouper qu'une
partie, le reste sort à plat. L'intertitre est une **ligne du flux virtualisé**, de la même
hauteur que les autres — c'est ce qui permet de virtualiser sans mesurer.

À ne pas confondre avec un agrégat (§ 5.2) : une section est un simple intertitre, sans
case ni action ; un agrégat est un élément qu'on coche et qui emporte ses enfants.

Réglage : `config.catalog.groupHeaders` (défaut `true`). À `false`, aucun en-tête n'est
rendu — et une source qui ne renseigne pas `group` ne paie même pas la comparaison. Un
réglage plutôt que « il suffit de ne pas renseigner `group` », parce qu'une source peut
venir d'un **plugin tiers** que vous ne contrôlez pas.

### 5.2 Agrégats et enfants

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

## 6. Pagination, recherche et volumes

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

## 7. Affichage, cadrage et persistance

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

**Persistance.** Ce qui est affiché survit au rechargement : les **clés** sont retenues
(`config.data.storageKeys.catalog`), et les géométries sont redemandées à la source. Une
géométrie est la réponse d'une API à un instant donné — la resservir depuis un stockage
local afficherait un périmètre que le backend a peut-être déplacé depuis. Une entrée
devenue introuvable est retirée silencieusement. Le **titre** prêté à une forme anonyme est
persisté avec sa clé : une zone posée depuis le catalogue reste donc trouvable par son nom
**même après un rechargement**, et pas seulement dans la session où on l'a posée.

L'utilisateur règle tout cela depuis l'engrenage de la barre d'outils : *conserver entre
les sessions*, *cadrer à l'ajout*, *tout retirer*. **« Tout retirer » éteint aussi les
sources à bascule** — le bouton dit « tout », et en épargner une laisserait des milliers
de points sur une carte qu'on vient de demander à vider. Le **badge du bouton Catalogue**
compte de la même façon les éléments cochés et les jeux allumés.

---

## 8. Config, thème, libellés

```ts
config.catalog = {
  pageSize: 50,            // éléments demandés par page
  debounceMs: 250,         // 💰 anti-rebond de la recherche : le levier direct sur le volume d'appels
  maxInlineActions: 2,     // actions rendues en ligne
  overscanRows: 4,         // lignes rendues hors écran de chaque côté de la fenêtre virtuelle
  prefetchMarginPx: 200,   // 💰 distance au bas de liste qui déclenche la page suivante
  persistDebounceMs: 250,  // anti-rebond de l'écriture de la sélection dans le stockage
  familyHeaders: true,     // nommer les familles du MENU des types (`CatalogSource.family`)
  groupHeaders: true,      // nommer les sections de la LISTE (`CatalogItem.group`)
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
types** n'y sont pas : ils viennent de `CatalogSource.label`, que vous fournissez. Une
source à bascule réutilise les **mêmes clés** que les lignes d'éléments (`catalog.add`,
`catalog.remove`, `catalog.loading`), avec le nom de la source en `{label}` : rien de
nouveau à traduire.

Deux réglages ne concernent **que** les sources à bascule, et ils vivent ailleurs :

| Réglage | Rôle |
|---|---|
| `CatalogToggleSource.source.minZoom` | 💰 gate de zoom, porté par la source elle-même |
| `config.data.viewportDebounceMs` | anti-rebond du rechargement au déplacement |
| `config.performance.boundsMargin` | 💰 combien on charge autour de l'écran — cf. § 4.2 |

---

## 9. Déclarer une source depuis un plugin

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

## 10. Recettes

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

**Deux familles dans le menu** — `family` les regroupe, dans l'ordre d'inscription (un
tri alphabétique reprendrait à l'hôte la main sur l'ordre de ses sources) :

```ts
{ id: 'zones',  family: 'Mes zones',   … }
{ id: 'cities', family: 'Territoires', … }
{ id: 'defibs', family: 'Territoires', … }   // ← rejoint la même famille
```

Chaque famille porte un **en-tête à son nom**, et les familles sont séparées par un filet.
`config.catalog.familyHeaders = false` retombe sur le filet seul. Une source sans `family`
tombe dans un groupe sans nom : pas d'en-tête, la lib n'inventant aucun intitulé.

Les deux régimes se mélangent dans une même famille : une bascule (§ 4) s'y range comme
une source de parcours.

**Piloter la sélection depuis l'application** :

```tsx
const catalog = useCatalog()
catalog.toggle(source, item, { fit: true })   // source de PARCOURS
catalog.setMany(source, items, true)
catalog.toggleSource('defibs')                // allume/éteint un jeu à bascule
catalog.toggleSource('defibs', false)         // état forcé
catalog.clear()
```

**Lire l'état d'un jeu** — `useCatalogToggle(id)`, et non `useCatalog()` : il s'abonne aux
deux booléens de CE jeu, là où l'API entière re-rendrait votre composant à chaque mutation
du catalogue.

```tsx
const { on, loading, toggle } = useCatalogToggle('defibs')
```

**Trier des sources hétérogènes** — les gardes discriminent l'union :

```ts
import { isToggleSource } from '@pasquelin/map3d'

const jeux = sources.filter(isToggleSource)   // `s.source` y est typé
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

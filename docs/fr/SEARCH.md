# Recherche — guide complet

**Français** · [English](../en/SEARCH.md) · [↑ Index](README.md)

Une seule boîte, une seule liste : les **éléments de la carte** (markers, zones,
dessins, symboles) **et** le géocodage de **lieux**, rubriqués.

Le principe qui gouverne tout le reste : **les rubriques carte ne se configurent
pas**. Les couches s'inscrivent elles-mêmes au registre `engine.search` dès qu'un
élément porte un nom. Il suffit qu'un marker ait un `title` pour être trouvable, et un
`typeLabel` sur sa couche pour que sa rubrique ait un nom lisible.

---

## 1. En deux minutes

```tsx
<Map
  search                                  // `true` = les défauts
  googleMapsApiKey={KEY}                  // → rubrique « Lieux » (Google Places)
  layers={[
    markersLayer({ points: agents, typeLabel: (t) => LIBELLES[t] }),  // rubrique nommée
    shapesLayer({ shapes: zones }),                                    // rubrique « Zones »
  ]}
/>
```

Sans prop `search`, **la boîte n'existe pas**.

---

## 2. Ce qui est indexé

| Rubrique | Id | Source | Condition |
|---|---|---|---|
| une par **type de marker** | `marker:<type>` | `<MarkerLayer>` | le marker porte un `title` |
| Zones | `shape` | `<ShapeLayer>` | la forme porte un `title` |
| Dessins | `draw` | `<DrawLayer>` | la forme dessinée porte un `title` |
| Lieux | `place` | géocodeur | prop `search` ≠ `false` |

**Un élément sans nom est écarté, jamais indexé sous son id** : proposer
« 7f3a-91b2 » dans une liste de résultats n'aide personne.

Les markers sont vus **post-filtre « Couches »** : ce qui est masqué sur la carte est
introuvable — inutile de faire voler la caméra vers un marker que l'utilisateur ne
verra pas. En revanche, un marker masqué par le **seuil des statiques** reste
cherchable : ce seuil dit ce qui est *lisible*, pas ce que l'utilisateur a *choisi* de
masquer.

Deux couches portant le même type produisent **une** rubrique dont les comptes
s'additionnent : l'utilisateur voit des « Agents », pas deux couches
d'implémentation.

---

## 3. Choisir un résultat

- La caméra s'y rend **d'elle-même**. Si l'entrée porte une **emprise** (`bounds`) elle
  **cadre** ; sinon elle vole à `flyAltitude`. C'est pourquoi une zone ou une ville se
  regardent en entier, là où un marker est simplement rejoint.
- Choisir un **marker** le **sélectionne** aussi — exactement comme un clic sur la
  carte : la couche signale, votre `onSelect` décide. Court-circuiter reviendrait à
  inventer une seconde sémantique de sélection.
- Le bouton « … » d'une ligne ouvre le **menu du marker** (`<Map markerMenu>`), évalué
  à l'ouverture et non au rendu de la ligne.
- `onSelect(entry)` vous notifie en plus, si vous avez autre chose à faire.

Clavier : `↑` `↓` `Entrée` `Échap`.

**En-têtes honnêtes** : chaque rubrique annonce le **total réel** avant troncature, et
non le nombre de lignes affichées.

**Historique** : les choix récents sont persistés (`historyStorageKey`, `null` pour
désactiver) et **re-résolus à la position courante** au réaffichage.

---

## 4. Régler la boîte

```tsx
<Map
  search={{
    placeholder: 'Chercher un agent, une zone, une ville…',
    scope: true,                                   // sélecteur de portée à pastilles
    groupOrder: ['marker:agent', 'marker:alert'],  // ordre des rubriques CARTE
    limitPerGroup: 6,
    minQuery: 2,
    debounceMs: 250,
    flyAltitude: 1200,
    historyStorageKey: 'm3d:search-history',
    historySize: 8,
    onSelect: (entry) => console.log(entry.group, entry.id),
  }}
/>
```

| Prop | Défaut | Note |
|---|---|---|
| `search` | Google Places avec la clé de `<Map googleMapsApiKey>` | `false` retire la rubrique « Lieux » |
| `limitPerGroup` | `6` | l'en-tête annonce le total réel |
| `scope` | `true` | `false` = toutes rubriques, sans sélecteur |
| `groupOrder` | — | les rubriques absentes suivent par ordre alphabétique |
| `minQuery` | `2` | 💰 à relever pour épargner un fournisseur facturé à l'appel ; à abaisser à `1` pour des libellés courts (codes, tournées) |
| `debounceMs` | `250` | 💰 chaque frappe déclenche un appel au géocodeur |
| `flyAltitude` | `2500` | altitude de repli quand le résultat choisi n'a pas d'emprise (`bounds`) |
| `historyStorageKey` | — | `null` désactive |
| `historySize` | `8` | entrées max conservées dans l'historique |

« Lieux » est **hors classement** : la rubrique ouvre toujours la liste, chercher une
ville étant le geste de cadrage le plus courant.

### Géocodeur

```tsx
import { createGooglePlacesSearch } from 'map3d'

<Map search={{ search: createGooglePlacesSearch({ apiKey, language: 'fr', region: 'fr', limit: 5 }) }} />
```

Ou le vôtre — la signature est minimale :

```ts
(query: string, signal?: AbortSignal) => Promise<SearchResult[]>
```

Endpoint, FieldMask (💰 facturation) et politique réseau se règlent dans
`config.providers.places` — cf. [CONFIG.md](CONFIG.md).

---

## 5. Brancher une source qui n'est pas une couche

À n'utiliser **que** pour un annuaire métier ou un référentiel distant : markers,
formes, dessins et symboles s'inscrivent déjà tout seuls.

```ts
useEffect(() => {
  // 1. Déclarer la rubrique (comptes) — n'émet que sur changement réel
  engine.search.report('mon-annuaire', [{ id: 'annuaire', label: 'Annuaire', count: contacts.length }])

  // 2. Fournir les résultats
  return engine.search.register({
    query: (needle, opts) => {
      // hors portée : rien pour nous (littéral neuf — jamais un objet partagé)
      if (opts.group && opts.group !== 'annuaire') return { entries: [], totals: new Map() }
      const hits = contacts
        .map((c) => ({ item: c, score: scoreMatch(normalizeSearch(c.nom), needle), distance: 0 }))
        .filter((h) => h.score !== NO_MATCH)
      return {
        entries: rankHits(hits, opts.limit).map((c) => ({
          group: 'annuaire',
          id: c.id,
          title: c.nom,
          position: c.position,
          select: () => ouvrir(c),
        })),
        totals: new Map([['annuaire', hits.length]]),
      }
    },
  })
}, [engine, contacts])
```

Deux règles structurelles :

- **Le contrat `query` est synchrone.** Tout ce qui vit sur la carte est déjà en
  mémoire, et un aller-retour asynchrone par frappe ne servirait qu'à faire clignoter
  la liste. Le géocodage distant, lui, n'est pas un fournisseur — il est traité à part,
  précisément parce qu'il est lent et faillible.
- **Les rubriques sont *déclarées*, pas demandées.** Sur un flux temps réel, le tableau
  de markers est remplacé plusieurs fois par seconde alors que les rubriques ne
  changent pas : `report` compare avant d'émettre.

Optimisation utile pour un gros jeu : ne construisez les entrées (et leurs closures)
**qu'après la troncature** — une requête de deux lettres peut correspondre à des
centaines d'éléments dont six seulement seront affichés.

---

## 6. Types et helpers

```ts
type SearchEntry = {
  group: string          // 'marker:agent' | 'shape' | 'draw' | 'place' | …
  id: string | number
  title: string
  subtitle?: string      // référence, adresse — JAMAIS le type (l'en-tête le dit déjà)
  titleColor?: string
  position: LatLng
  bounds?: Bounds        // présente → le choix CADRE au lieu de voler
  avatar?: string
  icon?: string
  color?: string
  select?: () => void    // ce que « choisir » veut dire pour CET élément
  menu?: () => MenuItem[]
}

type SearchGroup = { id: string; label: string; count: number; color?: string }
```

| Export | Rôle |
|---|---|
| `SearchRegistry` | le registre (`engine.search`) : `register`, `report`, `unreport`, `groups`, `query` |
| `markerGroupId(type)` | `` `marker:${type}` `` — à utiliser plutôt que de concaténer à la main |
| `SHAPE_GROUP` `DRAW_GROUP` `PLACE_GROUP` | ids de rubrique de la lib |
| `normalizeSearch` | normalisation (casse, accents) |
| `scoreMatch` / `NO_MATCH` | score d'un titre normalisé face à une requête |
| `rankHits(hits, limit)` | tri score puis proximité, troncature |
| `proximityRank(a, b)` | rang de proximité, départage les scores égaux |
| `Hit<T>` | `{ item, score, distance }` — la correspondance retenue, avant mise en forme en `SearchEntry` |
| `createTitleCache(titleOf)` | mémoïse la normalisation d'un titre par référence d'objet (`WeakMap`) — décisif sur un flux temps réel |
| `createGooglePlacesSearch` | géocodeur Google Places |

La couleur d'une rubrique doit être **la même** que celle de ses éléments sur la carte
(`theme.colors.marker[type]`, contour de zone…) : c'est elle qui fait le lien visuel
entre une entrée du sélecteur de portée et ce qu'on voit à l'écran. Utilisez
`markerColorOf(theme, type)` plutôt que de refaire la chaîne de repli.

---

## 7. Recettes

**Rendre une zone trouvable** — lui donner un `title`. Rien d'autre.

**Ordonner les rubriques** — `groupOrder: ['marker:alert', 'marker:agent', 'shape']`.

**Carte sans géocodage** — `search={{ search: false }}` : les rubriques carte restent.

**Boîte de recherche placée à la main** — `<SearchBox>` est exporté ; il doit vivre
sous `<Map>` (il consomme le contexte carte).

---

## Voir aussi

- [MARKERS.md](MARKERS.md) — `title`, `typeLabel`, menus partagés
- [ZONES.md](ZONES.md) — nommer une zone, emprises
- [CAMERA.md](CAMERA.md) — ce que « cadrer » veut dire
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md) · [LABELS.md](LABELS.md)

# Relations — distances et temps de trajet réels

**Français** · [English](../en/RELATIONS.md) · [↑ Index](README.md)

`<RelationLayer>` relie un marker à ses voisins **par tags**, avec les distances et
durées **routières réelles** d'un fournisseur de routage.

Une section « Distance autour » se **greffe** sur le menu contextuel du marker : elle
ne le remplace pas. Les familles de tags applicables à la source y sont listées,
chacune ouvrant ses presets de sélection.

---

## 1. En deux minutes

```tsx
import { createGoogleRoutesProvider, type RelationRule } from 'map3d'

// Le SEUL endroit où vit le métier : le moteur ne connaît que des tags.
const RULES: RelationRule[] = [
  {
    id: 'alert-to-agents',
    label: 'Agents',                          // libellé du niveau 2 du menu
    from: { any: ['alert'] },                 // le marker source doit satisfaire ceci
    to: { any: ['user'], none: ['onsite'] },  // les cibles candidates aussi
    color: '#22c55e',                         // pastille de la famille (facultatif)
    mode: 'DRIVE',
    selection: { mode: 'fastest', count: 3, maxMeters: 15_000 },
    limit: { compute: 15, render: 10 },
  },
]

const provider = useMemo(() => createGoogleRoutesProvider({ apiKey, region: 'fr' }), [apiKey])

<Map
  layers={[markersLayer({ points: markers })]}
  relations={{ rules: RULES, provider }}
  markerMenu={(m, relations) => [...base(m), { separator: true }, ...(relations?.menuFor(m) ?? [])]}
/>
```

`<Map relations={…}>` monte le moteur **autour** des couches de markers, ce qui fait
arriver ses entrées dans leur menu contextuel (second argument de `markerMenu`).

> `provider` doit être **stable** (`useMemo`) : il détermine l'identité du moteur.
> Passé construit en ligne, il serait recréé à chaque rendu et effacerait les
> relations ouvertes.

Montage manuel, avec la forme render-prop :

```tsx
<RelationLayer rules={RULES} provider={provider}>
  {(relations) => (
    <>
      <MarkerLayer points={markers} menu={(m) => [...base(m), ...relations.menuFor(m)]} />
      <RelationStatusBar nameOf={(p) => nomParId(p.id)} />
    </>
  )}
</RelationLayer>
```

---

## 2. La règle

```ts
type RelationRule = {
  id: string
  label: string              // niveau 2 du menu — fourni par l'app, jamais déduit
  from: TagSelector          // condition sur le marker SOURCE
  to: TagSelector            // condition sur les CIBLES
  color?: string
  mode: TravelMode           // 'DRIVE' | 'WALK' | 'BICYCLE' | 'TWO_WHEELER' | 'TRANSIT'
  selection: {
    mode: 'fastest' | 'radius'
    count?: number           // fastest : liens conservés
    radiusMeters?: number    // radius : rayon
    maxMeters: number        // 💰 garde-fou de coût, AVANT tout appel réseau
  }
  limit: {
    compute: number          // 💰 éléments envoyés au routage par interaction
    render: number           // liens dessinés simultanément
  }
  cutoffSeconds?: number     // durée réelle au-delà de laquelle un lien est écarté
}
```

### Sélecteurs de tags

```ts
type TagSelector = { any?: string[]; all?: string[]; none?: string[] }
```

| Clause | Sens |
|---|---|
| `any` | au moins un — sémantique **OU**, celle du filtre « Couches » |
| `all` | tous requis |
| `none` | exclusion |

Les trois se combinent en **ET**.

### Sélection

- **`fastest`** retient les `count` plus rapides. Le plus proche à vol d'oiseau n'est
  pas le plus rapide (sens uniques, fleuve à contourner) : on **sur-échantillonne**
  (`fastestOversample`, défaut 3 candidats par lien affiché) et c'est la **durée** qui
  tranche.
- **`radius`** retient tout ce qui est sous `radiusMeters`.

`maxMeters` est le garde-fou appliqué **avant** tout appel réseau ; `limit.compute` et
`limit.render` plafonnent respectivement les points envoyés au routage et les liens
dessinés.

> 💰 Chaque unité de `fastestOversample` multiplie la taille de la matrice facturée. À
> `1`, seul le voisinage direct est interrogé — et le résultat cesse d'être « les plus
> rapides ».

### Presets du menu

Les paliers proposés par le menu d'une famille (« les 3 plus rapides », « dans 500 m »)
se règlent par `menuPresets` : la bonne échelle dépend de ce qu'on relie.

Chaque item affiche un **hint** issu de la sélection **réelle** — c'est ce qui garantit
que le menu et la carte comptent la même chose. Un preset sans cible est désactivé.
Le preset par défaut de la règle est **marqué**, pas présélectionné : rien ne part tant
que l'utilisateur n'a pas cliqué.

---

## 3. Ce qui s'affiche

Un **socle** à plat sous le marker source, un **trait** par cible avec son rang et son
étiquette `2,4 km · 9 min`, et l'**itinéraire réel** au clic sur un lien.

Le socle porte la **barre d'état de sa relation** : elle s'ancre juste à côté du
marker, suit ses déplacements, et bascule de l'autre côté du socle quand le bord du
conteneur est trop proche. Chaque relation ouverte a donc sa propre barre, à l'endroit
où le regard se trouve déjà.

La barre décrit **ce qui est réellement à l'écran**, et change avec lui :

| | Sans itinéraire | Itinéraire tracé |
|---|---|---|
| Pastille | couleur de la famille | couleur de l'itinéraire |
| Titre | `source → famille` | `source → cible retenue` |
| Segments | famille, mode de transport | mode de transport seul |
| Mesure | étendue (`Les 3 plus rapides`) | `2,4 km · 9 min` du trajet |

Le sélecteur de famille disparaît une fois la cible arrêtée — il proposerait de refaire
un choix déjà fait.

Changer le **mode de transport** pendant un tracé le **retrace** dans le nouveau mode
au lieu de revenir aux traits directs : c'est le même trajet demandé autrement.
L'ancien tracé reste affiché pendant le recalcul plutôt que de laisser un vide.

Les cibles agrégées dans un même **cluster** partagent un tronc et s'ouvrent en
éventail, sans jamais éclater le cluster ni toucher au zoom (au-delà de `fanMaxLegs`,
défaut 5, l'éventail se replie en un trait agrégé).

Les liens **suivent leurs deux extrémités** : un marker qui bouge emporte son trait, et
au-delà de `staleMeters` les temps sont refaits — débit plafonné par
`refreshIntervalMs`, si bien qu'un véhicule rapide ne peut pas déclencher plus d'un
appel par intervalle.

---

## 4. Couleurs : deux questions, deux réponses

Le **trait** répond « ce faisceau part de qui ? » : il porte la couleur de **son
marker source** (`theme.colors.marker[type].base`, exactement celle de sa pastille),
traits et socle compris — et elle est résolue **à chaque passe**, si bien qu'un agent
qui change de statut change aussi la couleur de ses traits sans rouvrir la relation.

La **pastille de famille** (menu du marker, bascule de la barre d'état) répond « cette
famille vise quoi ? » : elle porte la couleur du **tag visé** par la règle, résolue
comme au panneau « Couches » (`theme.colors.tags`, puis la palette hashée de
`tagColor`).

Le tag retenu est le dernier de `to.all` (le plus restrictif :
`{ all: ['alert', 'critical'] }` → « critiques »), sinon le premier de `to.any`
(cf. `familyTag`).

Ordre de résolution : `rule.color` → couleur du marker source → `defaultColor`.

---

## 5. Traits pointillés, traits pleins

Les traits de **recherche** sont en **pointillé défilant** — le marching-ants de la
sélection, transposé au ruban 3D :

```tsx
<Map relations={{ rules, provider, linkDash: { length: 12, gap: 8, speed: 40, gapOpacity: 0.25 } }} />
```

Longueurs et vitesse en pixels écran (`speed` = px/s **vers la cible**), `false` pour
un trait plein.

L'espace entre deux tirets n'est **pas vide** : il garde la couleur du trait à
`gapOpacity` près, ce qui lui laisse un corps continu sans lui imposer un contour d'une
autre teinte — un trait pointillé ne reçoit donc pas de `casingWidth`.

L'itinéraire **tracé**, lui, reste plein, garde son contour et prend `routeColor` : le
pointillé dit « candidat en cours d'évaluation », le trait plein dit « voilà le
trajet ». `routeColor` est violet façon navigation plutôt que bleu — sur imagerie
satellite, un tracé bleu se confond avec les fleuves qu'il longe.

**Un seul trait par couple de markers.** Deux relations opposées — l'agent vers ses
alertes, l'alerte vers ses agents — décrivent le même arc et se superposaient au pixel
près, le second masquant le premier. Un seul trait est dessiné, et ses **tirets
successifs alternent les couleurs** de toutes les relations concernées : un maillage de
moins, et l'appartenance visible. Le trait revient à la **dernière relation ouverte** —
c'est elle qui porte l'étiquette, le survol et le clic. Sans pointillé, il reste uni
dans la couleur de cette même relation.

---

## 6. Honnêteté des valeurs

Tant que le routage n'a pas répondu, l'étiquette affiche `…` ; s'il échoue, « Temps
indisponible ».

**Jamais** de repli sur la distance à vol d'oiseau : elle sert à **sélectionner**, pas
à remplir un temps de trajet. Un `Link` porte `distanceMeters` / `durationSeconds` à
`null` tant que la valeur routière n'est pas connue, et un `status`
(`pending` | `ready` | `unavailable`).

---

## 7. Le fournisseur de routage

```ts
type RoutingProvider = {
  matrix(...): Promise<MatrixEntry[]>   // durées/distances en lot
  route(...): Promise<ProviderRoute>    // itinéraire détaillé d'un couple
}
```

Deux méthodes, c'est tout. Le core ne dépend que de ce contrat.

> ### ⚠️ Clé d'API — à lire avant la production
>
> `createGoogleRoutesProvider` appelle Google **depuis le navigateur**, donc la clé
> part dans le bundle. Les web services Google (Routes v2) **n'acceptent pas** les
> restrictions de clé par référent HTTP — seulement par IP : une clé embarquée dans une
> page web est utilisable par un tiers, à vos frais.
>
> En production, implémentez `RoutingProvider` contre **votre propre backend**. Aucune
> modification n'est nécessaire ailleurs.

Cache intégré : `RouteCache` (TTL + position), exporté.

---

## 8. Un core utilisable sans carte

Le moteur est publié tel quel : ni Three, ni React, ni `fetch`. Il est utilisable côté
serveur, ou en test avec un fournisseur factice.

| Export | Rôle |
|---|---|
| `RelationEngine` | le moteur, et son `RelationSnapshot` |
| `selectTargets`, `matchesSelector`, `familyTag` | sélection par tags |
| `buildRelationMenu` | construction du menu, hints compris |
| `haversineMeters`, `bearingDeg`, `greatCirclePoints`, `fanLegs`, `boundsAround` | géométrie sphérique |
| `decodePolyline` | polylignes encodées Google |
| `RouteCache` | cache TTL + position |
| `LinkLayer` | rendu des liens drapés (`LinkVisual`, `LinkLayerDefaults`) |

---

## 9. `RelationApi`

`useRelations()` (lève hors d'un `<RelationLayer>`), ou `map.current?.relations`
(`null` sans prop `relations`).

| Membre | Rôle |
|---|---|
| `rules` | les règles déclarées |
| `menuFor(marker)` | entrées à concaténer au menu — `[]` si aucune règle ne s'applique, donc concaténable sans test |
| `run(source, rule)` | lance une relation (règle déjà dérivée du preset) |
| `snapshots` | relations affichées — **une par marker source**, plusieurs peuvent coexister |
| `hubHosts` | conteneurs DOM des socles, indexés par id de marker source : y monter un portail suffit à suivre le marker, sans qu'aucune position ne transite par React |
| `setMode(sourceId, mode)` | bascule le transport (retrace, ne referme pas) |
| `routeColor` | couleur des itinéraires tracés |
| `familyColor(rule)` | couleur d'une famille (cf. § 4) |
| `untrace(linkOrSourceId?)` | referme l'itinéraire ; tous si omis |
| `clear(sourceId?)` | efface la relation ; toutes si omis |

---

## 10. Props de `<RelationLayer>`

| Prop | Rôle |
|---|---|
| `rules` **(requis)** | le vocabulaire métier |
| `provider` **(requis)** | routage — **stable** (`useMemo`) |
| `width` | épaisseur des liens, en px écran |
| `defaultColor` | dernier repli de couleur (jaune, lisible sur satellite comme sur plan) |
| `linkDash` | pointillé défilant des traits de recherche, ou `false` |
| `routeColor` | couleur de l'itinéraire tracé |
| `hoverDarken` | assombrissement au survol (< 1) — on assombrit la couleur de la famille plutôt que d'en imposer une autre : la teinte porte le sens |
| `hubRadius` | rayon du socle en px écran — trop petit, la croix qui efface devient un jeu d'adresse |
| `casingWidth` / `casingColor` | contour sombre sous le trait (lisibilité sur satellite) ; `0` pour l'ôter |
| `minOpacity` | opacité du lien le moins bien classé — plancher du dégradé de rang |
| `staleMeters` | dérive au-delà de laquelle temps et itinéraires sont refaits ; `0` = jamais |
| `refreshIntervalMs` | intervalle minimal entre deux recalculs d'une même relation |
| `menuPresets` | paliers proposés par le menu d'une famille |
| `fanMaxLegs` | au-delà, l'éventail se replie en trait agrégé (défaut 5) |
| `fastestOversample` | 💰 candidats interrogés par lien affiché (défaut 3) |
| `statusBar` | `false` retire la barre d'état ; un objet fournit `nameOf` |
| `children` | `ReactNode`, ou une **fonction** qui reçoit l'API |

Défauts réels : [PROPS.md](PROPS.md). Libellés et gabarits : `labels.relations` et
`labels.duration` — cf. [LABELS.md](LABELS.md).

---

## Voir aussi

- [MARKERS.md](MARKERS.md) — tags, types, couleurs
- [ENGINE.md](ENGINE.md) — registres (`engine.markers.visualNodeOf` alimente les éventails)
- [PROPS.md](PROPS.md) · [THEME.md](THEME.md) · [LABELS.md](LABELS.md)

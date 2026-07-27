# Markers statiques : masquage au dézoom, absorption dans les clusters

**Date** : 2026-07-27
**Périmètre** : lib `map3D` (puis exemple React, puis operator)

---

## 1. Problème

Les symboles posés (`SymbolMarkers`) restent affichés à tous les niveaux de zoom. Dézoomée
sur une région, la carte se couvre de pictogrammes de 40 px illisibles qui masquent les
alertes et les agents. Ils ne sont par ailleurs jamais absorbés par un cluster : leur couche
n'active pas le clustering.

Le besoin dépasse les symboles. Un défibrillateur, une borne, un point d'eau posent le même
problème : ce sont des **objets fixes du décor**, des repères qu'on consulte de près, pas des
événements qui demandent une action. Il leur manque une notion commune.

## 2. Ce qu'on construit

Une clé `static` sur la donnée d'un marker, portant trois comportements :

1. **Masqué en dessous d'un seuil de zoom** réglable.
2. **Absorbé par les clusters** comme n'importe quel marker.
3. **Jamais segmenté dans le camembert** d'un cluster — compté au total, sans part.

## 3. État des lieux

| Fait | Où |
| --- | --- |
| Les symboles montent leur **propre** `<MarkerLayer>`, sans `cluster` | `src/react/components/SymbolMarkers.tsx:136` |
| Les markers de l'hôte sont un **autre** `<MarkerLayer>`, clusterisé | `examples/react/src/App.tsx:213` |
| Les comptes de cluster sont calculés par `type` depuis les feuilles réelles | `src/layers/ClusterLayer.ts:120` |
| `clusterInfoFromCounts` est le point de vérité **partagé** clustering géo / déclutter écran | `src/layers/ClusterLayer.ts:19`, `src/react/components/MarkerLayer.tsx:473` |
| Le donut fait **une part par type**, parts égales | `src/react/components/DefaultCluster.tsx:79` |
| Tous les symboles portent `type: 'symbol'` | `src/react/components/SymbolMarkers.tsx:95` |
| `DataSource.minZoom` gate le **chargement réseau**, pas l'affichage | `src/data/types.ts:21` |
| Le seul filtre de visibilité est le filtre de tags, appliqué **avant** le clustering | `src/react/components/MarkerLayer.tsx:212` |
| Le marker sélectionné / suivi échappe au filtre | `src/react/components/MarkerLayer.tsx:225` |
| Le listener caméra ne tourne **que** si le clustering est actif, et ne passe pas par React | `src/react/components/MarkerLayer.tsx:700` |
| `MapConfig` n'a aucun bloc `markers` | `src/config/types.ts:267` |
| `useConfig()` expose la config résolue à tout composant | `src/react/context.ts:65` |

## 4. Décisions

| Question | Décision | Raison |
| --- | --- | --- |
| Dans quel cluster entrent les symboles ? | La couche symboles cluster **toute seule** | Aucune machinerie cross-couches ; la lib reste composable. Coût assumé : un symbole et une alerte côte à côte donnent deux pastilles. |
| Statique dans le donut ? | **Compté au total, aucune part** | Le chiffre central répond à « combien d'objets ici » ; l'anneau répond à « de quoi s'agit-il », question qui n'a pas de sens pour du décor. |
| Comment se déclare `static` ? | Drapeau `MarkerData.static?: boolean` | Même philosophie que `urgent`, `new`, `repositionable` : le drapeau vit sur la donnée. Permet deux markers de même type dont un seul est statique. |
| Nom et place du seuil ? | `config.markers.staticMinZoom` | Bloc `markers` dans `MapConfig`, vocabulaire aligné sur `DataSource.minZoom` et `theme.clustering.maxZoom`. |
| Masqué = introuvable ? | **Non** : reste dans la recherche et la loupe | Le gate est une question de lisibilité, pas d'intention utilisateur. Chercher « défibrillateur » doit le trouver et y voler, même dézoomé — contrairement au filtre de tags, où l'utilisateur a explicitement demandé le masquage. |

## 5. Architecture

### 5.1 `MarkerData.static` — `src/data/types.ts`

```ts
/**
 * Objet FIXE du décor (symbole posé, défibrillateur, borne) : un repère qu'on
 * consulte de près, pas un événement qui demande une action. Deux conséquences,
 * portées par la lib : il disparaît en dessous de `config.markers.staticMinZoom`,
 * et il n'occupe jamais de part dans le camembert d'un cluster — il est compté au
 * total, sans être segmenté par type.
 */
static?: boolean
```

Renseigné d'office par `SymbolMarkers` ; laissé à l'hôte pour ses propres types.

### 5.2 Seuil — `src/config/types.ts`, `src/config/defaultConfig.ts`

Nouveau bloc dans `MapConfig`, après `data` :

```ts
export type MarkersConfig = {
  /**
   * Zoom en dessous duquel les markers `static` disparaissent de la carte. Ils
   * restent dans la recherche et la loupe : le seuil dit ce qui est LISIBLE, pas
   * ce que l'utilisateur a choisi de masquer (c'est le rôle du filtre de tags).
   * `0` désactive le masquage.
   */
  staticMinZoom: number
}
```

Défaut : **13**. En dessous, la vue cadre une région entière : un pictogramme de 40 px n'y est
ni lisible ni cliquable.

### 5.3 `useZoomGate` — `src/react/hooks/useZoomGate.ts` (nouveau)

```ts
function useZoomGate(minZoom: number, active: boolean): boolean
```

- Retourne « le zoom courant est-il au-dessus du seuil ».
- Ne s'abonne à `engine.on('camera')` **que si `active`** — une carte sans marker statique ne
  paie rien.
- Stocke un **booléen**, jamais le zoom : un seul re-render au franchissement, là où stocker le
  zoom en re-déclencherait un par frame de molette.
- **Hystérésis de ±0.15** autour du seuil : sans elle, une molette arrêtée pile sur la valeur
  fait clignoter les markers. Même parade que le `maxZoom - 0.05` de `MarkerLayer.tsx:485`.
- Retourne `true` en bloc si `minZoom <= 0`.

Fichier séparé plutôt qu'inline : `MarkerLayer.tsx` fait déjà 1200 lignes.

### 5.4 Gate d'affichage — `src/react/components/MarkerLayer.tsx`

Après le `useMemo` `points` (`:225`), sans le modifier :

```ts
const hasStatic = useMemo(() => points.some((p) => p.static), [points])
const staticVisible = useZoomGate(config.markers.staticMinZoom, hasStatic)
const rendered = useMemo(
  () => (staticVisible ? points : points.filter((p) => !p.static || isExempt(p))),
  [points, staticVisible],
)
```

Répartition **stricte** des deux listes :

| Liste | Consommateurs | Contenu |
| --- | --- | --- |
| `points` | registre de recherche (`:581`, `:690`), `markersInBounds` de la loupe, `pointsByIdRef` → `markerById` / `info()`, registre de tags | **complet** |
| `rendered` | `clusterRef.current.load()` (`:536`), branche non-clusterisée (`:506`), `core.setItems()` | statiques filtrés sous le seuil |

Alimenter supercluster avec `rendered` fait d'une pierre deux coups : les statiques masqués
disparaissent de la carte **et** cessent de gonfler le total des clusters. Un cluster ne compte
jamais que ce qu'il cache réellement.

`isExempt` reprend les exemptions existantes (`selectedId`, `followId`) : on ne fait pas
disparaître ce sur quoi la carte est centrée ni ce que la caméra suit.

Le recompute déclenché par le changement de `staticVisible` passe par l'effet
`[points, recompute, engine]` (`:542`), qui doit dépendre de `rendered` au lieu de `points`.

### 5.5 Comptes de cluster — `src/layers/ClusterLayer.ts`

```ts
type LeafProps = { markerId: string | number; mType: string; mStatic?: boolean }

export type ClusterInfo = {
  total: number          // dynamiques + statiques
  counts: Record<string, number>   // dynamiques SEULEMENT
  types: string[]        // dérivé de counts → sans statiques, automatiquement
  staticCount: number    // nouveau
  position: LatLng
}

export function clusterInfoFromCounts(
  counts: Record<string, number>,
  position: LatLng,
  staticCount = 0,
): ClusterInfo
```

- `load()` lit `m.static` dans les propriétés de feuille.
- `leafCounts()` renvoie `{ counts, staticCount }` : les feuilles statiques ne sont jamais
  rangées par type.
- `ClusterEntry` de `kind: 'marker'` gagne `isStatic: boolean`, sans quoi le déclutter écran ne
  saurait pas où ranger un marker fusionné à la main.
- `total = Σcounts + staticCount`.

Corollaire : `counts` ne contient plus **que** du dynamique, donc `types` — qui en dérive — exclut
les statiques sans une ligne de plus. C'est la raison de placer la correction ici et pas dans le
composant : `clusterInfoFromCounts` est appelé des deux côtés (clustering géo `:176`, déclutter
écran `MarkerLayer.tsx:473`), une correction dans le donut n'en couvrirait qu'un.

### 5.6 Déclutter écran — `src/react/components/MarkerLayer.tsx:430-453`

`Bin` gagne `staticCount`. `countsOf` (`:431`) renvoie `{ counts, staticCount }` :

- entrée `cluster` → `{ ...e.cluster.counts }`, `e.cluster.staticCount` ;
- entrée `marker` → `e.isStatic ? { counts: {}, staticCount: 1 } : { counts: { [e.type]: 1 }, staticCount: 0 }`.

L'accumulation dans le bin somme les deux. `clusterInfoFromCounts(bin.counts, bin.position, bin.staticCount)`.

### 5.7 Donut — `src/react/components/DefaultCluster.tsx`

`types` étant déjà dérivé de `counts`, aucune part statique n'apparaît. Reste **le repli** :

> `types.length === 0` (cluster 100 % statique) → **pastille pleine** couleur
> `theme.colors.cluster`, portant le total, sans anneau segmenté.

Sans ce repli, un paquet de symboles rendrait un donut vide — un anneau sans aucun secteur,
avec un trou au milieu. Le rayon suit `defaultClusterRadius(total)` diminué de `RING_W` :
la pastille est le cœur seul.

### 5.8 Clustering des symboles — `src/react/components/SymbolMarkers.tsx`

- Les points reçoivent `static: true`.
- Le `<MarkerLayer>` reçoit `cluster={{ enabled: true }}`.
- Surchargeable par l'hôte via `DrawLayerProps.symbols.cluster` (`false` pour revenir au
  comportement actuel).

Un cluster de symboles est donc toujours 100 % statique → c'est exactement le cas de repli 5.7.

## 6. Cas limites

| Cas | Comportement |
| --- | --- |
| Cluster 100 % statique | Pastille pleine avec le total, sans anneau (5.7) |
| Marker statique sélectionné, sous le seuil | Reste affiché (exemption `selectedId`) |
| Marker statique suivi par la caméra | Reste affiché (exemption `followId`) |
| Recherche d'un statique masqué | Trouvé, `select()` y vole ; il réapparaît une fois le zoom franchi |
| `staticMinZoom: 0` | Aucun masquage, aucun abonnement caméra — comportement d'avant |
| Carte sans aucun marker statique | Aucun abonnement caméra, coût nul |
| Zoom arrêté pile sur le seuil | Hystérésis ±0.15, pas de clignotement |
| Statique masqué et clusterisé | Il ne compte **pas** dans le total : le cluster ne montre que ce qu'il cache |

## 7. Validation

Pas de suite de tests automatisés dans la lib : la validation passe par l'exemple React, puis
par `npx tsc --noEmit` (et **non** par le résumé `rtk tsc`, qui masque des erreurs).

Scénarios à vérifier dans `examples/react` :

1. Poser 5 symboles, dézoomer sous 13 → ils disparaissent, les alertes restent.
2. Rezoomer → ils réapparaissent, sans clignotement au passage du seuil.
3. Poser 5 symboles voisins, zoom 14 → une pastille pleine « 5 », sans anneau.
4. Un cluster d'alertes + un défibrillateur statique → le donut compte le défibrillateur au
   centre, sans lui donner de part.
5. Chercher le défibrillateur par son nom à zoom 8 → trouvé, le vol y mène.
6. Sélectionner un symbole puis dézoomer → il reste seul visible.

## 8. Plan de travail

Ordre imposé pour toute feature `map3D` : **lib → exemple → operator**.

1. `src/data/types.ts` — `MarkerData.static`
2. `src/config/types.ts` + `src/config/defaultConfig.ts` — bloc `markers.staticMinZoom`
3. `src/react/hooks/useZoomGate.ts` — nouveau
4. `src/layers/ClusterLayer.ts` — `mStatic`, `staticCount`, `ClusterEntry.isStatic`
5. `src/react/components/MarkerLayer.tsx` — `rendered`, `countsOf`, `Bin`
6. `src/react/components/DefaultCluster.tsx` — repli pastille
7. `src/react/components/SymbolMarkers.tsx` — `static: true` + `cluster`
8. `src/index.ts` — exports (`useZoomGate` si public, `MarkersConfig`)
9. `examples/react` — type démo « défibrillateur » statique + jeu de données
10. `gosecure/operator` — seulement après validation dans l'exemple

## 9. Hors périmètre

- Les 2 erreurs préexistantes de `src/core/MapEngine.ts` (293, 572) — sans rapport, non traitées ici.
- Un index supercluster partagé entre la couche symboles et la couche de l'hôte (option écartée
  en §4).
- Un seuil de zoom **par type** de marker : `staticMinZoom` est global. À rouvrir si un besoin
  réel apparaît, pas avant.

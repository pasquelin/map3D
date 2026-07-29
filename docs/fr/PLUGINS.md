# Plugins — guide auteur

**Français** · [English](../en/PLUGINS.md) · [↑ Index](README.md)

Un **plugin** ajoute de l'information sur la carte sans toucher au cœur de map3D :
sa source de données, son rendu et sa configuration sont déclarés une fois, la lib
les exécute et les câble à l'infrastructure existante (`MarkerLayer`, clustering,
filtre « Couches », recherche…).

Ce document couvre le contrat `Plugin`, le cycle de vie, la configuration, le hub
utilisateur, la performance et la sécurité côté auteur, et se termine par le
**registre des plugins officiels**.

- Props exhaustives et défauts réels → [PROPS.md](PROPS.md)
- Clé de persistance → [CONFIG.md](CONFIG.md)

---

## 1. Concept et modèle mental

**Un plugin déclare, map3D exécute et câble.** L'auteur n'écrit ni three.js, ni
gestion de frame, ni câblage de registres pour la voie déclarative — il fournit des
fonctions pures (fetch, mapping, rendu de contrôles), la lib les branche sur le
pipeline existant (`DataSource`, `MarkerLayer`, `ClusterRegistry`, filtre de tags).

```
Hôte (app React)
  <Map plugins={[monPlugin()]} pluginStorageKey?="m3d:plugins">
        │
        ├─ engine.plugins : PluginRegistry     — définitions, état { enabled, config }
        ├─ <PluginSurfaces>                    — un <PluginHost> par plugin ACTIVÉ
        │     • voie A : data.fetch → MarkerLayer
        │     • voie C : engine.addLayer(plugin.layer(ctx))
        │     • enrichBuilding : orchestré par engine.enrichment au clic bâtiment
        └─ Toolbar → Réglages → hub « Plugins » (toggle + config auto-rendue)
```

**La lib ne ship aucun plugin concret.** Elle expose la plateforme (contrat,
registre, hub, hooks) ; les plugins officiels vivent hors de la lib (§ 9).

Un plugin **doit** fournir au moins l'un de `data`, `layer`, `enrichBuilding`,
`setup` — sinon il n'apporte rien.

---

## 2. Anatomie d'un plugin

Le point d'entrée est `definePlugin`, qui infère `C` (le type de la config) depuis
le schéma, pour que `ctx.config` soit typé sans annotation :

```ts
import { definePlugin } from 'map3d'

export const monPlugin = () =>
  definePlugin({
    meta: {
      id: 'mon-plugin',       // namespace unique : config, persistance, tag « Couches »
      name: 'Mon plugin',
      description: 'Ce que le plugin fait, en une phrase',
      icon: mdiMonIcone,       // chemin @mdi/js
      version: '1.0.0',
      author: 'moi',
      homepage: 'https://…',
    },
    enabledByDefault: false,  // activé au premier montage si l'utilisateur n'a pas choisi
    config: [ /* § 3 */ ] as const,
    data: { /* § 4 */ },
    markerLayer: { /* § 5 */ },
    layer: (ctx) => monLayer(ctx),        // échappatoire — § 7
    enrichBuilding: async (hit, ctx) => ({ /* … */ }),  // § 6
    setup: (ctx) => {                      // cycle de vie global — ressources qui ne
      const id = setInterval(() => {}, 1000)  // dépendent d'aucune voie (websocket, timer)
      return () => clearInterval(id)          // teardown à la désactivation
    },
  })
```

Le `as const` sur `config` est ce qui permet à `definePlugin` d'inférer les clés et
les types de valeur (`boolean`/`number`/`string`) sans annotation manuelle.

**Cycle de vie** : `register()` au montage (via `<Map plugins>`), `setEnabled(id,
true)` déclenche le montage du `<PluginHost>` (voies A/C, `setup`), `setEnabled(id,
false)` ou `unregister()` le démonte (abort des fetch en vol, `layer.dispose()`,
teardown de `setup`).

---

## 3. Schéma de config

`config?: readonly PluginField[]` est la **seule** source des valeurs par défaut,
et le hub (lib) comme le dev panel d'un plugin (hors lib) le rendent **à
l'identique** — l'auteur n'écrit aucun formulaire.

```ts
type PluginField =
  | { key: string; label: string; help?: string; refetch?: boolean; type: 'boolean'; default: boolean }
  | { key: string; label: string; help?: string; refetch?: boolean; type: 'number'; default: number; min?: number; max?: number; step?: number }
  | { key: string; label: string; help?: string; refetch?: boolean; type: 'string'; default: string; secret?: boolean; placeholder?: string }
  | { key: string; label: string; help?: string; refetch?: boolean; type: 'select'; default: string; options: Record<string, string> }
```

| Champ commun | Rôle |
|---|---|
| `key` | Clé stable dans l'objet de config (identifiant TS). |
| `label` | Libellé affiché (hub + dev panel) — donnée fournie par le plugin, pas i18n de la lib. |
| `help` | Aide courte optionnelle (tooltip du contrôle). |
| `refetch` | `true` = modifier ce champ relance `data.fetch` (§ 4). Défaut `false` = champ purement visuel, sans appel réseau. |

`secret: true` (champs `string`) masque la valeur dans le contrôle ; le hub et le
dev panel ne la copient **jamais** dans le presse-papier ni les logs (§ 11).

Exemple, le plugin de démo de l'exemple (`examples/react/src/plugins/demoPlugin.tsx`) :

```ts
config: [
  { key: 'count', type: 'number', default: 12, min: 1, max: 60, refetch: true, label: 'Nombre de points' },
  { key: 'kind', type: 'select', default: 'poi', options: { poi: 'POI', alert: 'Alerte' }, refetch: true, label: 'Type' },
  { key: 'showTitles', type: 'boolean', default: true, label: 'Afficher les titres' },
  { key: 'note', type: 'string', default: '', placeholder: 'Note libre', label: 'Note' },
] as const,
```

`count` et `kind` portent `refetch: true` (ils changent ce qui est demandé) ;
`showTitles` et `note` sont cosmétiques (ils changent seulement le rendu des
markers déjà chargés).

---

## 4. Source de données et rafraîchissement

La **voie A** (déclarative) est le cas courant : le plugin mappe ses items en
`MarkerData[]`, la lib branche cette fonction sur son pipeline `DataSource` +
`MarkerLayer` existant (débounce, annulation, recyclage des markers).

```ts
data?: {
  fetch: (ctx: PluginDataContext<C>) => Promise<MarkerData[]> | MarkerData[]
  refresh?: 'viewport' | { intervalMs: number } | 'manual'
  minZoom?: number
  fetchPolicy?: Partial<FetchPolicy>
}
```

| Champ | Rôle |
|---|---|
| `fetch` | Reçoit `ctx.viewport` (`{ bounds, center, zoom }`) et retourne des `MarkerData[]`. |
| `refresh` | `'viewport'` (défaut) : rechargé au déplacement caméra. `{ intervalMs }` : polling, **pausé** quand l'onglet est caché. `'manual'` : rechargé seulement via `refresh()` (§ 8). |
| `minZoom` | Gate de zoom : sous ce zoom, pas de fetch. |
| `fetchPolicy` | Surcharge `timeoutMs`/`retries`/`backoffMs` de `defaultPluginFetchPolicy` (10 s / 1 essai / 300 ms) — utile face à une API tierce avec quota serré. |

`PluginContext<C>` (base de `PluginDataContext`) porte aussi `engine` (le
`MapEngine`), `config` (résolu, typé) et `signal` (un `AbortSignal` annulé à la
désactivation, au démontage, ou quand un champ `refetch` change).

```ts
data: {
  refresh: 'viewport',
  fetch: (ctx) => {
    const { bounds } = ctx.viewport
    return fetchPOIs(bounds, ctx.config.apiKey, { signal: ctx.signal })
      .then((items) => items.map((it) => ({ id: it.id, position: it.pos, type: 'poi', title: it.name, data: it })))
  },
},
```

**Refetch minimal** : un changement de config ne relance `fetch` que si un champ
`refetch: true` a changé ; un champ cosmétique ne fait que re-rendre les props de
`MarkerLayer`. Jamais de remontage sur un changement de config.

---

## 5. Rendu carte

`markerLayer?` réutilise l'ergonomie markers existante — la lib rend le résultat de
`data.fetch` dans un `<MarkerLayer>` interne :

```ts
markerLayer?: {
  menu?: (p: MarkerData<unknown>) => MenuItem[]
  tooltip?: MarkerLayerProps<unknown>['tooltip']
  icon?: (p: MarkerData<unknown>) => string
  typeLabel?: (type: string) => string
  cluster?: { enabled: boolean }
  size?: number
}
```

Le mapping en `MarkerData` (§ 4) porte l'essentiel : `id` (identité stable —
recyclage au lieu de recréation), `position`, `type` (couleur, rubrique de
recherche), `title` (nom cherchable et affiché), `tags` (filtre « Couches » — cf.
[MARKERS.md § 3](MARKERS.md#3-anatomie-dun-markerdata) pour le détail complet du
type). Sans `tags`, un marker reçoit `['marker', type]` par défaut.

- **Clustering** : `cluster: { enabled: true }` inscrit les markers du plugin au
  **même** regroupement que le reste de la carte (`engine.clusters`) — un seul
  index, pas un par plugin.
- **Menu** et **infobulle** : mêmes contrats que `<MarkerLayer menu>`/`tooltip`
  (cf. [MARKERS.md § 5](MARKERS.md#5-infobulle)).
- **Tags** : un plugin qui étiquette ses markers (`MarkerData.tags`) les inscrit
  d'office au filtre « Couches » — rien à câbler.

---

## 6. Voie « enrichir » au pick de bâtiment

Certains plugins n'ajoutent rien sur la carte : ils **enrichissent** un bâtiment
déjà désigné par la lib (`buildingclick`, cf. [BUILDINGS.md](BUILDINGS.md)).

```ts
enrichBuilding?: (hit: BuildingHit, ctx: PluginContext<C>) => Promise<BuildingEnrichmentResult>
// type BuildingEnrichmentResult = { attrs: Record<string, unknown>; tags?: string[] }
```

`hit.info` (`BuildingInfo`) porte `featureId`, `lat`/`lng` (point cliqué),
`height`/`minHeight`, `props` (attributs déjà remontés par le fournisseur de
tuiles) et `bounds`.

map3D **orchestre** tout :

- Sur `buildingclick` : **abort** de la requête d'enrichissement du pick précédent,
  nouvel `AbortSignal`, appel des `enrichBuilding` de tous les plugins **activés**,
  état `{ loading, data, tags, error }` par plugin (`EnrichmentState`).
- Le clic reste **instantané** — l'émission de `buildingclick` n'attend jamais le
  réseau, l'enrichissement arrive après.
- L'hôte lit le résultat fusionné via `useBuildingEnrichment()` :

```tsx
import { useBuildingEnrichment } from 'map3d'

function BuildingSheet() {
  const { loading, data, tags, error, byPlugin } = useBuildingEnrichment()
  if (loading) return <Spinner />
  if (error) return <p>Erreur</p>
  return <AttrTable attrs={data} sources={tags} />
}
```

À brancher dans le composant qu'ouvre `<Map buildingMenu>`.

**Tags de provenance** : `{ attrs, tags? }` — `tags` (défaut `[plugin.meta.id]`)
marque **d'où vient** chaque bloc. Quand N plugins enrichissent le même bâtiment,
l'hôte affiche « Source : X » et **filtre** les sources via le mécanisme « Couches »
existant (`engine.tags`) — aucun nouveau système.

---

## 7. Échappatoire `Layer`

Pour un rendu que la voie déclarative ne couvre pas (overlay WebGL custom), un
plugin contribue un `Layer` moteur brut :

```ts
layer?: (ctx: PluginLayerContext<C>) => Layer
```

`Layer` est le contrat du moteur (`update`/`project`/`dispose`/`setConfig?`/
`setGrounded?` — cf. [ENGINE.md § 3](ENGINE.md#3-écrire-une-couche)) : `update`
avance l'état 3D, `project` écrit les overlays DOM (passe d'écriture pure, après
toutes les lectures), `dispose` libère les ressources.

Monté via `engine.addLayer(layer)` à l'activation, `engine.removeLayer(layer)`
(qui appelle `dispose()`) à la désactivation.

> ⚠️ **Recréation sur config, pas mise à jour.** `Layer.setConfig` prend la config
> de la CARTE (`MapConfig`), pas la config du plugin : la plateforme **recrée**
> entièrement le `Layer` à chaque changement de config plugin, plutôt que de
> relayer cette config via `setConfig`. Ce n'est **pas** la garantie « jamais de
> remontage » de la voie markers (§ 4) — un plugin lourd sur cette voie doit garder
> son `layer()` bon marché à construire, ou préférer la voie A/`setup` pour ce qui
> change souvent.

---

## 8. Le hub et la config utilisateur

**Le hub « Plugins » est le seul point d'UI end-user des plugins** (pas de bouton
par plugin) — une ligne du menu **Réglages** de la `<Toolbar>` (masquée s'il n'y a
aucun plugin enregistré), ouvrant un sous-panneau latéral : par ligne, icône + nom
+ toggle on/off, et si le plugin a un `config`, un dépliant avec les contrôles
**auto-rendus** depuis le schéma (§ 3) — checkbox, slider+nombre, `input
type=password` si `secret`, select.

Côté hôte, `usePlugins()` donne le même accès programmatique :

```tsx
import { usePlugins } from 'map3d'

const { plugins, byId } = usePlugins()
const p = byId('mon-plugin')
p?.setEnabled(true)
p?.setConfig({ count: 30 })
p?.resetConfig()
p?.refresh()   // pour data.refresh === 'manual'
```

`PluginView` porte `meta`, `enabled`, `config`, `schema`, et les actions
`setEnabled`/`setConfig`/`resetConfig`/`refresh`. `useSyncExternalStore` sur
`engine.plugins` : pas de polling, re-render uniquement quand l'état change.

**Persistance** : l'état `{ enabled, config }` de chaque plugin est écrit en
localStorage sous `config.data.storageKeys.plugins` (défaut `'m3d:plugins'`,
réglable via `<Map pluginStorageKey>`, `null` pour désactiver). Seul le **partiel**
(écart aux défauts du schéma) est stocké, pour survivre aux évolutions de schéma —
une clé inconnue au chargement est ignorée. Écriture **débouncée** : jamais à
chaque `pointermove` d'un slider.

---

## 9. Packaging et distribution

**La lib ne ship aucun plugin concret** : elle expose uniquement la plateforme
(contrat `Plugin`, `PluginRegistry`, hub, hooks). Les plugins officiels vivent
**hors de la lib**, dans le monorepo `pluginsMap3D` (scope npm `@map3d`, un paquet
par plugin — `@map3d/plugin-<nom>`), chacun avec `map3d` en **peerDependency**.

Un plugin **tiers** suit le même contrat, livré en paquet npm publié ou en
dépendance locale `file:` — aucun chargement distant à l'exécution.

```tsx
import { monPluginOfficiel } from '@map3d/plugin-quelquechose'
import { monPluginMaison } from './plugins/maison'

<Map plugins={[monPluginOfficiel(), monPluginMaison()]} />
```

**Import dynamique pour les gros plugins** — un plugin qui embarque un SDK lourd
(catalogue, moteur de rendu tiers) devrait suivre le précédent du catalogue de
symboles MIL-STD de la lib (~9 Mo, chargé à la demande) : exposer une factory qui
importe dynamiquement le poids mort, pour qu'aucune carte n'en paie le coût sans
l'utiliser.

```ts
export const monGrosPlugin = () =>
  definePlugin({
    meta: { /* … */ },
    setup: async (ctx) => {
      const { initSdk } = await import('./sdk-lourd')
      const sdk = await initSdk()
      // …
    },
  })
```

---

## 10. Performance — les 10 règles côté auteur

Une carte est un moteur de rendu temps réel : le système de plugins **ne doit rien
coûter à la frame**. Ce que la plateforme garantit, et ce qui reste à la charge de
l'auteur :

1. **Réutiliser le pipeline viewport** — la voie A passe par `DataSource` +
   débounce + annulation + recyclage des markers ; ne réimplémentez pas une boucle
   de fetch/rendu maison.
2. **Zéro travail à la frame** — tout est event-driven (`'plugins'`, viewport,
   timers). Seule la voie `layer` (échappatoire) participe à la boucle de rendu,
   sous votre responsabilité.
3. **Clustering commun** — un seul `ClusterRegistry` agrège tous les plugins ; ne
   tenez pas votre propre index.
4. **Plugin désactivé = coût nul** — aucun hôte monté, aucun fetch, aucun layer,
   aucun timer. Garanti par la plateforme (démontage du `<PluginHost>`).
5. **Refetch minimal** — un changement de config ne relance `fetch` que si un champ
   `refetch: true` change (§ 3) ; jamais de remontage sur un changement de config.
6. **Réseau discipliné** — respectez `ctx.signal` dans votre `fetch` (abort lié à
   la désactivation, au changement de viewport, à un refetch, au démontage) ;
   réutilisez `ctx.fetchPolicy` ; si vous pollez en plus du viewport, la
   plateforme pause déjà le timer quand `document.hidden`.
7. **Persistance débouncée** — déjà assurée par `PluginRegistry` (§ 8) ; n'écrivez
   pas votre propre localStorage à chaque frappe.
8. **Hub event-driven** — assuré par la plateforme (`useSyncExternalStore`) ; si
   vous lisez `usePlugins()`/`useBuildingEnrichment()` vous-même, ne pollez pas.
9. **Bundle** — un plugin lourd doit être chargé en **import dynamique** (§ 9),
   jamais auto-importé par la lib.
10. **Allocations** — si vous fournissez `markerLayer.menu`/`tooltip`/`icon`, gardez
    ces fonctions **stables** (définies au module, pas recréées par render) : la
    plateforme les mémoïse déjà côté `PluginHost`, mais une fonction recréée à
    chaque appel de votre factory (`monPlugin()`) invaliderait cette mémoïsation.

---

## 11. Sécurité

- **`secret: true`** sur un champ `string` masque sa valeur dans le hub et le dev
  panel ; ni l'un ni l'autre ne la copie dans le presse-papier ou les logs. Une clé
  d'API tierce **doit** être déclarée `secret`.
- **Jamais de secret en dur** dans le code du plugin : la clé vient de
  `ctx.config` (saisie par l'utilisateur final via le hub, ou semée par l'hôte à
  l'enregistrement), jamais d'une constante committée.
- **Quotas** — une API tierce a des limites ; `fetchPolicy` (§ 4) modère les
  réessais (défaut 1 essai, backoff 300 ms) plutôt que de marteler un service en
  difficulté. Un champ de config type `maxItems`/`refreshMinutes` laisse
  l'utilisateur final ajuster son propre volume d'appels.
- Une clé embarquée dans un bundle **navigateur** reste visible côté client :
  documentez cette limite dans le README de votre plugin si l'API tierce ne
  supporte pas de restriction par référent (même remarque que pour
  `createGoogleRoutesProvider`, cf. [README.md](README.md#relations-distances-et-temps-de-trajet-réels)).

---

## 12. Cookbook — construire le plugin démo pas à pas

Le fil rouge de l'exemple de la lib (`examples/react/src/plugins/demoPlugin.tsx`) :
un plugin sans réseau (procédural), qui exerce la voie A, les 4 types de champ de
config, `refetch` vs cosmétique, et l'enrichissement au pick.

**1. Meta et activation**

```ts
import { mdiMapMarkerStar } from '@mdi/js'
import { definePlugin } from 'map3d'
import type { MarkerData } from 'map3d'

export const demoPlugin = () =>
  definePlugin({
    meta: {
      id: 'demo-poi',
      name: 'Points de démo',
      description: 'Markers procéduraux + enrichissement au pick (démonstration de la plateforme)',
      icon: mdiMapMarkerStar,
      version: '1.0.0',
      author: 'map3d',
    },
    enabledByDefault: true,   // visible sans action de l'utilisateur, pour la démo
```

**2. Le schéma de config — les 4 types de champ**

```ts
    config: [
      { key: 'count', type: 'number', default: 12, min: 1, max: 60, refetch: true, label: 'Nombre de points' },
      { key: 'kind', type: 'select', default: 'poi', options: { poi: 'POI', alert: 'Alerte' }, refetch: true, label: 'Type' },
      { key: 'showTitles', type: 'boolean', default: true, label: 'Afficher les titres' },
      { key: 'note', type: 'string', default: '', placeholder: 'Note libre', label: 'Note' },
    ] as const,
```

`count` et `kind` changent ce qui est **généré** → `refetch: true`. `showTitles` et
`note` ne changent que l'apparence des points déjà générés → pas de `refetch`.

**3. La source — voie A, sans réseau**

```ts
    data: {
      refresh: 'viewport',
      fetch: (ctx) => {
        const { bounds } = ctx.viewport
        const n = ctx.config.count            // typé number, sans annotation
        const out: MarkerData[] = []
        for (let i = 0; i < n; i++) {
          // Grille déterministe dans les bounds courants (pas de Math.random :
          // un rendu stable ne recrée pas les markers à chaque render).
          const fx = (i % 4) / 4 + 0.1
          const fy = Math.floor(i / 4) / Math.ceil(n / 4) + 0.05
          out.push({
            id: `demo-${i}`,
            position: { lat: bounds.south + (bounds.north - bounds.south) * fy, lng: bounds.west + (bounds.east - bounds.west) * fx },
            type: ctx.config.kind,
            title: ctx.config.showTitles ? `Démo ${i + 1}` : undefined,
            tags: ['demo-poi'],
            data: {},
          })
        }
        return out
      },
    },
    markerLayer: { cluster: { enabled: true } },
```

**4. L'enrichissement au pick**

```ts
    enrichBuilding: async (hit) => ({
      attrs: {
        Latitude: hit.info.lat.toFixed(5),
        Longitude: hit.info.lng.toFixed(5),
        'Hauteur (démo)': `${Math.round(hit.info.height)} m`,
      },
      tags: ['demo-poi'],
    }),
  })
```

**5. Le brancher**

```tsx
<Map plugins={[demoPlugin()]} buildingMenu={(info, close) => <BuildingSheet info={info} onClose={close} />} />
```

Ce plugin ne fait jamais de réseau (données procédurales), donc n'illustre pas
`fetchPolicy`/`secret` — voir § 4 et § 11 pour la voie avec API tierce, et un
plugin officiel du registre (§ 13) pour un exemple complet en conditions réelles.

---

## 13. Registre des plugins officiels

Un plugin **officiel** est maintenu dans le monorepo `pluginsMap3D`, publié sous le
scope npm `@map3d`, et listé ici. Techniquement identique à un plugin tiers —
l'organisation et le scope font l'« officiel ». Ce tableau **lie** vers la doc de
chaque plugin (README de son paquet) ; il ne la duplique pas.

| Nom | Paquet npm | Lien | Plage `map3d` compatible |
|---|---|---|---|
| *(aucun officiel publié à ce jour)* | — | — | — |

Ce registre s'enrichit au fil des plugins officiels publiés dans `pluginsMap3D` —
à mettre à jour dans le même mouvement que leur première publication.

---

## Voir aussi

- [ENGINE.md](ENGINE.md) — moteur, events, registres, écrire une couche
- [MARKERS.md](MARKERS.md) — `MarkerData`, clustering, filtre « Couches »
- [BUILDINGS.md](BUILDINGS.md) — sélection de bâtiment, `buildingMenu`, `BuildingInfo`
- [PROPS.md](PROPS.md) · [CONFIG.md](CONFIG.md)

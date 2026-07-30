# Templates — guide complet

**Français** · [English](../en/TEMPLATES.md) · [↑ Index](README.md)

Un **template** est une **sauvegarde nommée du dessin** : formes, dessin à main levée
et symboles MIL-STD-2525D. Il ne contient **ni zones, ni markers, ni tracés, ni
liens** — seulement ce que l'utilisateur a dessiné. Le contenu est le
`GeoJSONFeatureCollection` de la couche de dessin (cf. [DRAWING.md](DRAWING.md)),
filtrable par catégorie.

Le gestionnaire s'affiche **dans la barre de contrôles, sous « Couches »** (même
structure). Le stockage est en **localStorage par défaut**, surchargeable par une
**API externe** : dès qu'un `TemplateProvider` est branché, sa liste **prime** sur le
cache local (des templates peuvent avoir été publiés par d'autres utilisateurs).

## 1. En deux minutes

```tsx
import { Map } from 'map3d'

<Map draw templates />
```

`templates` monte le bouton sous « Couches ». Il ouvre un panneau qui permet de
**sauvegarder** le dessin courant (nom + catégories cochées), de **lister** les
templates (vignette d'aperçu, stats, nom éditable, suppression), de les **appliquer**
au dessin (ajouter ou remplacer), et d'**exporter/importer** un fichier `.m3dt`.

> Le bouton vit dans la barre de contrôles : il faut donc `controls` actif (le défaut).
> Un template sauve le dessin : il faut `draw` actif.

## 2. Ce qu'un template contient

Le contenu est découpé par **catégorie**, déduite du `kind` de chaque forme :

| Catégorie | `kind` | Inclus |
|-----------|--------|--------|
| `shapes` (Formes) | `line`, `polygon`, `rect`, `circle`, `arrow`, `measure` | ✅ |
| `freehand` (Main levée) | `freehand` | ✅ |
| `symbols` (Symboles) | `symbol` | ✅ |
| Zones (`ShapeLayer`), markers, tracés, liens | — | ❌ |

Au moment de sauvegarder, les **cases à cocher** choisissent les catégories retenues.
Les catégories offertes et leur pré-sélection se règlent (cf. §5).

Type de donnée :

```ts
type Template = {
  id: string
  name: string
  content: { draw: GeoJSONFeatureCollection }
  origin: 'local' | 'api'   // 'api' = servi par le provider (peut être readOnly)
  readOnly?: boolean
  author?: string
  createdAt?: number
  updatedAt?: number
  stats?: TemplateStats     // compteurs par catégorie, emprise, poids
}
```

## 3. Appliquer un template

Trois modes (`ApplyMode`), choisis dans le panneau :

- **Ajouter** (`merge`) — ajoute les formes du template au dessin courant. L'opération
  est **idempotente par identité** : re-cliquer le même template n'empile pas ses formes
  en double.
- **Remplacer** (`replace`) — remplace le dessin courant par celui du template.
- **Retirer** (`remove`) — retire du dessin les formes venues de ce template (inverse
  d'`Ajouter`).

`defaultApply` (config/prop) n'expose volontairement que `merge`/`replace` : « retirer »
est une action ponctuelle, pas un défaut sensé.

L'application passe par `fromGeoJSON` (chemin d'import canonique du dessin : gère
symboles, polygones fermés et formes verrouillées).

## 4. Stockage local vs API (le provider)

Sans provider, tout est **local** et persisté en localStorage
(`config.data.storageKeys.templates`, défaut `m3d:templates`).

Avec un provider, **l'API fait autorité** : sa liste est chargée au montage et écrase
la vue ; les mutations (sauvegarde, renommage, suppression) passent par lui.

```tsx
import { Map, createHttpTemplateProvider } from 'map3d'

const provider = createHttpTemplateProvider() // lit config.providers.templates

<Map draw templates={{ provider }} config={{ providers: { templates: {
  baseUrl: 'https://mon-api.example/templates',
  headers: { Authorization: 'Bearer …' },
} } }} />
```

Le contrat (à implémenter pour un backend maison) :

```ts
type TemplateProvider = {
  list(signal?): Promise<Template[]>
  save(template, signal?): Promise<Template>
  update(id, patch, signal?): Promise<Template>
  remove(id, signal?): Promise<void>
  setConfig?(config: TemplatesConfig): void
}
```

`createHttpTemplateProvider` fournit une implémentation REST par défaut
(`GET baseUrl`, `POST baseUrl`, `PATCH baseUrl/:id`, `DELETE baseUrl/:id`) sur
`fetchWithPolicy` (timeout + réessais bornés).

Les templates `origin:'api'` peuvent être marqués `readOnly` (publiés par un autre
utilisateur) : ils sont alors affichés avec un cadenas, ni renommables ni
supprimables localement.

## 5. Réglages (`config.providers.templates`)

```ts
type TemplatesConfig = {
  baseUrl: string                         // '' = pas d'API (local seul)
  headers: Record<string, string>
  fetch: FetchPolicy                      // { timeoutMs, retries, backoffMs }
  categories: TemplateCategory[]          // catégories offertes à la sauvegarde
  defaultCategories: TemplateCategory[]   // cochées par défaut
  defaultApply: 'merge' | 'replace'       // mode d'application par défaut
  allowExport: boolean                    // export/import .m3dt
}
```

Chaque réglage est surchargeable par une prop du panneau
(`<Map templates={{ categories, defaultApply, … }}>`). **Rien n'est en dur.**

## 6. Export / import de fichier `.m3dt`

Quand `allowExport` est vrai, chaque ligne offre un bouton d'export (télécharge un
JSON autoportant `{ format: 'm3dt', version, template }`) et le pied du panneau un
bouton d'import. Un template importé est ajouté au cache **local** avec une identité
neuve.

## 7. Événements (hôte non-React)

Le moteur émet (cf. [ENGINE.md](ENGINE.md)) :

```ts
engine.on('templatesave', (t) => …)             // créé ou renommé
engine.on('templateremove', ({ id }) => …)
engine.on('templateapply', ({ id, mode }) => …)
```

Les mutations acceptent `{ silent: true }` (sur `engine.templates`) pour ne PAS
réémettre — indispensable quand l'hôte réinjecte ce qu'il vient de recevoir de son
backend, afin d'éviter l'écho.

## 8. Hook `useTemplates`

Pour piloter le gestionnaire depuis vos propres composants :

```ts
const t = useTemplates({ provider })
t.templates            // liste réactive
t.saveCurrent(name, ['shapes', 'symbols'])
t.apply(id, 'merge')
t.rename(id, name); t.remove(id)
t.exportFile(id); t.importFile(file)
t.refresh()            // recharge depuis le provider
```

## 9. Internationalisation

Aucun texte n'est en dur : tout vient de `labels.templates.*` (titre, actions,
catégories, stats). Fournissez vos propres chaînes via `<MapProvider labels>` /
`<Map labels>` pour toute langue. Voir [LABELS.md](LABELS.md).

## 10. Registre `engine.templates`

Le moteur porte le registre (`engine.templates`, un `TemplateRegistry`), comme
`engine.tags` pour le filtre « Couches ». La couche de dessin y branche un
**`drawPort`** (`toGeoJSON`/`fromGeoJSON`) : c'est ce qui permet au bouton de vivre
dans la barre de contrôles, hors du contexte React du dessin. Voir
[ENGINE.md](ENGINE.md) pour les registres portés par le moteur.

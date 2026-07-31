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

Une case **séparée**, « Vue », ajoute au template l'endroit d'où on regarde — pose
caméra, fond de carte, couches affichées. C'est ce qui distingue un template « Vernon »
d'un template « Nice » là où les deux porteraient le même dessin. Elle ne fait pas
partie des catégories parce qu'une vue n'est pas du dessin : cf. §11.

Type de donnée :

```ts
type Template = {
  id: string
  name: string
  content: { draw: GeoJSONFeatureCollection; view?: TemplateView }
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

Si le template porte une **vue**, elle est rejouée en `merge` et `replace` — jamais en
`remove` : retirer des formes n'est pas une raison de déplacer la carte. Un template
sans aucune forme s'applique quand même : seule sa vue est alors rejouée.

**Filtre « Couches » actif** — poser un template alors qu'un filtre de tags masque une
partie de la carte ajouterait des formes invisibles (leurs tags ne sont pas cochés). En
`merge`/`replace`, l'application **révèle** donc les tags des formes posées : ils sont
ajoutés à la sélection du filtre pour que le template chargé se voie. Le filtre n'est pas
créé s'il était inactif (rien n'est alors masqué), et `remove` ne révèle rien (il ne pose
aucune forme).

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
  saveView: boolean                       // offrir la case « Vue »
  defaultSaveView: boolean                // case « Vue » cochée d'avance
  applyView: boolean                      // rejouer la vue au chargement
  viewFlyDuration: number                 // durée (s) du trajet ; 0 = instantané
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
t.saveCurrent(name, ['shapes', 'symbols'], { view: true })  // { view } est optionnel
t.saveCurrent('Vernon', [], { view: true })                 // vue seule, sans dessin
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

## 11. Vue mémorisée

Un template peut porter la **vue** d'où son dessin se regarde. C'est ce qui permet
d'avoir un template par site — « Vernon », « Nice » — plutôt qu'un dessin sans lieu.

```ts
type TemplateView = {
  lat: number; lng: number; altitude: number   // point au sol SOUS L'ŒIL, et hauteur
  heading: number                              // cap (rad), 0 = nord, positif vers l'est
  tilt: number                                 // inclinaison (rad), 0 = nadir, π/2 = horizon
  mapMode: '3d' | 'plan'
  traffic: boolean
  tags?: readonly string[]                     // filtre « Couches » — des NOMS de tags
  pedestrian?: TemplatePedestrianView          // point de station + regard + immersion
}
```

**Uniquement de l'usage.** Aucune donnée n'y entre : ni marker, ni zone, ni tracé. Les
`tags` sont des noms, pas les éléments qu'ils désignent.

**Rien de dérivé n'est stocké** — ni zoom, ni emprise : l'altitude et la pose les
redonnent, alors qu'une copie figée divergerait dès que le conteneur change de taille.
Idem pour la hauteur du sol sous le piéton, remesurée à l'arrivée.

### Dégradation

Une vue prise sur une carte mieux dotée reste chargeable ; chaque réglage se dégrade
seul, sans faire échouer les autres :

| Situation | Effet |
|-----------|-------|
| Mode `plan` sans fond 2D servable (ou `3d` sans volume) | mode inchangé |
| `traffic: true` hors des conditions du calque | trafic ignoré |
| Vue prise en 3D, rechargée en `plan` | inclinaison **ramenée** à la limite du mode |
| Tag mémorisé absent de la carte | il filtre, mais reste **décochable** (listé à compte 0) |
| Vue piéton, sol pas encore chargé ou volume indisponible | reste la pose caméra : même endroit, même cap |

### Hors du panneau

`captureView` / `applyView` sont exportées pour l'hôte qui gère ses propres vues — un
bouton « revenir ici », une vue par défaut au montage :

```ts
import { captureView, applyView } from 'map3d'

const vue = captureView(engine)                     // à mémoriser où vous voulez
applyView(engine, vue, { duration: 1.2 })           // 0 ou omis = instantané
```

L'ordre interne d'`applyView` n'est pas cosmétique : la prise de main précède tout (sinon
le vol d'intro reprend la caméra), le mode de carte précède la pose (c'est lui qui fixe la
borne d'inclinaison), la sortie du mode piéton précède la pose (sinon le contrôleur
l'écrase à la frame suivante), et l'entrée en piéton vient en dernier (son point de
station se valide au lancer de rayon, il faut être arrivé).

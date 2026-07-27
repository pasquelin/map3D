# Libellés & traduction (`labels`)

Tous les textes affichés par la lib (tooltips, aria-labels, placeholders, panneaux, labels de mesure) passent par un objet `MapLabels` : **aucun string en dur** dans les composants. Les défauts (français) sont dans `defaultLabels` ; chaque clé est overridable via `<MapProvider labels={...}>` (merge profond — ne passez que ce que vous traduisez).

```tsx
import { MapProvider } from '@gosecure/map3d'

<MapProvider
  labels={{
    controls: { fullscreen: 'Fullscreen', zoomIn: 'Zoom in' },
    tools: { rect: 'Rectangle', freehand: 'Freehand' },
    measure: { kilometers: '{value} km', meters: '{value} m' },
  }}
>
  ...
</MapProvider>
```

- Accès dans un composant custom : `useLabels()` (hook) — renvoie l'objet résolu.
- Interpolation : les gabarits contiennent des variables `{nom}` remplacées par `formatLabel(template, params)` — **conservez-les** dans vos traductions. `formatCount(one, other, count)` choisit la forme singulier/pluriel d'un couple de gabarits.
- Exports : `defaultLabels`, `mergeLabels(base, override)`, `formatLabel`, `formatCount`, `makeDistanceFormatter`, types `MapLabels` / `PartialLabels`.
- Le label de distance de la règle (outil Mesurer) est rendu par le core (hors React) : `<DrawLayer>` y injecte automatiquement `labels.measure` ; en usage vanilla, `drawLayer.formatDistance = makeDistanceFormatter(mesLabels.measure)`.

## Référence complète des clés

### `controls` — boutons de `<MapControls>` (tooltips / aria)

| Clé | Défaut |
|---|---|
| `controls.pan` | `Déplacer la carte` |
| `controls.target` | `Revenir à la cible` |
| `controls.rotate` | `Pivoter la vue (MAJ)` |
| `controls.north` | `Nord / vue du dessus` |
| `controls.zoomIn` | `Zoom avant` |
| `controls.zoomOut` | `Zoom arrière` |
| `controls.tilt` | `Incliner` |
| `controls.topDown` | `Vue du dessus` |
| `controls.globe` | `Retour au globe` |
| `controls.mode3d` | `Vue 3D` |
| `controls.plan` | `Plan` |
| `controls.traffic` | `Trafic` |
| `controls.fullscreen` | `Plein écran` |

### `tags` — bouton + panneau « Couches » (filtre par tag)

| Clé | Défaut |
|---|---|
| `tags.button` | `Couches — filtrer par tag` |
| `tags.searchPlaceholder` | `Rechercher un tag…` |
| `tags.empty` | `Aucun tag sur la carte` |
| `tags.noMatch` | `Aucun tag ne correspond` |
| `tags.showAll` | `Tout afficher` |

### `search` — `<SearchBox>`

| Clé | Défaut |
|---|---|
| `search.placeholder` | `Rechercher sur la carte…` (le prop `placeholder` du composant reste prioritaire) |
| `search.inputLabel` | `Recherche` (aria-label du champ) |
| `search.noResults` | `Aucun résultat` |
| `search.noResultsInGroup` | `Aucun résultat dans « {group} »` (portée restreinte ; `{group}` = nom de la rubrique) |
| `search.historyTitle` | `Recherches récentes` |
| `search.clearHistory` | `Effacer l’historique` |
| `search.clearInput` | `Effacer la recherche` (aria du bouton ✕) |
| `search.scopeAll` | `Tout` (valeur « toutes rubriques » du sélecteur de portée) |
| `search.scopeLabel` | `Restreindre la recherche` (aria du sélecteur) |
| `search.groups.shape` | `Zones` |
| `search.groups.draw` | `Dessins` |
| `search.groups.symbol` | `Symboles` |
| `search.groups.place` | `Lieux` |

Les rubriques issues d'une couche de markers ne sont **pas** nommées ici : leur
libellé vient de `<MarkerLayer typeLabel>` (`'agent'` → « Agents »), l'application
seule sachant ce que ses types signifient.

### `toolbar` — boutons de `<Toolbar>` hors outils

| Clé | Défaut |
|---|---|
| `toolbar.navigate` | `Naviguer` |
| `toolbar.undo` | `Annuler` |
| `toolbar.redo` | `Rétablir` |
| `toolbar.clearAll` | `Tout effacer` |

### `tools` — libellé de chaque outil de dessin

| Clé | Défaut |
|---|---|
| `tools.select` | `Sélectionner` |
| `tools.line` | `Ligne` |
| `tools.polygon` | `Polygone` |
| `tools.rect` | `Rectangle` |
| `tools.circle` | `Cercle` |
| `tools.freehand` | `Main levée` |
| `tools.arrow` | `Flèche` |
| `tools.measure` | `Mesurer` |
| `tools.erase` | `Effacer` |

### `selectModes` — flyout de l'outil sélection

`label` = texte de la rangée du flyout ; `description` = tooltip (affiché avec le raccourci, ex. « Sélection par rectangle (1) »).

| Clé | Défaut |
|---|---|
| `selectModes.rect.label` | `Rectangle` |
| `selectModes.rect.description` | `Sélection par rectangle` |
| `selectModes.poly.label` | `Polygone` |
| `selectModes.poly.description` | `Sélection par polygone` |
| `selectModes.lasso.label` | `Lasso` |
| `selectModes.lasso.description` | `Sélection au lasso` |

### `style` — panneau de style (libellés + aria des presets)

| Clé | Défaut | Variables |
|---|---|---|
| `style.fill` | `Couleur de fond` | |
| `style.stroke` | `Couleur de bordure` | |
| `style.swap` | `Échanger fond et bordure` | |
| `style.color` | `Couleur {color}` | `{color}` = couleur CSS |
| `style.customColor` | `Couleur personnalisée` | |
| `style.border` | `Bordure` | |
| `style.noBorder` | `Pas de bordure` | |
| `style.borderWidth` | `Bordure {width} px` | `{width}` = px |
| `style.strokeStyle` | `Trait` | |
| `style.solid` | `Trait plein` | |
| `style.dashed` | `Tirets` | |
| `style.dotted` | `Pointillés` | |
| `style.strokeOpacity` | `Op. trait` | |
| `style.fillOpacity` | `Fond` | |
| `style.opacityPreset` | `Fond {percent} %` | `{percent}` = 0–100 |
| `style.corners` | `Angles` | |
| `style.cornerRadius` | `Angles arrondis {radius} %` | `{radius}` = % |
| `style.selectionCount` | `{count} forme` | `{count}` = 1 |
| `style.selectionCountPlural` | `{count} formes` | `{count}` ≥ 2 |

### `settings` — panneau « Réglages des outils »

| Clé | Défaut |
|---|---|
| `settings.title` | `Réglages des outils` |
| `settings.resetAll` | `Tout réinitialiser` |
| `settings.resetTool` | `Réinitialiser cet outil` |
| `settings.shortcutsTitle` | `Raccourcis clavier` |

### `actions` — actions d'édition du dessin (récap des raccourcis)

| Clé | Défaut |
|---|---|
| `actions.panMap` | `Déplacer la carte` |
| `actions.rotateCamera` | `Tourner la caméra` |
| `actions.rotateShape` | `Tourner la forme` |
| `actions.undoRedo` | `Annuler / Rétablir` |
| `actions.selectAll` | `Tout sélectionner` |
| `actions.duplicate` | `Dupliquer` |
| `actions.delete` | `Supprimer` |
| `actions.moveSelection` | `Déplacer la sélection` |
| `actions.closePolygon` | `Fermer le polygone` |
| `actions.cancel` | `Annuler / quitter` |

### `keys` — noms de touches affichés

| Clé | Défaut |
|---|---|
| `keys.escape` | `Échap` |
| `keys.space` | `Espace` |
| `keys.spaceShift` | `Espace+Maj` |
| `keys.shiftDrag` | `Maj + glisser` |
| `keys.enter` | `Entrée` |
| `keys.arrows` | `Flèches` |
| `keys.backspace` | `⌫` |

### `format` — gabarits de composition

| Clé | Défaut | Variables |
|---|---|---|
| `format.shortcut` | `{label} ({key})` | tooltip/aria avec raccourci |

### `measure` — label de distance de la règle

| Clé | Défaut | Variables |
|---|---|---|
| `measure.kilometers` | `{value} km` | `{value}` = nombre formaté (2 décimales) |
| `measure.meters` | `{value} m` | `{value}` = mètres arrondis |

### `errors` — messages développeur

| Clé | Défaut |
|---|---|
| `errors.outsideMap` | `Ce composant doit être utilisé à l’intérieur de <Map>` |

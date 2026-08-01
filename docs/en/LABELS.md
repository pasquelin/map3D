# `MapLabels` — reference

[Français](../fr/LABELS.md) · **English** · [↑ Index](README.md)

Every string in the interface, and the formatting rules that depend on them (units,
plurals, templates). No visible string may live outside this tree.

```tsx
<MapProvider labels={{ controls: { zoomIn: 'Zoom in' } }}>
```

`{braces}` are variables substituted by `formatLabel`. To switch to imperial,
`imperialMeasure` replaces the whole `measure` block at once.

Exported helpers: `formatLabel(template, params)` (interpolation), `formatCount(n,
singular, plural, labels)` (countable, through `labels.plural`), `mergeLabels`,
`symbolText` (label of a catalogue entry), and the formatting factories
`makeDistanceFormatter`, `makeDurationFormatter`, `makeLinkLabelFormatter`.

Generated from `src/labels/defaultLabels.ts` and `src/labels/types.ts`.

> **The defaults are French strings** — that is the library's shipped locale, and the
> reason this tree exists. They are reproduced verbatim below (they are data, not
> prose); only the descriptions are translated. To run the map in English, override the
> keys as shown above.
>
> The source of truth is the French version, extracted from the code's JSDoc: check
> [fr/LABELS.md](../fr/LABELS.md) if a default looks out of date.

💰 = Google billing impact · 🌍 = locale/i18n impact

## `controls` — Navigation bar

| Key | Description | Default |
|---|---|---|
| `controls.pan` | Tooltips/aria of the `<MapControls>` buttons. | `'Déplacer la carte'` |
| `controls.rotate` | Tooltips/aria of the `<MapControls>` buttons. | `'Pivoter la vue (MAJ)'` |
| `controls.north` | Tooltips/aria of the `<MapControls>` buttons. | `'Nord / vue du dessus'` |
| `controls.zoomIn` | Tooltips/aria of the `<MapControls>` buttons. | `'Zoom avant'` |
| `controls.zoomOut` | Tooltips/aria of the `<MapControls>` buttons. | `'Zoom arrière'` |
| `controls.tilt` | Tooltips/aria of the `<MapControls>` buttons. | `'Incliner'` |
| `controls.globe` | Tooltips/aria of the `<MapControls>` buttons. | `'Retour au globe'` |
| `controls.fullscreen` | Tooltips/aria of the `<MapControls>` buttons. | `'Plein écran'` |
| `controls.target` | “Back to target” button — only appears with `MapControls target`. | `'Revenir à la cible'` |
| `controls.mode3d` | Basemap: 3D ↔ plan toggle (single button, always this label). | `'Vue 3D'` |
| `controls.traffic` | Google traffic overlay (plan mode only). | `'Trafic'` |

## `tags` — “Layers” panel

| Key | Description | Default |
|---|---|---|
| `tags.button` | “Layers” button + panel (tag filter). | `'Couches — filtrer par tag'` |
| `tags.searchPlaceholder` | “Layers” button + panel (tag filter). | `'Rechercher un tag…'` |
| `tags.empty` | No tag present on the map. | `'Aucun tag sur la carte'` |
| `tags.noMatch` | The search matches no tag. | `'Aucun tag ne correspond'` |
| `tags.showAll` | “Layers” button + panel (tag filter). | `'Tout afficher'` |

## `symbols` — Tactical symbols palette

| Key | Description | Default |
|---|---|---|
| `symbols.button` | The drawing bar's **Symbols** tool: a palette of icons placeable by drag-and-drop. Everything is translatable here — including the catalogue's categories and the affiliations — so that no text has to be passed as a prop. | `'Symboles'` |
| `symbols.searchPlaceholder` | The drawing bar's **Symbols** tool: a palette of icons placeable by drag-and-drop. Everything is translatable here — including the catalogue's categories and the affiliations — so that no text has to be passed as a prop. | `'Rechercher un symbole…'` |
| `symbols.dragHint` | Usage hint displayed at the top of the panel. | `'Glissez une icône sur la carte pour la poser'` |
| `symbols.noMatch` | The search matches no catalogue entry. | `'Aucun symbole ne correspond'` |
| `symbols.affiliation` | Title of the affiliation selection section. | `'Affiliation'` |
| `symbols.multiPointHint` | Multi-point graphic: placed by successive clicks, not by dropping. | `'Tracé multi-points — bientôt disponible'` |
| `symbols.categories.installations` | Label per catalogue category (catalogue key → displayed text). | `'Installations'` |
| `symbols.categories.units` | Label per catalogue category (catalogue key → displayed text). | `'Unités'` |
| `symbols.categories.equipment` | Label per catalogue category (catalogue key → displayed text). | `'Équipements'` |
| `symbols.categories.air` | Label per catalogue category (catalogue key → displayed text). | `'Aérien'` |
| `symbols.categories.events` | Label per catalogue category (catalogue key → displayed text). | `'Événements'` |
| `symbols.categories.control` | Label per catalogue category (catalogue key → displayed text). | `'Points de contrôle'` |
| `symbols.categories.tactical-graphics` | Label per catalogue category (catalogue key → displayed text). | `'Graphiques tactiques'` |
| `symbols.affiliations.friendly` | Label per affiliation (`friendly`, `hostile`, `neutral`, `unknown`). | `'Ami'` |
| `symbols.affiliations.hostile` | Label per affiliation (`friendly`, `hostile`, `neutral`, `unknown`). | `'Hostile'` |
| `symbols.affiliations.neutral` | Label per affiliation (`friendly`, `hostile`, `neutral`, `unknown`). | `'Neutre'` |
| `symbols.affiliations.unknown` | Label per affiliation (`friendly`, `hostile`, `neutral`, `unknown`). | `'Inconnu'` |

## `templates` — Templates manager

Top-right panel: list, save, share. See [TEMPLATES.md](TEMPLATES.md).

| Key | Description | Default |
|---|---|---|
| `templates.title` | Tooltip/aria of the open button + panel title. | `'Templates'` |
| `templates.save` | Button that opens the save form. | `'Sauvegarder'` |
| `templates.saveHint` | Instruction of the save form. | `'Nommez ce template et choisissez ce qu’il contient'` |
| `templates.name` | Placeholder/aria of the name field. | `'Nom du template'` |
| `templates.empty` | No template saved. | `'Aucun template'` |
| `templates.delete` | aria-label of the delete cross — `{name}`. | `'Supprimer {name}'` |
| `templates.deleteConfirm` | Deletion confirmation message — `{name}`. | `'Supprimer « {name} » ? Cette action est définitive.'` |
| `templates.confirm` | Confirmation button (dialog + rename commit). | `'Confirmer'` |
| `templates.cancel` | Cancel button (dialog + rename cancel). | `'Annuler'` |
| `templates.rename` | aria-label of the inline rename — `{name}`. | `'Renommer {name}'` |
| `templates.update` | “Update the template with the current drawing” button — `{name}`. | `'Mettre à jour « {name} » avec le dessin courant'` |
| `templates.updateConfirm` | Overwrite confirmation message — `{name}`. | `'Mettre à jour « {name} » avec le dessin courant ? L’ancien contenu sera écrasé.'` |
| `templates.apply` | Button applying a template to the current drawing. | `'Charger ce template'` |
| `templates.applyMode` | Heading of the apply-mode choice when clicking a template. | `'Au clic sur un template :'` |
| `templates.merge` | Apply option: adds to the existing drawing. | `'Ajouter'` |
| `templates.replace` | Apply option: replaces the existing drawing. | `'Remplacer'` |
| `templates.remove` | Apply option: removes from the drawing the shapes coming from this template. | `'Retirer'` |
| `templates.export` | `.m3dt` export button. | `'Exporter en fichier .m3dt'` |
| `templates.import` | `.m3dt` import button. | `'Importer'` |
| `templates.shared` | Badge of a shared template (coming from the API). | `'Partagé'` |
| `templates.readOnly` | Badge/aria of a read-only template. | `'Lecture seule'` |
| `templates.defaultName` | Fallback name of a template saved without a name. | `'template'` |
| `templates.importedName` | Fallback name of a template imported without a name. | `'Import'` |
| `templates.category.shapes` | Label of a saveable category (checkbox + stats — count-invariant). | `'Formes'` |
| `templates.category.freehand` | Label of a saveable category (checkbox + stats — count-invariant). | `'Main levée'` |
| `templates.category.symbols` | Label of a saveable category (checkbox + stats — count-invariant). | `'Symboles'` |
| `templates.stats.pair` | Compact stats: “label count” pair. | `'{label} {count}'` |
| `templates.stats.bytes` | Compact stats: weight template (`{count}`). | `'{count} o'` |
| `templates.view` | “Also save the view” checkbox in the save form. | `'Vue'` |
| `templates.viewHint` | Hint for the “View” checkbox — what it actually carries. | `'Position, orientation, type de carte et couches affichées'` |
| `templates.hasView` | Badge/aria for a template that carries a view. | `'Ce template rouvre sa vue'` |

## `search` — Unified search

| Key | Description | Default |
|---|---|---|
| `search.placeholder` | `<SearchBox>` (the component's `placeholder` prop still takes precedence). | `'Rechercher sur la carte…'` |
| `search.inputLabel` | aria-label of the field. | `'Recherche'` |
| `search.noResults` | Query with no result, across all groups. | `'Aucun résultat'` |
| `search.noResultsInGroup` | Query with no result within a restricted group — `{group}` receives its name. Distinct from `noResults` so the user sees that it is the SCOPE filtering, not the map being empty. | `'Aucun résultat dans « {group} »'` |
| `search.historyTitle` | Title of the history section (empty focused field). | `'Recherches récentes'` |
| `search.clearHistory` | `<SearchBox>` (the component's `placeholder` prop still takes precedence). | `'Effacer l’historique'` |
| `search.clearInput` | aria-label of the ✕ button clearing the field. | `'Effacer la recherche'` |
| `search.scopeAll` | Scope selector: button, “all groups” value, aria-label. | `'Tout'` |
| `search.scopeLabel` | `<SearchBox>` (the component's `placeholder` prop still takes precedence). | `'Restreindre la recherche'` |
| `search.groups.shape` | Name of the groups the LIBRARY produces itself. Those coming from a marker layer are named by its `typeLabel`, since only the application knows that a type `'agent'` is called “Agents”. | `'Zones'` |
| `search.groups.draw` | Name of the groups the LIBRARY produces itself. Those coming from a marker layer are named by its `typeLabel`, since only the application knows that a type `'agent'` is called “Agents”. | `'Dessins'` |
| `search.groups.symbol` | Name of the groups the LIBRARY produces itself. Those coming from a marker layer are named by its `typeLabel`, since only the application knows that a type `'agent'` is called “Agents”. | `'Symboles'` |
| `search.groups.place` | Name of the groups the LIBRARY produces itself. Those coming from a marker layer are named by its `typeLabel`, since only the application knows that a type `'agent'` is called “Agents”. | `'Lieux'` |

## `toolbar` — Drawing bar

| Key | Description | Default |
|---|---|---|
| `toolbar.navigate` | `<Toolbar>` buttons other than tools (navigation, history, clearing). | `'Naviguer'` |
| `buildingPick.label` | “Building” row of the selector — outside `selectModes`, which is keyed by `SelectMode`: picking a building is not a drawing selection mode. | `'Bâtiment'` |
| `buildingPick.description` | Its tooltip. | `'Sélectionner un bâtiment (volume 3D interne)'` |
| `measureTools.measure.label` | Rows of the “Measure” submenu: `label` = flyout row, `description` = tooltip (with the shortcut) — same convention as `selectModes`. | `'Mesurer'` |
| `measureTools.measure.description` | Its tooltip. | `'Mesurer une distance'` |
| `measureTools.graticule.label` | The “coordinate grid” row of the same submenu — a LAYER, not a drawing tool. | `'Grille'` |
| `measureTools.graticule.description` | Its tooltip. | `'Grille de coordonnées géographiques'` |
| `graticule.remarkable.equator` | Names of remarkable lines, indexed by `config.graticule.remarkable[].labelKey`. A missing key shows the coordinate instead of the name. | `'Équateur'` |
| `graticule.remarkable.tropicCancer` | — | `'Tropique du Cancer'` |
| `graticule.remarkable.tropicCapricorn` | — | `'Tropique du Capricorne'` |
| `graticule.remarkable.arcticCircle` | — | `'Cercle arctique'` |
| `graticule.remarkable.antarcticCircle` | — | `'Cercle antarctique'` |
| `graticule.remarkable.primeMeridian` | — | `'Méridien d'origine'` |
| `graticule.remarkable.antimeridian` | — | `'180ᵉ méridien'` |
| `graticule.format.deg` | Label template at degree precision — variables `{d}`, `{hemi}`. | `'{d}°{hemi}'` |
| `graticule.format.dm` | Minute precision — `{d}`, `{m}`, `{hemi}`. | `"{d}°{m}'{hemi}"` |
| `graticule.format.dms` | Second precision — `{d}`, `{m}`, `{s}`, `{hemi}`. | `'{d}°{m}\'{s}"{hemi}'` |
| `graticule.hemisphere.north` | Cardinal points — translatable (`W` → `O` if the host wants). | `'N'` |
| `graticule.hemisphere.south` | — | `'S'` |
| `graticule.hemisphere.east` | — | `'E'` |
| `graticule.hemisphere.west` | — | `'W'` |
| `toolbar.undo` | `<Toolbar>` buttons other than tools (navigation, history, clearing). | `'Annuler'` |
| `toolbar.redo` | `<Toolbar>` buttons other than tools (navigation, history, clearing). | `'Rétablir'` |
| `toolbar.clearAll` | `<Toolbar>` buttons other than tools (navigation, history, clearing). | `'Tout effacer'` |

## `tools` — Tool names

| Key | Description | Default |
|---|---|---|
| `tools.select` | Label of each drawing tool (toolbar, Settings panel, shortcut summary). | `'Sélectionner'` |
| `tools.line` | Label of each drawing tool (toolbar, Settings panel, shortcut summary). | `'Ligne'` |
| `tools.polygon` | Label of each drawing tool (toolbar, Settings panel, shortcut summary). | `'Polygone'` |
| `tools.rect` | Label of each drawing tool (toolbar, Settings panel, shortcut summary). | `'Rectangle'` |
| `tools.circle` | Label of each drawing tool (toolbar, Settings panel, shortcut summary). | `'Cercle'` |
| `tools.freehand` | Label of each drawing tool (toolbar, Settings panel, shortcut summary). | `'Main levée'` |
| `tools.arrow` | Label of each drawing tool (toolbar, Settings panel, shortcut summary). | `'Flèche'` |
| `tools.measure` | Label of each drawing tool (toolbar, Settings panel, shortcut summary). | `'Mesurer'` |
| `tools.erase` | Label of each drawing tool (toolbar, Settings panel, shortcut summary). | `'Effacer'` |
| `tools.symbol` | Label of each drawing tool (toolbar, Settings panel, shortcut summary). | `'Symboles'` |

## `selectModes` — Selection modes

| Key | Description | Default |
|---|---|---|
| `selectModes.rect.label` | Modes of the selection flyout (rectangle / polygon / lasso marquee): `label` = flyout row, `description` = tooltip (with the shortcut) — distinct from the label so as not to repeat text already visible. | `'Rectangle'` |
| `selectModes.rect.description` | Modes of the selection flyout (rectangle / polygon / lasso marquee): `label` = flyout row, `description` = tooltip (with the shortcut) — distinct from the label so as not to repeat text already visible. | `'Sélection par rectangle'` |
| `selectModes.poly.label` | Modes of the selection flyout (rectangle / polygon / lasso marquee): `label` = flyout row, `description` = tooltip (with the shortcut) — distinct from the label so as not to repeat text already visible. | `'Polygone'` |
| `selectModes.poly.description` | Modes of the selection flyout (rectangle / polygon / lasso marquee): `label` = flyout row, `description` = tooltip (with the shortcut) — distinct from the label so as not to repeat text already visible. | `'Sélection par polygone'` |
| `selectModes.lasso.label` | Modes of the selection flyout (rectangle / polygon / lasso marquee): `label` = flyout row, `description` = tooltip (with the shortcut) — distinct from the label so as not to repeat text already visible. | `'Lasso'` |
| `selectModes.lasso.description` | Modes of the selection flyout (rectangle / polygon / lasso marquee): `label` = flyout row, `description` = tooltip (with the shortcut) — distinct from the label so as not to repeat text already visible. | `'Sélection au lasso'` |

## `style` — Style panel

| Key | Description | Default |
|---|---|---|
| `style.fill` | Style panel (swatches, palette, presets) — labels and aria. | `'Couleur de fond'` |
| `style.stroke` | Style panel (swatches, palette, presets) — labels and aria. | `'Couleur de bordure'` |
| `style.swap` | Style panel (swatches, palette, presets) — labels and aria. | `'Échanger fond et bordure'` |
| `style.color` | Palette chip — `{color}` = the CSS colour. | `'Couleur {color}'` |
| `style.customColor` | Style panel (swatches, palette, presets) — labels and aria. | `'Couleur personnalisée'` |
| `style.border` | Style panel (swatches, palette, presets) — labels and aria. | `'Bordure'` |
| `style.noBorder` | Style panel (swatches, palette, presets) — labels and aria. | `'Pas de bordure'` |
| `style.borderWidth` | Width preset — `{width}` = px. | `'Bordure {width} px'` |
| `style.strokeStyle` | Style panel (swatches, palette, presets) — labels and aria. | `'Trait'` |
| `style.solid` | Style panel (swatches, palette, presets) — labels and aria. | `'Trait plein'` |
| `style.dashed` | Style panel (swatches, palette, presets) — labels and aria. | `'Tirets'` |
| `style.dotted` | Style panel (swatches, palette, presets) — labels and aria. | `'Pointillés'` |
| `style.strokeOpacity` | Style panel (swatches, palette, presets) — labels and aria. | `'Op. trait'` |
| `style.fillOpacity` | Style panel (swatches, palette, presets) — labels and aria. | `'Fond'` |
| `style.opacityPreset` | Opacity preset — `{percent}` = 0–100. | `'Fond {percent} %'` |
| `style.corners` | Style panel (swatches, palette, presets) — labels and aria. | `'Angles'` |
| `style.cornerRadius` | Corner radius preset — `{radius}` = % of the short side. | `'Angles arrondis {radius} %'` |
| `style.selectionCount` | Panel title when 1 shape is selected — `{count}`. | `'{count} forme'` |
| `style.selectionCountPlural` | Panel title when several shapes are selected — `{count}`. | `'{count} formes'` |
| `style.expand` | Button that unfolds the collapsed panel. | `'Modifier le style'` |
| `style.collapse` | Button that collapses the panel down to its single button. | `'Réduire'` |

## `selection` — Selection panel

| Key | Description | Default |
|---|---|---|
| `selection.title` | Panel title. | `'Sélection'` |
| `selection.shapesGroup` | Name of the shapes category in a row. | `'Formes'` |
| `selection.group` | Template of a row's label — `{group}`, `{type}` (separate counter). | `'{group} · {type}'` |
| `selection.deselectGroup` | aria-label of a row's cross — `{label}` = the row's label. | `'Désélectionner {label}'` |
| `selection.clearAll` | Selection panel (list of selected elements, by group). | `'Tout désélectionner'` |
| `selection.movePanel` | aria-label of the panel's move grip. | `'Déplacer le panneau'` |

## `clusters` — Marker grouping

| Key | Description | Default |
|---|---|---|
| `clusters.label` | aria-label of a chip — `{count}` = number of aggregated markers. It is the only text a screen reader gets from the chip: the pie is an image, and the per-type breakdown lives in the tooltip. | `'Groupe de {count} marqueurs'` |
| `clusters.labelSingular` | Same, singular — `{count}` = 1. | `'Groupe de {count} marqueur'` |

## `markerList` — Marker lists

| Key | Description | Default |
|---|---|---|
| `markerList.target` | “Target” action (menu + click on the row). | `'Cibler'` |
| `markerList.actions` | aria-label of a row's actions menu button — `{label}`. | `'Actions pour {label}'` |
| `markerList.remove` | aria-label of a row's cross — `{label}`. | `'Retirer {label}'` |

## `lens` — Lens tool

| Key | Description | Default |
|---|---|---|
| `lens.tool` | Label/aria of the lens tool in the toolbar. | `'Loupe'` |
| `lens.title` | Panel title — `{count}` = number of markers. | `'{count} marqueurs'` |
| `lens.titleSingular` | Singular title — `{count}` = 1. | `'{count} marqueur'` |
| `lens.empty` | Empty panel (area with no marker). | `'Aucun marqueur dans la zone'` |
| `lens.remove` | aria-label of the button removing the lens area. | `'Retirer la loupe'` |
| `lens.movePanel` | aria-label of the panel's move grip. | `'Déplacer le panneau'` |
| `lens.snapBack` | aria-label/tooltip of the button snapping the panel back to the area (after moving it). | `'Rattacher le panneau à la zone'` |

## `settings` — Settings panel

| Key | Description | Default |
|---|---|---|
| `settings.title` | “Tool settings” panel. | `'Réglages des outils'` |
| `settings.resetAll` | “Tool settings” panel. | `'Tout réinitialiser'` |
| `settings.resetTool` | “Tool settings” panel. | `'Réinitialiser cet outil'` |
| `settings.shortcutsTitle` | “Tool settings” panel. | `'Raccourcis clavier'` |

## `actions` — Gesture cheat sheet

| Key | Description | Default |
|---|---|---|
| `actions.panMap` | Drawing editing actions (shortcut summary). | `'Déplacer la carte'` |
| `actions.rotateCamera` | Drawing editing actions (shortcut summary). | `'Tourner la caméra'` |
| `actions.rotateShape` | Drawing editing actions (shortcut summary). | `'Tourner la forme'` |
| `actions.undoRedo` | Drawing editing actions (shortcut summary). | `'Annuler / Rétablir'` |
| `actions.selectAll` | Drawing editing actions (shortcut summary). | `'Tout sélectionner'` |
| `actions.duplicate` | Drawing editing actions (shortcut summary). | `'Dupliquer'` |
| `actions.delete` | Drawing editing actions (shortcut summary). | `'Supprimer'` |
| `actions.moveSelection` | Drawing editing actions (shortcut summary). | `'Déplacer la sélection'` |
| `actions.closePolygon` | Drawing editing actions (shortcut summary). | `'Fermer le polygone'` |
| `actions.cancel` | Drawing editing actions (shortcut summary). | `'Annuler / quitter'` |
| `actions.addToSelection` | Shift+click / Shift+marquee: add to the selection. | `'Ajouter à la sélection'` |
| `actions.markersOnly` | Alt/⌘+marquee: select markers only. | `'Marqueurs seuls (tracé)'` |

## `glyphs` — Interface glyphs

| Key | Description | Default |
|---|---|---|
| `glyphs.submenu` | Branch mark of a submenu. | `'›'` |
| `glyphs.check` | Tick of a menu's active option. | `'✓'` |
| `glyphs.none` | “No border” preset. | `'∅'` |
| `glyphs.separator` | Inline separator of cluster tooltips. | `'·'` |

## `modKey` — Modifier prefix per platform

| Key | Description | Default |
|---|---|---|
| `modKey.mac` | Modifier prefix shown in shortcuts, per platform. | `'⌘'` |
| `modKey.other` | Modifier prefix shown in shortcuts, per platform. | `'Ctrl+'` |

## `keys` — Displayed key names

| Key | Description | Default |
|---|---|---|
| `keys.escape` | Displayed key names (tooltips, shortcut summary). | `'Échap'` |
| `keys.space` | Displayed key names (tooltips, shortcut summary). | `'Espace'` |
| `keys.spaceShift` | Displayed key names (tooltips, shortcut summary). | `'Espace+Maj'` |
| `keys.shiftDrag` | Displayed key names (tooltips, shortcut summary). | `'Maj + glisser'` |
| `keys.enter` | Displayed key names (tooltips, shortcut summary). | `'Entrée'` |
| `keys.arrows` | Displayed key names (tooltips, shortcut summary). | `'Flèches'` |
| `keys.backspace` | Displayed key names (tooltips, shortcut summary). | `'⌫'` |
| `keys.shiftClick` | Displayed key names (tooltips, shortcut summary). | `'Maj + clic'` |
| `keys.altOrCmd` | Displayed key names (tooltips, shortcut summary). | `'Alt / ⌘'` |
| `keys.shift` | Shift glyph on its own, to compose a displayed shortcut (⇧Z). | `'⇧'` |

## `format` — Composition templates

| Key | Description | Default |
|---|---|---|
| `format.shortcut` | Label + shortcut of a tooltip/aria — `{label}`, `{key}`. | `'{label} ({key})'` |

## `measure` — 🌍 Distances — unit system

| Key | Description | Default |
|---|---|---|
| `measure.major` | Template of the MAJOR unit (km, miles) — `{value}`. | `'{value} km'` |
| `measure.minor` | Template of the MINOR unit (m, feet) — `{value}`. | `'{value} m'` |
| `measure.majorThreshold` | Switching threshold to the major unit, **in metres**. | `1000` |
| `measure.majorFactor` | Metre → major unit divisor: `1000` in metric, `1609.344` in imperial. | `1000` |
| `measure.minorFactor` | Metre → minor unit divisor: `1` in metric, `0.3048` in imperial. | `1` |
| `measure.majorDecimals` | Decimals of the major unit. | `2` |
| `measure.minorDecimals` | Decimals of the minor unit — it used to be rounded to an integer with no recourse. | `0` |
| `measure.numberLocale` | Number formatting locale (`Intl.NumberFormat`). `'auto'` follows the browser. ⚠️ Without it, formatting went through `toFixed`, so the decimal separator was ALWAYS a dot: the library displayed “2.40 km” where its own French labels promise “2,4 km”. `toFixed` also does not strip… | `'auto'` |

## `duration` — Durations

| Key | Description | Default |
|---|---|---|
| `duration.minorThreshold` | Below this number of seconds, the duration is displayed in seconds. | `60` |
| `duration.majorThreshold` | Below this number of minutes, it is displayed in minutes; beyond, in hours. | `60` |
| `duration.seconds` | Travel duration — `{value}`, or `{h}`/`{m}` beyond an hour. | `'{value} s'` |
| `duration.minutes` | Travel duration — `{value}`, or `{h}`/`{m}` beyond an hour. | `'{value} min'` |
| `duration.hours` | Whole hours (zero minutes) — `{h}`. | `'{h} h'` |
| `duration.hoursMinutes` | Hours and minutes — `{h}`, `{m}`. | `'{h} h {m}'` |

## `readout` — 🌍 View readout block

Altitude has NO unit system of its own: it goes through `measure`, like every distance in
the library.

| Key | Description | Default |
|---|---|---|
| `readout.title` | Accessible name of the region (screen readers) — the block has no visible title. | `'Position de la caméra'` |
| `readout.altitude` | Label of the altitude row. | `'alt'` |
| `readout.latitude` | Label of the latitude row. | `'lat'` |
| `readout.longitude` | Label of the longitude row. | `'lng'` |
| `readout.heading` | Label of the heading — the direction the camera LOOKS at. | `'cap'` |
| `readout.tilt` | Label of the tilt — `0°` at nadir (straight down), `90°` at the horizon. | `'incl'` |
| `readout.zoom` | Label of the zoom row. | `'zoom'` |
| `readout.degreeFormat` | Template for ANGLES (heading and tilt) — `{value}`. The only fields carrying a unit: the degree sign sits flush against the number, which no `Intl.NumberFormat` produces. | `'{value}°'` |
| `readout.degreeDecimals` | Angle decimals. `0` is enough for navigation; raise it for a fine reading. Shared by both on purpose: they sit side by side, and two different precisions would suggest one is better known than the other. | `0` |
| `readout.coordDecimals` | Coordinate decimals. **Fixed** (minimum = maximum): a decimal that appears and disappears changes the number's width, and the block jitters on every frame of a move. 5 ≈ 1 m on the ground. | `5` |
| `readout.zoomDecimals` | Zoom decimals — same fixed-width rule. | `1` |
| `readout.numberLocale` | Locale used to format coordinates and zoom (`'auto'` follows the browser). Deliberately distinct from `measure.numberLocale`: a WGS84 coordinate gets copied elsewhere, where the decimal point is the convention — hence the point even under a French interface, while altitude still reads “1,2 km”. | `'en-US'` |

## `relations` — Relation engine

| Key | Description | Default |
|---|---|---|
| `relations.menuRoot` | Title of the section added to a marker's context menu. | `'Distance autour'` |
| `relations.pending` | Label of a link while the real time has not come back. | `'…'` |
| `relations.unavailable` | Label of a link whose real time could not be obtained. | `'Temps indisponible'` |
| `relations.linkLabel` | Nominal label of a link — `{distance}`, `{duration}` already formatted. | `'{distance} · {duration}'` |
| `relations.fastestGroup` | Title of the speed presets block. | `'Les plus rapides'` |
| `relations.fastest` | Speed preset — `{count}`. | `'Les {count} plus rapides'` |
| `relations.radiusGroup` | Title of the radius presets block. | `'Dans un rayon'` |
| `relations.radius` | Radius preset — `{radius}` already formatted. | `'Dans {radius}'` |
| `relations.targetCount` | Hint of a preset: number of targets kept — `{count}`. | `'{count}'` |
| `relations.tooWide` | Hint of a preset whose selection exceeds the computation cap — `{count}`. | `'{count} !'` |
| `relations.noTargets` | Hint of a preset with no target at all. | `'aucun'` |
| `relations.clusterAggregate` | Aggregated label of a cluster too crowded for the fan — `{count}`. | `'{count} éléments'` |
| `relations.statusRelation` | Status bar: active relation — `{source}`, `{targets}`. | `'{source} → {targets}'` |
| `relations.clear` | Status bar: clear the relation (button label, visible and aria-label). | `'Supprimer'` |
| `relations.removeRoute` | aria-label of the cross on a route label (closes the trace). | `'Fermer l’itinéraire'` |
| `relations.modes.DRIVE` | Names of the travel modes (clickable segment of the status bar). | `'En voiture'` |
| `relations.modes.WALK` | Names of the travel modes (clickable segment of the status bar). | `'À pied'` |
| `relations.modes.BICYCLE` | Names of the travel modes (clickable segment of the status bar). | `'À vélo'` |
| `relations.modes.TWO_WHEELER` | Names of the travel modes (clickable segment of the status bar). | `'En deux-roues'` |
| `relations.modes.TRANSIT` | Names of the travel modes (clickable segment of the status bar). | `'En transports'` |

## `pinned` — Favourites dock

| Key | Description | Default |
|---|---|---|
| `pinned.add` | Prompt of the add tab. | `'Ajouter un marqueur'` |
| `pinned.remove` | Tooltip shown while dragging a chip out of the dock. | `'Supprimer'` |
| `pinned.collapse` | aria-label of the button that collapses the dock. | `'Réduire'` |
| `pinned.expand` | aria-label of the button/chip that expands the dock. | `'Développer'` |
| `pinned.title` | Name of the dock, displayed ON the grip when collapsed: it is then the only visible element, and a chevron alone does not say what it reopens. | `'Favoris'` |

## `plural` — 🌍 Grammatical form selection

| Key | Description | Default |
|---|---|---|
| `plural` | A `(count: number) => 'one' \| 'other'` function. ⚠️ The default is the **French** rule (`n > 1`): it is **wrong for English**, where `0` is plural, and insufficient for Polish or Russian (three forms). **Override it in an English setup.** Return one of the two forms the library can render, or plug in `Intl.PluralRules`. | `(n) => (n > 1 ? 'other' : 'one')` |

## `errors` — Error messages (developer-facing)

| Key | Description | Default |
|---|---|---|
| `errors.outsideMap` | A library hook called outside a `<Map>` — the context is then missing. | `'Ce composant doit être utilisé à l’intérieur de <Map>'` |
| `errors.drawingRequired` | `useDrawing()` called while the drawing layer is removed. | `'useDrawing nécessite le dessin : il est retiré par <Map draw={false}>'` |
| `errors.lensRequired` | `useLens()` called while the lens is removed. | `'useLens nécessite la loupe : elle est retirée par <Map toolbar={{ lens: false }}>'` |

---

## Full English label set

A ready-to-paste starting point. Only the visible strings are translated; templates keep
their `{variables}`.

```tsx
import { imperialMeasure } from 'map3d'

<MapProvider
  labels={{
    controls: {
      pan: 'Pan the map', rotate: 'Rotate the view (SHIFT)', north: 'North / top-down',
      zoomIn: 'Zoom in', zoomOut: 'Zoom out', tilt: 'Tilt',
      globe: 'Back to globe', fullscreen: 'Fullscreen', target: 'Back to target',
      mode3d: '3D view', traffic: 'Traffic',
    },
    tags: {
      button: 'Layers — filter by tag', searchPlaceholder: 'Search a tag…',
      empty: 'No tag on the map', noMatch: 'No matching tag', showAll: 'Show all',
    },
    toolbar: { navigate: 'Navigate', undo: 'Undo', redo: 'Redo', clearAll: 'Clear all' },
    tools: {
      select: 'Select', line: 'Line', polygon: 'Polygon', rect: 'Rectangle',
      circle: 'Circle', freehand: 'Freehand', arrow: 'Arrow', measure: 'Measure',
      erase: 'Erase', symbol: 'Symbols',
    },
    search: {
      placeholder: 'Search the map…', inputLabel: 'Search', noResults: 'No result',
      noResultsInGroup: 'No result in “{group}”', historyTitle: 'Recent searches',
      clearHistory: 'Clear history', clearInput: 'Clear search',
      scopeAll: 'All', scopeLabel: 'Narrow the search',
      groups: { shape: 'Zones', draw: 'Drawings', symbol: 'Symbols', place: 'Places' },
    },
    keys: {
      escape: 'Esc', space: 'Space', spaceShift: 'Space+Shift', shiftDrag: 'Shift + drag',
      enter: 'Enter', arrows: 'Arrows', backspace: '⌫', shiftClick: 'Shift + click',
      altOrCmd: 'Alt / ⌘', shift: '⇧',
    },
    measure: imperialMeasure,   // or keep the metric block and only change `numberLocale`
    errors: {
      outsideMap: 'This component must be used inside <Map>',
      drawingRequired: 'useDrawing requires drawing: it is removed by <Map draw={false}>',
      lensRequired: 'useLens requires the lens: it is removed by <Map toolbar={{ lens: false }}>',
    },
  }}
>
```

The merge is deep: every key left out keeps its default.

---

## `catalog` — Remote entity catalog

Bar button, type menu, list and settings — see the [CATALOG.md](CATALOG.md) guide. **Type names** are not here: they come from `CatalogSource.label`, provided by the host, which alone knows what it calls them.

Defaults below are the library's real French strings — they are data, not prose to translate.

| Key | Description | Default |
|---|---|---|
| `catalog.button` | Bar button. | `'Catalogue'` |
| `catalog.searchPlaceholder` | Search field. | `'Taper votre recherche…'` |
| `catalog.empty` | The source holds no item. | `'Aucun élément'` |
| `catalog.noMatch` | The search returns nothing. | `'Aucun résultat'` |
| `catalog.loading` | Page loading. | `'Chargement…'` |
| `catalog.error` | Listing failure. | `'Chargement impossible'` |
| `catalog.retry` | Error banner button. | `'Réessayer'` |
| `catalog.itemError` | Geometry loading failure, as a row tooltip. | `'Impossible d’afficher cet élément'` |
| `catalog.add` | Checkbox, "not on the map yet" state — `{label}`. | `'Afficher {label} sur la carte'` |
| `catalog.remove` | Checkbox, "displayed" state — `{label}`. | `'Retirer {label} de la carte'` |
| `catalog.expand` / `catalog.collapse` | Aggregate chevron. | `'Déplier'` / `'Replier'` |
| `catalog.numberLocale` | Locale used to format a source's total (`'auto'` follows the browser). `36 699` or `36,699` is an INTERFACE decision, not a browser one — see `measure.numberLocale`. | `'auto'` |
| `catalog.settings.title` | Gear panel entry. | `'Catalogue'` |
| `catalog.settings.persist` | Persistence switch. | `'Conserver les éléments affichés entre les sessions'` |
| `catalog.settings.fitOnAdd` | Framing switch. | `'Cadrer à l’ajout'` |
| `catalog.settings.clear` | Purge button. | `'Tout retirer'` |

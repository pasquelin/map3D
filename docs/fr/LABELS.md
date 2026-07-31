# `MapLabels` — référence

**Français** · [English](../en/LABELS.md) · [↑ Index](README.md)

Tous les textes de l'interface, et les règles de formatage qui en dépendent
(unités, pluriel, gabarits). Aucune chaîne visible ne doit vivre hors de cet arbre.

```tsx
<MapProvider labels={{ controls: { zoomIn: 'Zoom in' } }}>
```

Les `{accolades}` sont des variables substituées par `formatLabel`. Pour passer en
impérial, `imperialMeasure` remplace le bloc `measure` d'un coup.

Helpers exportés : `formatLabel(gabarit, params)` (interpolation), `formatCount(n,
singulier, pluriel, labels)` (dénombrable, via `labels.plural`), `mergeLabels`,
`symbolText` (libellé d'une entrée de catalogue), et les fabriques de formatage
`makeDistanceFormatter`, `makeDurationFormatter`, `makeLinkLabelFormatter`.

Généré depuis `src/labels/defaultLabels.ts` et `src/labels/types.ts`.

💰 = impact facturation Google · 🌍 = impact locale/i18n

## `controls` — Barre de navigation

| Clé | Description | Défaut |
|---|---|---|
| `controls.pan` | Tooltips/aria des boutons de `<MapControls>`. | `'Déplacer la carte'` |
| `controls.rotate` | Tooltips/aria des boutons de `<MapControls>`. | `'Pivoter la vue (MAJ)'` |
| `controls.north` | Tooltips/aria des boutons de `<MapControls>`. | `'Nord / vue du dessus'` |
| `controls.zoomIn` | Tooltips/aria des boutons de `<MapControls>`. | `'Zoom avant'` |
| `controls.zoomOut` | Tooltips/aria des boutons de `<MapControls>`. | `'Zoom arrière'` |
| `controls.tilt` | Tooltips/aria des boutons de `<MapControls>`. | `'Incliner'` |
| `controls.globe` | Tooltips/aria des boutons de `<MapControls>`. | `'Retour au globe'` |
| `controls.fullscreen` | Tooltips/aria des boutons de `<MapControls>`. | `'Plein écran'` |
| `controls.target` | Bouton « revenir à la cible » — n'apparaît qu'avec `MapControls target`. | `'Revenir à la cible'` |
| `controls.mode3d` | Fond de carte : bascule 3D ↔ plan (bouton unique, toujours ce libellé). | `'Vue 3D'` |
| `controls.traffic` | Calque trafic Google (mode plan uniquement). | `'Trafic'` |

## `tags` — Panneau « Couches »

| Clé | Description | Défaut |
|---|---|---|
| `tags.button` | Bouton + panneau « Couches » (filtre par tag). | `'Couches — filtrer par tag'` |
| `tags.searchPlaceholder` | Bouton + panneau « Couches » (filtre par tag). | `'Rechercher un tag…'` |
| `tags.empty` | Aucun tag présent sur la carte. | `'Aucun tag sur la carte'` |
| `tags.noMatch` | La recherche ne matche aucun tag. | `'Aucun tag ne correspond'` |
| `tags.showAll` | Bouton + panneau « Couches » (filtre par tag). | `'Tout afficher'` |

## `symbols` — Palette de symboles tactiques

| Clé | Description | Défaut |
|---|---|---|
| `symbols.button` | Outil **Symboles** de la barre de dessin : palette d'icônes posables au glisser-déposer. Tout est traduisible ici — y compris les catégories du catalogue et les affiliations — pour qu'aucun texte n'ait à passer en prop. | `'Symboles'` |
| `symbols.searchPlaceholder` | Outil **Symboles** de la barre de dessin : palette d'icônes posables au glisser-déposer. Tout est traduisible ici — y compris les catégories du catalogue et les affiliations — pour qu'aucun texte n'ait à passer en prop. | `'Rechercher un symbole…'` |
| `symbols.dragHint` | Consigne d'usage affichée en tête du panneau. | `'Glissez une icône sur la carte pour la poser'` |
| `symbols.noMatch` | La recherche ne matche aucune entrée du catalogue. | `'Aucun symbole ne correspond'` |
| `symbols.affiliation` | Titre de la section de choix d'affiliation. | `'Affiliation'` |
| `symbols.multiPointHint` | Graphique multi-points : posé par clics successifs, pas par dépôt. | `'Tracé multi-points — bientôt disponible'` |
| `symbols.categories.installations` | Libellé par catégorie du catalogue (clé du catalogue → texte affiché). | `'Installations'` |
| `symbols.categories.units` | Libellé par catégorie du catalogue (clé du catalogue → texte affiché). | `'Unités'` |
| `symbols.categories.equipment` | Libellé par catégorie du catalogue (clé du catalogue → texte affiché). | `'Équipements'` |
| `symbols.categories.air` | Libellé par catégorie du catalogue (clé du catalogue → texte affiché). | `'Aérien'` |
| `symbols.categories.events` | Libellé par catégorie du catalogue (clé du catalogue → texte affiché). | `'Événements'` |
| `symbols.categories.control` | Libellé par catégorie du catalogue (clé du catalogue → texte affiché). | `'Points de contrôle'` |
| `symbols.categories.tactical-graphics` | Libellé par catégorie du catalogue (clé du catalogue → texte affiché). | `'Graphiques tactiques'` |
| `symbols.affiliations.friendly` | Libellé par affiliation (`friendly`, `hostile`, `neutral`, `unknown`). | `'Ami'` |
| `symbols.affiliations.hostile` | Libellé par affiliation (`friendly`, `hostile`, `neutral`, `unknown`). | `'Hostile'` |
| `symbols.affiliations.neutral` | Libellé par affiliation (`friendly`, `hostile`, `neutral`, `unknown`). | `'Neutre'` |
| `symbols.affiliations.unknown` | Libellé par affiliation (`friendly`, `hostile`, `neutral`, `unknown`). | `'Inconnu'` |

## `templates` — Gestionnaire de templates

Panneau haut-droite : liste, sauvegarde, partage. Cf. [TEMPLATES.md](TEMPLATES.md).

| Clé | Description | Défaut |
|---|---|---|
| `templates.title` | Tooltip/aria du bouton d'ouverture + titre du panneau. | `'Templates'` |
| `templates.save` | Bouton d'ouverture du formulaire de sauvegarde. | `'Sauvegarder'` |
| `templates.saveHint` | Consigne du formulaire de sauvegarde. | `'Nommez ce template et choisissez ce qu’il contient'` |
| `templates.name` | Placeholder/aria du champ nom. | `'Nom du template'` |
| `templates.empty` | Aucun template enregistré. | `'Aucun template'` |
| `templates.delete` | aria-label de la croix de suppression — `{name}`. | `'Supprimer {name}'` |
| `templates.deleteConfirm` | Message de confirmation de suppression — `{name}`. | `'Supprimer « {name} » ? Cette action est définitive.'` |
| `templates.confirm` | Bouton de confirmation (dialogue + validation du renommage). | `'Confirmer'` |
| `templates.cancel` | Bouton d'annulation (dialogue + annulation du renommage). | `'Annuler'` |
| `templates.rename` | aria-label du renommage inline — `{name}`. | `'Renommer {name}'` |
| `templates.update` | Bouton « mettre à jour le template avec le dessin courant » — `{name}`. | `'Mettre à jour « {name} » avec le dessin courant'` |
| `templates.updateConfirm` | Message de confirmation d'écrasement — `{name}`. | `'Mettre à jour « {name} » avec le dessin courant ? L’ancien contenu sera écrasé.'` |
| `templates.apply` | Bouton d'application d'un template au dessin courant. | `'Charger ce template'` |
| `templates.applyMode` | Intitulé du choix du mode d'application au clic sur un template. | `'Au clic sur un template :'` |
| `templates.merge` | Option d'application : ajoute au dessin existant. | `'Ajouter'` |
| `templates.replace` | Option d'application : remplace le dessin existant. | `'Remplacer'` |
| `templates.remove` | Option d'application : retire du dessin les formes venues de ce template. | `'Retirer'` |
| `templates.export` | Bouton d'export `.m3dt`. | `'Exporter en fichier .m3dt'` |
| `templates.import` | Bouton d'import `.m3dt`. | `'Importer'` |
| `templates.shared` | Badge d'un template partagé (venu de l'API). | `'Partagé'` |
| `templates.readOnly` | Badge/aria d'un template en lecture seule. | `'Lecture seule'` |
| `templates.defaultName` | Nom de repli d'un template sauvegardé sans nom. | `'template'` |
| `templates.importedName` | Nom de repli d'un template importé sans nom. | `'Import'` |
| `templates.category.shapes` | Libellé d'une catégorie sauvegardable (checkbox + stats — invariant au nombre). | `'Formes'` |
| `templates.category.freehand` | Libellé d'une catégorie sauvegardable (checkbox + stats — invariant au nombre). | `'Main levée'` |
| `templates.category.symbols` | Libellé d'une catégorie sauvegardable (checkbox + stats — invariant au nombre). | `'Symboles'` |
| `templates.stats.pair` | Stats compactes : paire « libellé nombre ». | `'{label} {count}'` |
| `templates.stats.bytes` | Stats compactes : gabarit de poids (`{count}`). | `'{count} o'` |
| `templates.view` | Case « mémoriser la vue » du formulaire de sauvegarde. | `'Vue'` |
| `templates.viewHint` | Consigne de la case « Vue » — ce qu'elle emporte réellement. | `'Position, orientation, type de carte et couches affichées'` |
| `templates.hasView` | Badge/aria d'un template qui porte une vue. | `'Ce template rouvre sa vue'` |

## `search` — Recherche unifiée

| Clé | Description | Défaut |
|---|---|---|
| `search.placeholder` | `<SearchBox>` (le prop `placeholder` du composant reste prioritaire). | `'Rechercher sur la carte…'` |
| `search.inputLabel` | aria-label du champ. | `'Recherche'` |
| `search.noResults` | Requête sans résultat, toutes rubriques confondues. | `'Aucun résultat'` |
| `search.noResultsInGroup` | Requête sans résultat dans une rubrique restreinte — `{group}` reçoit son nom. Distinct de `noResults` pour que l'utilisateur voie que c'est la PORTÉE qui filtre, et pas la carte qui est vide. | `'Aucun résultat dans « {group} »'` |
| `search.historyTitle` | Titre de la section historique (champ vide focalisé). | `'Recherches récentes'` |
| `search.clearHistory` | `<SearchBox>` (le prop `placeholder` du composant reste prioritaire). | `'Effacer l’historique'` |
| `search.clearInput` | aria-label du bouton ✕ qui vide le champ. | `'Effacer la recherche'` |
| `search.scopeAll` | Sélecteur de portée : bouton, valeur « toutes rubriques », aria-label. | `'Tout'` |
| `search.scopeLabel` | `<SearchBox>` (le prop `placeholder` du composant reste prioritaire). | `'Restreindre la recherche'` |
| `search.groups.shape` | Nom des rubriques que la LIB produit elle-même. Celles issues d'une couche de markers sont nommées par son `typeLabel`, l'application seule sachant qu'un type `'agent'` s'appelle « Agents ». | `'Zones'` |
| `search.groups.draw` | Nom des rubriques que la LIB produit elle-même. Celles issues d'une couche de markers sont nommées par son `typeLabel`, l'application seule sachant qu'un type `'agent'` s'appelle « Agents ». | `'Dessins'` |
| `search.groups.symbol` | Nom des rubriques que la LIB produit elle-même. Celles issues d'une couche de markers sont nommées par son `typeLabel`, l'application seule sachant qu'un type `'agent'` s'appelle « Agents ». | `'Symboles'` |
| `search.groups.place` | Nom des rubriques que la LIB produit elle-même. Celles issues d'une couche de markers sont nommées par son `typeLabel`, l'application seule sachant qu'un type `'agent'` s'appelle « Agents ». | `'Lieux'` |

## `toolbar` — Barre de dessin

| Clé | Description | Défaut |
|---|---|---|
| `toolbar.navigate` | Boutons de `<Toolbar>` hors outils (navigation, historique, effacement). | `'Naviguer'` |
| `buildingPick.label` | Ligne « bâtiment » du sélecteur — hors de `selectModes`, qui est indexé par `SelectMode` : désigner un bâtiment n'est pas un mode de sélection de dessin. | `'Bâtiment'` |
| `buildingPick.description` | Son infobulle. | `'Sélectionner un bâtiment (volume 3D interne)'` |
| `measureTools.measure.label` | Rangées du sous-menu « Mesures » : `label` = rangée du flyout, `description` = infobulle (avec le raccourci) — même convention que `selectModes`. | `'Mesurer'` |
| `measureTools.measure.description` | Son infobulle. | `'Mesurer une distance'` |
| `measureTools.graticule.label` | Rangée « grille de coordonnées » du même sous-menu — un CALQUE, pas un outil de tracé. | `'Grille'` |
| `measureTools.graticule.description` | Son infobulle. | `'Grille de coordonnées géographiques'` |
| `graticule.remarkable.equator` | Noms des lignes remarquables, indexés par `config.graticule.remarkable[].labelKey`. Une clé absente fait afficher la coordonnée à la place du nom. | `'Équateur'` |
| `graticule.remarkable.tropicCancer` | — | `'Tropique du Cancer'` |
| `graticule.remarkable.tropicCapricorn` | — | `'Tropique du Capricorne'` |
| `graticule.remarkable.arcticCircle` | — | `'Cercle arctique'` |
| `graticule.remarkable.antarcticCircle` | — | `'Cercle antarctique'` |
| `graticule.remarkable.primeMeridian` | — | `'Méridien d'origine'` |
| `graticule.remarkable.antimeridian` | — | `'180ᵉ méridien'` |
| `graticule.format.deg` | Gabarit d'étiquette au degré — variables `{d}`, `{hemi}`. | `'{d}°{hemi}'` |
| `graticule.format.dm` | Gabarit à la minute — `{d}`, `{m}`, `{hemi}`. | `"{d}°{m}'{hemi}"` |
| `graticule.format.dms` | Gabarit à la seconde — `{d}`, `{m}`, `{s}`, `{hemi}`. | `'{d}°{m}\'{s}"{hemi}'` |
| `graticule.hemisphere.north` | Points cardinaux — traduisibles (`W` → `O` si l'hôte le souhaite). | `'N'` |
| `graticule.hemisphere.south` | — | `'S'` |
| `graticule.hemisphere.east` | — | `'E'` |
| `graticule.hemisphere.west` | — | `'W'` |
| `toolbar.undo` | Boutons de `<Toolbar>` hors outils (navigation, historique, effacement). | `'Annuler'` |
| `toolbar.redo` | Boutons de `<Toolbar>` hors outils (navigation, historique, effacement). | `'Rétablir'` |
| `toolbar.clearAll` | Boutons de `<Toolbar>` hors outils (navigation, historique, effacement). | `'Tout effacer'` |

## `tools` — Noms des outils

| Clé | Description | Défaut |
|---|---|---|
| `tools.select` | Libellé de chaque outil de dessin (toolbar, panneau Réglages, récap raccourcis). | `'Sélectionner'` |
| `tools.line` | Libellé de chaque outil de dessin (toolbar, panneau Réglages, récap raccourcis). | `'Ligne'` |
| `tools.polygon` | Libellé de chaque outil de dessin (toolbar, panneau Réglages, récap raccourcis). | `'Polygone'` |
| `tools.rect` | Libellé de chaque outil de dessin (toolbar, panneau Réglages, récap raccourcis). | `'Rectangle'` |
| `tools.circle` | Libellé de chaque outil de dessin (toolbar, panneau Réglages, récap raccourcis). | `'Cercle'` |
| `tools.freehand` | Libellé de chaque outil de dessin (toolbar, panneau Réglages, récap raccourcis). | `'Main levée'` |
| `tools.arrow` | Libellé de chaque outil de dessin (toolbar, panneau Réglages, récap raccourcis). | `'Flèche'` |
| `tools.measure` | Libellé de chaque outil de dessin (toolbar, panneau Réglages, récap raccourcis). | `'Mesurer'` |
| `tools.erase` | Libellé de chaque outil de dessin (toolbar, panneau Réglages, récap raccourcis). | `'Effacer'` |
| `tools.symbol` | Libellé de chaque outil de dessin (toolbar, panneau Réglages, récap raccourcis). | `'Symboles'` |

## `selectModes` — Modes de sélection

| Clé | Description | Défaut |
|---|---|---|
| `selectModes.rect.label` | Modes du flyout de sélection (marquee rectangle / polygone / lasso) : `label` = rangée du flyout, `description` = tooltip (avec le raccourci) — distincte du label pour ne pas répéter le texte déjà visible. | `'Rectangle'` |
| `selectModes.rect.description` | Modes du flyout de sélection (marquee rectangle / polygone / lasso) : `label` = rangée du flyout, `description` = tooltip (avec le raccourci) — distincte du label pour ne pas répéter le texte déjà visible. | `'Sélection par rectangle'` |
| `selectModes.poly.label` | Modes du flyout de sélection (marquee rectangle / polygone / lasso) : `label` = rangée du flyout, `description` = tooltip (avec le raccourci) — distincte du label pour ne pas répéter le texte déjà visible. | `'Polygone'` |
| `selectModes.poly.description` | Modes du flyout de sélection (marquee rectangle / polygone / lasso) : `label` = rangée du flyout, `description` = tooltip (avec le raccourci) — distincte du label pour ne pas répéter le texte déjà visible. | `'Sélection par polygone'` |
| `selectModes.lasso.label` | Modes du flyout de sélection (marquee rectangle / polygone / lasso) : `label` = rangée du flyout, `description` = tooltip (avec le raccourci) — distincte du label pour ne pas répéter le texte déjà visible. | `'Lasso'` |
| `selectModes.lasso.description` | Modes du flyout de sélection (marquee rectangle / polygone / lasso) : `label` = rangée du flyout, `description` = tooltip (avec le raccourci) — distincte du label pour ne pas répéter le texte déjà visible. | `'Sélection au lasso'` |

## `style` — Panneau de style

| Clé | Description | Défaut |
|---|---|---|
| `style.fill` | Panneau de style (swatches, palette, presets) — libellés et aria. | `'Couleur de fond'` |
| `style.stroke` | Panneau de style (swatches, palette, presets) — libellés et aria. | `'Couleur de bordure'` |
| `style.swap` | Panneau de style (swatches, palette, presets) — libellés et aria. | `'Échanger fond et bordure'` |
| `style.color` | Pastille de la palette — `{color}` = la couleur CSS. | `'Couleur {color}'` |
| `style.customColor` | Panneau de style (swatches, palette, presets) — libellés et aria. | `'Couleur personnalisée'` |
| `style.border` | Panneau de style (swatches, palette, presets) — libellés et aria. | `'Bordure'` |
| `style.noBorder` | Panneau de style (swatches, palette, presets) — libellés et aria. | `'Pas de bordure'` |
| `style.borderWidth` | Preset d'épaisseur — `{width}` = px. | `'Bordure {width} px'` |
| `style.strokeStyle` | Panneau de style (swatches, palette, presets) — libellés et aria. | `'Trait'` |
| `style.solid` | Panneau de style (swatches, palette, presets) — libellés et aria. | `'Trait plein'` |
| `style.dashed` | Panneau de style (swatches, palette, presets) — libellés et aria. | `'Tirets'` |
| `style.dotted` | Panneau de style (swatches, palette, presets) — libellés et aria. | `'Pointillés'` |
| `style.strokeOpacity` | Panneau de style (swatches, palette, presets) — libellés et aria. | `'Op. trait'` |
| `style.fillOpacity` | Panneau de style (swatches, palette, presets) — libellés et aria. | `'Fond'` |
| `style.opacityPreset` | Preset d'opacité — `{percent}` = 0–100. | `'Fond {percent} %'` |
| `style.corners` | Panneau de style (swatches, palette, presets) — libellés et aria. | `'Angles'` |
| `style.cornerRadius` | Preset de rayon d'angle — `{radius}` = % du petit côté. | `'Angles arrondis {radius} %'` |
| `style.selectionCount` | Titre du panneau quand 1 forme est sélectionnée — `{count}`. | `'{count} forme'` |
| `style.selectionCountPlural` | Titre du panneau quand plusieurs formes sont sélectionnées — `{count}`. | `'{count} formes'` |
| `style.expand` | Bouton qui déplie le panneau réduit. | `'Modifier le style'` |
| `style.collapse` | Bouton qui réduit le panneau à son seul bouton. | `'Réduire'` |

## `selection` — Panneau de sélection

| Clé | Description | Défaut |
|---|---|---|
| `selection.title` | Titre du panneau. | `'Sélection'` |
| `selection.shapesGroup` | Nom de la catégorie formes dans une rangée. | `'Formes'` |
| `selection.group` | Gabarit du libellé d'une rangée — `{group}`, `{type}` (compteur séparé). | `'{group} · {type}'` |
| `selection.deselectGroup` | aria-label de la croix d'une rangée — `{label}` = libellé de la rangée. | `'Désélectionner {label}'` |
| `selection.clearAll` | Panneau de sélection (liste des éléments sélectionnés, par groupe). | `'Tout désélectionner'` |
| `selection.movePanel` | aria-label de la poignée de déplacement du panneau. | `'Déplacer le panneau'` |

## `clusters` — Regroupement de markers

| Clé | Description | Défaut |
|---|---|---|
| `clusters.label` | aria-label d'une pastille — `{count}` = nombre de markers agrégés. C'est le seul texte qu'un lecteur d'écran a de la pastille : le camembert est une image, et la répartition par type vit dans l'infobulle. | `'Groupe de {count} marqueurs'` |
| `clusters.labelSingular` | Idem au singulier — `{count}` = 1. | `'Groupe de {count} marqueur'` |

## `markerList` — Listes de markers

| Clé | Description | Défaut |
|---|---|---|
| `markerList.target` | Action « cibler » (menu + clic sur la ligne). | `'Cibler'` |
| `markerList.actions` | aria-label du bouton de menu d'actions d'une ligne — `{label}`. | `'Actions pour {label}'` |
| `markerList.remove` | aria-label de la croix d'une ligne — `{label}`. | `'Retirer {label}'` |

## `lens` — Outil loupe

| Clé | Description | Défaut |
|---|---|---|
| `lens.tool` | Libellé/aria de l'outil loupe dans la toolbar. | `'Loupe'` |
| `lens.title` | Titre du panneau — `{count}` = nombre de markers. | `'{count} marqueurs'` |
| `lens.titleSingular` | Titre au singulier — `{count}` = 1. | `'{count} marqueur'` |
| `lens.empty` | Panneau vide (zone sans marker). | `'Aucun marqueur dans la zone'` |
| `lens.remove` | aria-label du bouton qui retire la zone loupe. | `'Retirer la loupe'` |
| `lens.movePanel` | aria-label de la poignée de déplacement du panneau. | `'Déplacer le panneau'` |
| `lens.snapBack` | aria-label/tooltip du bouton qui ré-aimante le panneau à la zone (après déplacement). | `'Rattacher le panneau à la zone'` |

## `settings` — Panneau Réglages

| Clé | Description | Défaut |
|---|---|---|
| `settings.title` | Panneau « Réglages des outils ». | `'Réglages des outils'` |
| `settings.resetAll` | Panneau « Réglages des outils ». | `'Tout réinitialiser'` |
| `settings.resetTool` | Panneau « Réglages des outils ». | `'Réinitialiser cet outil'` |
| `settings.shortcutsTitle` | Panneau « Réglages des outils ». | `'Raccourcis clavier'` |

## `actions` — Aide-mémoire des gestes

| Clé | Description | Défaut |
|---|---|---|
| `actions.panMap` | Actions d'édition du dessin (récapitulatif des raccourcis). | `'Déplacer la carte'` |
| `actions.rotateCamera` | Actions d'édition du dessin (récapitulatif des raccourcis). | `'Tourner la caméra'` |
| `actions.rotateShape` | Actions d'édition du dessin (récapitulatif des raccourcis). | `'Tourner la forme'` |
| `actions.undoRedo` | Actions d'édition du dessin (récapitulatif des raccourcis). | `'Annuler / Rétablir'` |
| `actions.selectAll` | Actions d'édition du dessin (récapitulatif des raccourcis). | `'Tout sélectionner'` |
| `actions.duplicate` | Actions d'édition du dessin (récapitulatif des raccourcis). | `'Dupliquer'` |
| `actions.delete` | Actions d'édition du dessin (récapitulatif des raccourcis). | `'Supprimer'` |
| `actions.moveSelection` | Actions d'édition du dessin (récapitulatif des raccourcis). | `'Déplacer la sélection'` |
| `actions.closePolygon` | Actions d'édition du dessin (récapitulatif des raccourcis). | `'Fermer le polygone'` |
| `actions.cancel` | Actions d'édition du dessin (récapitulatif des raccourcis). | `'Annuler / quitter'` |
| `actions.addToSelection` | Maj+clic / Maj+marquee : ajouter à la sélection. | `'Ajouter à la sélection'` |
| `actions.markersOnly` | Alt/⌘+marquee : ne sélectionner que les markers. | `'Marqueurs seuls (tracé)'` |

## `glyphs` — Glyphes d'interface

| Clé | Description | Défaut |
|---|---|---|
| `glyphs.submenu` | Marque de branche d'un sous-menu. | `'›'` |
| `glyphs.check` | Coche de l'option active d'un menu. | `'✓'` |
| `glyphs.none` | Preset « sans bordure ». | `'∅'` |
| `glyphs.separator` | Séparateur inline des infobulles de cluster. | `'·'` |

## `modKey` — Préfixe du modificateur par plateforme

| Clé | Description | Défaut |
|---|---|---|
| `modKey.mac` | Préfixe de modificateur affiché dans les raccourcis, par plateforme. | `'⌘'` |
| `modKey.other` | Préfixe de modificateur affiché dans les raccourcis, par plateforme. | `'Ctrl+'` |

## `keys` — Noms des touches affichés

| Clé | Description | Défaut |
|---|---|---|
| `keys.escape` | Noms de touches affichés (tooltips, récap raccourcis). | `'Échap'` |
| `keys.space` | Noms de touches affichés (tooltips, récap raccourcis). | `'Espace'` |
| `keys.spaceShift` | Noms de touches affichés (tooltips, récap raccourcis). | `'Espace+Maj'` |
| `keys.shiftDrag` | Noms de touches affichés (tooltips, récap raccourcis). | `'Maj + glisser'` |
| `keys.enter` | Noms de touches affichés (tooltips, récap raccourcis). | `'Entrée'` |
| `keys.arrows` | Noms de touches affichés (tooltips, récap raccourcis). | `'Flèches'` |
| `keys.backspace` | Noms de touches affichés (tooltips, récap raccourcis). | `'⌫'` |
| `keys.shiftClick` | Noms de touches affichés (tooltips, récap raccourcis). | `'Maj + clic'` |
| `keys.altOrCmd` | Noms de touches affichés (tooltips, récap raccourcis). | `'Alt / ⌘'` |
| `keys.shift` | Glyphe Maj seul, pour composer un raccourci affiché (⇧Z). | `'⇧'` |

## `format` — Gabarits de composition

| Clé | Description | Défaut |
|---|---|---|
| `format.shortcut` | Libellé + raccourci d'un tooltip/aria — `{label}`, `{key}`. | `'{label} ({key})'` |

## `measure` — 🌍 Distances — système d'unités

| Clé | Description | Défaut |
|---|---|---|
| `measure.major` | Gabarit de la GRANDE unité (km, miles) — `{value}`. | `'{value} km'` |
| `measure.minor` | Gabarit de la PETITE unité (m, pieds) — `{value}`. | `'{value} m'` |
| `measure.majorThreshold` | Seuil de bascule vers la grande unité, **en mètres**. | `1000` |
| `measure.majorFactor` | Diviseur mètre → grande unité : `1000` en métrique, `1609.344` en impérial. | `1000` |
| `measure.minorFactor` | Diviseur mètre → petite unité : `1` en métrique, `0.3048` en impérial. | `1` |
| `measure.majorDecimals` | Décimales de la grande unité. | `2` |
| `measure.minorDecimals` | Décimales de la petite unité — elle était arrondie à l'entier sans recours. | `0` |
| `measure.numberLocale` | Locale de formatage des nombres (`Intl.NumberFormat`). `'auto'` suit le navigateur. ⚠️ Sans elle, le formatage passait par `toFixed`, donc le séparateur décimal était TOUJOURS le point : la lib affichait « 2.40 km » là où ses propres libellés français promettent « 2,4 km ». `toFixed` ne supprime… | `'auto'` |

## `duration` — Durées

| Clé | Description | Défaut |
|---|---|---|
| `duration.minorThreshold` | Sous ce nombre de secondes, la durée s'affiche en secondes. | `60` |
| `duration.majorThreshold` | Sous ce nombre de minutes, elle s'affiche en minutes ; au-delà en heures. | `60` |
| `duration.seconds` | Durée de trajet — `{value}`, ou `{h}`/`{m}` au-delà de l'heure. | `'{value} s'` |
| `duration.minutes` | Durée de trajet — `{value}`, ou `{h}`/`{m}` au-delà de l'heure. | `'{value} min'` |
| `duration.hours` | Heures pleines (minutes nulles) — `{h}`. | `'{h} h'` |
| `duration.hoursMinutes` | Heures et minutes — `{h}`, `{m}`. | `'{h} h {m}'` |

## `readout` — 🌍 Bloc de lecture de la vue

L'altitude n'a PAS son propre système d'unités : elle passe par `measure`, comme toute
distance de la lib.

| Clé | Description | Défaut |
|---|---|---|
| `readout.title` | Nom accessible de la région (lecteurs d'écran) — le bloc n'a pas de titre visible. | `'Position de la caméra'` |
| `readout.altitude` | Libellé de la ligne d'altitude. | `'alt'` |
| `readout.latitude` | Libellé de la latitude. | `'lat'` |
| `readout.longitude` | Libellé de la longitude. | `'lng'` |
| `readout.heading` | Libellé du cap — la direction que REGARDE la caméra. | `'cap'` |
| `readout.tilt` | Libellé de l'inclinaison — `0°` au nadir (à la verticale), `90°` à l'horizon. | `'incl'` |
| `readout.zoom` | Libellé du zoom. | `'zoom'` |
| `readout.degreeFormat` | Gabarit des ANGLES (cap et inclinaison) — `{value}`. Les seuls champs à porter une unité : le degré s'écrit collé au nombre, ce qu'aucun `Intl.NumberFormat` ne produit. | `'{value}°'` |
| `readout.degreeDecimals` | Décimales des angles. `0` suffit à la navigation ; le relever pour un relevé fin. Commun aux deux à dessein : ils s'affichent côte à côte, et deux précisions différentes suggéreraient que l'un est mieux connu que l'autre. | `0` |
| `readout.coordDecimals` | Décimales des coordonnées. **Fixes** (minimum = maximum) : une décimale qui apparaît et disparaît change la largeur du nombre, et le bloc tressaute à chaque frame de déplacement. 5 ≈ 1 m au sol. | `5` |
| `readout.zoomDecimals` | Décimales du zoom — mêmes règles de largeur fixe. | `1` |
| `readout.numberLocale` | Locale de formatage des coordonnées et du zoom (`'auto'` suit le navigateur). Distincte de `measure.numberLocale` à dessein : une coordonnée WGS84 se recopie ailleurs, où le point décimal est la convention — d'où le point même sous une interface française, alors que l'altitude affiche bien « 1,2 km ». | `'en-US'` |

## `relations` — Moteur de relations

| Clé | Description | Défaut |
|---|---|---|
| `relations.menuRoot` | Titre de la section ajoutée au menu contextuel d'un marker. | `'Distance autour'` |
| `relations.pending` | Étiquette d'un lien tant que le temps réel n'est pas revenu. | `'…'` |
| `relations.unavailable` | Étiquette d'un lien dont le temps réel n'a pas pu être obtenu. | `'Temps indisponible'` |
| `relations.linkLabel` | Étiquette nominale d'un lien — `{distance}`, `{duration}` déjà formatés. | `'{distance} · {duration}'` |
| `relations.fastestGroup` | Titre du bloc de presets par rapidité. | `'Les plus rapides'` |
| `relations.fastest` | Preset par rapidité — `{count}`. | `'Les {count} plus rapides'` |
| `relations.radiusGroup` | Titre du bloc de presets par rayon. | `'Dans un rayon'` |
| `relations.radius` | Preset par rayon — `{radius}` déjà formaté. | `'Dans {radius}'` |
| `relations.targetCount` | Indice d'un preset : nombre de cibles retenues — `{count}`. | `'{count}'` |
| `relations.tooWide` | Indice d'un preset dont la sélection dépasse le plafond de calcul — `{count}`. | `'{count} !'` |
| `relations.noTargets` | Indice d'un preset sans aucune cible. | `'aucun'` |
| `relations.clusterAggregate` | Étiquette agrégée d'un cluster trop fourni pour l'éventail — `{count}`. | `'{count} éléments'` |
| `relations.statusRelation` | Barre d'état : relation active — `{source}`, `{targets}`. | `'{source} → {targets}'` |
| `relations.clear` | Barre d'état : effacer la relation (libellé du bouton, visible et aria-label). | `'Supprimer'` |
| `relations.removeRoute` | aria-label de la croix d'une étiquette d'itinéraire (referme le tracé). | `'Fermer l’itinéraire'` |
| `relations.modes.DRIVE` | Noms des modes de transport (segment cliquable de la barre d'état). | `'En voiture'` |
| `relations.modes.WALK` | Noms des modes de transport (segment cliquable de la barre d'état). | `'À pied'` |
| `relations.modes.BICYCLE` | Noms des modes de transport (segment cliquable de la barre d'état). | `'À vélo'` |
| `relations.modes.TWO_WHEELER` | Noms des modes de transport (segment cliquable de la barre d'état). | `'En deux-roues'` |
| `relations.modes.TRANSIT` | Noms des modes de transport (segment cliquable de la barre d'état). | `'En transports'` |

## `pinned` — Dock des favoris

| Clé | Description | Défaut |
|---|---|---|
| `pinned.add` | Invite de la languette d'ajout. | `'Ajouter un marqueur'` |
| `pinned.remove` | Tooltip affiché en glissant une pastille hors de la dock. | `'Supprimer'` |
| `pinned.collapse` | aria-label du bouton qui replie la dock. | `'Réduire'` |
| `pinned.expand` | aria-label du bouton/pastille qui redéploie la dock. | `'Développer'` |
| `pinned.title` | Nom de la dock, affiché SUR la poignée quand elle est repliée : c'est alors le seul élément visible, et un chevron seul ne dit pas ce qu'il rouvre. | `'Favoris'` |

## `plural` — 🌍 Choix de la forme grammaticale

| Clé | Description | Défaut |
|---|---|---|
| `plural` | Fonction `(count: number) => 'one' \| 'other'`. ⚠️ Le défaut est la règle **française** (`n > 1`) : elle est **fausse pour l'anglais**, où `0` est pluriel, et insuffisante pour le polonais ou le russe (trois formes). Renvoyer l'une des deux formes que la lib sait rendre, ou brancher `Intl.PluralRules`. | `(n) => (n > 1 ? 'other' : 'one')` |

## `errors` — Messages d'erreur (développeur)

| Clé | Description | Défaut |
|---|---|---|
| `errors.outsideMap` | Hook de la lib appelé hors d'un `<Map>` — le contexte est alors absent. | `'Ce composant doit être utilisé à l’intérieur de <Map>'` |
| `errors.drawingRequired` | `useDrawing()` appelé alors que la couche de dessin est retirée. | `'useDrawing nécessite le dessin : il est retiré par <Map draw={false}>'` |
| `errors.lensRequired` | `useLens()` appelé alors que la loupe est retirée. | `'useLens nécessite la loupe : elle est retirée par <Map toolbar={{ lens: false }}>'` |

---

## `catalog` — Catalogue d'entités distantes

Bouton de barre, menu des types, liste et réglages — cf. le guide [CATALOG.md](CATALOG.md). Les **noms des types** ne sont pas ici : ils viennent de `CatalogSource.label`, fourni par l'hôte, qui seul sait comment il les appelle.

| Clé | Description | Défaut |
|---|---|---|
| `catalog.button` | Bouton de barre. | `'Catalogue'` |
| `catalog.types` | En-tête du menu listant les types. | `'Types'` |
| `catalog.searchPlaceholder` | Champ de recherche. | `'Taper votre recherche…'` |
| `catalog.countSingular` | Compteur au singulier — cf. `formatCount`. | `'1 élément'` |
| `catalog.count` | Compteur au pluriel. | `'{count} éléments'` |
| `catalog.empty` | La source ne contient aucun élément. | `'Aucun élément'` |
| `catalog.noMatch` | La recherche ne ramène rien. | `'Aucun résultat'` |
| `catalog.loading` | Chargement d'une page. | `'Chargement…'` |
| `catalog.error` | Échec du listage. | `'Chargement impossible'` |
| `catalog.retry` | Bouton du bandeau d'erreur. | `'Réessayer'` |
| `catalog.itemError` | Échec du chargement d'une géométrie, en infobulle sur la ligne. | `'Impossible d’afficher cet élément'` |
| `catalog.add` | Case à cocher, état « pas encore sur la carte » — `{label}`. | `'Afficher {label} sur la carte'` |
| `catalog.remove` | Case à cocher, état « affiché » — `{label}`. | `'Retirer {label} de la carte'` |
| `catalog.back` | Retour au menu des types. | `'Retour aux types'` |
| `catalog.expand` / `catalog.collapse` | Chevron d'un agrégat. | `'Déplier'` / `'Replier'` |
| `catalog.settings.title` | Entrée du panneau engrenage. | `'Catalogue'` |
| `catalog.settings.persist` | Interrupteur de persistance. | `'Conserver les éléments affichés entre les sessions'` |
| `catalog.settings.fitOnAdd` | Interrupteur de cadrage. | `'Cadrer à l’ajout'` |
| `catalog.settings.clear` | Bouton de purge. | `'Tout retirer'` |

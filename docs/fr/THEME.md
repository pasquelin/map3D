# `MapTheme` — référence

**Français** · [English](../en/THEME.md) · [↑ Index](README.md)

Tout ce qui se VOIT : couleurs, tailles, rythme. Le pendant de `MapConfig`, qui
règle les comportements.

```tsx
<MapProvider theme={{ colors: { ui: { accent: '#0af' } } }}>
```

Override partiel et profond, comme la config. Un couple `{ light, dark }` permet
de suivre le mode de l'application hôte.

Généré depuis `src/theme/defaultTheme.ts` et `src/theme/types.ts`.

💰 = impact facturation Google · 🌍 = impact locale/i18n

## `colorScheme` — Mode par défaut

| Clé | Description | Défaut |
|---|---|---|
| `colorScheme` | Mode par défaut du thème (un couple `{light, dark}` le rend automatique). | `'dark'` |

## `colors` — Palette

| Clé | Description | Défaut |
|---|---|---|
| `colors.background` | Fond du canvas, visible avant le chargement des tuiles. | `'#0d1415'` |
| `colors.marker.default.base` | Couleur par type de marker (ex. 'alert-critical', 'agent-available'). | `'#2E7CF6'` |
| `colors.marker.default.accent` | Couleur par type de marker (ex. 'alert-critical', 'agent-available'). | `'#78BEFF'` |
| `colors.marker.default.contrast` | Couleur par type de marker (ex. 'alert-critical', 'agent-available'). | `'#ffffff'` |
| `colors.cluster.core` | Cœur du donut. | `'#1e293b'` |
| `colors.cluster.satellite` | Réservée aux satellites (modèle historique). | `'#6344F0'` |
| `colors.cluster.text` | Total affiché au centre. | `'#ffffff'` |
| `colors.cluster.ring` | Anneau de séparation cœur/parts. | `'#ffffff'` |
| `colors.draw.palette` | Palette proposée par le sélecteur de couleur du dessin. | `["#F0503A", "#EE8F0A", "#079A7D", "#2E7CF6", "#6344F0", "#101828"]` |
| `colors.draw.default` | Couleur d'une forme nouvellement tracée. | `'#2E7CF6'` |
| `colors.ui.panel` | Fond des panneaux et barres (translucide). | `'rgba(20,26,30,0.92)'` |
| `colors.ui.text` | Texte principal. | `'#f8fafc'` |
| `colors.ui.muted` | Texte secondaire, libellés discrets. | `'#94a3b8'` |
| `colors.ui.accent` | Couleur d'accent : état actif, focus, sélection. | `'#2E7CF6'` |
| `colors.ui.error` | Erreurs et actions destructrices. | `'#d11a01'` |
| `colors.ui.border` | Bordures et séparateurs. | `'rgba(255,255,255,0.10)'` |
| `colors.attention.sonar` | Décorations d'attention des markers (`new`/`urgent`) — signaux opérationnels, couleurs volontairement très voyantes. Optionnel : thème antérieur valide. | `'#ffd60a'` |
| `colors.attention.target` | Décorations d'attention des markers (`new`/`urgent`) — signaux opérationnels, couleurs volontairement très voyantes. Optionnel : thème antérieur valide. | `'#ff3b30'` |
| `colors.path.base` | Couleur d'un tracé. | `'#2E7CF6'` |
| `colors.path.casing` | Contour du tracé (lisibilité sur imagerie satellite). | `'#ffffff'` |
| `colors.zone.fill` | Remplissage d'une zone. | `'#079A7D'` |
| `colors.zone.stroke` | Contour d'une zone. | `'#079A7D'` |
| `colors.marquee.fill` | Marching-ants **partagé** par les trois surfaces de sélection : contour des formes sélectionnées, tracé du sélecteur (rect/poly/lasso) et zone de la loupe. `fill` = voile de fond (sélecteur et loupe seuls — un contour de forme reste creux), `stroke` = pointillé animé, `under` = trait continu… | `'rgba(255,255,255,0.12)'` |
| `colors.marquee.stroke` | Marching-ants **partagé** par les trois surfaces de sélection : contour des formes sélectionnées, tracé du sélecteur (rect/poly/lasso) et zone de la loupe. `fill` = voile de fond (sélecteur et loupe seuls — un contour de forme reste creux), `stroke` = pointillé animé, `under` = trait continu… | `'#000000'` |
| `colors.marquee.under` | Marching-ants **partagé** par les trois surfaces de sélection : contour des formes sélectionnées, tracé du sélecteur (rect/poly/lasso) et zone de la loupe. `fill` = voile de fond (sélecteur et loupe seuls — un contour de forme reste creux), `stroke` = pointillé animé, `under` = trait continu… | `'#ffffff'` |

## `shadows` — Ombres

| Clé | Description | Défaut |
|---|---|---|
| `shadows.sm` | Éléments posés (swatches, pastilles). | `'0 1px 2px rgba(0,0,0,0.3)'` |
| `shadows.md` | Boutons et petites surfaces. | `'0 3px 8px rgba(0,0,0,0.35),0 1px 2px rgba(0,0,0,0.3)'` |
| `shadows.lg` | Panneaux flottants et menus. | `'0 10px 26px rgba(0,0,0,0.45),0 3px 8px rgba(0,0,0,0.3)'` |

## `radii` — Rayons d'angle (px)

| Clé | Description | Défaut |
|---|---|---|
| `radii.sm` | Petits éléments : boutons de barre, poignées. | `6` |
| `radii.md` | Panneaux et menus. | `10` |
| `radii.lg` | Grandes surfaces. | `14` |
| `radii.pill` | Forme pilule (valeur volontairement énorme). | `999` |

## `typography` — Typographie

| Clé | Description | Défaut |
|---|---|---|
| `typography.fontFamily` | Pile de polices de toute l'UI de la carte. | `'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'` |
| `typography.sizes.xs` | Échelle typographique (px). Publiée en `--m3d-size-*`. ⚠️ Ne couvre pas encore toute la feuille de styles : 26 tailles accidentelles (9.5 à 22 px) y restent littérales, faute de palier correspondant. | `10.5` |
| `typography.sizes.sm` | Échelle typographique (px). Publiée en `--m3d-size-*`. ⚠️ Ne couvre pas encore toute la feuille de styles : 26 tailles accidentelles (9.5 à 22 px) y restent littérales, faute de palier correspondant. | `12.5` |
| `typography.sizes.md` | Échelle typographique (px). Publiée en `--m3d-size-*`. ⚠️ Ne couvre pas encore toute la feuille de styles : 26 tailles accidentelles (9.5 à 22 px) y restent littérales, faute de palier correspondant. | `13.5` |
| `typography.sizes.lg` | Échelle typographique (px). Publiée en `--m3d-size-*`. ⚠️ Ne couvre pas encore toute la feuille de styles : 26 tailles accidentelles (9.5 à 22 px) y restent littérales, faute de palier correspondant. | `16` |
| `typography.weights.normal` | Graisses, publiées en `--m3d-weight-*`. | `400` |
| `typography.weights.medium` | Graisses, publiées en `--m3d-weight-*`. | `500` |
| `typography.weights.semibold` | Graisses, publiées en `--m3d-weight-*`. | `600` |
| `typography.weights.bold` | Graisses, publiées en `--m3d-weight-*`. | `700` |

## `markers` — Markers

| Clé | Description | Défaut |
|---|---|---|
| `markers.size` | Diamètre du sprite (px). | `44` |
| `markers.ringWidth` | Épaisseur de l'anneau (px). | `3` |
| `markers.gradient` | Dégradé du corps du marker. | `true` |
| `markers.gloss` | Reflet sur la pastille. | `true` |
| `markers.icon` | Contenu par défaut d'un marker : rien, l'icône du type, son rang, ou un nœud. | `'type'` |
| `markers.moveTween.duration` | Tween de position (déplacement animé des agents). | `500` |
| `markers.moveTween.easing` | Tween de position (déplacement animé des agents). | *(fonction)* |

## `clusters` — Géométrie du cluster par défaut (donut)

| Clé | Description | Défaut |
|---|---|---|
| `clusters.coreRadius` | Rayon du cœur (px) selon le nombre total de points. | *(fonction)* |
| `clusters.ringWidth` | Épaisseur de l'anneau segmenté (px). | `30` |
| `clusters.strokeWidth` | Contour clair des parts (px) — il déborde du rayon extérieur de sa moitié. | `2.5` |
| `clusters.segmentGap` | Écart angulaire entre deux parts (rad) ; `0` les rend jointives. | `0.045` |
| `clusters.startAngle` | Angle de la première part (rad). `Math.PI` = 9h, deux parts haut/bas. | `3.141592653589793` |

## `animations` — Rythme des animations et des vols caméra

| Clé | Description | Défaut |
|---|---|---|
| `animations.enabled` | Coupe TOUTES les animations JS (le CSS a sa propre règle `prefers-reduced-motion`). | `true` |
| `animations.pulse.duration` | Pulsation d'un marker à signaler. `false` la coupe. | `2000` |
| `animations.pulse.easing` | Pulsation d'un marker à signaler. `false` la coupe. | `'ease-out'` |
| `animations.pulse.scale` | Pulsation d'un marker à signaler. `false` la coupe. | `1.16` |
| `animations.halo.duration` | Halo qui s'écarte d'un marker (`maxScale` = agrandissement final). | `2600` |
| `animations.halo.easing` | Halo qui s'écarte d'un marker (`maxScale` = agrandissement final). | `'cubic-bezier(.2,.6,.35,1)'` |
| `animations.halo.maxScale` | Halo qui s'écarte d'un marker (`maxScale` = agrandissement final). | `2.1` |
| `animations.bob.duration` | Léger flottement vertical (`amplitude` en px). | `2400` |
| `animations.bob.amplitude` | Léger flottement vertical (`amplitude` en px). | `4` |
| `animations.markerEnter.duration` | Entrée d'un marker (`stagger` = décalage entre deux apparitions, ms). | `460` |
| `animations.markerEnter.easing` | Entrée d'un marker (`stagger` = décalage entre deux apparitions, ms). | `'cubic-bezier(.32,1.5,.5,1)'` |
| `animations.markerEnter.stagger` | Entrée d'un marker (`stagger` = décalage entre deux apparitions, ms). | `30` |
| `animations.clusterEnter.duration` | Entrée d'un cluster. | `460` |
| `animations.clusterEnter.easing` | Entrée d'un cluster. | `'cubic-bezier(.32,1.5,.5,1)'` |
| `animations.clusterEnter.stagger` | Entrée d'un cluster. | `55` |
| `animations.menuOpen.duration` | Ouverture des menus, flyouts et panneaux. Publiée en `--m3d-menu-dur`. | `200` |
| `animations.menuOpen.easing` | Ouverture des menus, flyouts et panneaux. Publiée en `--m3d-menu-dur`. | `'cubic-bezier(.32,1.3,.5,1)'` |
| `animations.flyDuration` | Durée d'un vol caméra ordinaire (s) — `flyTo`, `fitBounds`. | `1` |
| `animations.flyEasing` | Courbe d'accélération des vols caméra. | *(fonction)* |
| `animations.pan` | Déplacement latéral. | `0.5` |
| `animations.zoom` | Changement de zoom par bouton. | `0.4` |
| `animations.moveTo` | Recentrage « immédiat » (`useCamera().moveTo`). | `0.4` |
| `animations.target` | Vol de ciblage depuis un listing ou un favori épinglé. | `0.8` |
| `animations.clusterOpen` | Ouverture d'un cluster (zoom sur son emprise). | `0.6` |
| `animations.topDown` | Bascule en vue du dessus. | `0.5` |
| `animations.globe` | Recul en vue globe. | `1` |

## `spacing` — Espacements des surfaces flottantes (px)

| Clé | Description | Défaut |
|---|---|---|
| `spacing.gap` | Écart entre une surface ancrée et son ancre. | `12` |
| `spacing.edge` | Marge minimale entre une surface et le bord du conteneur. | `8` |
| `spacing.barInset` | Retrait des barres verticales par rapport au bord. | `16` |

## `sizing` — Dimensions des surfaces et des icônes

| Clé | Description | Défaut |
|---|---|---|
| `sizing.lensPanelW` | Largeur du panneau d'inventaire de la loupe (px). | `252` |
| `sizing.selectionPanelW` | Largeur du panneau de sélection (px). | `236` |
| `sizing.panelMaxHeight.tags` | Hauteurs maximales des panneaux quand la place le permet (px). Elles divergeaient sans raison exprimée (380 / 420 / 300 / 560 / 520). | `380` |
| `sizing.panelMaxHeight.symbols` | Hauteurs maximales des panneaux quand la place le permet (px). Elles divergeaient sans raison exprimée (380 / 420 / 300 / 560 / 520). | `420` |
| `sizing.panelMaxHeight.search` | Hauteurs maximales des panneaux quand la place le permet (px). Elles divergeaient sans raison exprimée (380 / 420 / 300 / 560 / 520). | `340` |
| `sizing.panelMaxHeight.settings` | Hauteurs maximales des panneaux quand la place le permet (px). Elles divergeaient sans raison exprimée (380 / 420 / 300 / 560 / 520). | `560` |
| `sizing.panelMaxHeight.settingsSub` | Hauteurs maximales des panneaux quand la place le permet (px). Elles divergeaient sans raison exprimée (380 / 420 / 300 / 560 / 520). | `520` |
| `sizing.iconSize` | Taille des icônes @mdi (unité `@mdi/react` : 1 ≈ 24 px). Une seule valeur là où sept coexistaient en dur (0.5 à 0.8) sans qu'aucune ne se distingue. | `0.8` |

## `tiles` — Traitement colorimétrique du fond de carte (mode sombre)

| Clé | Description | Défaut |
|---|---|---|
| `tiles.filter.brightness` | `1` = inchangé ; `< 1` assombrit. | `0.85` |
| `tiles.filter.saturation` | `1` = inchangé ; `< 1` désature. | `0.9` |
| `tiles.filter.contrast` | `1` = inchangé. | `1.05` |

## `globe` — Globe et atmosphère

| Clé | Description | Défaut |
|---|---|---|
| `globe.atmosphere` | Halo atmosphérique autour du globe. | `true` |
| `globe.background` | Fond derrière le globe (espace). | `'#070C16'` |
| `globe.oceanColor` | Océan des globes de repli — celui de secours et celui sous les tuiles 2D. | `'#0F2942'` |
| `globe.landColor` | Terres émergées du globe de repli. | `'#4F7A45'` |

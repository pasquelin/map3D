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
| `colors.tags` | Couleur de repérage par tag (panneau « Couches »), clé = nom du tag. Tag absent de cet objet → palette hashée de la lib. Optionnel. | `{}` |
| `colors.cluster.core` | Cœur du donut. | `'#1e293b'` |
| `colors.cluster.text` | Total affiché au centre. | `'#ffffff'` |
| `colors.cluster.ring` | Anneau de séparation cœur/parts. | `'#ffffff'` |
| `colors.draw.palette` | Palette proposée par le sélecteur de couleur du dessin. | `["#F0503A", "#EE8F0A", "#079A7D", "#2E7CF6", "#6344F0", "#101828"]` |
| `colors.draw.default` | Couleur d'une forme nouvellement tracée. | `'#2E7CF6'` |
| `colors.ui.panel` | Fond des panneaux et barres (translucide). | `'rgba(20,26,30,0.9)'` |
| `colors.ui.text` | Texte principal. | `'#f8fafc'` |
| `colors.ui.muted` | Texte secondaire, libellés discrets. | `'#94a3b8'` |
| `colors.ui.accent` | Couleur d'accent : état actif, focus, sélection. | `'#2E7CF6'` |
| `colors.ui.error` | Erreurs et actions destructrices. | `'#d11a01'` |
| `colors.ui.border` | Bordures et séparateurs. | `'rgba(255,255,255,0.10)'` |
| `colors.ui.stat` | **Optionnel.** Verdicts du panneau de diagnostic (`ok` / `warn` / `bad`), cf. [`performance.statThresholds`](CONFIG.md). Distinct d'`error` : une valeur excessive n'est pas une erreur, c'est un budget dépassé — les confondre ferait lire une carte lourde comme une carte cassée. Absent, le panneau retombe sur `colors.ui.text` : pas de couleur plutôt qu'un verdict que le thème n'a pas voulu donner. | `{ ok: '#4ade80', warn: '#facc15', bad: '#f87171' }` |
| `colors.attention.sonar` | Décorations d'attention des markers (`new`/`urgent`) — signaux opérationnels, couleurs volontairement très voyantes. Optionnel : thème antérieur valide. | `'#ffd60a'` |
| `colors.attention.target` | Décorations d'attention des markers (`new`/`urgent`) — signaux opérationnels, couleurs volontairement très voyantes. Optionnel : thème antérieur valide. | `'#ff3b30'` |
| `colors.pedestrian.placeValid` | Mode piéton : curseur de placement et réticule d'immersion totale. Cible affichée quand le point visé est une rue posable. Optionnel : thème antérieur valide. | `'#2E7CF6'` |
| `colors.pedestrian.placeBlocked` | Mode piéton : cible barrée quand le point visé est un toit ou le ciel. Optionnel. | `'#d11a01'` |
| `colors.pedestrian.reticle` | Mode piéton : réticule central de l'immersion totale. Optionnel. | `'#f8fafc'` |
| `colors.path.base` | Couleur d'un tracé. | `'#2E7CF6'` |
| `colors.path.casing` | Contour du tracé (lisibilité sur imagerie satellite). | `'#ffffff'` |
| `colors.zone.fill` | Remplissage d'une zone. | `'#079A7D'` |
| `colors.zone.stroke` | Contour d'une zone. | `'#079A7D'` |
| `colors.graticule.line` | Grille de coordonnées : parallèles et méridiens ordinaires. Optionnel — un thème antérieur reste valide (repli sur le thème par défaut). | `'#ffd54a'` |
| `colors.graticule.remarkable` | Équateur, tropiques, cercles polaires, méridiens remarquables. | `'#ff8f00'` |
| `colors.graticule.label` | Texte de l'étiquette de coordonnée. | `'#ffffff'` |
| `colors.graticule.labelBackground` | Fond de la pastille d'étiquette. | `'rgba(0,0,0,0.55)'` |
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
| `sizing.templatesPanelW` | Largeur du panneau de templates (px), calée sur sa rangée de cases la plus chargée (catégories + « Vue »). | `352` |
| `sizing.panelMaxHeight.tags` | Hauteurs maximales des panneaux quand la place le permet (px). Elles divergeaient sans raison exprimée (380 / 420 / 300 / 560 / 520). | `380` |
| `sizing.panelMaxHeight.symbols` | Hauteurs maximales des panneaux quand la place le permet (px). Elles divergeaient sans raison exprimée (380 / 420 / 300 / 560 / 520). | `420` |
| `sizing.panelMaxHeight.search` | Hauteurs maximales des panneaux quand la place le permet (px). Elles divergeaient sans raison exprimée (380 / 420 / 300 / 560 / 520). | `340` |
| `sizing.panelMaxHeight.settings` | Hauteurs maximales des panneaux quand la place le permet (px). Elles divergeaient sans raison exprimée (380 / 420 / 300 / 560 / 520). | `560` |
| `sizing.panelMaxHeight.settingsSub` | Hauteurs maximales des panneaux quand la place le permet (px). Elles divergeaient sans raison exprimée (380 / 420 / 300 / 560 / 520). | `520` |
| `sizing.panelMaxHeight.templates` | Hauteurs maximales des panneaux quand la place le permet (px). Elles divergeaient sans raison exprimée (380 / 420 / 300 / 560 / 520). | `460` |
| `sizing.panelMaxHeight.catalog` | Hauteur maximale du panneau de catalogue (px). | `380` |
| `sizing.catalogRowHeight` | Hauteur d'une ligne de catalogue (px). ⚠️ CONSTANTE par contrat : `visibleWindow` en déduit la fenêtre à rendre sans mesurer les lignes. Une ligne qui dépasserait décalerait tout le contenu sous elle. | `34` |
| `sizing.catalogIndent` | Décalage horizontal d'une ligne enfant dépliée (px). | `18` |
| `sizing.catalogChevronW` | Largeur du chevron de dépliage (px). ⚠️ Elle donne AUSSI sa largeur à la gouttière réservée sur les lignes sans enfants : les deux doivent coïncider, sinon les noms d'une même liste ne s'alignent plus selon que la ligne porte un chevron ou non. | `18` |
| `sizing.catalogPanelW` | Largeur du panneau de catalogue — le menu des types (px). Sert aussi de marge de cadrage, avec `catalogSubPanelW` : une zone cadrée pendant que le catalogue est ouvert ne doit pas atterrir dessous. | `252` |
| `sizing.catalogSubPanelW` | Largeur du second panneau, celui de la liste (px). Distincte de `catalogPanelW` bien qu'égale par défaut : les deux surfaces sont ACCOLÉES du même côté, donc c'est leur SOMME que le cadrage réserve. | `252` |
| `sizing.iconSize` | Taille des icônes @mdi (unité `@mdi/react` : 1 ≈ 24 px). Une seule valeur là où sept coexistaient en dur (0.5 à 0.8) sans qu'aucune ne se distingue. | `0.8` |

## `tiles` — Traitement colorimétrique du fond de carte (mode sombre)

| Clé | Description | Défaut |
|---|---|---|
| `tiles.filter.brightness` | `1` = inchangé ; `< 1` assombrit. | `0.85` |
| `tiles.filter.saturation` | `1` = inchangé ; `< 1` désature. | `0.9` |
| `tiles.filter.contrast` | `1` = inchangé. | `1.05` |
| `tiles.filter.invert` | `0` = inchangé ; `1` inverse — spectaculaire mais rarement lisible. Optionnel. | *(non défini)* |
| `tiles.filter.hueRotate` | Rotation de teinte, en degrés. Optionnel. | *(non défini)* |

## `globe` — Globe et atmosphère

| Clé | Description | Défaut |
|---|---|---|
| `globe.background` | Fond derrière le globe (espace). | `'#070C16'` |
| `globe.oceanColor` | Océan des globes de repli — celui de secours et celui sous les tuiles 2D. | `'#0F2942'` |
| `globe.hazeColor` | Couleur dans laquelle le décor lointain se dissout en **mode piéton** (brouillard de `pedestrian.fogStartMeters` à `viewDistanceMeters`). ⚠️ C'était le fond du canvas, ce qui était juste tant que le fond était ce qu'on voyait derrière le décor ; le ciel atmosphérique se peignant au plan far, les façades lointaines s'estompaient vers un fond clair **sur un ciel bleu** et dessinaient une barre horizontale nette à hauteur d'horizon. Ciel éteint (`sky.enabled: false`), le fond du canvas reprend ce rôle. La teinte d'un ciel bas varie avec l'heure et la diffusion : ce défaut vise le ciel par défaut, en milieu de journée. | `'#C4D6E4'` |
| `globe.landColor` | Terres émergées du globe de repli. | `'#4F7A45'` |
| `globe.buildingColor` | Façades des bâtiments extrudés (volume du fournisseur interne). Une emprise qui porte sa propre couleur (attribut `colour`) garde la sienne. | `'#8A8E96'` |
| `globe.buildingRoofColor` | Toits des bâtiments extrudés, plus clairs que les façades — la face haute se lit d'emblée. | `'#C2C6CE'` |
| `globe.buildingRoofLighten` | De combien éclaircir le toit d'une emprise qui porte SA PROPRE couleur (attribut `colour`), en fraction vers le blanc. `buildingRoofColor` ne s'applique qu'aux emprises laissées au thème, et sans cet écart le volume disparaît sur celles-là. ⚠️ Était un littéral dans `BuildingsLayer` : une décision d'apparence écrite dans le code d'un calque, invisible depuis le thème. `0` rend le toit de la couleur exacte de la façade. | `0.35` |
| `globe.buildingSunAzimuth` | Azimut du soleil factice (degrés depuis le nord, sens horaire) qui module les façades selon leur orientation. La scène n'a **aucune** lumière : le terme est cuit dans les couleurs de sommets par le worker d'extrusion, il ne coûte rien à la frame. Éviter les multiples de 45° : sur une diagonale exacte, les quatre façades d'un bâtiment orthogonal tombent deux par deux sur la même teinte. | `120` |
| `globe.buildingShadeMin` | Teinte de la façade la moins exposée, en fraction de sa couleur. `1` désactive l'ombrage. | `0.62` |
| `globe.buildingHoverColor` | Teinte d'un bâtiment survolé, l'outil de sélection actif. Elle remplace la couleur des sommets de l'emprise, mais reste MODULÉE par l'ombrage cuit dedans : le bâtiment ressort du quartier sans perdre le relief de ses façades. | `'#F2B441'` |
| `globe.buildingSelectColor` | Teinte du bâtiment dont le menu contextuel est ouvert. | `'#E8613C'` |

import type { ReactNode } from 'react'

export type MarkerColor = { base: string; accent: string; contrast: string }

export type AnimationSpec<T> = T | false

/**
 * Thème complet et **entièrement paramétrable** : aucune valeur en dur dans le
 * rendu ne doit exister hors de cet objet. Un couple `{ light, dark }` permet le
 * mode clair/sombre synchronisé avec l'app hôte.
 */
export type MapTheme = {
  /** Mode par défaut du thème (un couple `{light, dark}` le rend automatique). */
  colorScheme: 'dark' | 'light'
  colors: {
    /** Fond du canvas, visible avant le chargement des tuiles. */
    background: string
    /** Couleur par type de marker (ex. 'alert-critical', 'agent-available'). */
    marker: Record<string, MarkerColor>
    /** Couleur de repérage par tag (panneau « Couches ») ; tag/champ absent → palette hashée de la lib.
     *  Optionnel : un thème complet écrit avant cet ajout reste valide (et ne crashe pas le panneau). */
    tags?: Record<string, string>
    /** Couleurs PROPRES au cluster, indépendantes des types qu'il agrège. */
    cluster: {
      /** Cœur du donut. */
      core: string
      /** Total affiché au centre. */
      text: string
      /** Anneau de séparation cœur/parts. */
      ring: string
    }
    draw: {
      /** Palette proposée par le sélecteur de couleur du dessin. */
      palette: string[]
      /** Couleur d'une forme nouvellement tracée. */
      default: string
    }
    ui: {
      /** Fond des panneaux et barres (translucide). */
      panel: string
      /** Texte principal. */
      text: string
      /** Texte secondaire, libellés discrets. */
      muted: string
      /** Couleur d'accent : état actif, focus, sélection. */
      accent: string
      /** Erreurs et actions destructrices. */
      error: string
      /** Bordures et séparateurs. */
      border: string
      /**
       * Verdict d'une grandeur du panneau de diagnostic (cf. `performance.statThresholds`).
       *
       * Optionnel — un thème complet écrit avant cet ajout reste valide, et le panneau
       * retombe alors sur `text` : pas de couleur plutôt qu'une couleur fausse.
       *
       * `bad` est distinct d'`error` : une valeur excessive n'est pas une erreur, c'est un
       * budget dépassé. Les confondre ferait lire une carte lourde comme une carte cassée.
       */
      stat?: {
        ok: string
        warn: string
        bad: string
      }
    }
    /** Décorations d'attention des markers (`new`/`urgent`) — signaux opérationnels,
     *  couleurs volontairement très voyantes. Optionnel : thème antérieur valide. */
    attention?: { sonar?: string; target?: string }
    /**
     * Mode piéton : curseur de placement (valide / interdit) et réticule d'immersion
     * totale. Optionnel — un thème complet écrit avant cet ajout reste valide.
     */
    pedestrian?: {
      /** Cible affichée quand le point visé est une rue posable. */
      placeValid?: string
      /** Cible barrée quand le point visé est un toit ou le ciel. */
      placeBlocked?: string
      /** Réticule central de l'immersion totale. */
      reticle?: string
    }
    /**
     * Grille de coordonnées (parallèles, méridiens, étiquettes). Optionnel : un thème
     * complet écrit avant cet ajout reste valide et ne casse pas au montage — même règle
     * que `attention` et `pedestrian`, la couche retombant sur ses propres replis.
     */
    graticule?: {
      /** Parallèles et méridiens ordinaires. */
      line: string
      /** Équateur, tropiques, cercles polaires, méridiens remarquables. */
      remarkable: string
      /** Texte de l'étiquette. */
      label: string
      /** Fond de la pastille d'étiquette. */
      labelBackground: string
    }
    path: {
      /** Couleur d'un tracé. */
      base: string
      /** Contour du tracé (lisibilité sur imagerie satellite). */
      casing: string
      /** Halo d'un tracé sélectionné (outil sélection). */
      selected: string
    }
    zone: {
      /** Remplissage d'une zone. */
      fill: string
      /** Contour d'une zone. */
      stroke: string
    }
    /** Marching-ants **partagé** par les trois surfaces de sélection : contour des
     *  formes sélectionnées, tracé du sélecteur (rect/poly/lasso) et zone de la
     *  loupe. `fill` = voile de fond (sélecteur et loupe seuls — un contour de forme
     *  reste creux), `stroke` = pointillé animé, `under` = trait continu dessous.
     *  `stroke` et `under` doivent CONTRASTER l'un avec l'autre : c'est leur
     *  alternance qui rend la sélection lisible sur n'importe quel fond de carte
     *  (satellite, eau, neige). Optionnel : repli CSS blanc/noir. */
    marquee?: { fill: string; stroke: string; under: string }
  }
  /** Ombres portées, de la plus discrète à la plus marquée. */
  shadows: {
    /** Éléments posés (swatches, pastilles). */
    sm: string
    /** Boutons et petites surfaces. */
    md: string
    /** Panneaux flottants et menus. */
    lg: string
  }
  /** Rayons d'angle (px). */
  radii: {
    /** Petits éléments : boutons de barre, poignées. */
    sm: number
    /** Panneaux et menus. */
    md: number
    /** Grandes surfaces. */
    lg: number
    /** Forme pilule (valeur volontairement énorme). */
    pill: number
  }
  typography: {
    /** Pile de polices de toute l'UI de la carte. */
    fontFamily: string
    /**
     * Échelle typographique (px). Publiée en `--m3d-size-*`.
     *
     * ⚠️ Ne couvre pas encore toute la feuille de styles : 26 tailles accidentelles
     * (9.5 à 22 px) y restent littérales, faute de palier correspondant.
     */
    sizes: Record<string, number>
    /** Graisses, publiées en `--m3d-weight-*`. */
    weights: Record<string, number>
  }
  markers: {
    /** Diamètre du sprite (px). */
    size: number
    /** Épaisseur de l'anneau (px). */
    ringWidth: number
    /** Dégradé du corps du marker. */
    gradient: boolean
    /** Reflet sur la pastille. */
    gloss: boolean
    /** Contenu par défaut d'un marker : rien, l'icône du type, son rang, ou un nœud. */
    icon: 'none' | 'type' | 'number' | ReactNode
    /** Tween de position (déplacement animé des agents). */
    moveTween: { duration: number; easing: (t: number) => number }
  }
  /**
   * Géométrie du cluster par défaut, en **donut** : un cœur portant le total,
   * entouré d'un anneau segmenté par type.
   *
   * ⚠️ Ces clés décrivaient jusqu'ici un modèle « cœur + satellites en arc »
   * (`satelliteRadius`, `arcSpan`, `maxSatellites`) qui n'existe plus : le composant
   * a été réécrit en donut, sans que le thème suive. Aucune des cinq n'avait donc de
   * consommateur — un hôte pouvait les régler sans que rien ne bouge. Elles sont
   * remplacées par la géométrie réellement dessinée.
   */
  clusters: {
    /** Rayon du cœur (px) selon le nombre total de points. */
    coreRadius: (total: number) => number
    /** Épaisseur de l'anneau segmenté (px). */
    ringWidth: number
    /** Contour clair des parts (px) — il déborde du rayon extérieur de sa moitié. */
    strokeWidth: number
    /** Écart angulaire entre deux parts (rad) ; `0` les rend jointives. */
    segmentGap: number
    /** Angle de la première part (rad). `Math.PI` = 9h, deux parts haut/bas. */
    startAngle: number
    /** Écart (px) entre le bord de la pastille et son anneau de sélection marching-ants —
     *  sans lui, l'anneau tomberait pile sur le contour du donut et serait invisible. */
    selectedGapPx: number
  }
  animations: {
    /** Coupe TOUTES les animations JS (le CSS a sa propre règle `prefers-reduced-motion`). */
    enabled: boolean
    /** Pulsation d'un marker à signaler. `false` la coupe. */
    pulse: AnimationSpec<{ duration: number; easing: string; scale: number }>
    /** Halo qui s'écarte d'un marker (`maxScale` = agrandissement final). */
    halo: AnimationSpec<{ duration: number; easing: string; maxScale: number }>
    /** Léger flottement vertical (`amplitude` en px). */
    bob: AnimationSpec<{ duration: number; amplitude: number }>
    /** Entrée d'un marker (`stagger` = décalage entre deux apparitions, ms). */
    markerEnter: { duration: number; easing: string; stagger: number }
    /** Entrée d'un cluster. */
    clusterEnter: { duration: number; easing: string; stagger: number }
    /** Ouverture des menus, flyouts et panneaux. Publiée en `--m3d-menu-dur`. */
    menuOpen: { duration: number; easing: string }
    /** Durée d'un vol caméra ordinaire (s) — `flyTo`, `fitBounds`. */
    flyDuration: number
    /** Courbe d'accélération des vols caméra. */
    flyEasing: (t: number) => number
    /**
     * Durées (s) des déplacements caméra qui ne sont pas des vols ordinaires.
     *
     * Elles étaient écrites en littéral dans huit fichiers — `0.4` ici, `0.8` là,
     * `0.6` ailleurs — si bien que « recentrer sur un marker » et « ouvrir un
     * cluster » n'avaient pas le même rythme sans qu'aucune intention ne le dise, et
     * qu'aucune application ne pouvait ralentir l'ensemble d'un coup.
     */
    /** Déplacement latéral. */
    pan: number
    /** Changement de zoom par bouton. */
    zoom: number
    /** Recentrage « immédiat » (`useCamera().moveTo`). */
    moveTo: number
    /** Vol de ciblage depuis un listing ou un favori épinglé. */
    target: number
    /** Ouverture d'un cluster (zoom sur son emprise). */
    clusterOpen: number
    /** Bascule en vue du dessus. */
    topDown: number
    /** Recul en vue globe. */
    globe: number
  }
  /**
   * Espacements des surfaces flottantes (px).
   *
   * `MapTheme` n'en avait aucun : ces valeurs vivaient dans `style/panelGeometry`,
   * source unique côté code mais hors de portée d'une charte graphique. Elles sont
   * aussi publiées en variables CSS (`--m3d-gap`…), pour que la feuille de styles et
   * les calculs de placement partagent toujours le même nombre.
   */
  spacing: {
    /** Écart entre une surface ancrée et son ancre. */
    gap: number
    /** Marge minimale entre une surface et le bord du conteneur. */
    edge: number
    /** Retrait des barres verticales par rapport au bord. */
    barInset: number
  }
  /** Dimensions des surfaces flottantes et des icônes. */
  sizing: {
    /** Largeur du panneau d'inventaire de la loupe (px). */
    lensPanelW: number
    /** Largeur du panneau de sélection (px). */
    selectionPanelW: number
    /** Largeur du panneau de templates (px). */
    templatesPanelW: number
    /**
     * Hauteurs maximales des panneaux quand la place le permet (px). Elles
     * divergeaient sans raison exprimée (380 / 420 / 300 / 560 / 520).
     */
    panelMaxHeight: {
      tags: number
      symbols: number
      search: number
      settings: number
      settingsSub: number
      templates: number
      catalog: number
    }
    /**
     * Hauteur d'une ligne de catalogue (px).
     *
     * ⚠️ CONSTANTE par contrat : `visibleWindow` en déduit la fenêtre à rendre sans
     * mesurer les lignes. Une ligne qui dépasserait cette hauteur (deux lignes de texte,
     * une icône plus grande) décalerait tout le contenu sous elle.
     */
    catalogRowHeight: number
    /** Décalage horizontal d'une ligne enfant dépliée (px). */
    catalogIndent: number
    /**
     * Largeur du chevron de dépliage (px).
     *
     * ⚠️ Elle donne AUSSI sa largeur à la gouttière réservée sur les lignes sans
     * enfants : les deux doivent coïncider, sinon les noms d'une même liste ne
     * s'alignent plus selon que la ligne porte un chevron ou non.
     */
    catalogChevronW: number
    /**
     * Largeur du panneau de catalogue — le menu des types (px).
     *
     * Sert aussi de marge de cadrage, avec `catalogSubPanelW` : une zone cadrée pendant
     * que le catalogue est ouvert ne doit pas atterrir dessous.
     */
    catalogPanelW: number
    /**
     * Largeur du second panneau, celui de la liste (px).
     *
     * Distincte de `catalogPanelW` bien qu'égale par défaut : les deux surfaces sont
     * ACCOLÉES du même côté, donc c'est leur SOMME que le cadrage doit réserver. Les
     * confondre faisait atterrir la zone cadrée sous la liste — et `fitOnAdd` étant
     * actif par défaut, c'était le chemin nominal.
     */
    catalogSubPanelW: number
    /**
     * Taille des icônes @mdi (unité `@mdi/react` : 1 ≈ 24 px). Une seule valeur là
     * où sept coexistaient en dur (0.5 à 0.8) sans qu'aucune ne se distingue.
     */
    iconSize: number
  }
  /**
   * Traitement colorimétrique du fond de carte — le seul aspect des tuiles qui soit
   * réellement une affaire d'apparence.
   *
   * ⚠️ Ce bloc portait aussi `cacheSize`, `uploadsPerFrame`, `parentFallback` et
   * `priorityByDistance` : des budgets mémoire GPU et CPU, donc de la config. Aucun
   * n'avait de consommateur, et `cacheSize` (256) doublonnait
   * `providers.tiles.maxTiles` (500) — deux noms, deux valeurs, un seul effet, et pas
   * celui du thème. Ils sont retirés au profit de `providers.tiles`.
   */
  tiles?: {
    /**
     * Traitement colorimétrique du fond de carte, appliqué au canvas WebGL.
     *
     * C'est le levier du mode sombre : les tuiles Google sont produites claires, et
     * rien dans leur API ne fournit de variante sombre. Les assombrir ici est la
     * seule façon qu'une carte s'accorde à une UI sombre.
     *
     * ⚠️ Le filtre porte sur le CANVAS, donc sur tout ce qui y est rendu : tuiles,
     * mais aussi formes dessinées et tracés. Markers, panneaux et barres vivent dans
     * l'overlay DOM et n'en sont pas affectés. Un filtre marqué (`invert`) rend donc
     * les zones dessinées atypiques — à réserver aux réglages doux.
     *
     * Omis ou vide : aucun filtre, les tuiles telles que le fournisseur les rend.
     */
    filter?: {
      /** `1` = inchangé ; `< 1` assombrit. */
      brightness?: number
      /** `1` = inchangé ; `< 1` désature. */
      saturation?: number
      /** `1` = inchangé. */
      contrast?: number
      /** `0` = inchangé ; `1` inverse — spectaculaire mais rarement lisible. */
      invert?: number
      /** Rotation de teinte, en degrés. */
      hueRotate?: number
    }
  }
  globe: {
    /** Fond derrière le globe (espace). */
    background: string
    /** Océan des globes de repli — celui de secours et celui sous les tuiles 2D. */
    oceanColor: string
    /**
     * Couleur dans laquelle le décor lointain se dissout en mode piéton (brouillard de
     * `pedestrian.fogStartMeters` à `viewDistanceMeters`).
     *
     * ⚠️ Elle valait le FOND du canvas, ce qui était juste tant que le fond était ce qu'on
     * voyait derrière le décor. Le ciel atmosphérique (`sky.enabled`) se peint désormais au
     * plan far, donc devant ce fond : les façades lointaines s'estompaient vers le fond clair
     * sur un ciel bleu, et leur bande blanchie dessinait une **barre horizontale nette** à
     * hauteur d'horizon. Accordée au ciel, elle les y dissout au lieu de les découper.
     *
     * Ciel éteint, c'est le fond du canvas qui reprend ce rôle — il redevient alors ce qu'on
     * voit derrière. Une teinte de ciel bas ne dépend pas que d'elle-même : l'heure et les
     * réglages de diffusion la font varier, donc ce défaut vise le ciel par défaut, en
     * milieu de journée.
     */
    hazeColor: string
    /** Terres émergées du globe de repli. */
    landColor: string
    /**
     * Façades des bâtiments extrudés (volume du fournisseur interne). Une emprise qui
     * porte sa propre couleur (attribut `colour`) garde la sienne.
     */
    buildingColor: string
    /** Toits des bâtiments extrudés, plus clairs que les façades — la face haute se lit d'emblée. */
    buildingRoofColor: string
    /**
     * De combien éclaircir le toit d'une emprise qui porte SA PROPRE couleur (attribut
     * `colour`), en fraction vers le blanc — `buildingRoofColor` ne s'applique qu'aux
     * emprises laissées au thème, et sans cet écart le volume disparaît sur celles-là.
     *
     * ⚠️ Était un littéral dans `BuildingsLayer` : une décision d'apparence, écrite dans
     * le code d'un calque, invisible depuis le thème qui la portait déjà pour tout le
     * reste. `0` rend le toit de la couleur exacte de la façade.
     */
    buildingRoofLighten: number
    /**
     * Azimut du soleil factice (degrés depuis le nord, sens horaire) qui module les
     * façades selon leur orientation.
     *
     * La scène n'a AUCUNE lumière : tout est en `MeshBasicMaterial`. Sans cette
     * modulation, deux murs perpendiculaires ont exactement la même teinte et les blocs
     * s'aplatissent — un pâté de maisons devenait une tache grise. Le terme est **cuit
     * dans les couleurs de sommets** par le worker d'extrusion : il ne coûte rien à la
     * frame, et n'introduit aucun éclairage dans une scène qui n'en veut pas.
     */
    buildingSunAzimuth: number
    /**
     * Teinte de la façade la moins exposée, en fraction de sa couleur (0 = noire, 1 =
     * aucun ombrage). Le mur le mieux exposé garde sa couleur pleine.
     */
    buildingShadeMin: number
    /**
     * Teinte d'un bâtiment survolé, l'outil de sélection actif.
     *
     * Elle REMPLACE la couleur des sommets de l'emprise le temps du survol — ombrage
     * compris, qui est cuit dedans : c'est ce qui la fait ressortir d'un quartier entier.
     */
    buildingHoverColor: string
    /** Teinte du bâtiment dont le menu contextuel est ouvert. */
    buildingSelectColor: string
  }
}

/**
 * Rend récursivement optionnel. Fonctions ET tableaux restent atomiques : un tableau
 * ne se fusionne pas élément par élément (`deepMerge` le remplace en bloc), donc en
 * rendre les indices optionnels décrirait un merge qui n'existe pas — et laisserait
 * passer `{ palette: { 0: '#fff' } }`.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends (...args: never[]) => unknown
      ? T[K]
      : T[K] extends object
        ? DeepPartial<T[K]>
        : T[K]
}

export type PartialTheme = DeepPartial<MapTheme>
/** Un thème unique, ou un couple clair/sombre. */
export type ThemeInput = MapTheme | { light: MapTheme; dark: MapTheme }

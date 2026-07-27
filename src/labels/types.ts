import type { DeepPartial } from '../theme/types'
import type { DrawTool, SelectMode } from '../layers/DrawLayer'

/**
 * Tous les textes affichés par la lib, **entièrement traduisibles** : aucun
 * libellé en dur dans les composants ne doit exister hors de cet objet. Les
 * défauts (français) sont dans `defaultLabels` ; l'hôte override tout ou partie
 * via `<MapProvider labels={...}>` (merge profond, mêmes règles que le thème).
 *
 * Les gabarits contiennent des variables `{nom}` interpolées par `formatLabel`
 * (ex. `'Bordure {width} px'`) — les conserver dans toute traduction.
 */
export type MapLabels = {
  /** Tooltips/aria des boutons de `<MapControls>`. */
  controls: {
    pan: string
    rotate: string
    north: string
    zoomIn: string
    zoomOut: string
    tilt: string
    topDown: string
    globe: string
    fullscreen: string
    /** Bouton « revenir à la cible » — n'apparaît qu'avec `MapControls target`. */
    target: string
    /** Fond de carte : tuiles 3D photoréalistes. */
    mode3d: string
    /** Fond de carte : plan 2D Google. */
    plan: string
    /** Calque trafic Google (mode plan uniquement). */
    traffic: string
  }
  /** Bouton + panneau « Couches » (filtre par tag). */
  tags: {
    button: string
    searchPlaceholder: string
    /** Aucun tag présent sur la carte. */
    empty: string
    /** La recherche ne matche aucun tag. */
    noMatch: string
    showAll: string
  }
  /**
   * Outil **Symboles** de la barre de dessin : palette d'icônes posables au
   * glisser-déposer. Tout est traduisible ici — y compris les catégories du
   * catalogue et les affiliations — pour qu'aucun texte n'ait à passer en prop.
   */
  symbols: {
    button: string
    searchPlaceholder: string
    /** Consigne d'usage affichée en tête du panneau. */
    dragHint: string
    /** La recherche ne matche aucune entrée du catalogue. */
    noMatch: string
    /** Titre de la section de choix d'affiliation. */
    affiliation: string
    /** Graphique multi-points : posé par clics successifs, pas par dépôt. */
    multiPointHint: string
    /** Libellé par catégorie du catalogue (clé du catalogue → texte affiché). */
    categories: Record<string, string>
    /** Libellé par affiliation (`friendly`, `hostile`, `neutral`, `unknown`). */
    affiliations: Record<string, string>
  }
  /** `<SearchBox>` (le prop `placeholder` du composant reste prioritaire). */
  search: {
    placeholder: string
    /** aria-label du champ. */
    inputLabel: string
    /** Requête sans résultat. */
    noResults: string
    /** Titre de la section historique (champ vide focalisé). */
    historyTitle: string
    clearHistory: string
    /** aria-label du bouton ✕ qui vide le champ. */
    clearInput: string
  }
  /** Boutons de `<DrawToolbar>` hors outils (navigation, historique, effacement). */
  toolbar: {
    navigate: string
    undo: string
    redo: string
    clearAll: string
  }
  /** Libellé de chaque outil de dessin (toolbar, panneau Réglages, récap raccourcis). */
  tools: Record<DrawTool, string>
  /**
   * Modes du flyout de sélection (marquee rectangle / polygone / lasso) :
   * `label` = rangée du flyout, `description` = tooltip (avec le raccourci) —
   * distincte du label pour ne pas répéter le texte déjà visible.
   */
  selectModes: Record<SelectMode, { label: string; description: string }>
  /** Panneau de style (swatches, palette, presets) — libellés et aria. */
  style: {
    fill: string
    stroke: string
    swap: string
    /** Pastille de la palette — `{color}` = la couleur CSS. */
    color: string
    customColor: string
    border: string
    noBorder: string
    /** Preset d'épaisseur — `{width}` = px. */
    borderWidth: string
    strokeStyle: string
    solid: string
    dashed: string
    dotted: string
    strokeOpacity: string
    fillOpacity: string
    /** Preset d'opacité — `{percent}` = 0–100. */
    opacityPreset: string
    corners: string
    /** Preset de rayon d'angle — `{radius}` = % du petit côté. */
    cornerRadius: string
    /** Titre du panneau quand 1 forme est sélectionnée — `{count}`. */
    selectionCount: string
    /** Titre du panneau quand plusieurs formes sont sélectionnées — `{count}`. */
    selectionCountPlural: string
  }
  /** Panneau de sélection (liste des éléments sélectionnés, par groupe). */
  selection: {
    /** Titre du panneau. */
    title: string
    /** Nom de la catégorie formes dans une rangée. */
    shapesGroup: string
    /** Gabarit du libellé d'une rangée — `{group}`, `{type}` (compteur séparé). */
    group: string
    /** aria-label de la croix d'une rangée — `{label}` = libellé de la rangée. */
    deselectGroup: string
    clearAll: string
    /** aria-label de la poignée de déplacement du panneau. */
    movePanel: string
  }
  /** Liste de markers partagée (sélection + loupe) : 1 ligne par marker. */
  markerList: {
    /** Action « cibler » (menu + clic sur la ligne). */
    target: string
    /** aria-label du bouton de menu d'actions d'une ligne — `{label}`. */
    actions: string
    /** aria-label de la croix d'une ligne — `{label}`. */
    remove: string
  }
  /** Outil loupe (`<LensLayer>`) : inventaire des markers d'une zone. */
  lens: {
    /** Libellé/aria de l'outil loupe dans la toolbar. */
    tool: string
    /** Titre du panneau — `{count}` = nombre de markers. */
    title: string
    /** Titre au singulier — `{count}` = 1. */
    titleSingular: string
    /** Panneau vide (zone sans marker). */
    empty: string
    /** aria-label du bouton qui retire la zone loupe. */
    remove: string
    /** aria-label de la poignée de déplacement du panneau. */
    movePanel: string
    /** aria-label/tooltip du bouton qui ré-aimante le panneau à la zone (après déplacement). */
    snapBack: string
  }
  /** Panneau « Réglages des outils ». */
  settings: {
    title: string
    resetAll: string
    resetTool: string
    shortcutsTitle: string
  }
  /** Actions d'édition du dessin (récapitulatif des raccourcis). */
  actions: {
    panMap: string
    rotateCamera: string
    rotateShape: string
    undoRedo: string
    selectAll: string
    duplicate: string
    delete: string
    moveSelection: string
    closePolygon: string
    cancel: string
    /** Maj+clic / Maj+marquee : ajouter à la sélection. */
    addToSelection: string
    /** Alt/⌘+marquee : ne sélectionner que les markers. */
    markersOnly: string
  }
  /** Noms de touches affichés (tooltips, récap raccourcis). */
  keys: {
    escape: string
    space: string
    spaceShift: string
    shiftDrag: string
    enter: string
    arrows: string
    backspace: string
    shiftClick: string
    altOrCmd: string
  }
  /** Gabarits de composition des textes affichés. */
  format: {
    /** Libellé + raccourci d'un tooltip/aria — `{label}`, `{key}`. */
    shortcut: string
  }
  /** Label de distance de l'outil règle — `{value}` = nombre déjà formaté. */
  measure: {
    kilometers: string
    meters: string
  }
  /** Durée de trajet — `{value}`, ou `{h}`/`{m}` au-delà de l'heure. */
  duration: {
    seconds: string
    minutes: string
    /** Heures pleines (minutes nulles) — `{h}`. */
    hours: string
    /** Heures et minutes — `{h}`, `{m}`. */
    hoursMinutes: string
  }
  /** Moteur de relations (`<RelationLayer>`) : liens vers les markers voisins. */
  relations: {
    /** Titre de la section ajoutée au menu contextuel d'un marker. */
    menuRoot: string
    /** Étiquette d'un lien tant que le temps réel n'est pas revenu. */
    pending: string
    /** Étiquette d'un lien dont le temps réel n'a pas pu être obtenu. */
    unavailable: string
    /** Étiquette nominale d'un lien — `{distance}`, `{duration}` déjà formatés. */
    linkLabel: string
    /** Titre du bloc de presets par rapidité. */
    fastestGroup: string
    /** Preset par rapidité — `{count}`. */
    fastest: string
    /** Titre du bloc de presets par rayon. */
    radiusGroup: string
    /** Preset par rayon — `{radius}` déjà formaté. */
    radius: string
    /** Indice d'un preset : nombre de cibles retenues — `{count}`. */
    targetCount: string
    /** Indice d'un preset dont la sélection dépasse le plafond de calcul — `{count}`. */
    tooWide: string
    /** Indice d'un preset sans aucune cible. */
    noTargets: string
    /** Étiquette agrégée d'un cluster trop fourni pour l'éventail — `{count}`. */
    clusterAggregate: string
    /** Barre d'état : relation active — `{source}`, `{targets}`. */
    statusRelation: string
    /** Barre d'état : effacer la relation (libellé du bouton, visible et aria-label). */
    clear: string
    /** aria-label de la croix d'une étiquette d'itinéraire (referme le tracé). */
    removeRoute: string
    /** Noms des modes de transport (segment cliquable de la barre d'état). */
    modes: {
      DRIVE: string
      WALK: string
      BICYCLE: string
      TWO_WHEELER: string
      TRANSIT: string
    }
  }
  /** Dock des favoris épinglés (`<PinnedDock>`). */
  pinned: {
    /** Invite de la languette d'ajout. */
    add: string
    /** Tooltip affiché en glissant une pastille hors de la dock. */
    remove: string
    /** aria-label du bouton qui replie la dock. */
    collapse: string
    /** aria-label du bouton/pastille qui redéploie la dock. */
    expand: string
    /**
     * Nom de la dock, affiché SUR la poignée quand elle est repliée : c'est alors
     * le seul élément visible, et un chevron seul ne dit pas ce qu'il rouvre.
     */
    title: string
  }
  /** Messages d'erreur développeur. */
  errors: {
    outsideMap: string
  }
}

export type PartialLabels = DeepPartial<MapLabels>

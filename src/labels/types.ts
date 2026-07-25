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
    /** Nom de la catégorie markers dans une rangée. */
    markersGroup: string
    /** Gabarit du libellé d'une rangée — `{group}`, `{type}` (compteur séparé). */
    group: string
    /** aria-label de la croix d'une rangée — `{label}` = libellé de la rangée. */
    deselectGroup: string
    clearAll: string
    /** aria-label de la poignée de déplacement du panneau. */
    movePanel: string
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
  /** Messages d'erreur développeur. */
  errors: {
    outsideMap: string
  }
}

export type PartialLabels = DeepPartial<MapLabels>

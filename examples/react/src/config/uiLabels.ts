import type { ControlGroup, DrawToolbarSection, MapControlButton, SelectMode } from 'map3d'
import { defaultLabels } from 'map3d'

/* ══════════════════ LIBELLÉS DES SURFACES D'INTERFACE ══════════════════
   Le pendant de `configLabels` pour ce qui n'est pas dans `MapConfig` : les boutons, les
   sections et les groupes que `<Map>` monte. Ils vivent dans `config/`, avec le reste du
   vocabulaire français de la démo, et non dans le fichier qui construit l'onglet — un
   builder de contrôleurs n'a pas à héberger la traduction de la lib.

   Les outils, les modes de sélection et les boutons de navigation ONT déjà leur nom
   français dans `defaultLabels` — c'est celui que la carte affiche en infobulle. Les
   réécrire ici donnait deux traductions du même bouton, et elles avaient déjà divergé
   (« gomme » ici, « Effacer » sur la carte).

   Chaque table est un `Record<Union, string>` : un membre ajouté à `MapControlButton` ou
   à `ControlGroup` devient une erreur de compilation ici, pas un bouton qui apparaît en
   anglais. */

/**
 * Les deux exceptions viennent d'un décalage DANS LA LIB : `MapControlButton` nomme
 * `compass` et `layers` ce que `labels.controls` appelle `north` et ne porte pas du
 * tout (le libellé du filtre par tag vit sous `labels.tags`).
 */
export const BUTTON_LABELS: Record<MapControlButton, string> = {
  ...defaultLabels.controls,
  compass: defaultLabels.controls.north,
  layers: 'Couches',
}

/** `selectModes` porte un objet `{ label, description }` : seul le libellé nous sert. */
export const SELECT_MODE_LABELS: Record<SelectMode, string> = {
  rect: defaultLabels.selectModes.rect.label,
  poly: defaultLabels.selectModes.poly.label,
  lasso: defaultLabels.selectModes.lasso.label,
}

/** Sections de la barre : la lib les nomme, mais éclatées sur cinq groupes de labels. */
export const SECTION_LABELS: Record<DrawToolbarSection, string> = {
  navigate: defaultLabels.toolbar.navigate,
  select: defaultLabels.tools.select,
  symbol: defaultLabels.symbols.button,
  lens: defaultLabels.lens.tool,
  plugins: defaultLabels.plugins.title,
  stylePanel: 'Style de tracé',
  settings: defaultLabels.settings.title,
  undo: defaultLabels.toolbar.undo,
  redo: defaultLabels.toolbar.redo,
  clear: defaultLabels.toolbar.clearAll,
}

/** `ControlGroup` est le seul de ces cinq vocabulaires que la lib n'étiquette pas. */
export const GROUP_LABELS: Record<ControlGroup, string> = {
  drag: 'Déplacement / rotation',
  compass: 'Boussole',
  zoom: 'Zoom',
  view: 'Vues',
  basemap: 'Fonds',
  pedestrian: 'Mode piéton',
  target: 'Cible',
  layers: 'Couches',
  fullscreen: 'Plein écran',
}

// Paliers proposés par les palettes de style du dessin.
//
// Module sans dépendance, comme `style/panelGeometry` et pour la même raison : le
// contexte React (`context.ts`) et les palettes (`drawControls.tsx`) en ont tous deux
// besoin, et les faire s'importer l'un l'autre créerait un cycle.

/**
 * Ce sont des CHOIX PRODUIT, pas des constantes : la densité d'un plan cadastral
 * n'appelle pas les mêmes épaisseurs qu'un croquis tactique. Réglables via
 * `<Map draw={{ presets }}>`.
 */
export type DrawPresets = {
  /** Épaisseurs de bordure (px). `0` = sans bordure. */
  widths: readonly number[]
  /** Opacités de bordure. */
  strokeOpacities: readonly number[]
  /** Opacités de remplissage. */
  fillOpacities: readonly number[]
  /** Rayons d'angle des rectangles, en % du petit côté. */
  radii: readonly number[]
}

export const DEFAULT_DRAW_PRESETS: DrawPresets = {
  widths: [0, 2, 4, 8, 14],
  strokeOpacities: [0.25, 0.5, 0.75, 0.95],
  fillOpacities: [0, 0.3, 0.6, 1],
  radii: [0, 10, 25, 50],
}

/**
 * Rayon d'angle maximal proposé — borne de l'échelle des aperçus.
 *
 * Dérivé des presets plutôt que réécrit : l'aperçu de `DrawSettingsPanel` divisait
 * par un `50` littéral emprunté à cette table, si bien que changer `radii` faussait
 * silencieusement son dessin. Repli à 50 si la liste est vide.
 */
export const maxRadiusOf = (presets: DrawPresets): number => presets.radii.at(-1) ?? 50

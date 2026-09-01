// Résolution des couleurs DU THÈME : « quelle couleur pour ce type de marker ? »,
// « quelle couleur pour ce tag ? ». Deux questions posées partout dans la lib —
// pastilles, parts de cluster, lignes de liste, dock, panneau « Couches », traits de
// relation — et dont la réponse doit être la MÊME partout, sinon un marker et le
// trait qui en part n'ont plus la même couleur.
//
// Ces deux règles de repli étaient recopiées à l'identique sur une demi-douzaine de
// sites. Elles vivent ici, et nulle part ailleurs.

import { tagColor } from '../core/TagFilter'
import { defaultTheme } from './defaultTheme'
import type { MapTheme, MarkerColor } from './types'

/**
 * Couleur d'un TYPE de marker. Repli sur l'entrée `default` du thème — un type que
 * l'application n'a pas déclaré (symbole posé, donnée inattendue) doit rester
 * visible plutôt que disparaître.
 */
export function markerColorOf(theme: MapTheme, type: string): MarkerColor {
  return theme.colors.marker[type] ?? theme.colors.marker.default!
}

/**
 * Couleur d'un TAG. Le thème d'abord (`colors.tags`, ce que l'application déclare),
 * sinon la palette hashée de la lib : un tag jamais déclaré (les dessins : `draw`,
 * `rect`…) garde ainsi une couleur stable entre les sessions et entre les surfaces.
 */
export function tagColorOf(theme: MapTheme, tag: string): string {
  return theme.colors.tags?.[tag] ?? tagColor(tag, theme.colors.tagPalette ?? defaultTheme.colors.tagPalette)
}

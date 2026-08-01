/**
 * Signature « map3D » — **source unique** du texte, du lien et de la cible a11y,
 * partagée par la passe WebGL (`Watermark`) et le lien DOM (`WatermarkLink`).
 *
 * ⚠️ Le CONTENU (texte, URL, a11y) est volontairement **hors `labels` / `theme` /
 * `config`** : rendre ces valeurs surchargeables serait un vecteur de suppression du
 * filigrane (libellé vidé, couleur transparente). C'est une exception ASSUMÉE à « tout
 * est config » — le wordmark est un identifiant de marque non traductible (cf. règle
 * docs « ne se traduisent pas : identifiants »), au même titre que `marker:agent`.
 * Seule l'EXISTENCE de la signature se coupe, via `config.watermark.enabled` — un
 * interrupteur réservé aux clients sous licence commerciale (la couper sans licence
 * viole PolyForm-Noncommercial).
 */

/** Marque affichée, peinte dans le canvas et doublée par la zone de clic. */
export const WATERMARK_TEXT = 'map3D'

/** Cible du lien : le dépôt (sa page d'accueil porte la licence PolyForm). */
export const WATERMARK_HREF = 'https://github.com/pasquelin/map3D'

/** Libellé lu par les lecteurs d'écran (la zone de clic est visuellement transparente). */
export const WATERMARK_ARIA = 'map3D — voir le projet et sa licence sur GitHub'

// Métriques de la police — **source unique** partagée par la texture peinte
// (`Watermark`) et le CSS de la zone de clic (`css/watermark.ts`). La boîte de clic DOM
// doit épouser exactement les glyphes peints : ces valeurs DOIVENT rester communes aux
// deux, comme `BAR_INSET` l'est déjà via `panelGeometry`.

/** Corps du texte (px logiques). */
export const WATERMARK_FONT_PX = 13
/** Graisse du texte. */
export const WATERMARK_FONT_WEIGHT = 600
/** Pile de polices ('Segoe UI' entre quotes : requis par le parseur `ctx.font` du canvas). */
export const WATERMARK_FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
/** Interligne — la hauteur de la texture et le CSS en dérivent. */
export const WATERMARK_LINE_HEIGHT = 1.4

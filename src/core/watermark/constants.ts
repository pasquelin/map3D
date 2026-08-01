/**
 * Signature « map3D » — **source unique** du texte, du lien et de la cible a11y,
 * partagée par la passe WebGL (`Watermark`) et le lien DOM (`WatermarkLink`).
 *
 * ⚠️ Volontairement **hors `labels` / `theme` / `config`** : rendre ces valeurs
 * surchargeables par l'hôte serait un vecteur de suppression du filigrane (libellé
 * vidé, couleur transparente). C'est une exception ASSUMÉE à « tout est config » —
 * le wordmark est un identifiant de marque non traductible (cf. règle docs
 * « ne se traduisent pas : identifiants »), au même titre que `marker:agent`.
 * L'attribution requise par la licence PolyForm-Noncommercial ne doit dépendre
 * d'aucun réglage de l'hôte.
 */

/** Marque affichée, peinte dans le canvas et doublée par la zone de clic. */
export const WATERMARK_TEXT = 'map3D'

/** Cible du lien : le dépôt (sa page d'accueil porte la licence PolyForm). */
export const WATERMARK_HREF = 'https://github.com/pasquelin/map3D'

/** Libellé lu par les lecteurs d'écran (la zone de clic est visuellement transparente). */
export const WATERMARK_ARIA = 'map3D — voir le projet et sa licence sur GitHub'

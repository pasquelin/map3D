/**
 * Géométrie partagée des surfaces flottantes — **source unique** pour la feuille de
 * styles et pour les hooks de placement (`panelFit`).
 *
 * Ces valeurs étaient auparavant écrites des deux côtés : le CSS posait
 * `calc(100% + 12px)`, le JS supposait `GAP = 12` pour calculer la place disponible
 * de chaque côté. La divergence ne casse rien de visible — elle fausse en silence le
 * choix du côté d'ouverture — et elle s'était déjà produite (un panneau à 10px).
 * D'où ce module sans dépendance, importé par les deux.
 */

/** Écart entre une surface ancrée et son ancre (px). */
export const GAP = 12
/** Marge minimale conservée entre une surface et le bord du conteneur (px). */
export const EDGE = 8
/** Retrait des barres verticales par rapport au bord du conteneur (px). */
export const BAR_INSET = 16

/**
 * Géométrie partagée des surfaces flottantes — **source unique** pour la feuille de
 * styles et pour les hooks de placement (`panelFit`).
 *
 * Ces valeurs étaient auparavant écrites des deux côtés : le CSS posait
 * `calc(100% + 12px)`, le JS supposait `GAP = 12` pour calculer la place disponible
 * de chaque côté. La divergence ne casse rien de visible — elle fausse en silence le
 * choix du côté d'ouverture — et elle s'était déjà produite (un panneau à 10px).
 * D'où ce module sans dépendance, importé par les deux.
 *
 * `GAP` n'a plus qu'un lecteur depuis que toutes les surfaces déroulantes sont placées
 * en JS (`useAnchoredPortal`) : le CSS ne calcule plus aucun décalage. La divergence
 * décrite ci-dessus est donc devenue impossible, pas seulement surveillée.
 */

/** Écart entre une surface ancrée et son ancre (px). */
export const GAP = 12
/** Marge minimale conservée entre une surface et le bord du conteneur (px). */
export const EDGE = 8
/** Retrait des barres verticales par rapport au bord du conteneur (px). */
export const BAR_INSET = 16

/**
 * Largeur des panneaux flottants (px). Même raison d'être que `GAP` : la feuille de
 * styles la pose, et `LensLayer` en a besoin pour décider de quel côté de la zone
 * ancrer son panneau (« tient-il à droite ? »). Le nombre était écrit aux deux
 * endroits, avec un commentaire pour tenir la synchro — c'est-à-dire rien.
 */
export const LENS_PANEL_W = 260
/** Largeur du panneau de sélection (px). */
export const SELECTION_PANEL_W = 260
/**
 * Largeur du panneau de templates (px).
 *
 * Dimensionnée par sa rangée de cases la plus chargée — les catégories de dessin PLUS
 * « Vue », soit quatre colonnes. À 288 px il restait 34 px de texte par case : « Symboles »
 * en demande ~50 px, et se serait coupé en plein mot. Le compte : 4 × (50 texte + 15
 * case + 5 gap + 8 padding) + 3 × 3 gap + 14 + 16 padding ≈ 352.
 */
export const TEMPLATES_PANEL_W = 352

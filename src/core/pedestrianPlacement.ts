/**
 * Le point visé est-il **posable** ? Comparaison de la surface touchée sous le curseur
 * (`Projection.pickHeight`) au niveau de rue estimé sur une couronne
 * (`Projection.sampleGroundHeight`, minimum local).
 *
 * Les tuiles photoréalistes sont un maillage fusionné SANS sémantique : rien n'y distingue
 * un toit d'une chaussée. L'écart des deux mesures est le seul signal disponible — un toit
 * domine la rue adjacente de plusieurs mètres, une chaussée non.
 *
 * ⚠️ `hitHeight` à `null` vaut **sol nu**, donc POSABLE — et non l'inverse.
 *
 * C'est le cas normal du fournisseur interne, où seuls les bâtiments sont des volumes
 * raycastables : viser la chaussée ne touche rien. Traiter cette absence comme un refus
 * inversait toute la règle — seuls les toits se validaient, et la rue, c'est-à-dire le seul
 * endroit où l'on veut poser un piéton, était interdite.
 *
 * Le vide reste écarté en amont : l'appelant n'entre ici qu'avec une coordonnée résolue
 * (`pickLatLng`), et un sol indéterminé (`groundHeight` nul, aucune tuile chargée) refuse.
 */
export function isGroundPlacement(
  hitHeight: number | null,
  groundHeight: number | null,
  maxRoofDeltaMeters: number,
): boolean {
  if (groundHeight === null) return false
  if (hitHeight === null) return true
  return hitHeight - groundHeight <= maxRoofDeltaMeters
}

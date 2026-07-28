/**
 * Le point visé est-il **posable** ? Comparaison de la surface touchée sous le curseur
 * (`Projection.pickHeight`) au niveau de rue estimé sur une couronne
 * (`Projection.sampleGroundHeight`, minimum local).
 *
 * Les tuiles photoréalistes sont un maillage fusionné SANS sémantique : rien n'y distingue
 * un toit d'une chaussée. L'écart des deux mesures est le seul signal disponible — un toit
 * domine la rue adjacente de plusieurs mètres, une chaussée non.
 *
 * `null` (ciel, ou aucune tuile chargée) vaut refus : on ne pose pas un piéton dans le vide.
 */
export function isGroundPlacement(
  hitHeight: number | null,
  groundHeight: number | null,
  maxRoofDeltaMeters: number,
): boolean {
  if (hitHeight === null || groundHeight === null) return false
  return hitHeight - groundHeight <= maxRoofDeltaMeters
}

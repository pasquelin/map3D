/**
 * Distance de référence qui gouverne l'ÉCHELLE PERÇUE de la vue — celle dont `MapView.zoom`
 * se déduit.
 *
 * Ce n'était pas une fonction mais l'altitude brute, et `altitude = distance × cos(tilt)` :
 * incliner la vue sans bouger la caméra du point visé faisait chuter l'altitude, donc grimper
 * le zoom. Mesuré sur l'exemple : 14,75 à plat, 18,46 à 85° — assez pour franchir
 * `clustering.maxZoom` et éteindre tous les regroupements alors que rien n'avait changé à
 * l'écran.
 *
 * @param picked distance caméra → point visé (centre de l'écran), `null` si le rayon part
 *   au-dessus de l'horizon — il n'y a alors aucun point visé.
 * @param altitude repli hors vue rasante : à plat, c'est exactement la distance au point visé.
 * @param cap borne supérieure (`0` = aucune). Sert à la vue rasante, où le regard porte
 *   jusqu'à l'horizon : sans elle, un piéton lisant l'échelle de son point de fuite se
 *   croirait à des kilomètres d'altitude et passerait sous les seuils d'affichage du décor.
 */
export function viewScaleDistance(picked: number | null, altitude: number, cap: number): number {
  if (cap > 0) return Math.min(picked ?? cap, cap)
  return picked ?? altitude
}

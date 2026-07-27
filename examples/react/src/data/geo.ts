import { type LatLng, MapMath } from 'map3d'

/**
 * Décale un point de `eastM` mètres vers l'est et `northM` vers le nord.
 *
 * Primitive commune au tracé des emprises de bâtiments (`shapes.ts`) et au pas des
 * agents (`agents.ts`) : sans elle, chacun réécrivait sa conversion mètres → degrés,
 * avec sa propre copie du rayon terrestre. `MapMath.M_PER_DEG` est la constante que
 * la lib elle-même utilise — la démo montre où la prendre plutôt qu'un `111320` de
 * plus.
 *
 * Approximation équirectangulaire : exacte à quelques centimètres sur les distances
 * en jeu ici (un bâtiment, un pas de patrouille).
 */
export const offsetMeters = (from: LatLng, eastM: number, northM: number): LatLng => {
  const mPerDegLng = MapMath.M_PER_DEG * Math.cos(from.lat * MapMath.DEG2RAD)
  return {
    lat: from.lat + northM / MapMath.M_PER_DEG,
    lng: from.lng + eastM / mPerDegLng,
  }
}

/** Composantes (est, nord) d'un déplacement de `distanceM` suivant un cap en radians. */
export const moveAlong = (from: LatLng, headingRad: number, distanceM: number): LatLng =>
  offsetMeters(from, Math.sin(headingRad) * distanceM, Math.cos(headingRad) * distanceM)

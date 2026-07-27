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

/**
 * Angle d'or (rad) : la suite des caps `i × GOLDEN` ne se referme jamais sur elle-même,
 * donc deux points générés ne se superposent pas, quel que soit leur nombre.
 */
export const GOLDEN = 2.399963

/**
 * `index`-ième point d'une spirale de Vogel autour d'`origin`.
 *
 * Rayon en √index — la densité reste CONSTANTE à mesure que la couronne grandit, là où
 * un rayon linéaire tasserait tout au centre puis n'y mettrait plus rien.
 *
 * Partagée par les renforts d'agents et les points de renfort de `data/generate` : les
 * deux avaient recopié la même recette (angle d'or + √), avec leur propre littéral
 * `2.399963` et leur propre copie du commentaire qui l'explique.
 */
export const vogel = (origin: LatLng, index: number, spacingM: number): LatLng =>
  moveAlong(origin, index * GOLDEN, spacingM * Math.sqrt(index + 1))

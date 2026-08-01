// Tracés de démonstration — la couche `<PathLayer>` du banc d'essai.
//
// Deux parcours par ville, dérivés de son centre : le banc doit rester utilisable quelle
// que soit la ville choisie, et des coordonnées écrites à la main n'auraient marché que
// pour Paris. Ce sont des rubans drapés sur le relief, pas des itinéraires calculés — le
// routage réel, lui, passe par le moteur de relations.

import type { LatLng } from '@pasquelin/map3d'
import { CITIES, CITY_LIST, type CityId } from './cities'
import type { PathData } from '@pasquelin/map3d'

/**
 * Chemin en arc de cercle autour d'un centre, échantillonné en `steps` points.
 *
 * Assez de points pour que le drapage suive le relief (un tracé de deux points sauterait
 * les creux), assez peu pour rester lisible dans l'inspecteur.
 */
function arc(center: LatLng, radiusMeters: number, fromDeg: number, toDeg: number, steps = 24): LatLng[] {
  const points: LatLng[] = []
  // Mètres → degrés à CETTE latitude : sans le cosinus, l'arc s'aplatit vers le nord.
  const dLat = radiusMeters / 111_320
  const dLng = radiusMeters / (111_320 * Math.cos((center.lat * Math.PI) / 180))
  for (let i = 0; i <= steps; i++) {
    const rad = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180
    points.push({ lat: center.lat + dLat * Math.sin(rad), lng: center.lng + dLng * Math.cos(rad) })
  }
  return points
}

/**
 * Deux tracés autour du centre d'une ville : une boucle large et une diagonale plus
 * courte, de couleurs distinctes pour montrer que chaque tracé porte la sienne.
 *
 * Les rayons sont relatifs à `radiusMeters` de la ville : les mêmes tracés se lisent
 * aussi bien sur Paris (11 km) que sur Vernon (5 km).
 */
export function demoPaths(city: CityId): PathData[] {
  const { center, radiusMeters } = CITIES[city]
  const r = radiusMeters * 0.35
  return [
    // `erasable: true` : la gomme (mode sélection ou ponctuel) peut les effacer — la lib
    // remonte leur id via `onErase`, à l'app de les retirer (cf. `App.tsx`).
    { id: `${city}-boucle`, points: arc(center, r, -30, 210), width: 8, erasable: true },
    {
      id: `${city}-diagonale`,
      points: arc(center, r * 0.55, 200, 340, 16),
      color: '#f2b441',
      width: 6,
      erasable: true,
    },
  ]
}

/**
 * Les tracés de toutes les villes du banc — même patron que `DEMO_SHAPES`.
 *
 * Constante et non calculée au rendu : ces points ne dépendent d'aucun état, et une
 * nouvelle référence à chaque rendu ferait reconstruire les rubans par la couche.
 */
export const DEMO_PATHS: PathData[] = CITY_LIST.flatMap((c) => demoPaths(c.id))

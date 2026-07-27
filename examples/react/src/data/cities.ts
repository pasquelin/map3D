import type { LatLng } from 'map3d'

/* ══════════════════ VILLES DE LA DÉMO ══════════════════
   Trois terrains réels, choisis pour leurs contrastes : une métropole dense (Paris),
   une ville littorale étalée entre aéroport, stade et vieille ville (Nice) et une
   ville moyenne de Normandie (Vernon). Les données de `alerts.ts`, `agents.ts` et
   `shapes.ts` s'y rattachent par le même identifiant, qui sert aussi de TAG (filtre
   « Couches » : on isole une ville d'un clic). */

export type CityId = 'paris' | 'nice' | 'vernon'

export type City = {
  id: CityId
  label: string
  /** Centre opérationnel — cible du cadrage « Villes › ». */
  center: LatLng
  /**
   * Rayon de couverture, en mètres : ce que dessine la zone drapée de la ville et
   * ce à quoi le dessin est CONTRAINT (`draw.constraints.limits`, satisfait dès
   * qu'une seule limite contient la forme).
   */
  radiusMeters: number
  /** Zoom de confort pour se poser sur la ville. */
  zoom: number
}

export const CITIES: Record<CityId, City> = {
  // 11 km : Paris intra-muros ET la petite couronne opérationnelle (La Défense, le
  // Stade de France), qui portent des sites de la démo.
  paris: { id: 'paris', label: 'Paris', center: { lat: 48.8566, lng: 2.3522 }, radiusMeters: 11000, zoom: 14 },
  // Centre décalé vers l'ouest du vrai centre-ville : il faut tenir à la fois le
  // Vieux-Nice, l'aéroport et l'Allianz Riviera dans le même rayon.
  nice: { id: 'nice', label: 'Nice', center: { lat: 43.698, lng: 7.245 }, radiusMeters: 6000, zoom: 13 },
  vernon: { id: 'vernon', label: 'Vernon', center: { lat: 49.091, lng: 1.475 }, radiusMeters: 5000, zoom: 14 },
}

export const CITY_LIST: City[] = [CITIES.paris, CITIES.nice, CITIES.vernon]

/** Centre initial de la carte. Les deux autres villes s'atteignent par « Villes › ». */
export const PARIS = CITIES.paris.center

/** Point de contrôle précision (marqueur + cible du bouton « Recentrer »). */
export const TEST_POINT = { lat: 49.095441, lng: 1.378192 }

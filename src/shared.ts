// Primitives géographiques partagées par toutes les couches (core, data, providers).

export type LatLng = { lat: number; lng: number }

/**
 * Cadre géographique (aligné sur `MapViewport.bounds` d'operator).
 *
 * Convention Google (celle des viewports Places) : `east < west` signifie que le
 * cadre **franchit l'antiméridien** (±180°) — par exemple Fidji, `west: 176.8` /
 * `east: -178.0`. Un `east - west` naïf y donne une amplitude négative absurde :
 * les consommateurs doivent traiter ce cas.
 */
export type Bounds = { north: number; south: number; east: number; west: number }

/**
 * Résultat de recherche de lieu (SearchBox, providers de recherche). `bounds` =
 * viewport du lieu quand le provider le fournit — sert à calculer le zoom adapté.
 */
export type SearchResult = LatLng & { name: string; description?: string; bounds?: Bounds }

/** Égalité de deux ensembles : même taille ET mêmes éléments. */
export function sameSet<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

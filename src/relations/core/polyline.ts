// Décodeur de polyligne encodée Google (format « Encoded Polyline Algorithm »).
// Pur et sans dépendance : c'est ce qui permet au core de rester interrogeable
// sans réseau, avec un fournisseur de routage factice.

import type { LatLng } from '../../shared'

/** Précision du format : les coordonnées sont transportées en 1e-5 degré. */
const PRECISION = 1e5

/**
 * Décode une polyligne encodée en liste de points. Une chaîne tronquée ou
 * corrompue s'arrête sur ce qui a pu être lu plutôt que de lever : un tracé
 * partiel reste exploitable, une exception ferait disparaître tout l'itinéraire.
 */
export function decodePolyline(encoded: string): LatLng[] {
  const out: LatLng[] = []
  let index = 0
  let lat = 0
  let lng = 0
  while (index < encoded.length) {
    const dLat = readValue()
    if (dLat === null) break
    const dLng = readValue()
    if (dLng === null) break
    lat += dLat
    lng += dLng
    out.push({ lat: lat / PRECISION, lng: lng / PRECISION })
  }
  return out

  /** Lit un entier zigzag/base64 à la position courante, `null` si le groupe est incomplet. */
  function readValue(): number | null {
    let result = 0
    let shift = 0
    // Sans valeur initiale : le corps de la boucle l'affecte avant que la condition
    // ne la lise, et un `0` de départ laisserait croire à un état qui n'existe pas.
    let byte: number
    do {
      if (index >= encoded.length) return null
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    // Bit de poids faible = signe (encodage zigzag).
    return result & 1 ? ~(result >> 1) : result >> 1
  }
}

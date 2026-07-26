// Géométrie sphérique du moteur de relations — PUR : aucune dépendance à Three,
// React ou au DOM. `Projection.groundDistance` ne convient pas ici : c'est une
// corde 3D couplée au tileset, alors que la sélection doit rester calculable
// sans carte montée (menu, tests, rendu serveur).

import { clamp, DEG2RAD, EARTH_CIRCUMFERENCE, M_PER_DEG, RAD2DEG } from '../../core/math'
import type { Bounds, LatLng } from '../../shared'

/** Rayon terrestre moyen, dérivé de la circonférence — jamais un littéral concurrent. */
const EARTH_RADIUS = EARTH_CIRCUMFERENCE / (2 * Math.PI)

/** Distance orthodromique (m). SEULE implémentation de haversine du dépôt. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG2RAD
  const dLng = (b.lng - a.lng) * DEG2RAD
  const la = a.lat * DEG2RAD
  const lb = b.lat * DEG2RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Azimut initial de `from` vers `to`, en degrés dans [0, 360). */
export function bearingDeg(from: LatLng, to: LatLng): number {
  const la = from.lat * DEG2RAD
  const lb = to.lat * DEG2RAD
  const dLng = (to.lng - from.lng) * DEG2RAD
  const y = Math.sin(dLng) * Math.cos(lb)
  const x = Math.cos(la) * Math.sin(lb) - Math.sin(la) * Math.cos(lb) * Math.cos(dLng)
  return (Math.atan2(y, x) * RAD2DEG + 360) % 360
}

/** Bornes de subdivision : en dessous de 2 il n'y a pas de segment, au-delà de 256 la
 *  géométrie coûte plus qu'elle n'apporte (le drapage lisse déjà le relief). */
const MIN_STEPS = 2
const MAX_STEPS = 256

/**
 * Échantillonne le grand cercle a→b tous les `stepMeters`. Indispensable au rendu :
 * un groupe drapé n'a qu'UNE hauteur d'ancre, donc un lien de plusieurs kilomètres
 * tracé en un seul segment traverserait le relief au lieu de le suivre.
 */
export function greatCirclePoints(a: LatLng, b: LatLng, stepMeters: number): LatLng[] {
  const distance = haversineMeters(a, b)
  const steps = Math.max(MIN_STEPS, Math.min(MAX_STEPS, Math.ceil(distance / Math.max(1, stepMeters))))
  const delta = distance / EARTH_RADIUS
  // Points confondus (ou quasi) : l'interpolation sphérique dégénère (sin(δ) → 0).
  if (delta < 1e-9) return [a, b]
  const la = a.lat * DEG2RAD
  const lna = a.lng * DEG2RAD
  const lb = b.lat * DEG2RAD
  const lnb = b.lng * DEG2RAD
  const sinDelta = Math.sin(delta)
  const out: LatLng[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const wa = Math.sin((1 - t) * delta) / sinDelta
    const wb = Math.sin(t * delta) / sinDelta
    const x = wa * Math.cos(la) * Math.cos(lna) + wb * Math.cos(lb) * Math.cos(lnb)
    const y = wa * Math.cos(la) * Math.sin(lna) + wb * Math.cos(lb) * Math.sin(lnb)
    const z = wa * Math.sin(la) + wb * Math.sin(lb)
    out.push({ lat: Math.atan2(z, Math.hypot(x, y)) * RAD2DEG, lng: Math.atan2(y, x) * RAD2DEG })
  }
  return out
}

/**
 * Azimuts des pattes d'un éventail de cluster. L'arc s'ouvre à l'OPPOSÉ du tronc
 * (`trunkBearingDeg + 180`) : les pattes s'écartent de la ligne d'arrivée au lieu
 * de la recouvrir. Une patte unique part droit dans l'axe.
 */
export function fanLegs(trunkBearingDeg: number, count: number, spreadDeg: number): number[] {
  if (count <= 0) return []
  const center = (trunkBearingDeg + 180) % 360
  if (count === 1) return [center]
  const start = center - spreadDeg / 2
  const step = spreadDeg / (count - 1)
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push((start + step * i + 360) % 360)
  return out
}

/** Point atteint depuis `from` en suivant `bearing` (degrés) sur `distanceMeters`. */
export function destinationPoint(from: LatLng, bearingDeg: number, distanceMeters: number): LatLng {
  const delta = distanceMeters / EARTH_RADIUS
  const theta = bearingDeg * DEG2RAD
  const la = from.lat * DEG2RAD
  const lat = Math.asin(Math.sin(la) * Math.cos(delta) + Math.cos(la) * Math.sin(delta) * Math.cos(theta))
  const lng =
    from.lng * DEG2RAD +
    Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(la), Math.cos(delta) - Math.sin(la) * Math.sin(lat))
  return { lat: lat * RAD2DEG, lng: lng * RAD2DEG }
}

/**
 * Cadre géo englobant un disque de `radiusMeters` autour d'un point. Sert à
 * restreindre l'inventaire de markers interrogé : la sélection doit couvrir le
 * voisinage réel de la source, pas seulement ce qui est à l'écran.
 */
export function boundsAround(center: LatLng, radiusMeters: number): Bounds {
  const dLat = radiusMeters / M_PER_DEG
  // Le degré de longitude se resserre avec la latitude ; le plancher évite une
  // amplitude infinie au voisinage des pôles.
  const dLng = radiusMeters / (M_PER_DEG * Math.max(0.01, Math.cos(center.lat * DEG2RAD)))
  const north = clamp(center.lat + dLat, -90, 90)
  const south = clamp(center.lat - dLat, -90, 90)
  // Une amplitude qui fait le tour ne peut plus être décrite par un couple est/ouest :
  // le repli en cadre global évite un intervalle vide (est < ouest sans franchissement
  // réel), qui ne sélectionnerait plus RIEN au lieu de tout.
  if (dLng >= 180) return { north, south, east: 180, west: -180 }
  return {
    north,
    south,
    // Longitudes ramenées dans [-180, 180]. `boundsContains` gère le cadre à cheval
    // sur l'antiméridien (`west > east`) — mais seulement si les bornes y sont : une
    // source à 179° produisait sinon `east: 179.1…` hors domaine, donc aucune cible.
    east: wrapLng(center.lng + dLng),
    west: wrapLng(center.lng - dLng),
  }
}

/** Ramène une longitude dans [-180, 180). */
function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

/**
 * Cellule de grille d'un point, en mètres. Sert de composante de clé de cache :
 * un marker mobile invalide son entrée en franchissant une cellule, ce qu'un TTL
 * seul ne ferait pas (un point mobile garderait un temps de trajet périmé).
 */
export function quantizeKey(p: LatLng, cellMeters: number): string {
  const latCell = Math.round((p.lat * M_PER_DEG) / cellMeters)
  // Le pas de longitude se resserre avec la latitude — sans le cosinus, une cellule
  // ferait des kilomètres en est-ouest près des pôles.
  const cos = Math.max(0.01, Math.cos(p.lat * DEG2RAD))
  const lngCell = Math.round((p.lng * M_PER_DEG * cos) / cellMeters)
  return `${latCell}:${lngCell}`
}

// Primitives mathématiques pures : aucune dépendance à Three ni au DOM — testables
// et SSR-safe. Seuls les helpers réellement consommés par le moteur sont conservés.

export const DEG2RAD = Math.PI / 180
export const RAD2DEG = 180 / Math.PI

/** Circonférence terrestre (m) — base des conversions zoom ↔ altitude ↔ résolution. */
export const EARTH_CIRCUMFERENCE = 40_075_016
/** Mètres par degré de latitude (approx. équirectangulaire, suffisant < 1 km). */
export const M_PER_DEG = 111_320

/** Résolution sol Web-Mercator (m/px, tuiles 256 px) à un zoom et une latitude —
 *  SOURCE UNIQUE de la constante ~156543 : ne pas la réécrire en littéral. */
export function metersPerPixelAtZoom(zoom: number, latDeg: number): number {
  return ((EARTH_CIRCUMFERENCE / 256) * Math.cos(latDeg * DEG2RAD)) / 2 ** zoom
}

export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x
}

/** Plus court delta angulaire (degrés) de `from` vers `to`, dans [-180, 180]. */
export function shortestLngDelta(from: number, to: number): number {
  return (((to - from + 540) % 360) - 180)
}

/** Interpolation lissée cubique C1 symétrique (t ∈ [0,1]). */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

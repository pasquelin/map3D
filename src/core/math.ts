// Primitives mathématiques pures : aucune dépendance à Three ni au DOM — testables
// et SSR-safe. Seuls les helpers réellement consommés par le moteur sont conservés.

export const DEG2RAD = Math.PI / 180
export const RAD2DEG = 180 / Math.PI

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

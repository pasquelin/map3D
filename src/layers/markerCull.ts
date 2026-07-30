/**
 * Marker dans le cadre du canvas, `margin` pixels de tolérance comprise.
 *
 * Extrait de `MarkerLayer.project` pour être testable seul : c'est la moitié « écran » du
 * verdict de cull, l'autre (dos de la caméra) relevant de la géométrie 3D — cf.
 * `Projection.isBehindCamera`.
 */
export function isInsideFrame(sx: number, sy: number, width: number, height: number, margin: number): boolean {
  return sx >= -margin && sy >= -margin && sx <= width + margin && sy <= height + margin
}

/**
 * Marker à portée de vue. Prend le carré de la distance : c'est un test par marker et par
 * frame, et la racine n'apporterait rien qu'une élévation au carré ne fasse aussi bien.
 *
 * `maxMeters <= 0` = aucune borne. C'est le cas hors mode piéton, où la scène s'étend
 * jusqu'à l'horizon et où c'est l'occlusion par le globe qui décide.
 */
export function isWithinViewDistance(distanceSquared: number, maxMeters: number): boolean {
  return maxMeters <= 0 || distanceSquared <= maxMeters * maxMeters
}

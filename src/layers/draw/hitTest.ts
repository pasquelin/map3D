import { clamp } from '../../core/math'

/** Point écran en pixels. */
export type ScreenPt = { x: number; y: number }

/** Rectangle écran min/max en pixels. */
export type ScreenBBox = { minX: number; minY: number; maxX: number; maxY: number }

/** Distance point→segment en pixels. */
export function segDistPx(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** true si `p` est à l'intérieur du polygone (ray casting, bords inclus au pixel près). */
export function pointInPolygon(p: ScreenPt, poly: readonly ScreenPt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** true si les segments [a,b] et [c,d] se croisent (orientation signée, colinéaires exclus). */
export function segmentsIntersect(a: ScreenPt, b: ScreenPt, c: ScreenPt, d: ScreenPt): boolean {
  const o = (p: ScreenPt, q: ScreenPt, r: ScreenPt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const o1 = o(a, b, c)
  const o2 = o(a, b, d)
  const o3 = o(c, d, a)
  const o4 = o(c, d, b)
  return o1 * o2 < 0 && o3 * o4 < 0
}

/**
 * Sémantique « touche = sélectionné » (façon Figma) entre le contour d'une forme
 * et un polygone sélecteur **fermé** : un sommet de la forme dans le sélecteur,
 * OU un sommet du sélecteur dans la forme (si elle est fermée), OU une arête qui
 * en croise une autre.
 */
export function shapeTouchesSelector(
  shape: readonly ScreenPt[],
  shapeClosed: boolean,
  selector: readonly ScreenPt[],
): boolean {
  if (shape.length === 0 || selector.length < 3) return false
  for (const p of shape) if (pointInPolygon(p, selector)) return true
  if (shapeClosed && shape.length >= 3) {
    for (const p of selector) if (pointInPolygon(p, shape)) return true
  }
  const shapeSegs = shapeClosed ? shape.length : shape.length - 1
  for (let i = 0; i < shapeSegs; i++) {
    const a = shape[i]!
    const b = shape[(i + 1) % shape.length]!
    for (let j = 0; j < selector.length; j++) {
      if (segmentsIntersect(a, b, selector[j]!, selector[(j + 1) % selector.length]!)) return true
    }
  }
  return false
}

/** Bbox écran d'un ensemble de points (null si vide). */
export function screenBBox(points: readonly ScreenPt[]): ScreenBBox | null {
  if (points.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

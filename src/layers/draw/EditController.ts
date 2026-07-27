import type { InteractionConfig } from '../../config/types'
import { EnuFrame } from '../../core/enu'
import { type Pt, diagonalToCorners } from '../../core/geometry'
import type { Projection } from '../../core/Projection'
import type { LatLng } from '../../shared'
import type { Drawing } from '../DrawLayer'
import type { ScreenPt } from './hitTest'

/** Poignée : coin/arête de la boîte de transformation, ou sommet d'une polyligne. */
export type HandleId =
  | { type: 'scale'; u: 0 | 0.5 | 1; v: 0 | 0.5 | 1 }
  | { type: 'vertex'; shapeId: string; index: number }

export type HandleSpec = { id: HandleId; x: number; y: number; kind: 'scale' | 'vertex'; cursor: string }

/** Contrat fourni par DrawLayer — l'EditController ne touche jamais aux structures privées. */
export type EditHost = {
  /** Formes sélectionnées éditables (jamais verrouillées). */
  targets(): Drawing[]
  anchorHeight(d: Drawing): number
  toScreen(p: LatLng, height: number): ScreenPt | null
  /** Snapshot d'historique de l'état courant — appelé une fois au début du geste. */
  snapshotBefore(): void
  /** Reconstruction (throttlée côté host) pendant le geste. */
  afterMutate(changed: readonly Drawing[]): void
  /** Fin de geste : invalidation hauteurs/mpp + rebuild final + émission. */
  commit(changed: readonly Drawing[]): void
  /** Seuils de geste courants — relu à l'usage, la config changeant à chaud. */
  interaction(): InteractionConfig
}

/** Repère de transformation : orienté (axes propres d'un rect seul) ou aligné ENU. */
type Basis = { O: Pt; U: Pt; V: Pt; w: number; h: number }

type Target = { d: Drawing; orig: Pt[] }

type Gesture = {
  kind: 'move' | 'scale' | 'vertex'
  frame: EnuFrame
  targets: Target[]
  basis: Basis
  center: Pt
  start: Pt
  handle?: { u: number; v: number }
  vertexIndex?: number
  rotating: boolean
}

const VERTEX_KINDS = new Set(['polygon', 'line', 'measure', 'arrow'])

/** Formes stockées en quad de 4 coins : repère propre, 8 poignées, homothétie. */
function isQuad(kind: string): boolean {
  return kind === 'rect'
}

/**
 * Transformations des formes sélectionnées, calculées dans un plan ENU commun
 * ancré à la 1ʳᵉ forme : déplacement (drag du corps), rotation (Maj pendant le
 * drag, autour du centre), redimensionnement par poignées (coins = 2 axes, arêtes
 * = 1 axe, Maj sur coin = homothétie), déplacement de sommet. Les mutations vont
 * dans `Drawing.points` (lat/lng) — le drapage/rendu existant fait le reste.
 */
export class EditController {
  private gesture: Gesture | null = null

  constructor(
    private readonly projection: Projection,
    private readonly host: EditHost,
  ) {}

  get active(): boolean {
    return this.gesture !== null
  }

  /** true pendant la rotation d'une forme (Maj + drag du corps) — curseur dédié. */
  get rotating(): boolean {
    return this.gesture?.kind === 'move' && this.gesture.rotating
  }

  /** Drag du corps : translation, Maj = rotation. */
  beginMove(cursor: LatLng): boolean {
    return this.begin('move', cursor)
  }

  /** Drag d'une poignée de la boîte de transformation. */
  beginScale(cursor: LatLng, handle: { u: number; v: number }): boolean {
    return this.begin('scale', cursor, handle)
  }

  /** Drag d'un sommet (polygone, ligne, mesure, flèche). */
  beginVertex(cursor: LatLng, shapeId: string, index: number): boolean {
    const target = this.host.targets().find((d) => d.id === shapeId)
    if (!target || index >= target.points.length) return false
    return this.begin('vertex', cursor, undefined, index, target)
  }

  private begin(
    kind: Gesture['kind'],
    cursor: LatLng,
    handle?: { u: number; v: number },
    vertexIndex?: number,
    vertexTarget?: Drawing,
  ): boolean {
    const ds = kind === 'vertex' && vertexTarget ? [vertexTarget] : this.host.targets()
    if (ds.length === 0) return false
    this.host.snapshotBefore()
    // Normalisation : un rect encore stocké en 2 points diagonaux passe en 4 coins
    // (les transformations libres — rotation, scale oblique — exigent 4 sommets).
    for (const d of ds) {
      if (isQuad(d.kind) && d.points.length < 4) this.normalizeRect(d)
    }
    const ref = ds[0]!
    const frame = new EnuFrame(this.projection, ref.points[0]!, this.host.anchorHeight(ref))
    const targets: Target[] = ds.map((d) => ({ d, orig: d.points.map((p) => frame.local(p)) }))
    const basis = computeBasis(targets)
    this.gesture = {
      kind,
      frame,
      targets,
      basis,
      center: fromUV(basis, 0.5, 0.5),
      start: frame.local(cursor),
      handle,
      vertexIndex,
      rotating: false,
    }
    return true
  }

  /** Position curseur suivante (latLng pické) — mutation + rebuild throttlé. */
  move(cursor: LatLng | null, shift: boolean): void {
    const g = this.gesture
    if (!g || !cursor) return
    const cur = g.frame.local(cursor)
    if (g.kind === 'move') {
      // Bascule translation ↔ rotation en plein drag : on fige (« bake ») l'état
      // courant comme nouvelle référence — y compris basis et CENTRE, sinon la
      // rotation orbiterait autour de la position d'avant la translation.
      if (shift !== g.rotating) {
        for (const t of g.targets) t.orig = t.d.points.map((p) => g.frame.local(p))
        g.basis = computeBasis(g.targets)
        g.center = fromUV(g.basis, 0.5, 0.5)
        g.start = cur
        g.rotating = shift
      }
      if (g.rotating) {
        const a0 = Math.atan2(g.start.z - g.center.z, g.start.x - g.center.x)
        const a1 = Math.atan2(cur.z - g.center.z, cur.x - g.center.x)
        this.apply(g, (p) => rotate(p, g.center, a1 - a0))
      } else {
        const dx = cur.x - g.start.x
        const dz = cur.z - g.start.z
        this.apply(g, (p) => ({ x: p.x + dx, z: p.z + dz }))
      }
      return
    }
    if (g.kind === 'vertex') {
      const t = g.targets[0]!
      t.d.points[g.vertexIndex!] = g.frame.toLatLng(cur)
      this.host.afterMutate([t.d])
      return
    }
    // scale
    const h = g.handle!
    const [cu, cv] = toUV(g.basis, cur)
    const au = h.u === 0.5 ? 0.5 : 1 - h.u
    const av = h.v === 0.5 ? 0.5 : 1 - h.v
    let su = h.u === 0.5 ? 1 : clampScale((cu - au) / (h.u - au), this.host.interaction().minScale)
    let sv = h.v === 0.5 ? 1 : clampScale((cv - av) / (h.v - av), this.host.interaction().minScale)
    if (shift && h.u !== 0.5 && h.v !== 0.5) {
      // Homothétie : le facteur dominant s'applique aux deux axes.
      const s = Math.abs(su - 1) > Math.abs(sv - 1) ? su : sv
      su = s
      sv = s
    }
    this.apply(g, (p) => {
      const [pu, pv] = toUV(g.basis, p)
      return fromUV(g.basis, au + (pu - au) * su, av + (pv - av) * sv)
    })
  }

  /** Fin du geste (pointer up) : commit (invalidation hauteurs, rebuild, émission). */
  end(): void {
    const g = this.gesture
    this.gesture = null
    if (g) this.host.commit(g.targets.map((t) => t.d))
  }

  /** Annule le geste : restaure la géométrie de départ. */
  cancel(): void {
    const g = this.gesture
    this.gesture = null
    if (!g) return
    for (const t of g.targets) t.d.points = t.orig.map((p) => g.frame.toLatLng(p))
    this.host.commit(g.targets.map((t) => t.d))
  }

  /** Abandonne le geste SANS commit ni restauration — les cibles ne sont plus
   *  valides (suppression, undo, remplacement de collection pendant le drag). */
  abort(): void {
    this.gesture = null
  }

  /**
   * Poignées de la sélection courante en px écran : boîte orientée (rect seul) ou
   * alignée ENU, 4 coins pour un cercle, sommets des polylignes. Recalculé chaque
   * frame par le host (passe projection).
   */
  layout(): HandleSpec[] {
    const ds = this.host.targets()
    if (ds.length === 0) return []
    const ref = ds[0]!
    if (ref.points.length === 0) return []
    const height = this.host.anchorHeight(ref)
    const frame = new EnuFrame(this.projection, ref.points[0]!, height)
    const basis = computeBasis(ds.map((d) => ({ d, orig: d.points.map((p) => frame.local(p)) })))
    const specs: HandleSpec[] = []

    const singleCircle = ds.length === 1 && ref.kind === 'circle'
    const corners: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    const edges: Array<[number, number]> = [
      [0.5, 0],
      [1, 0.5],
      [0.5, 1],
      [0, 0.5],
    ]
    const boxHandles = singleCircle ? corners : [...corners, ...edges]
    const centerScreen = this.host.toScreen(frame.toLatLng(fromUV(basis, 0.5, 0.5)), height)
    for (const [u, v] of boxHandles) {
      const s = this.host.toScreen(frame.toLatLng(fromUV(basis, u, v)), height)
      if (!s) continue
      specs.push({
        id: { type: 'scale', u: u as 0 | 0.5 | 1, v: v as 0 | 0.5 | 1 },
        x: s.x,
        y: s.y,
        kind: 'scale',
        cursor: centerScreen ? resizeCursor(s, centerScreen) : 'nwse-resize',
      })
    }
    // Poignées par sommet : une seule polyligne sélectionnée.
    if (ds.length === 1 && VERTEX_KINDS.has(ref.kind)) {
      for (let i = 0; i < ref.points.length; i++) {
        const s = this.host.toScreen(ref.points[i]!, height)
        if (!s) continue
        specs.push({ id: { type: 'vertex', shapeId: ref.id, index: i }, x: s.x, y: s.y, kind: 'vertex', cursor: 'move' })
      }
    }
    return specs
  }

  private apply(g: Gesture, fn: (p: Pt) => Pt): void {
    for (const t of g.targets) {
      for (let i = 0; i < t.orig.length; i++) {
        t.d.points[i] = g.frame.toLatLng(fn(t.orig[i]!))
      }
    }
    this.host.afterMutate(g.targets.map((t) => t.d))
  }

  /** 2 points diagonaux → 4 coins stockés (repère propre de la forme, drapage inchangé). */
  private normalizeRect(d: Drawing): void {
    const frame = new EnuFrame(this.projection, d.points[0]!, this.host.anchorHeight(d))
    const corners = diagonalToCorners(frame.local(d.points[0]!), frame.local(d.points[d.points.length - 1]!))
    d.points = corners.map((p) => frame.toLatLng(p))
  }
}

function computeBasis(targets: readonly Target[]): Basis {
  const first = targets[0]!
  if (targets.length === 1 && isQuad(first.d.kind) && first.orig.length >= 4) {
    // Axes propres du quad (possiblement tourné) : le resize suit ses arêtes.
    const [p0, p1, , p3] = first.orig as [Pt, Pt, Pt, Pt]
    const w = Math.max(Math.hypot(p1.x - p0.x, p1.z - p0.z), 1e-6)
    const h = Math.max(Math.hypot(p3.x - p0.x, p3.z - p0.z), 1e-6)
    return {
      O: p0,
      U: { x: (p1.x - p0.x) / w, z: (p1.z - p0.z) / w },
      V: { x: (p3.x - p0.x) / h, z: (p3.z - p0.z) / h },
      w,
      h,
    }
  }
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  const grow = (x: number, z: number) => {
    if (x < minX) minX = x
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (z > maxZ) maxZ = z
  }
  for (const t of targets) {
    if (t.d.kind === 'circle' && t.orig.length >= 2) {
      const [c, e] = t.orig as [Pt, Pt]
      const r = Math.hypot(e.x - c.x, e.z - c.z)
      grow(c.x - r, c.z - r)
      grow(c.x + r, c.z + r)
    } else {
      for (const p of t.orig) grow(p.x, p.z)
    }
  }
  return {
    O: { x: minX, z: minZ },
    U: { x: 1, z: 0 },
    V: { x: 0, z: 1 },
    w: Math.max(maxX - minX, 1e-6),
    h: Math.max(maxZ - minZ, 1e-6),
  }
}

function toUV(b: Basis, p: Pt): [number, number] {
  const rx = p.x - b.O.x
  const rz = p.z - b.O.z
  return [(rx * b.U.x + rz * b.U.z) / b.w, (rx * b.V.x + rz * b.V.z) / b.h]
}

function fromUV(b: Basis, u: number, v: number): Pt {
  return { x: b.O.x + b.U.x * u * b.w + b.V.x * v * b.h, z: b.O.z + b.U.z * u * b.w + b.V.z * v * b.h }
}

function rotate(p: Pt, c: Pt, ang: number): Pt {
  const cos = Math.cos(ang)
  const sin = Math.sin(ang)
  const dx = p.x - c.x
  const dz = p.z - c.z
  return { x: c.x + dx * cos - dz * sin, z: c.z + dx * sin + dz * cos }
}

function clampScale(s: number, min: number): number {
  if (!Number.isFinite(s)) return 1
  if (Math.abs(s) < min) return s < 0 ? -min : min
  return s
}

/** Curseur de resize selon l'angle écran poignée→centre (gère les boîtes tournées). */
function resizeCursor(handle: ScreenPt, center: ScreenPt): string {
  const ang = (Math.atan2(handle.y - center.y, handle.x - center.x) * 180) / Math.PI
  const a = ((ang % 360) + 360) % 360
  if (a < 22.5 || a >= 337.5) return 'ew-resize'
  if (a < 67.5) return 'nwse-resize'
  if (a < 112.5) return 'ns-resize'
  if (a < 157.5) return 'nesw-resize'
  if (a < 202.5) return 'ew-resize'
  if (a < 247.5) return 'nwse-resize'
  if (a < 292.5) return 'ns-resize'
  return 'nesw-resize'
}

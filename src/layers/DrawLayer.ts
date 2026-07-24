import * as THREE from 'three'
import { EnuFrame } from '../core/enu'
import type { FrameContext, Layer } from '../core/Layer'
import type { PointerInterceptor, PointerPhase } from '../core/MapEngine'
import type { Projection } from '../core/Projection'
import { clamp } from '../core/math'
import { type Pt, arrowHead, circlePoints, disposeObject3D, fillGeo, fillMaterial, ribbon, strokeMaterial } from '../core/geometry'
import type { LatLng } from '../shared'

export type DrawTool = 'line' | 'polygon' | 'rect' | 'circle' | 'freehand' | 'arrow' | 'measure' | 'erase'
export type DrawDefaults = { color: string; width: number; fillOpacity: number }

export type Drawing = {
  id: string
  kind: DrawTool
  points: LatLng[]
  color: string
  width: number
  fillOpacity: number
  closed: boolean
}

type GeoJSONFeature = {
  type: 'Feature'
  geometry: { type: 'LineString'; coordinates: number[][] } | { type: 'Polygon'; coordinates: number[][][] }
  properties: { kind: DrawTool; color: string; width: number; fillOpacity: number }
}
export type GeoJSONFeatureCollection = { type: 'FeatureCollection'; features: GeoJSONFeature[] }

let seq = 0
const nextId = () => `draw-${seq++}`

/**
 * Outils de dessin sur le globe : formes stockées en lat/lng et drapées en plan
 * tangent (ENU). Le picking renvoie directement des lat/lng (intersection
 * ellipsoïde). Ligne, polygone (clics + Entrée), rectangle, cercle, main levée,
 * flèche, mesure (label ancré), gomme, annuler, tout effacer, GeoJSON in/out.
 */
export class DrawLayer implements Layer {
  readonly group = new THREE.Group()

  tool: DrawTool | null = null
  defaults: DrawDefaults

  private drawings: Drawing[] = []
  private live: Drawing | null = null
  private mode: 'idle' | 'click' | 'drag' = 'idle'
  private readonly meshes = new Map<string, THREE.Group>()
  private readonly labels = new Map<string, HTMLDivElement>()
  private readonly camScratch = new THREE.Vector3()
  private lastCamera: THREE.Camera | null = null
  /** true quand le curseur aimante le 1er sommet du polygone (fermeture facile). */
  private snapping = false

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly projection: Projection,
    private readonly overlay: HTMLElement,
    defaults: DrawDefaults,
    private renderOrder = 4,
    private onChange?: (geojson: GeoJSONFeatureCollection) => void,
  ) {
    this.group.name = 'm3d-draw'
    this.defaults = defaults
    this.scene.add(this.group)
  }

  setTool(tool: DrawTool | null): void {
    // Un polygone en cours (mode clic) est VALIDÉ au changement d'outil au lieu
    // d'être jeté — sinon cliquer sur « main » fait disparaître le tracé.
    if (this.live && this.mode === 'click' && this.live.kind === 'polygon') this.closeCurrent()
    else this.cancelLive()
    this.tool = tool
  }

  setDefaults(d: Partial<DrawDefaults>): void {
    this.defaults = { ...this.defaults, ...d }
  }

  readonly interceptor: PointerInterceptor = (phase, latLng) => {
    if (!this.tool) return false
    if (!latLng) return true
    if (this.tool === 'erase') {
      if (phase === 'down') this.eraseAt(latLng)
      return true
    }
    return this.handleDraw(phase, latLng)
  }

  private handleDraw(phase: PointerPhase, p: LatLng): boolean {
    if (!this.tool) return false
    if (this.tool === 'polygon') {
      if (phase === 'down') {
        if (this.live && this.mode === 'click') {
          // Aimant : clic près du 1er sommet (≥3 sommets posés) → ferme le polygone.
          const first = this.live.points[0]!
          if (this.live.points.length >= 4 && (this.snapping || this.nearFirst(first, p))) {
            this.snapping = false
            this.closeCurrent()
            return true
          }
          this.live.points.push(p)
        } else {
          // 2 points au départ (sommet figé + point élastique) → N clics = N sommets.
          this.startLive(p, 'click', [p, { ...p }])
        }
        this.rebuildLive()
      } else if (phase === 'move' && this.live) {
        const first = this.live.points[0]!
        // Colle l'arête d'aperçu au 1er sommet quand on en est proche (fermeture facile).
        this.snapping = this.nearFirst(first, p)
        this.live.points[this.live.points.length - 1] = this.snapping ? { ...first } : p
        this.rebuildLive()
      }
      return true
    }
    if (this.tool === 'freehand') {
      if (phase === 'down') this.startLive(p, 'drag')
      else if (phase === 'move' && this.live) {
        const last = this.live.points[this.live.points.length - 1]!
        if (this.projection.groundDistance(last, p) > Math.max(2, this.defaults.width * 0.4)) {
          this.live.points.push(p)
          this.rebuildLive()
        }
      } else if (phase === 'up') this.commitLive()
      return true
    }
    if (phase === 'down') this.startLive(p, 'drag', [p, p])
    else if (phase === 'move' && this.live) {
      this.live.points[this.live.points.length - 1] = p
      this.rebuildLive()
    } else if (phase === 'up') this.commitLive()
    return true
  }

  closeCurrent(): void {
    if (!this.live) return
    if (this.live.kind === 'polygon') {
      this.live.points.pop()
      this.live.closed = this.live.points.length > 2
    }
    this.commitLive()
  }

  private startLive(p: LatLng, mode: 'click' | 'drag', points?: LatLng[]): void {
    if (!this.tool) return
    this.live = {
      id: nextId(),
      kind: this.tool,
      points: points ?? [p],
      color: this.defaults.color,
      width: this.defaults.width,
      fillOpacity: this.defaults.fillOpacity,
      closed: this.tool === 'rect' || this.tool === 'circle',
    }
    this.mode = mode
  }

  private commitLive(): void {
    const d = this.live
    this.live = null
    this.mode = 'idle'
    if (!d) return
    if (d.points.length < 2) {
      this.removeMeshes(d.id)
      return
    }
    this.drawings.push(d)
    this.rebuildOne(d, false)
    this.emitChange()
  }

  private cancelLive(): void {
    if (!this.live) return
    this.removeMeshes(this.live.id)
    this.live = null
    this.mode = 'idle'
  }

  undo(): void {
    const d = this.drawings.pop()
    if (!d) return
    this.removeMeshes(d.id)
    this.emitChange()
  }

  clear(): void {
    for (const d of this.drawings) this.removeMeshes(d.id)
    this.drawings = []
    this.cancelLive()
    this.emitChange()
  }

  private eraseAt(p: LatLng): void {
    const sp = this.toScreen(p)
    if (!sp) return
    const TOL = 14
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i]!
      const scr: Array<{ x: number; y: number }> = []
      for (const q of d.points) {
        const s = this.toScreen(q)
        if (s) scr.push(s)
      }
      if (scr.length === 0) continue
      let hit = false
      if (scr.length === 1) {
        hit = Math.hypot(sp.x - scr[0]!.x, sp.y - scr[0]!.y) < TOL
      } else {
        const segs = d.closed ? scr.length : scr.length - 1
        for (let k = 0; k < segs; k++) {
          const a = scr[k]!
          const b = scr[(k + 1) % scr.length]!
          if (DrawLayer.segDistPx(sp.x, sp.y, a.x, a.y, b.x, b.y) < TOL) {
            hit = true
            break
          }
        }
      }
      if (hit) {
        this.removeMeshes(d.id)
        this.drawings.splice(i, 1)
        this.emitChange()
        return
      }
    }
  }

  // ── Rendu (drapé ENU) ──

  private localGeometry(d: Drawing, frame: EnuFrame): { points: Pt[]; closed: boolean } {
    if (d.kind === 'rect' && d.points.length >= 2) {
      const a = frame.local(d.points[0]!)
      const b = frame.local(d.points[d.points.length - 1]!)
      return { points: [a, { x: b.x, z: a.z }, b, { x: a.x, z: b.z }], closed: true }
    }
    if (d.kind === 'circle' && d.points.length >= 2) {
      const c = frame.local(d.points[0]!)
      const e = frame.local(d.points[d.points.length - 1]!)
      const r = Math.hypot(e.x - c.x, e.z - c.z)
      return { points: circlePoints(c, r, 48), closed: true }
    }
    return { points: d.points.map((p) => frame.local(p)), closed: d.closed }
  }

  private rebuildOne(d: Drawing, preview: boolean): void {
    this.removeMeshes(d.id)
    if (!this.projection.isReady() || d.points.length < 1) return
    const frame = new EnuFrame(this.projection, d.points[0]!)
    const { points, closed } = this.localGeometry(d, frame)

    const enu = frame.group()

    if (closed && points.length > 2 && d.fillOpacity > 0) {
      const fg = fillGeo(points)
      if (fg) {
        const m = new THREE.Mesh(fg, fillMaterial(d.color, d.fillOpacity * (preview ? 0.6 : 1)))
        m.renderOrder = this.renderOrder
        enu.add(m)
      }
    }
    const rg = ribbon(points, d.width, closed)
    if (rg) {
      const m = new THREE.Mesh(rg, strokeMaterial(d.color, preview ? 0.6 : 0.95))
      m.renderOrder = this.renderOrder + 1
      enu.add(m)
    }
    if (d.kind === 'arrow') {
      const ah = arrowHead(points, d.width)
      if (ah) {
        const m = new THREE.Mesh(ah, strokeMaterial(d.color, preview ? 0.6 : 0.95))
        m.renderOrder = this.renderOrder + 1
        enu.add(m)
      }
    }
    this.group.add(enu)
    this.meshes.set(d.id, enu)
    if (d.kind === 'measure') this.ensureLabel(d)
  }

  private rebuildLive(): void {
    if (this.live) this.rebuildOne(this.live, true)
  }

  private removeMeshes(id: string): void {
    const g = this.meshes.get(id)
    if (g) {
      disposeObject3D(g)
      this.group.remove(g)
      this.meshes.delete(id)
    }
    const label = this.labels.get(id)
    if (label) {
      label.remove()
      this.labels.delete(id)
    }
  }

  private ensureLabel(d: Drawing): void {
    let label = this.labels.get(d.id)
    if (!label) {
      label = document.createElement('div')
      label.className = 'm3d-measure-label'
      this.overlay.appendChild(label)
      this.labels.set(d.id, label)
    }
    label.textContent = formatDistance(this.measureLength(d.points))
  }

  private measureLength(points: LatLng[]): number {
    let total = 0
    for (let i = 0; i < points.length - 1; i++) total += this.projection.groundDistance(points[i]!, points[i + 1]!)
    return total
  }

  update(_ctx: FrameContext): void {}

  /** Projette un lat/lng en pixels écran (null si derrière la caméra / non prêt). */
  private toScreen(p: LatLng): { x: number; y: number } | null {
    if (!this.lastCamera) return null
    const w = this.projection.latLngToWorld(p, this.camScratch)
    const s = this.projection.worldToScreen(w, this.lastCamera)
    return s.z <= 1 ? { x: s.sx, y: s.sy } : null
  }

  /** Curseur proche du 1er sommet à l'écran (≥3 sommets posés) → aimant de fermeture. */
  private nearFirst(first: LatLng, cur: LatLng): boolean {
    if (!this.live || this.live.points.length < 4) return false
    const a = this.toScreen(first)
    const b = this.toScreen(cur)
    return !!(a && b && Math.hypot(a.x - b.x, a.y - b.y) < 16)
  }

  /** Distance point→segment en pixels. */
  private static segDistPx(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }

  project(ctx: FrameContext): void {
    this.lastCamera = ctx.camera
    for (const [id, label] of this.labels) {
      const d = this.drawings.find((x) => x.id === id) ?? (this.live?.id === id ? this.live : null)
      if (!d || d.points.length < 2) {
        label.style.display = 'none'
        continue
      }
      const mid = d.points[Math.floor(d.points.length / 2)]!
      const world = this.projection.latLngToWorld(mid)
      const visible = this.projection.isAboveHorizon(world, ctx.camera.position)
      const s = this.projection.worldToScreen(world, ctx.camera)
      const show = visible && s.z <= 1
      label.style.display = show ? 'block' : 'none'
      if (show) label.style.transform = `translate3d(${s.sx}px, ${s.sy}px, 0) translate(-50%, -50%)`
    }
  }

  toGeoJSON(): GeoJSONFeatureCollection {
    return {
      type: 'FeatureCollection',
      features: this.drawings.map((d) => {
        const coords = d.points.map((p) => [p.lng, p.lat])
        const props = { kind: d.kind, color: d.color, width: d.width, fillOpacity: d.fillOpacity }
        if (d.closed) {
          const ring = [...coords, coords[0]!]
          return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: props }
        }
        return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: props }
      }),
    }
  }

  fromGeoJSON(fc: GeoJSONFeatureCollection): void {
    this.clear()
    for (const f of fc.features) {
      const props = f.properties
      const coords = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0]! : f.geometry.coordinates
      const points = coords.map((c) => ({ lng: c[0]!, lat: c[1]! }))
      const d: Drawing = {
        id: nextId(),
        kind: props.kind,
        points,
        color: props.color,
        width: props.width,
        fillOpacity: props.fillOpacity,
        closed: f.geometry.type === 'Polygon',
      }
      this.drawings.push(d)
      this.rebuildOne(d, false)
    }
    this.emitChange()
  }

  private emitChange(): void {
    this.onChange?.(this.toGeoJSON())
  }

  dispose(): void {
    for (const d of [...this.drawings]) this.removeMeshes(d.id)
    this.cancelLive()
    this.drawings = []
    this.scene.remove(this.group)
  }
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}

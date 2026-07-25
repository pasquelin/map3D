import * as THREE from 'three'
import { EnuFrame } from '../core/enu'
import { HEIGHT_EPSILON, HeightResettle, MPP_BAND, UNRESOLVED_RETRY_FRAMES } from '../core/resettle'
import type { FrameContext, Layer } from '../core/Layer'
import type { PointerInterceptor, PointerPhase } from '../core/MapEngine'
import type { Projection } from '../core/Projection'
import { clamp } from '../core/math'
import { type Pt, arrowHead, circlePoints, disposeObject3D, fillGeo, fillMaterial, ribbon, strokeMaterial } from '../core/geometry'
import type { LatLng } from '../shared'

export type DrawTool = 'line' | 'polygon' | 'rect' | 'circle' | 'freehand' | 'arrow' | 'measure' | 'erase'
/** `width` : épaisseur de trait en **pixels écran** (constante au zoom, comme toute carte). */
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
  /** Index id → dessin, maintenu avec `drawings` : les boucles par frame font des
   *  lookups O(1) au lieu de `drawings.find` O(n) (O(n²) par frame sinon). */
  private readonly byId = new Map<string, Drawing>()
  private live: Drawing | null = null
  private mode: 'idle' | 'click' | 'drag' = 'idle'
  private readonly meshes = new Map<string, THREE.Group>()
  /**
   * Hauteur de drapage (m au-dessus de l'ellipsoïde) par dessin, à l'ancre : SANS
   * elle, les formes seraient rendues à h=0 sur l'ellipsoïde, ~50–100 m sous la
   * surface visible → décalage au curseur et glissement au pan (parallaxe).
   * `null` = **non résolue** (tuiles absentes) : le repli est utilisé sans jamais
   * être mémoïsé comme définitif — la fenêtre resettle reste ouverte jusqu'à
   * résolution. Invalidée au changement de `Projection.heightEpoch` (bascule 2D/3D)
   * et raffinée par lots après mouvement caméra (streaming LOD).
   */
  private readonly heights = new Map<string, number | null>()
  private heightEpoch = -1
  private readonly resettle = new HeightResettle()
  private groupEpochSeen = -1
  private stableRuns = 0
  private retryTick = 0
  /**
   * Résolution (m/px) utilisée au dernier build de chaque dessin. L'épaisseur de
   * trait est un style **écran** (px) convertie en mètres à la construction : quand
   * le zoom fait dériver la résolution hors d'une bande d'hystérésis (±25 %), la
   * géométrie est reconstruite — jamais de rebuild par frame.
   */
  private readonly builtMpp = new Map<string, number>()
  private viewH = 1
  private readonly labels = new Map<string, HTMLDivElement>()
  private readonly camScratch = new THREE.Vector3()
  private lastCamera: THREE.Camera | null = null
  /** true quand le curseur aimante le 1er sommet du polygone (fermeture facile). */
  private snapping = false

  constructor(
    /** Parent — utiliser `engine.annotations` pour hériter du masquage pendant l'intro. */
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
        // Décimation en px écran (convertie en mètres à la résolution courante).
        const minMeters = Math.max(2, this.defaults.width * 0.4) * this.mppFor(this.live)
        if (this.projection.groundDistance(last, p) > minMeters) {
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
      this.dropDrawing(d.id)
      return
    }
    this.drawings.push(d)
    this.byId.set(d.id, d)
    this.rebuildOne(d, false)
    this.emitChange()
  }

  private cancelLive(): void {
    if (!this.live) return
    this.dropDrawing(this.live.id)
    this.live = null
    this.mode = 'idle'
  }

  undo(): void {
    const d = this.drawings.pop()
    if (!d) return
    this.byId.delete(d.id)
    this.dropDrawing(d.id)
    this.emitChange()
  }

  clear(): void {
    for (const d of this.drawings) this.dropDrawing(d.id)
    this.drawings = []
    this.byId.clear()
    this.cancelLive()
    this.emitChange()
  }

  private eraseAt(p: LatLng): void {
    const TOL = 14
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i]!
      // Curseur et sommets projetés À LA MÊME hauteur (celle du dessin) : comparés à
      // des hauteurs différentes, la parallaxe fausserait la tolérance en px.
      const h = this.heightFor(d)
      const sp = this.toScreen(p, h)
      if (!sp) continue
      const scr: Array<{ x: number; y: number }> = []
      for (const q of d.points) {
        const s = this.toScreen(q, h)
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
        this.dropDrawing(d.id)
        this.drawings.splice(i, 1)
        this.byId.delete(d.id)
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

  /** Dessin (commité ou en cours) portant cet id — lookup O(1). */
  private drawingFor(id: string): Drawing | null {
    return this.byId.get(id) ?? (this.live?.id === id ? this.live : null)
  }

  /**
   * Hauteur de drapage du dessin : mémoïsée quand elle est **résolue** (raycast ayant
   * touché une tuile, ou plan 2D), puis raffinée par la fenêtre resettle. Non résolue
   * (`null`) → repli renvoyé SANS mémoïsation définitive, retenté via la fenêtre.
   */
  private heightFor(d: Drawing): number {
    const cached = this.heights.get(d.id)
    if (cached !== undefined && cached !== null) return cached
    if (cached === undefined) {
      const h = this.projection.resolveAnchorHeight(d.points[0]!)
      this.heights.set(d.id, h)
      // Tuiles fines de la zone en cours de streaming : re-échantillonnage à suivre.
      this.resettle.open()
      if (h !== null) return h
    }
    return this.projection.surfaceFallbackHeight
  }

  /** Résolution courante (m/px) à l'ancre du dessin — 1 tant que la caméra est inconnue. */
  private mppFor(d: Drawing): number {
    if (!this.lastCamera || d.points.length < 1) return 1
    return this.projection.metersPerPixel(d.points[0]!, this.lastCamera, this.viewH, this.heightFor(d))
  }

  private rebuildOne(d: Drawing, preview: boolean): void {
    this.removeMeshes(d.id)
    const height = this.heightFor(d)
    if (!this.projection.isReady() || d.points.length < 1) return
    const frame = new EnuFrame(this.projection, d.points[0]!, height)
    const { points, closed } = this.localGeometry(d, frame)
    // Épaisseur de trait : px écran → mètres monde à la résolution courante.
    const mpp = this.mppFor(d)
    const widthMeters = d.width * mpp
    this.builtMpp.set(d.id, mpp)

    const enu = frame.group()

    if (closed && points.length > 2 && d.fillOpacity > 0) {
      const fg = fillGeo(points)
      if (fg) {
        const m = new THREE.Mesh(fg, fillMaterial(d.color, d.fillOpacity * (preview ? 0.6 : 1)))
        m.renderOrder = this.renderOrder
        enu.add(m)
      }
    }
    const rg = ribbon(points, widthMeters, closed)
    if (rg) {
      const m = new THREE.Mesh(rg, strokeMaterial(d.color, preview ? 0.6 : 0.95))
      m.renderOrder = this.renderOrder + 1
      enu.add(m)
    }
    if (d.kind === 'arrow') {
      const ah = arrowHead(points, widthMeters)
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

  /** Retire meshes + label d'un dessin (rebuildable : les mémos hauteur/mpp survivent). */
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

  /** Oublie complètement un dessin supprimé : meshes, label ET mémos hauteur/mpp. */
  private dropDrawing(id: string): void {
    this.removeMeshes(id)
    this.heights.delete(id)
    this.builtMpp.delete(id)
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

  update(ctx: FrameContext): void {
    this.lastCamera = ctx.camera
    this.viewH = ctx.size.height
    let heightsChanged = false
    // Bascule 2D/3D : la surface de référence change → hauteurs re-résolues.
    if (this.heightEpoch !== this.projection.heightEpoch) {
      this.heightEpoch = this.projection.heightEpoch
      this.heights.clear()
      this.resettle.open()
      this.stableRuns = 0
      heightsChanged = true
    }
    // `note` sert aussi de garde « caméra immobile » : bande d'épaisseur et bases
    // sont sautées intégralement au repos.
    const camMoved = this.resettle.note(ctx.cameraState)
    if (camMoved) this.stableRuns = 0

    // Suit le raffinement des tuiles (LOD) par petits lots amortis.
    const ids = this.resettle.batch(this.meshes.size)
    if (ids.length > 0) {
      const keys = [...this.meshes.keys()]
      for (const i of ids) {
        const id = keys[i]!
        const d = this.drawingFor(id)
        if (!d || d.points.length < 1) continue
        const h = this.projection.resolveAnchorHeight(d.points[0]!)
        if (h === null) continue
        const prev = this.heights.get(id)
        if (prev == null || Math.abs(h - prev) > HEIGHT_EPSILON) {
          this.heights.set(id, h)
          heightsChanged = true
          this.stableRuns = 0
        } else {
          this.stableRuns++
        }
      }
    }
    // Cycle complet stable → fenêtre fermée tôt.
    if (this.meshes.size > 0 && this.stableRuns >= this.meshes.size) {
      this.resettle.close()
      this.stableRuns = 0
    }
    // Ancres jamais résolues : retentative à basse cadence, ciblée sur elles seules.
    if (++this.retryTick % UNRESOLVED_RETRY_FRAMES === 0) {
      for (const [id, h] of this.heights) {
        if (h !== null) continue
        const d = this.drawingFor(id)
        if (!d || d.points.length < 1) continue
        const nh = this.projection.resolveAnchorHeight(d.points[0]!)
        if (nh !== null) {
          this.heights.set(id, nh)
          heightsChanged = true
        }
      }
    }

    // Épaisseur px écran : le ratio ne peut changer que si caméra/hauteurs ont bougé.
    if (camMoved || heightsChanged) {
      let toRebuild: Drawing[] | null = null
      for (const [id] of this.meshes) {
        const d = this.drawingFor(id)
        const built = this.builtMpp.get(id)
        if (!d || built === undefined) continue
        const ratio = this.mppFor(d) / built
        if (ratio > MPP_BAND || ratio < 1 / MPP_BAND) (toRebuild ??= []).push(d)
      }
      if (toRebuild) for (const d of toRebuild) this.rebuildOne(d, d === this.live)
    }
    // Bases ENU : recalées au rebase du tileset ou au changement de hauteur seulement
    // (un rebuild arrive déjà avec sa base fraîche) — jamais par frame au repos.
    const gEpoch = this.projection.groupEpoch()
    if (gEpoch !== this.groupEpochSeen || heightsChanged) {
      this.groupEpochSeen = gEpoch
      this.refreshBases()
    }
  }

  /**
   * Recale la base ENU (matrice figée) de chaque forme depuis son ancre. Le tileset
   * **rebase son origine** quand la caméra s'éloigne (`group.matrixWorld` change,
   * cf. Projection) : sans ce recalage, la géométrie drapée resterait dans l'ancien
   * repère monde et **dériverait** sous la carte au pan (2D comme 3D). La géométrie
   * locale 2D est invariante au rebase (transformée rigide) — seule la base doit
   * suivre. Appelé au rebase et au changement de hauteur, pas par frame.
   */
  private refreshBases(): void {
    if (!this.projection.isReady()) return
    for (const [id, enu] of this.meshes) {
      const d = this.drawingFor(id)
      if (!d || d.points.length < 1) continue
      this.projection.enuBasisFor(d.points[0]!, enu.matrix, this.heightFor(d))
      enu.matrixWorldNeedsUpdate = true
    }
  }

  /** Projette un lat/lng (à `height` m) en pixels écran (null si derrière la caméra / non prêt). */
  private toScreen(p: LatLng, height = 0): { x: number; y: number } | null {
    if (!this.lastCamera) return null
    const w = this.projection.latLngToWorld(p, this.camScratch, height)
    const s = this.projection.worldToScreen(w, this.lastCamera)
    return s.z <= 1 ? { x: s.sx, y: s.sy } : null
  }

  /** Curseur proche du 1er sommet à l'écran (≥3 sommets posés) → aimant de fermeture. */
  private nearFirst(first: LatLng, cur: LatLng): boolean {
    if (!this.live || this.live.points.length < 4) return false
    const h = this.heightFor(this.live)
    const a = this.toScreen(first, h)
    const b = this.toScreen(cur, h)
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
      const d = this.drawingFor(id)
      if (!d || d.points.length < 2) {
        label.style.display = 'none'
        continue
      }
      const mid = d.points[Math.floor(d.points.length / 2)]!
      const world = this.projection.latLngToWorld(mid, undefined, this.heightFor(d))
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
      this.byId.set(d.id, d)
      this.rebuildOne(d, false)
    }
    this.emitChange()
  }

  private emitChange(): void {
    this.onChange?.(this.toGeoJSON())
  }

  dispose(): void {
    for (const d of [...this.drawings]) this.dropDrawing(d.id)
    this.cancelLive()
    this.drawings = []
    this.byId.clear()
    this.scene.remove(this.group)
  }
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}

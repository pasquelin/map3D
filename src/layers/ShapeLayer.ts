import * as THREE from 'three'
import { EnuFrame } from '../core/enu'
import type { FrameContext, Layer } from '../core/Layer'
import type { Projection } from '../core/Projection'
import { DrapeSync } from '../core/resettle'
import { type Pt, circlePoints, clearGroup, disposeObject3D, fillGeo, fillMaterial, ribbon, strokeMaterial } from '../core/geometry'
import type { Bounds, LatLng } from '../shared'

/** `width` : épaisseur de trait en **pixels écran** (constante au zoom). */
export type ShapeStyle = { color?: string; width?: number; fillOpacity?: number }

export type ShapeData = ShapeStyle &
  (
    | { id?: string | number; kind: 'polygon'; points: LatLng[] }
    | { id?: string | number; kind: 'line'; points: LatLng[] }
    | { id?: string | number; kind: 'arrow'; points: LatLng[] }
    | { id?: string | number; kind: 'rect'; bounds: Bounds }
    | { id?: string | number; kind: 'circle'; center: LatLng; radiusMeters: number }
  )

export type ShapeLayerDefaults = { color: string; width: number; fillOpacity: number; renderOrder: number }

/** Zones/formes drapées sur le globe (plan tangent ENU, plaquées à la surface). */
export class ShapeLayer implements Layer {
  readonly group = new THREE.Group()
  private shapes: ShapeData[] = []
  // Groupes drapés : ancre, hauteur de drapage (surface visible à l'ancre — évite la
  // parallaxe d'une forme rendue à h=0 sous le sol), résolution m/px au build (épaisseur
  // px écran) et la forme source (rebuild individuel). `height: null` = non résolue
  // (tuiles absentes au build) : repli utilisé, retentée par le protocole DrapeSync —
  // jamais mémoïsée comme définitive.
  private readonly drapes: { enu: THREE.Group; anchor: LatLng; height: number | null; mpp: number; shape: ShapeData }[] = []
  /** Protocole partagé : raffinement LOD, bande d'épaisseur, bases ENU (cf. core/resettle). */
  private readonly sync: DrapeSync
  private lastCamera: THREE.Camera | null = null
  private viewH = 1

  constructor(
    /** Parent — utiliser `engine.annotations` pour hériter du masquage pendant l'intro. */
    private readonly scene: THREE.Object3D,
    private readonly projection: Projection,
    private defaults: ShapeLayerDefaults,
  ) {
    this.group.name = 'm3d-shapes'
    this.scene.add(this.group)
    this.sync = new DrapeSync(projection, {
      count: () => this.drapes.length,
      getHeight: (i) => this.drapes[i]!.height,
      setHeight: (i, h) => {
        this.drapes[i]!.height = h
      },
      resolve: (i) => this.projection.resolveAnchorHeight(this.drapes[i]!.anchor),
      mppRatio: (i) => {
        const d = this.drapes[i]!
        return this.mpp(d.anchor, d.height ?? this.projection.surfaceFallbackHeight) / d.mpp
      },
      rebuild: (i) => this.rebuildDrape(i),
      remove: (i) => {
        this.drapes.splice(i, 1)
      },
      applyBasis: (i) => {
        const d = this.drapes[i]!
        this.projection.enuBasisFor(d.anchor, d.enu.matrix, d.height ?? this.projection.surfaceFallbackHeight)
        d.enu.matrixWorldNeedsUpdate = true
      },
    })
  }

  setShapes(shapes: ShapeData[]): void {
    this.shapes = shapes
    this.rebuild()
  }

  setDefaults(d: Partial<ShapeLayerDefaults>): void {
    this.defaults = { ...this.defaults, ...d }
    this.rebuild()
  }

  private anchor(shape: ShapeData): LatLng {
    if (shape.kind === 'circle') return shape.center
    if (shape.kind === 'rect') {
      return { lat: (shape.bounds.north + shape.bounds.south) / 2, lng: (shape.bounds.east + shape.bounds.west) / 2 }
    }
    return shape.points[0] ?? { lat: 0, lng: 0 }
  }

  private localPoints(shape: ShapeData, frame: EnuFrame): { points: Pt[]; closed: boolean } {
    switch (shape.kind) {
      case 'polygon':
        return { points: shape.points.map((p) => frame.local(p)), closed: true }
      case 'line':
      case 'arrow':
        return { points: shape.points.map((p) => frame.local(p)), closed: false }
      case 'rect': {
        const b = shape.bounds
        return {
          points: [
            frame.local({ lat: b.north, lng: b.west }),
            frame.local({ lat: b.north, lng: b.east }),
            frame.local({ lat: b.south, lng: b.east }),
            frame.local({ lat: b.south, lng: b.west }),
          ],
          closed: true,
        }
      }
      case 'circle': {
        const c = frame.local(shape.center)
        return { points: circlePoints(c, shape.radiusMeters, 64), closed: true }
      }
    }
  }

  /**
   * Construit le groupe drapé d'une forme. `height` null = non résolue (repli utilisé
   * pour la géométrie, ré-affinée ensuite par la fenêtre resettle).
   */
  private buildDrape(
    shape: ShapeData,
    height: number | null,
  ): { enu: THREE.Group; anchor: LatLng; height: number | null; mpp: number; shape: ShapeData } | null {
    const anchor = this.anchor(shape)
    const h = height ?? this.projection.surfaceFallbackHeight
    const frame = new EnuFrame(this.projection, anchor, h)
    const { points, closed } = this.localPoints(shape, frame)
    if (points.length < 2) return null

    const color = shape.color ?? this.defaults.color
    const fillOpacity = shape.fillOpacity ?? this.defaults.fillOpacity
    // Épaisseur de trait : px écran → mètres monde à la résolution courante.
    const mpp = this.mpp(anchor, h)
    const width = (shape.width ?? this.defaults.width) * mpp
    const enu = frame.group()

    if (closed && points.length > 2 && fillOpacity > 0) {
      const fg = fillGeo(points)
      if (fg) {
        const m = new THREE.Mesh(fg, fillMaterial(color, fillOpacity))
        m.renderOrder = this.defaults.renderOrder
        enu.add(m)
      }
    }
    const rg = ribbon(points, width, closed)
    if (rg) {
      const m = new THREE.Mesh(rg, strokeMaterial(color))
      m.renderOrder = this.defaults.renderOrder + 1
      enu.add(m)
    }
    return { enu, anchor, height, mpp, shape }
  }

  private rebuild(): void {
    clearGroup(this.group)
    this.drapes.length = 0
    if (!this.projection.isReady()) return
    for (const shape of this.shapes) {
      const d = this.buildDrape(shape, this.projection.resolveAnchorHeight(this.anchor(shape)))
      if (!d) continue
      this.drapes.push(d)
      this.group.add(d.enu)
    }
    // Les tuiles fines de la zone arrivent en streaming : re-échantillonnage à suivre.
    this.sync.invalidate()
  }

  /** Reconstruit UNE forme (bande d'épaisseur franchie) en réutilisant sa hauteur mémoïsée
   *  — pas de raycast ni de rebuild global. Renvoie false si la forme est devenue invalide. */
  private rebuildDrape(i: number): boolean {
    const old = this.drapes[i]!
    disposeObject3D(old.enu)
    this.group.remove(old.enu)
    const d = this.buildDrape(old.shape, old.height)
    if (!d) return false
    this.drapes[i] = d
    this.group.add(d.enu)
    return true
  }

  /** Résolution courante (m/px) à l'ancre — 1 tant que la caméra est inconnue. */
  private mpp(anchor: LatLng, height: number): number {
    if (!this.lastCamera) return 1
    return this.projection.metersPerPixel(anchor, this.lastCamera, this.viewH, height)
  }

  update(ctx: FrameContext): void {
    this.lastCamera = ctx.camera
    this.viewH = ctx.size.height
    if (!this.projection.isReady()) return
    this.sync.update(ctx.cameraState)
  }
  project(_ctx: FrameContext): void {}
  dispose(): void {
    clearGroup(this.group)
    this.drapes.length = 0
    this.scene.remove(this.group)
  }
}

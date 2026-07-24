import * as THREE from 'three'
import { EnuFrame } from '../core/enu'
import type { FrameContext, Layer } from '../core/Layer'
import type { Projection } from '../core/Projection'
import { circlePoints, clearGroup, fillGeo, fillMaterial, ribbon, strokeMaterial } from '../core/geometry'
import type { LatLng } from '../shared'

export type PathData = {
  id?: string | number
  points: LatLng[]
  color?: string
  width?: number
  casing?: boolean
  casingColor?: string
}

export type PathLayerDefaults = {
  color: string
  casingColor: string
  width: number
  casingWidth: number
  renderOrder: number
}

type Head = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }

/** Tracés/parcours drapés sur le globe (ENU) avec point courant animé (trace GPS). */
export class PathLayer implements Layer {
  readonly group = new THREE.Group()
  private paths: PathData[] = []
  private heads: Head[] = []
  private time = 0

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly projection: Projection,
    private defaults: PathLayerDefaults,
    private animateHead = true,
  ) {
    this.group.name = 'm3d-paths'
    this.scene.add(this.group)
  }

  setPaths(paths: PathData[]): void {
    this.paths = paths
    this.rebuild()
  }

  setAnimateHead(v: boolean): void {
    this.animateHead = v
    this.rebuild()
  }

  setDefaults(d: Partial<PathLayerDefaults>): void {
    this.defaults = { ...this.defaults, ...d }
    this.rebuild()
  }

  private rebuild(): void {
    clearGroup(this.group)
    this.heads = []
    if (!this.projection.isReady()) return
    for (const path of this.paths) {
      if (path.points.length < 2) continue
      const frame = new EnuFrame(this.projection, path.points[0]!)
      const pts = path.points.map((p) => frame.local(p))
      const width = path.width ?? this.defaults.width
      const color = path.color ?? this.defaults.color

      const enu = frame.group()

      if (path.casing ?? true) {
        const cg = ribbon(pts, width + this.defaults.casingWidth, false)
        if (cg) {
          const mesh = new THREE.Mesh(cg, strokeMaterial(path.casingColor ?? this.defaults.casingColor, 0.9))
          mesh.renderOrder = this.defaults.renderOrder
          enu.add(mesh)
        }
      }
      const mg = ribbon(pts, width, false)
      if (mg) {
        const mesh = new THREE.Mesh(mg, strokeMaterial(color))
        mesh.renderOrder = this.defaults.renderOrder + 1
        enu.add(mesh)
      }
      if (this.animateHead) {
        const head = pts[pts.length - 1]!
        const ring = fillGeo(circlePoints({ x: 0, z: 0 }, width * 1.6, 24))
        if (ring) {
          const mat = fillMaterial(color, 0.5)
          const mesh = new THREE.Mesh(ring, mat)
          mesh.position.set(head.x, 0, head.z)
          mesh.renderOrder = this.defaults.renderOrder + 2
          enu.add(mesh)
          this.heads.push({ mesh, mat })
        }
      }
      this.group.add(enu)
    }
  }

  update(ctx: FrameContext): void {
    if (this.heads.length === 0) return
    this.time += ctx.dt
    const t = (this.time % 1.6) / 1.6
    const scale = 1 + t * 1.4
    const opacity = 0.5 * (1 - t)
    for (const head of this.heads) {
      head.mesh.scale.set(scale, scale, scale)
      head.mat.opacity = opacity
    }
  }

  project(_ctx: FrameContext): void {}

  dispose(): void {
    clearGroup(this.group)
    this.scene.remove(this.group)
  }
}

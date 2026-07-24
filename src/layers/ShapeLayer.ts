import * as THREE from 'three'
import { EnuFrame } from '../core/enu'
import type { FrameContext, Layer } from '../core/Layer'
import type { Projection } from '../core/Projection'
import { type Pt, circlePoints, clearGroup, fillGeo, fillMaterial, ribbon, strokeMaterial } from '../core/geometry'
import type { Bounds, LatLng } from '../shared'

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

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly projection: Projection,
    private defaults: ShapeLayerDefaults,
  ) {
    this.group.name = 'm3d-shapes'
    this.scene.add(this.group)
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

  private rebuild(): void {
    clearGroup(this.group)
    if (!this.projection.isReady()) return
    for (const shape of this.shapes) {
      const color = shape.color ?? this.defaults.color
      const width = shape.width ?? this.defaults.width
      const fillOpacity = shape.fillOpacity ?? this.defaults.fillOpacity
      const frame = new EnuFrame(this.projection, this.anchor(shape))
      const { points, closed } = this.localPoints(shape, frame)
      if (points.length < 2) continue

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
      this.group.add(enu)
    }
  }

  update(_ctx: FrameContext): void {}
  project(_ctx: FrameContext): void {}
  dispose(): void {
    clearGroup(this.group)
    this.scene.remove(this.group)
  }
}

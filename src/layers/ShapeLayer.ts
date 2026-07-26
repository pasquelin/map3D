import * as THREE from 'three'
import { EnuFrame } from '../core/enu'
import type { Projection } from '../core/Projection'
import { type Pt, circlePoints, fillGeo, fillMaterial, ribbon, strokeMaterial } from '../core/geometry'
import type { Bounds, LatLng } from '../shared'
import { type Drape, DrapedLayer } from './DrapedLayer'

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

/**
 * Zones/formes drapées sur le globe (plan tangent ENU, plaquées à la surface).
 * Le protocole de drapage (mémoïsation des hauteurs, raffinement LOD, rebuild à la
 * bande d'épaisseur, rebase) vient de `DrapedLayer` : il ne reste ici que la
 * géométrie propre aux formes.
 */
export class ShapeLayer extends DrapedLayer<ShapeData> {
  private shapes: ShapeData[] = []

  constructor(
    scene: THREE.Object3D,
    projection: Projection,
    private defaults: ShapeLayerDefaults,
  ) {
    super(scene, projection, 'm3d-shapes')
  }

  setShapes(shapes: ShapeData[]): void {
    this.shapes = shapes
    this.rebuildAll(this.shapes)
  }

  setDefaults(d: Partial<ShapeLayerDefaults>): void {
    this.defaults = { ...this.defaults, ...d }
    this.rebuildAll(this.shapes)
  }

  protected anchorOf(shape: ShapeData): LatLng {
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

  protected buildDrape(shape: ShapeData, height: number | null): Drape<ShapeData> | null {
    const anchor = this.anchorOf(shape)
    const h = this.heightOr(height)
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
    return { enu, anchor, height, mpp, item: shape }
  }
}

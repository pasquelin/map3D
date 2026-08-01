import * as THREE from 'three'
import { EnuFrame } from '../core/enu'
import type { FrameContext } from '../core/Layer'
import type { Projection } from '../core/Projection'
import { circlePoints, fillGeo, fillMaterial, ribbon, strokeMaterial } from '../core/geometry'
import type { LatLng } from '../shared'
import { type Drape, DrapedLayer } from './DrapedLayer'

/** `width`/`casingWidth` : épaisseurs de trait en **pixels écran** (constantes au zoom). */
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

/** Drape d'un tracé : le groupe standard, plus la tête animée du point courant. */
type PathDrape = Drape<PathData> & { head: Head | null }

/**
 * Tracés/parcours drapés sur le globe (ENU) avec point courant animé (trace GPS).
 * Le protocole de drapage vient de `DrapedLayer` ; il ne reste ici que la géométrie
 * du ruban et l'animation de la tête.
 */
export class PathLayer extends DrapedLayer<PathData, PathDrape> {
  protected readonly statKind = 'paths' as const

  private paths: PathData[] = []
  private time = 0

  constructor(
    scene: THREE.Object3D,
    projection: Projection,
    private defaults: PathLayerDefaults,
    private animateHead = true,
  ) {
    super(scene, projection, 'm3d-paths')
  }

  setPaths(paths: PathData[]): void {
    this.paths = paths
    this.rebuildAll(this.paths)
  }

  setAnimateHead(v: boolean): void {
    this.animateHead = v
    this.rebuildAll(this.paths)
  }

  setDefaults(d: Partial<PathLayerDefaults>): void {
    this.defaults = { ...this.defaults, ...d }
    this.rebuildAll(this.paths)
  }

  protected anchorOf(path: PathData): LatLng {
    return path.points[0] ?? { lat: 0, lng: 0 }
  }

  /** Construit le groupe drapé d'un tracé (casing + trait + tête animée). */
  protected buildDrape(path: PathData, height: number | null): PathDrape | null {
    if (path.points.length < 2) return null
    const anchor = this.anchorOf(path)
    const h = this.heightOr(height)
    const frame = new EnuFrame(this.projection, anchor, h)
    const pts = path.points.map((p) => frame.local(p))
    // Épaisseurs de trait : px écran → mètres monde à la résolution courante.
    const mpp = this.mpp(anchor, h)
    const width = (path.width ?? this.defaults.width) * mpp
    const color = path.color ?? this.defaults.color

    const enu = frame.group()
    let head: Head | null = null

    if (path.casing ?? true) {
      const cg = ribbon(pts, width + this.defaults.casingWidth * mpp, false)
      if (cg) {
        const mesh = new THREE.Mesh(
          cg,
          strokeMaterial(path.casingColor ?? this.defaults.casingColor, this.flatDepthTest, 0.9),
        )
        mesh.renderOrder = this.defaults.renderOrder
        enu.add(mesh)
      }
    }
    const mg = ribbon(pts, width, false)
    if (mg) {
      const mesh = new THREE.Mesh(mg, strokeMaterial(color, this.flatDepthTest))
      mesh.renderOrder = this.defaults.renderOrder + 1
      enu.add(mesh)
    }
    if (this.animateHead) {
      const last = pts[pts.length - 1]!
      // Densité prise sur la config comme partout ailleurs (`ShapeLayer`, `LinkLayer`,
      // `DrawLayer`) : ce `24` était le seul littéral survivant et produisait une tête
      // visiblement plus facettée que les autres disques de la carte.
      const ring = fillGeo(circlePoints({ x: 0, z: 0 }, width * 1.6, this.config.performance.circleSegments))
      if (ring) {
        const mat = fillMaterial(color, this.flatDepthTest, 0.5)
        const mesh = new THREE.Mesh(ring, mat)
        mesh.position.set(last.x, 0, last.z)
        mesh.renderOrder = this.defaults.renderOrder + 2
        enu.add(mesh)
        head = { mesh, mat }
      }
    }
    return { enu, anchor, height, mpp, item: path, head }
  }

  /** Pulsation des têtes (point courant) — indépendante du drapage. */
  protected onUpdate(ctx: FrameContext): void {
    this.time += ctx.dt
    const t = (this.time % 1.6) / 1.6
    const scale = 1 + t * 1.4
    const opacity = 0.5 * (1 - t)
    let pulsing = false
    for (const d of this.drapes) {
      if (!d.head) continue
      pulsing = true
      d.head.mesh.scale.set(scale, scale, scale)
      d.head.mat.opacity = opacity
    }
    // Une tête qui pulse fait changer l'image sans que rien ne bouge par ailleurs. Signalé
    // une fois pour la couche : le drapeau est global, le poser par tracé ne l'est pas plus.
    if (pulsing) ctx.invalidate()
  }
}

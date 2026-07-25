import * as THREE from 'three'
import { EnuFrame } from '../core/enu'
import type { FrameContext, Layer } from '../core/Layer'
import type { Projection } from '../core/Projection'
import { DrapeSync } from '../core/resettle'
import { circlePoints, clearGroup, disposeObject3D, fillGeo, fillMaterial, ribbon, strokeMaterial } from '../core/geometry'
import type { LatLng } from '../shared'

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

type PathDrape = {
  enu: THREE.Group
  anchor: LatLng
  /** null = non résolue (tuiles absentes au build) — repli utilisé, re-résolue via resettle. */
  height: number | null
  mpp: number
  path: PathData
  head: Head | null
}

/** Tracés/parcours drapés sur le globe (ENU) avec point courant animé (trace GPS). */
export class PathLayer implements Layer {
  readonly group = new THREE.Group()
  private paths: PathData[] = []
  private time = 0
  // Groupes drapés auto-porteurs (ancre, hauteur de drapage, résolution m/px au build,
  // tracé source, tête animée) : synchronisés par le protocole partagé DrapeSync
  // (raffinement LOD, bande d'épaisseur avec rebuild individuel, bases au rebase).
  private readonly drapes: PathDrape[] = []
  /** Protocole partagé : raffinement LOD, bande d'épaisseur, bases ENU (cf. core/resettle). */
  private readonly sync: DrapeSync
  private lastCamera: THREE.Camera | null = null
  private viewH = 1

  constructor(
    /** Parent — utiliser `engine.annotations` pour hériter du masquage pendant l'intro. */
    private readonly scene: THREE.Object3D,
    private readonly projection: Projection,
    private defaults: PathLayerDefaults,
    private animateHead = true,
  ) {
    this.group.name = 'm3d-paths'
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

  /** Construit le groupe drapé d'un tracé (casing + trait + tête animée). */
  private buildDrape(path: PathData, height: number | null): PathDrape | null {
    if (path.points.length < 2) return null
    const anchor = path.points[0]!
    const h = height ?? this.projection.surfaceFallbackHeight
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
      const last = pts[pts.length - 1]!
      const ring = fillGeo(circlePoints({ x: 0, z: 0 }, width * 1.6, 24))
      if (ring) {
        const mat = fillMaterial(color, 0.5)
        const mesh = new THREE.Mesh(ring, mat)
        mesh.position.set(last.x, 0, last.z)
        mesh.renderOrder = this.defaults.renderOrder + 2
        enu.add(mesh)
        head = { mesh, mat }
      }
    }
    return { enu, anchor, height, mpp, path, head }
  }

  private rebuild(): void {
    clearGroup(this.group)
    this.drapes.length = 0
    if (!this.projection.isReady()) return
    for (const path of this.paths) {
      const anchor = path.points[0]
      const d = anchor ? this.buildDrape(path, this.projection.resolveAnchorHeight(anchor)) : null
      if (!d) continue
      this.drapes.push(d)
      this.group.add(d.enu)
    }
    // Les tuiles fines de la zone arrivent en streaming : re-échantillonnage à suivre.
    this.sync.invalidate()
  }

  /** Reconstruit UN tracé (bande d'épaisseur franchie) en réutilisant sa hauteur mémoïsée. */
  private rebuildDrape(i: number): boolean {
    const old = this.drapes[i]!
    disposeObject3D(old.enu)
    this.group.remove(old.enu)
    const d = this.buildDrape(old.path, old.height)
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
    if (this.projection.isReady()) this.sync.update(ctx.cameraState)
    // Animation des têtes (point courant) — indépendante du drapage.
    this.time += ctx.dt
    const t = (this.time % 1.6) / 1.6
    const scale = 1 + t * 1.4
    const opacity = 0.5 * (1 - t)
    for (const d of this.drapes) {
      if (!d.head) continue
      d.head.mesh.scale.set(scale, scale, scale)
      d.head.mat.opacity = opacity
    }
  }

  project(_ctx: FrameContext): void {}

  dispose(): void {
    clearGroup(this.group)
    this.drapes.length = 0
    this.scene.remove(this.group)
  }
}

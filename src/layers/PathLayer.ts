import * as THREE from 'three'
import { EnuFrame } from '../core/enu'
import { boundsOfLatLngs } from '../core/bounds'
import type { FrameContext } from '../core/Layer'
import type { Projection, ScreenPoint } from '../core/Projection'
import type { SelectableScreenItem } from '../core/Selectables'
import { circlePoints, fillGeo, ribbon } from '../core/geometry'
import { fillMaterial, strokeMaterial } from '../core/geometryMaterials'
import type { Bounds, LatLng } from '../shared'
import { type Drape, DrapedLayer } from './DrapedLayer'
import { segDistPx } from './draw/hitTest'

/** Préfixe d'id des tracés dans le registre de sélection : évite les collisions avec les ids de markers. */
const PATH_SID = 'path:'

/** `width`/`casingWidth` : épaisseurs de trait en **pixels écran** (constantes au zoom). */
export type PathData = {
  id?: string | number
  points: LatLng[]
  color?: string
  width?: number
  casing?: boolean
  casingColor?: string
  /**
   * Opt-in : autorise la **gomme** à effacer ce tracé (défaut protégé). La lib ne
   * mute pas les props — elle remonte l'`id` via `onErase` pour que l'app le retire
   * de son state. Un `id` est requis pour être ciblable.
   */
  erasable?: boolean
}

export type PathLayerDefaults = {
  color: string
  casingColor: string
  width: number
  casingWidth: number
  renderOrder: number
  /** Couleur du halo de sélection (thème). */
  selectedColor: string
  /** Sur-épaisseur du halo de sélection, en px écran, autour du trait. */
  selectedWidth: number
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

  /** Emprise d'un tracé : ses points. */
  protected boundsOf(item: PathData): Bounds | null {
    return boundsOfLatLngs(item.points)
  }

  private paths: PathData[] = []
  private time = 0
  /** Scratch de projection (chemin froid : finalize/clic), même patron que `LinkLayer`. */
  private readonly scratch = new THREE.Vector3()
  private readonly screen: ScreenPoint = { sx: 0, sy: 0, z: 0 }
  /** Ids (préfixés `path:`) des tracés sélectionnés — pilote le halo. */
  private selected = new Set<string>()
  /** Id synthétique stable pour un tracé sans `id` propre (réassigné à chaque `setPaths`). */
  private synth = new WeakMap<PathData, string>()
  /** Un rebuild de halo attend un repaint (consommé au prochain `onUpdate`). */
  private selectionDirty = false

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
    // Id synthétique aux tracés sans `id` propre : indispensable pour les
    // sélectionner. Un tracé sans `id` perd sa sélection au prochain `setPaths`
    // (flux temps réel) — fournir un `id` pour une sélection stable.
    this.synth = new WeakMap()
    let auto = 0
    for (const p of paths) if (p.id === undefined) this.synth.set(p, `auto-${auto++}`)
    this.rebuildAll(this.paths)
  }

  /** Id du tracé dans le registre de sélection (préfixé, stable). */
  private sidOf(path: PathData): string {
    return PATH_SID + (path.id ?? this.synth.get(path) ?? '')
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

    // Halo de sélection : ruban le plus large, posé sous le casing (renderOrder le
    // plus bas) pour cerner le trait sans le masquer. Couleur venue du thème.
    if (this.selected.has(this.sidOf(path))) {
      const hg = ribbon(pts, width + this.defaults.selectedWidth * mpp, false)
      if (hg) {
        const mesh = new THREE.Mesh(hg, strokeMaterial(this.defaults.selectedColor, this.flatDepthTest, 0.9))
        mesh.renderOrder = this.defaults.renderOrder - 1
        enu.add(mesh)
      }
    }

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
    // Repaint unique après un changement de sélection (halo posé/retiré hors geste).
    if (this.selectionDirty) {
      this.selectionDirty = false
      ctx.invalidate()
    }
  }

  /**
   * Projette les points d'un tracé à sa hauteur de drapage — chemin FROID
   * (finalize/clic, jamais par frame), d'où l'allocation. `visible` = devant la
   * caméra (`z <= 1`) ; un segment n'est valide qu'entre deux points visibles.
   * Mutualisé par `selectableItems` (contour) et `hitTest` (plus-proche-segment).
   */
  private projectPath(d: PathDrape, camera: THREE.Camera): { x: number; y: number; visible: boolean }[] {
    const h = this.heightOf(d)
    const out: { x: number; y: number; visible: boolean }[] = []
    for (const p of d.item.points) {
      const world = this.projection.latLngToWorld(p, this.scratch, h)
      const s = this.projection.worldToScreen(world, camera, this.screen)
      out.push({ x: s.sx, y: s.sy, visible: s.z <= 1 })
    }
    return out
  }

  /**
   * Contours écran des tracés pour l'outil sélection. Un tracé est une polyligne
   * OUVERTE (`closed:false`) des points visibles ; `x,y` = 1er point visible.
   */
  selectableItems(camera: THREE.Camera): SelectableScreenItem[] {
    if (!this.projection.isReady()) return []
    const out: SelectableScreenItem[] = []
    for (const d of this.drapes) {
      const pts = this.projectPath(d, camera).filter((p) => p.visible)
      const first = pts[0]
      if (!first) continue
      out.push({ id: this.sidOf(d.item), kind: 'path', x: first.x, y: first.y, geometry: { pts, closed: false } })
    }
    return out
  }

  /** true si l'id (préfixé) correspond à un tracé encore présent — pour `info`/prune du registre. */
  hasSelectable(id: string | number): boolean {
    if (typeof id !== 'string' || !id.startsWith(PATH_SID)) return false
    for (const d of this.drapes) if (this.sidOf(d.item) === id) return true
    return false
  }

  /** Tracé le plus proche d'un point écran (clic), ou null — même seuil que les formes. */
  hitTest(screenX: number, screenY: number, tolPx: number): string | null {
    const camera = this.lastCamera
    if (this.drapes.length === 0 || !camera || !this.projection.isReady()) return null
    let bestId: string | null = null
    let bestDistance = tolPx
    for (const d of this.drapes) {
      const pts = this.projectPath(d, camera)
      // Segment testé seulement entre deux points visibles (jamais à travers un point derrière la caméra).
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!
        const b = pts[i]!
        if (!a.visible || !b.visible) continue
        const dist = segDistPx(screenX, screenY, a.x, a.y, b.x, b.y)
        if (dist < bestDistance) {
          bestDistance = dist
          bestId = this.sidOf(d.item)
        }
      }
    }
    return bestId
  }

  /**
   * Applique la sélection : rebuild ciblé des seuls tracés dont l'appartenance a
   * changé (pour poser/retirer le halo). Hors frame — coût acceptable.
   */
  setSelected(ids: ReadonlySet<string | number>): void {
    const next = new Set<string>()
    for (const id of ids) if (typeof id === 'string' && id.startsWith(PATH_SID)) next.add(id)
    const prev = this.selected
    this.selected = next
    for (let i = 0; i < this.drapes.length; i++) {
      const sid = this.sidOf(this.drapes[i]!.item)
      if (prev.has(sid) !== next.has(sid)) {
        this.rebuildDrape(i)
        // Le rebuild ciblé change l'image (halo posé/retiré) sans passer par `sync`
        // (qui rouvrirait la fenêtre de raycasts). Sous renderOnDemand, un `select()`
        // programmatique — hors geste pointeur — ne repeindrait jamais sans ceci.
        this.selectionDirty = true
      }
    }
  }
}

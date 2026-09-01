import * as THREE from 'three'
import { EnuFrame } from '../core/enu'
import { boundsOfLatLngs } from '../core/bounds'
import type { FrameContext } from '../core/Layer'
import type { Projection } from '../core/Projection'

import type { SelectableGeometry, SelectableScreenItem } from '../core/Selectables'
import { circlePoints, fillGeo, ribbon } from '../core/geometry'
import { fillMaterial, strokeMaterial } from '../core/geometryMaterials'
import type { Bounds, LatLng } from '../shared'
import { type Drape, DrapedLayer } from './DrapedLayer'


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
}

type Head = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }

/** Drape d'un tracé : le groupe standard, la tête animée, et son id de sélection MÉMORISÉ
 *  (calculé une fois au build — évite de reconstruire la string `path:…` à chaque frame). */
type PathDrape = Drape<PathData> & { head: Head | null; sid: string }

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

  /** Ids (préfixés `path:`) des tracés sélectionnés — pilote leur contour dans l'overlay. */
  private selected = new Set<string>()
  /** Id synthétique stable pour un tracé sans `id` propre (réassigné à chaque `setPaths`). */
  private synth = new WeakMap<PathData, string>()

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

    // La SÉLECTION d'un tracé se matérialise par le pointillé « marching ants » de
    // `SelectionOverlay` (comme les formes) — langage visuel de sélection UNIQUE, jamais
    // un halo 3D propre au tracé. Le drape ne dépend donc plus de l'état sélectionné.
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
    return { enu, anchor, height, mpp, item: path, head, sid: this.sidOf(path) }
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
      d.head.mesh.scale.set(scale, scale, scale)
      d.head.mat.opacity = opacity
      if (!pulsing && this.headInView(d.head.mesh, d.enu, ctx)) pulsing = true
    }
    // Une tête qui pulse fait changer l'image sans que rien ne bouge par ailleurs. Signalé
    // une fois pour la couche — et seulement si une tête est À L'ÉCRAN : sinon le rendu à
    // la demande ne dormait jamais tant qu'un tracé était monté, où qu'il soit.
    if (pulsing) ctx.invalidate()
  }

  /**
   * La tête est-elle dans le cadre (marge de culling des markers) ? Position monde tirée de
   * la matrice LOCALE du groupe ENU — ses conteneurs sont à l'identité — et non de
   * `matrixWorld`, que seule une descente de rendu recalcule : sous rendu à la demande, la
   * première tête ne serait jamais vue, donc jamais repeinte, donc jamais descendue.
   */
  private headInView(mesh: THREE.Object3D, enu: THREE.Group, ctx: FrameContext): boolean {
    const world = this.scratch.copy(mesh.position).applyMatrix4(enu.matrix)
    if (!this.projection.isAboveHorizon(world, ctx.camera.position)) return false
    const s = this.projection.worldToScreen(world, ctx.camera, this.screen)
    if (s.z > 1) return false
    const m = this.config.performance.markerCullMarginPx
    return s.sx >= -m && s.sy >= -m && s.sx <= ctx.size.width + m && s.sy <= ctx.size.height + m
  }


  /**
   * Projette les points d'un tracé à sa hauteur de drapage — chemin FROID
   * (finalize/clic, jamais par frame), d'où l'allocation. `visible` = devant la
   * caméra (`z <= 1`) ; un segment n'est valide qu'entre deux points visibles.
   * Mutualisé par `selectableItems` (contour) et `hitTest` (plus-proche-segment).
   */
  private projectPath(
    d: PathDrape,
    camera: THREE.Camera,
    visibleOnly = false,
  ): { x: number; y: number; visible: boolean }[] {
    const h = this.heightOf(d)
    const out: { x: number; y: number; visible: boolean }[] = []
    for (const p of d.item.points) {
      const world = this.projection.latLngToWorld(p, this.scratch, h)
      const s = this.projection.worldToScreen(world, camera, this.screen)
      const visible = s.z <= 1
      // `visibleOnly` : filtre dans la boucle (un seul tableau) au lieu d'un `.filter` en aval —
      // évite une seconde allocation par tracé par frame sur le contour de sélection.
      if (visibleOnly && !visible) continue
      out.push({ x: s.sx, y: s.sy, visible })
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
      const pts = this.projectPath(d, camera, true)
      const first = pts[0]
      if (!first) continue
      out.push({ id: d.sid, kind: 'path', x: first.x, y: first.y, geometry: { pts, closed: false } })
    }
    return out
  }

  /** true si l'id (préfixé) correspond à un tracé encore présent — pour `info`/prune du registre. */
  hasSelectable(id: string | number): boolean {
    return typeof id === 'string' && id.startsWith(PATH_SID) && this.drapeById(id) !== undefined
  }

  /** Drape d'un id de sélection (préfixé), ou undefined — lookup unique partagé (`sid` mémorisé). */
  private drapeById(id: string | number): PathDrape | undefined {
    for (const d of this.drapes) if (d.sid === id) return d
    return undefined
  }

  /** Couleur d'un tracé par id (préfixé), pour la pastille de couleur du badge — repli défaut. */
  colorOf(id: string | number): string | undefined {
    const d = this.drapeById(id)
    return d ? (d.item.color ?? this.defaults.color) : undefined
  }

  /** Emprise géographique d'un tracé par id (préfixé) — de quoi le CADRER (« Cibler » d'un badge). */
  boundsOfId(id: string | number): Bounds | null {
    const d = this.drapeById(id)
    return d ? this.boundsOf(d.item) : null
  }

  /** Des tracés sont-ils sélectionnés ? — garde bon marché de l'overlay (sans reprojeter). */
  hasSelectedContours(): boolean {
    return this.selected.size > 0
  }

  /**
   * Contours écran (px canvas) des tracés SÉLECTIONNÉS — alimente le pointillé
   * « marching ants » de `SelectionOverlay`, comme les formes dessinées. Ne reprojette
   * que les tracés sélectionnés (jamais toute la couche) : appelé chaque frame par la
   * passe projection tant qu'un tracé est sélectionné.
   */
  selectedContours(): SelectableGeometry[] {
    const camera = this.lastCamera
    if (this.selected.size === 0 || !camera || !this.projection.isReady()) return []
    const out: SelectableGeometry[] = []
    for (const d of this.drapes) {
      // `d.sid` mémorisé : zéro allocation de string dans cette boucle par frame.
      if (!this.selected.has(d.sid)) continue
      const pts = this.projectPath(d, camera, true)
      if (pts.length > 1) out.push({ kind: 'poly', pts, closed: false })
    }
    return out
  }

  /** Tracé le plus proche d'un point écran (clic), ou null — même seuil que les formes. */
  hitTest(screenX: number, screenY: number, tolPx: number): string | null {
    const camera = this.lastCamera
    if (this.drapes.length === 0 || !camera || !this.projection.isReady()) return null
    let bestId: string | null = null
    let bestDistance = tolPx
    for (const d of this.drapes) {
      const dist = this.polylineDistancePx(d.item.points, this.heightOf(d), camera, screenX, screenY, bestDistance)
      if (dist < bestDistance) {
        bestDistance = dist
        bestId = d.sid
      }
    }
    return bestId
  }


  /**
   * Mémorise les tracés sélectionnés (filtrés au préfixe `path:`). Aucun rebuild de
   * drape : la sélection ne peint plus rien EN 3D — elle n'alimente que le contour
   * pointillé de l'overlay (`selectedContours`), repeint par la passe projection.
   */
  setSelected(ids: ReadonlySet<string | number>): void {
    const next = new Set<string>()
    for (const id of ids) if (typeof id === 'string' && id.startsWith(PATH_SID)) next.add(id)
    this.selected = next
  }
}

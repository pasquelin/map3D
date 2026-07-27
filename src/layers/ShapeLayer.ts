import * as THREE from 'three'
import { EnuFrame } from '../core/enu'
import type { Projection } from '../core/Projection'
import { boundsOfCircle, boundsOfLatLngs, unionBounds } from '../core/bounds'
import { circleRing, PREDICATE_CIRCLE_SEGMENTS } from '../core/geodesy'
import {
  type Pt,
  circlePoints,
  edgeMaterial,
  fillGeo,
  fillMaterial,
  prismEdges,
  prismWalls,
  ribbon,
  strokeMaterial,
  volumeMaterial,
} from '../core/geometry'
import type { Bounds, LatLng } from '../shared'
import { type Drape, DrapedLayer } from './DrapedLayer'

/** `width` : épaisseur de trait en **pixels écran** (constante au zoom). */
export type ShapeStyle = {
  color?: string
  width?: number
  fillOpacity?: number
  /**
   * Hauteur d'extrusion en **mètres au-dessus du sol** : la forme devient un
   * volume (murs verticaux + couvercle) au lieu d'un aplat drapé. Absent ou `0` =
   * drapé au sol, le comportement par défaut.
   *
   * Le volume repart de la surface drapée — il hérite donc du même ancrage au
   * terrain, et ne peut pas dériver par rapport à elle.
   *
   * N'a de sens que pour les formes fermées (polygone, rectangle, cercle) ; sur
   * une ligne ou une flèche, elle produirait un mur sans épaisseur, sans intérêt.
   */
  extrudeHeight?: number
}

/**
 * Identité d'une forme fournie par l'application. `title` est le nom lisible —
 * même rôle que `MarkerData.title` : ce que la recherche indexe et ce que les
 * listes affichent. Sans lui, une zone n'est trouvable par personne.
 */
type ShapeIdentity = { id?: string | number; title?: string }

export type ShapeData = ShapeStyle &
  ShapeIdentity &
  (
    | { kind: 'polygon'; points: LatLng[] }
    | { kind: 'line'; points: LatLng[] }
    | { kind: 'arrow'; points: LatLng[] }
    | { kind: 'rect'; bounds: Bounds }
    | { kind: 'circle'; center: LatLng; radiusMeters: number }
  )

export type ShapeLayerDefaults = { color: string; width: number; fillOpacity: number; renderOrder: number }

/**
 * Contour géodésique d'une forme, toutes variantes ramenées à un anneau de
 * lat/lng — les prédicats géométriques n'ont ainsi qu'un seul type d'entrée.
 * Les cercles sont polygonisés, les rectangles développés en 4 coins.
 */
export function ringOfShape(s: ShapeData, circleSegments = PREDICATE_CIRCLE_SEGMENTS): LatLng[] {
  if (s.kind === 'circle') return circleRing(s.center, s.radiusMeters, circleSegments)
  if (s.kind === 'rect') {
    const b = s.bounds
    return [
      { lat: b.north, lng: b.west },
      { lat: b.north, lng: b.east },
      { lat: b.south, lng: b.east },
      { lat: b.south, lng: b.west },
    ]
  }
  return s.points
}

/** Cadre englobant une forme, quelle que soit sa variante géométrique. */
export function boundsOfShape(s: ShapeData): Bounds | null {
  if (s.kind === 'rect') return s.bounds
  if (s.kind === 'circle') return boundsOfCircle(s.center, s.radiusMeters)
  return boundsOfLatLngs(s.points)
}

/** Cadre englobant un ensemble de formes — équivalent d'`extendBoundsWithZones`. */
export function boundsOfShapes(shapes: Iterable<ShapeData>): Bounds | null {
  const list: Array<Bounds | null> = []
  for (const s of shapes) list.push(boundsOfShape(s))
  return unionBounds(list)
}

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
        return { points: circlePoints(c, shape.radiusMeters, this.config.performance.circleSegments), closed: true }
      }
    }
  }

  /**
   * Altitude locale du **bas** d'un volume : sous le point le plus bas du terrain
   * qu'il couvre.
   *
   * Sans ça le prisme partirait du plan de l'ancre — une hauteur unique, prise au
   * centre de la zone. Sur un terrain qui descend (une berge, un pont, un vallon),
   * le bas des murs se retrouve alors suspendu en l'air au-dessus du creux : c'est
   * précisément ce que la forme drapée masquait, puisqu'elle se dessine par-dessus
   * tout sans test de profondeur.
   *
   * Le sol est échantillonné sur le contour (au plus `GROUND_SAMPLES` points, un
   * raycast chacun — au build seulement, jamais par frame), et le bas descend
   * encore de `BASE_SINK` pour rester enterré entre deux échantillons. Un terrain
   * inconnu (tuiles absentes) ramène simplement au plan de l'ancre : le drape sera
   * reconstruit quand les hauteurs se résoudront.
   */
  private extrudeBaseY(points: readonly Pt[], frame: EnuFrame, anchorHeight: number): number {
    const step = Math.max(1, Math.floor(points.length / ShapeLayer.GROUND_SAMPLES))
    let lowest: number | null = null
    for (let i = 0; i < points.length; i += step) {
      const g = this.projection.resolveAnchorHeight(frame.toLatLng(points[i]!))
      if (g !== null && (lowest === null || g < lowest)) lowest = g
    }
    if (lowest === null) return -ShapeLayer.BASE_SINK
    return Math.min(0, lowest - anchorHeight) - ShapeLayer.BASE_SINK
  }

  /** Points de contour échantillonnés pour trouver le sol le plus bas sous un volume. */
  private static readonly GROUND_SAMPLES = 16
  /** Enfouissement du bas d'un volume sous le sol le plus bas mesuré (m). */
  private static readonly BASE_SINK = 8

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
    const asked = closed && points.length > 2 ? (shape.extrudeHeight ?? 0) : 0
    // Hauteur non finie (`NaN` d'un calcul amont) ramenée à 0 : sans ça elle
    // échouerait aux DEUX tests ci-dessous — ni ruban au sol, ni volume — et la
    // forme perdrait purement et simplement son contour.
    const extrude = Number.isFinite(asked) ? asked : 0
    // Contour au sol en ruban — SAUF sur un volume, dont l'anneau du bas est tracé
    // avec les autres arêtes pour qu'elles aient toutes la même finesse.
    if (extrude <= 0) {
      const rg = ribbon(points, width, closed)
      if (rg) {
        const m = new THREE.Mesh(rg, strokeMaterial(color))
        m.renderOrder = this.defaults.renderOrder + 1
        enu.add(m)
      }
    }

    // Volume optionnel : murs + couvercle, montés DANS le même repère ENU que la
    // surface drapée. C'est ce qui garantit qu'ils ne peuvent pas glisser par
    // rapport à elle — ils partagent son ancre et sa hauteur de drapage, résolues
    // et raffinées par `DrapedLayer`. Aucun second système de positionnement.
    if (extrude > 0) {
      const baseY = this.extrudeBaseY(points, frame, h)
      const walls = prismWalls(points, baseY, extrude, true)
      if (walls) {
        const m = new THREE.Mesh(walls, volumeMaterial(color, Math.max(fillOpacity, 0.12)))
        m.renderOrder = this.defaults.renderOrder
        enu.add(m)
      }
      const capFill = fillGeo(points)
      if (capFill) {
        capFill.translate(0, extrude, 0)
        const m = new THREE.Mesh(capFill, volumeMaterial(color, Math.max(fillOpacity, 0.12)))
        m.renderOrder = this.defaults.renderOrder
        enu.add(m)
      }
      // Arêtes en lignes GL (1 px pile, constant au zoom) et non en rubans : un
      // ruban porte une épaisseur en MÈTRES, qu'il faudrait reconvertir à chaque
      // changement de résolution et qui ne vaudrait jamais 1 px exactement.
      const edges = prismEdges(points, baseY, extrude, true)
      if (edges) {
        const l = new THREE.LineSegments(edges, edgeMaterial(color))
        l.renderOrder = this.defaults.renderOrder + 1
        enu.add(l)
      }
    }
    return { enu, anchor, height, mpp, item: shape }
  }
}

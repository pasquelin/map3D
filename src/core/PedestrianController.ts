import * as THREE from 'three'
import { defaultConfig } from '../config/defaultConfig'
import type { MapConfig } from '../config/types'
import type { LatLng } from '../shared'
import type { NavKeys } from './NavKeys'
import { type FeelerHit, slideMove, smoothHeight, stepGround } from './pedestrianCollision'
import type { Projection } from './Projection'

/** Où en est le piéton — lu par `MapEngine` pour composer l'événement `pedestrian`. */
export type PedestrianPose = {
  position: LatLng
  groundHeight: number
  /** Cap (rad), 0 = nord, croissant vers l'est. */
  heading: number
  /** Regard vertical (rad), 0 = horizon, positif vers le haut. */
  pitch: number
}

const DEG2RAD = Math.PI / 180
const TAU = Math.PI * 2

/**
 * Angles (rad) des palpeurs autour de la direction de marche : répartition UNIFORME sur le
 * demi-plan avant, de −90° à +90°.
 *
 * La symétrie est un invariant, pas une élégance : un éventail qui penche d'un côté détecte
 * mieux les murs de ce côté, et la marche dévie le long des façades. Un compte impair pose
 * en plus un palpeur central (droit devant) ; un compte pair encadre la direction de marche
 * au plus près — dans les deux cas un mur frontal est vu.
 *
 * L'arrière n'est jamais testé : on ne peut pas entrer dans un mur qu'on quitte, et ce
 * serait doubler le budget de rayons pour rien.
 */
export function feelerAngles(count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [0]
  const out: number[] = []
  const step = Math.PI / (count - 1)
  for (let i = 0; i < count; i++) out.push(-Math.PI / 2 + i * step)
  return out
}

/**
 * Regard vertical borné. La borne est en plus rabattue **sous** la verticale : à ±90° le
 * produit vectoriel avant × haut s'annule et l'orientation de la caméra devient indéfinie.
 */
export function clampPitch(pitch: number, pitchMaxDeg: number): number {
  const max = Math.min(pitchMaxDeg * DEG2RAD, Math.PI / 2 - 1e-3)
  return Math.max(-max, Math.min(max, pitch))
}

/** Cap après un déplacement souris horizontal, ramené dans `[0, 2π[`. */
export function headingAfterLook(heading: number, dxPx: number, lookSpeedDegPerPx: number): number {
  const next = (heading + dxPx * lookSpeedDegPerPx * DEG2RAD) % TAU
  return next < 0 ? next + TAU : next
}

/**
 * Troisième état pilote de la caméra, à côté de `fly` et `follow` (cf. `Camera.update`) :
 * la marche à hauteur d'homme. Intègre déplacement, regard, gravité et collision, et écrit
 * directement `threeCamera` — `GlobeControls` est gelé pendant ce temps.
 *
 * **Zéro-alloc** : tout le scratch est préalloué. Ce chemin est parcouru à chaque frame, et
 * un `new Vector3` y allouerait 60 fois par seconde et par usage.
 */
export class PedestrianController {
  private config: MapConfig = defaultConfig

  /** Position au sol du piéton, et hauteur de sol lissée sous ses pieds. */
  private readonly at: LatLng = { lat: 0, lng: 0 }
  private groundHeight = 0
  private headingRad = 0
  private pitchRad = 0
  /** Delta de regard accumulé depuis le dernier `update` — cf. spec §9 (Pointer Lock). */
  private lookDx = 0
  private lookDy = 0

  // ── Scratch (aucune allocation par frame) ──
  private readonly origin = new THREE.Vector3()
  private readonly east = new THREE.Vector3()
  private readonly north = new THREE.Vector3()
  private readonly up = new THREE.Vector3()
  private readonly eye = new THREE.Vector3()
  private readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly lookTarget = new THREE.Vector3()
  private readonly rayFrom = new THREE.Vector3()
  private readonly rayDir = new THREE.Vector3()
  private readonly rayHit = new THREE.Vector3()
  private readonly poseMatrix = new THREE.Matrix4()
  /** Impacts des palpeurs de la frame — tableau réutilisé, vidé par `length = 0`. */
  private readonly hits: FeelerHit[] = []
  private readonly move = { east: 0, north: 0 }

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly projection: Projection,
    private readonly navKeys: NavKeys,
  ) {}

  setConfig(config: MapConfig): void {
    this.config = config
  }

  /**
   * Entre en première personne au-dessus d'un point de rue validé. Le cap initial reprend
   * l'azimut courant de la caméra projeté au sol : l'utilisateur continue de regarder dans
   * la direction qu'il regardait, et la plongée ne le désoriente pas.
   */
  enter(p: LatLng, groundHeight: number): void {
    this.at.lat = p.lat
    this.at.lng = p.lng
    this.groundHeight = groundHeight
    this.pitchRad = 0
    this.lookDx = 0
    this.lookDy = 0
    this.projection.getENUAxes(this.at, this.origin, this.east, this.north, this.up, groundHeight)
    // Axe de visée courant projeté sur le plan tangent → cap. Au nadir il dégénère (on
    // regarde le long de la verticale) : le haut de l'écran prend alors le relais, exactement
    // comme dans `applyKeyNav`.
    this.forward.set(0, 0, -1).transformDirection(this.camera.matrixWorld).projectOnPlane(this.up)
    if (this.forward.lengthSq() < 1e-8) {
      this.forward.set(0, 1, 0).transformDirection(this.camera.matrixWorld).projectOnPlane(this.up)
    }
    this.headingRad =
      this.forward.lengthSq() < 1e-8 ? 0 : Math.atan2(this.forward.dot(this.east), this.forward.dot(this.north))
    this.applyPose()
  }

  /** Accumule un delta de regard en pixels — appliqué une seule fois par frame. */
  addLook(dxPx: number, dyPx: number): void {
    this.lookDx += dxPx
    this.lookDy += dyPx
  }

  /** Position au sol courante — référence VIVE, jamais copiée : lue par frame. */
  get position(): LatLng {
    return this.at
  }

  /** Cap courant (rad) — lu par frame, sans allouer (contrairement à `getPose`). */
  get heading(): number {
    return this.headingRad
  }

  /** Regard vertical courant (rad) — même raison que `heading`. */
  get pitch(): number {
    return this.pitchRad
  }

  getPose(): PedestrianPose {
    return {
      position: { lat: this.at.lat, lng: this.at.lng },
      groundHeight: this.groundHeight,
      heading: this.headingRad,
      pitch: this.pitchRad,
    }
  }

  /** Avance d'une frame : regard, déplacement collisionné, gravité, puis pose caméra. */
  update(dt: number): void {
    const c = this.config.pedestrian
    this.applyLook(c)
    // Base tangente au point courant, recalculée chaque frame : le repère du tileset peut
    // avoir changé (rebase d'origine), et « tout droit » doit suivre la rue.
    this.projection.getENUAxes(this.at, this.origin, this.east, this.north, this.up, this.groundHeight)
    const moved = this.applyWalk(dt)
    this.applyGravity(dt, moved)
    this.applyPose()
  }

  /**
   * Regard : le delta accumulé devient cap + tangage, puis se vide.
   *
   * Les deux axes s'inversent séparément (`invertX` / `invertY`) : la bonne convention
   * dépend du geste — glisser la carte (« attraper la scène ») et regarder en FPS vont en
   * sens opposés, et l'une comme l'autre a ses habitués.
   */
  private applyLook(c: MapConfig['pedestrian']): void {
    if (this.lookDx === 0 && this.lookDy === 0) return
    const dx = c.invertX ? -this.lookDx : this.lookDx
    const dy = c.invertY ? this.lookDy : -this.lookDy
    this.headingRad = headingAfterLook(this.headingRad, dx, c.lookSpeed)
    this.pitchRad = clampPitch(this.pitchRad + dy * c.lookSpeed * DEG2RAD, c.pitchMaxDeg)
    this.lookDx = 0
    this.lookDy = 0
  }

  /** Déplacement demandé, corrigé par les palpeurs. Rend `true` si le piéton a bougé. */
  private applyWalk(dt: number): boolean {
    const axis = this.navKeys.axis()
    if (!axis) return false
    const c = this.config.pedestrian
    // Diagonale normalisée : deux touches ne vont pas plus vite qu'une (cf. `applyKeyNav`).
    const norm = axis.forward !== 0 && axis.right !== 0 ? Math.SQRT1_2 : 1
    const speed = c.walkSpeed * (axis.boost ? c.sprintFactor : 1) * dt
    const sin = Math.sin(this.headingRad)
    const cos = Math.cos(this.headingRad)
    // Cap → axes locaux : « avant » suit la RUE (plan tangent), jamais la ligne de visée —
    // sinon regarder ses pieds ferait avancer moins vite, et regarder le ciel décoller.
    this.move.east = (axis.forward * sin + axis.right * cos) * norm * speed
    this.move.north = (axis.forward * cos - axis.right * sin) * norm * speed
    if (this.move.east === 0 && this.move.north === 0) return false

    this.probeFeelers()
    const slid = slideMove(this.move, this.hits, c.collision.radiusMeters)
    if (slid.east === 0 && slid.north === 0) return false

    // Local (m) → monde, puis retour en lat/lng : le pas est court, l'écart au plan tangent
    // est négligeable (cf. `EnuFrame.toLatLng`).
    this.eye.copy(this.origin).addScaledVector(this.east, slid.east).addScaledVector(this.north, slid.north)
    const next = this.projection.worldToLatLng(this.eye)
    this.at.lat = next.lat
    this.at.lng = next.lng
    return true
  }

  /**
   * Palpeurs horizontaux depuis le CENTRE du corps (mi-hauteur) : un rayon au niveau des
   * yeux passerait au-dessus d'un muret, un rayon au sol buterait sur le moindre trottoir.
   * Aucun rayon si l'on ne bouge pas — la boucle immobile ne coûte rien.
   */
  private probeFeelers(): void {
    this.hits.length = 0
    const c = this.config.pedestrian
    const far = c.collision.radiusMeters + c.collision.feelerMarginMeters
    const angles = feelerAngles(c.collision.feelers)
    if (angles.length === 0) return
    // Direction de marche normalisée dans le plan local.
    const len = Math.hypot(this.move.east, this.move.north)
    const dirE = this.move.east / len
    const dirN = this.move.north / len
    this.rayFrom.copy(this.origin).addScaledVector(this.up, c.eyeHeightMeters / 2)
    for (const angle of angles) {
      const sin = Math.sin(angle)
      const cos = Math.cos(angle)
      const e = dirE * cos - dirN * sin
      const n = dirE * sin + dirN * cos
      this.rayDir.set(0, 0, 0).addScaledVector(this.east, e).addScaledVector(this.north, n).normalize()
      const distance = this.projection.castRay(this.rayFrom, this.rayDir, far, this.rayHit)
      if (distance !== null) this.hits.push({ dirEast: e, dirNorth: n, distance })
    }
  }

  /**
   * Suivi du sol : UN seul rayon descendant par frame (spec §8), lissé. La couronne à ~9
   * rayons de `sampleGroundHeight` est réservée au placement — la relancer en marche
   * multiplierait le budget par neuf pour un gain nul.
   */
  private applyGravity(dt: number, moved: boolean): void {
    const c = this.config.pedestrian
    /**
     * Rayon COURT depuis au-dessus de la tête, et non `sampleSurfaceHeight` : celui-ci part
     * de 12 km d'altitude et porte sur 40 km (cf. `performance.groundSample`), donc à
     * hauteur d'homme il traverse toute la scène pour mesurer deux mètres sous les pieds.
     * C'était le poste le plus cher de la boucle de marche.
     */
    const probeUp = c.eyeHeightMeters + c.collision.maxStepHeightMeters
    this.rayFrom.copy(this.origin).addScaledVector(this.up, probeUp)
    this.rayDir.copy(this.up).negate()
    const distance = this.projection.castRay(this.rayFrom, this.rayDir, probeUp + c.groundProbeMeters, this.rayHit)
    // Sol introuvable — hors de portée, ou surface non raycastable (le raster du volume
    // interne) : on garde la hauteur précédente plutôt que de tomber au centre de la Terre.
    if (distance === null) return
    const sampled = this.groundHeight + probeUp - distance
    // Une montée trop raide pendant un pas est un mur, pas une marche : on ne monte pas.
    const target = moved ? stepGround(this.groundHeight, sampled, c.collision.maxStepHeightMeters) : sampled
    if (target === null) return
    this.groundHeight = smoothHeight(this.groundHeight, target, c.groundSmoothing, dt)
  }

  /** Écrit position et orientation dans la caméra Three, depuis (point, cap, tangage). */
  private applyPose(): void {
    const c = this.config.pedestrian
    this.projection.getENUAxes(this.at, this.origin, this.east, this.north, this.up, this.groundHeight)
    this.eye.copy(this.origin).addScaledVector(this.up, c.eyeHeightMeters)
    const sin = Math.sin(this.headingRad)
    const cos = Math.cos(this.headingRad)
    // Cap dans le plan tangent, puis tangage autour de l'axe « droite » local.
    this.forward.set(0, 0, 0).addScaledVector(this.north, cos).addScaledVector(this.east, sin)
    this.right.crossVectors(this.forward, this.up).normalize()
    this.forward.applyAxisAngle(this.right, -this.pitchRad).normalize()
    this.lookTarget.copy(this.eye).add(this.forward)
    this.poseMatrix.lookAt(this.eye, this.lookTarget, this.up)
    this.camera.position.copy(this.eye)
    this.camera.quaternion.setFromRotationMatrix(this.poseMatrix)
    this.camera.updateMatrixWorld()
  }
}

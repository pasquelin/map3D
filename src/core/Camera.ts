import * as THREE from 'three'
import type { LatLng } from '../shared'
import type { Projection } from './Projection'
import { clamp, easeInOutCubic } from './math'

export type CameraState = {
  lat: number
  lng: number
  /** Altitude de la caméra au-dessus de la surface (mètres). */
  altitude: number
  heading: number
  tilt: number
}

export type FlyOptions = {
  duration?: number
  altitude?: number
  /** Étiquette du vol — permet à `retargetFlyAltitude` de ne viser QUE ce vol.
   *  `'intro'` est RÉSERVÉ au moteur (vol de démarrage, re-ciblé/annulé par lui). */
  tag?: string
}

type Fly = {
  fromPos: THREE.Vector3
  fromQuat: THREE.Quaternion
  toPos: THREE.Vector3
  toQuat: THREE.Quaternion
  t: number
  speed: number
  target: LatLng
  altitude: number
  tag?: string
}

/**
 * Contrôleur caméra pour globe. La navigation (orbite/zoom/tilt façon Google
 * Earth) est déléguée à `GlobeControls` ; cette classe ajoute `flyTo`/`follow`
 * et expose un état lat/lng/altitude dérivé de la position 3D.
 */
export class Camera {
  flyDuration = 1.0
  flyEasing: (t: number) => number = easeInOutCubic
  /** Altitude max (m) au-dessus de la surface — borne le dézoom des vols/boutons. */
  maxAltitude = Infinity

  private fly: Fly | null = null
  private followFn: (() => LatLng | null) | null = null

  private readonly surface = new THREE.Vector3()
  private readonly normal = new THREE.Vector3()
  private readonly lookTarget = new THREE.Vector3()
  // Scratch réutilisés par placeNadir/update (mode `follow` : appelé chaque frame).
  private readonly nadirMatrix = new THREE.Matrix4()
  private readonly nadirUp = new THREE.Vector3()
  private readonly followPos = new THREE.Vector3()
  private readonly followQuat = new THREE.Quaternion()

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly projection: Projection,
  ) {}

  /** Vrai tant qu'un vol/suivi pilote la caméra (les contrôles sont alors gelés). */
  isControlling(): boolean {
    return this.fly !== null || this.followFn !== null
  }

  /** Vol en cours ? Avec `tag`, seulement s'il porte ce tag (distingue le vol
   *  d'intro d'un vol de recherche/suivi — un suivi n'est PAS un vol). */
  isFlying(tag?: string): boolean {
    return this.fly !== null && (tag === undefined || this.fly.tag === tag)
  }

  getState(): CameraState {
    const ll = this.projection.worldToLatLng(this.camera.position)
    this.projection.latLngToWorld(ll, this.surface, 0)
    const altitude = this.camera.position.distanceTo(this.surface)
    return { lat: ll.lat, lng: ll.lng, altitude, heading: 0, tilt: 0 }
  }

  /** Place la caméra à la verticale (nadir) d'un point, à une altitude donnée
   *  (mètres au-dessus de l'ellipsoïde — négative légitime sous le niveau de la
   *  mer : mer Morte, géoïde négatif). */
  private placeNadir(p: LatLng, altitude: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion): void {
    this.projection.latLngToWorld(p, this.surface, 0)
    this.projection.worldNormal(p, this.normal)
    outPos.copy(this.surface).addScaledVector(this.normal, altitude)
    // Regarde le sol, "up" ≈ nord approximé par l'axe polaire projeté.
    const up = this.nadirUp.set(0, 0, 1)
    if (Math.abs(this.normal.dot(up)) > 0.99) up.set(0, 1, 0)
    // Cible 1 m SOUS L'ŒIL le long de la verticale — pas la surface h=0 : avec une
    // cible fixe, un œil passé sous l'ellipsoïde (altitude négative) inversait le
    // lookAt → caméra dos à la Terre. L'orientation nadir ne dépend ainsi jamais
    // du signe de l'altitude.
    this.lookTarget.copy(outPos).addScaledVector(this.normal, -1)
    this.nadirMatrix.lookAt(outPos, this.lookTarget, up)
    outQuat.setFromRotationMatrix(this.nadirMatrix)
  }

  /** Positionne instantanément la caméra à la verticale d'un point. */
  jumpTo(p: LatLng, altitude: number): void {
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    this.placeNadir(p, Math.min(altitude, this.maxAltitude), pos, quat)
    this.camera.position.copy(pos)
    this.camera.quaternion.copy(quat)
    this.camera.updateMatrixWorld()
  }

  flyTo(dest: Partial<LatLng> & { altitude?: number }, opts: FlyOptions = {}): void {
    this.followFn = null
    const state = this.getState()
    const target: LatLng = { lat: dest.lat ?? state.lat, lng: dest.lng ?? state.lng }
    const altitude = Math.min(this.maxAltitude, opts.altitude ?? dest.altitude ?? state.altitude)
    const toPos = new THREE.Vector3()
    const toQuat = new THREE.Quaternion()
    this.placeNadir(target, altitude, toPos, toQuat)
    const duration = Math.max(0.05, opts.duration ?? this.flyDuration)
    this.fly = {
      fromPos: this.camera.position.clone(),
      fromQuat: this.camera.quaternion.clone(),
      toPos,
      toQuat,
      t: 0,
      speed: 1 / (duration * 60),
      target,
      altitude,
      tag: opts.tag,
    }
  }

  /**
   * Ré-ancre l'altitude d'arrivée du vol en cours portant `tag` (no-op sinon).
   * Sert au vol d'intro : la hauteur du sol se précise pendant la descente
   * (raffinement des tuiles) → la destination suit, l'atterrissage est exact.
   */
  retargetFlyAltitude(altitude: number, tag?: string): void {
    const f = this.fly
    if (!f || f.tag !== tag) return
    f.altitude = Math.min(this.maxAltitude, altitude)
    this.placeNadir(f.target, f.altitude, f.toPos, f.toQuat)
  }

  /** Interrompt le vol en cours (la caméra reste où elle est). */
  cancelFly(): void {
    this.fly = null
  }

  follow(getPos: () => LatLng | null): () => void {
    this.fly = null
    this.followFn = getPos
    return () => {
      if (this.followFn === getPos) this.followFn = null
    }
  }

  /** Avance vol/suivi. Retourne true si la caméra a été pilotée cette frame. */
  update(): boolean {
    if (this.fly) {
      const f = this.fly
      f.t = Math.min(1, f.t + f.speed)
      const e = this.flyEasing(f.t)
      this.camera.position.lerpVectors(f.fromPos, f.toPos, e)
      this.camera.quaternion.slerpQuaternions(f.fromQuat, f.toQuat, e)
      if (f.t >= 1) this.fly = null
      return true
    }
    if (this.followFn) {
      const p = this.followFn()
      if (p) {
        const altitude = this.getState().altitude
        this.placeNadir(p, clamp(altitude, 200, 2_000_000), this.followPos, this.followQuat)
        this.camera.position.copy(this.followPos)
        this.camera.quaternion.copy(this.followQuat)
      }
      return true
    }
    return false
  }
}

import * as THREE from 'three'
import type { LatLng } from '../shared'
import type { Pt } from './geometry'
import type { Projection } from './Projection'

/**
 * Plan tangent East-North-Up ancré sur un point du globe. Permet de construire
 * les formes/tracés à plat en mètres locaux (x = est, z = nord) puis de les
 * draper sur l'ellipsoïde via une matrice de base — sans toucher aux builders
 * de géométrie planaires (ribbon/fill).
 */
export class EnuFrame {
  readonly origin = new THREE.Vector3()
  readonly east = new THREE.Vector3()
  readonly north = new THREE.Vector3()
  readonly up = new THREE.Vector3()
  private readonly d = new THREE.Vector3()
  private readonly w = new THREE.Vector3()

  constructor(
    private readonly projection: Projection,
    anchor: LatLng,
    /** Hauteur de l'origine (m au-dessus de l'ellipsoïde) — cf. `Projection.resolveAnchorHeight`. */
    height = 0,
  ) {
    projection.getENUAxes(anchor, this.origin, this.east, this.north, this.up, height)
  }

  /** lat/lng → coordonnées locales (mètres) dans le plan tangent. */
  local(p: LatLng): Pt {
    this.projection.latLngToWorld(p, this.w)
    this.d.subVectors(this.w, this.origin)
    return { x: this.d.dot(this.east), z: this.d.dot(this.north) }
  }

  /** Coordonnées locales (mètres) → lat/lng — inverse de `local` (l'écart au plan
   *  tangent est négligeable aux échelles d'édition, quelques km au plus). */
  toLatLng(p: Pt): LatLng {
    this.w.copy(this.origin).addScaledVector(this.east, p.x).addScaledVector(this.north, p.z)
    return this.projection.worldToLatLng(this.w)
  }

  /** Matrice monde qui pose le plan local sur le globe. */
  basis(out?: THREE.Matrix4): THREE.Matrix4 {
    return this.projection.enuBasis(this.origin, this.east, this.north, this.up, out)
  }

  /** Groupe Three drapé sur le globe (matrice figée à la base ENU), prêt à recevoir la géométrie locale. */
  group(): THREE.Group {
    const g = new THREE.Group()
    g.matrixAutoUpdate = false
    this.basis(g.matrix)
    g.matrixWorldNeedsUpdate = true
    return g
  }
}

/** En deçà, la visée projetée est jugée dégénérée (on regarde le long de la verticale). */
export const HEADING_EPSILON = 1e-8

/**
 * Direction « devant » de la caméra projetée sur le plan tangent (`up`), avec le repli
 * délibéré sur le HAUT DE L'ÉCRAN quand la visée dégénère (au nadir on regarde le long de
 * la verticale, à l'horizon c'est l'inverse — d'où l'ordre : visée d'abord). Écrit dans
 * `out` (non normalisé) et le retourne ; l'appelant teste `out.lengthSq() < HEADING_EPSILON`
 * pour la dégénérescence complète (nadir pur).
 *
 * Règle unique partagée par `applyKeyNav` (qui exploite le vecteur), `Camera.getPose` et
 * l'entrée en piéton (qui en tirent un cap via `headingFromForward`).
 */
export const projectViewForward = (
  matrixWorld: THREE.Matrix4,
  up: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 => {
  out.set(0, 0, -1).transformDirection(matrixWorld).projectOnPlane(up)
  if (out.lengthSq() < HEADING_EPSILON) out.set(0, 1, 0).transformDirection(matrixWorld).projectOnPlane(up)
  return out
}

/** Cap (rad, 0 = nord, positif vers l'est) d'une visée projetée ; `0` si elle a dégénéré. */
export const headingFromForward = (forward: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3): number =>
  forward.lengthSq() < HEADING_EPSILON ? 0 : Math.atan2(forward.dot(east), forward.dot(north))

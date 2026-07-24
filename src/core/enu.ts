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
  ) {
    projection.getENUAxes(anchor, this.origin, this.east, this.north, this.up)
  }

  /** lat/lng → coordonnées locales (mètres) dans le plan tangent. */
  local(p: LatLng): Pt {
    this.projection.latLngToWorld(p, this.w)
    this.d.subVectors(this.w, this.origin)
    return { x: this.d.dot(this.east), z: this.d.dot(this.north) }
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

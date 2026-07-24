import * as THREE from 'three'
import type { Ellipsoid } from '3d-tiles-renderer'
import type { LatLng } from '../shared'
import { DEG2RAD, RAD2DEG } from './math'

export type { LatLng } from '../shared'
export type ScreenPoint = { sx: number; sy: number; z: number }

/**
 * Conversion lat/lng ↔ monde ↔ écran en repère **géocentrique (ECEF)**, adossée
 * à l'ellipsoïde WGS84 du `TilesRenderer`. C'est ce repère 3D réel qui **ancre**
 * les markers à leur coordonnée géographique : la position monde d'un point ne
 * dépend plus de la caméra, donc rien ne dérive au déplacement.
 */
export class Projection {
  private ellipsoid: Ellipsoid | null = null
  private group: THREE.Object3D | null = null
  private width = 1
  private height = 1

  private readonly raycaster = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  private readonly scratch = new THREE.Vector3()
  private readonly scratchLocal = new THREE.Vector3()
  // Inverse de group.matrixWorld mémoïsée : recalculée uniquement quand la matrice
  // change (rebase d'origine), pas à chaque pick/occlusion d'une même frame.
  private readonly cachedInverse = new THREE.Matrix4()
  private readonly cachedMatrix = new THREE.Matrix4()
  private readonly rayScratch = new THREE.Ray()
  // Rayon dédié à l'échantillonnage vertical de la hauteur du sol (markers posés
  // sur la vraie surface des tuiles, pas sur l'ellipsoïde).
  private readonly groundRay = new THREE.Raycaster()
  private readonly rayOrigin = new THREE.Vector3()
  private readonly rayDir = new THREE.Vector3()
  private readonly hitLocal = new THREE.Vector3()
  private readonly cartoScratch = { lat: 0, lon: 0, height: 0 }

  /** Fournit l'ellipsoïde et le groupe de tuiles (leur repère local = ECEF). */
  setContext(ellipsoid: Ellipsoid, group: THREE.Object3D): void {
    this.ellipsoid = ellipsoid
    this.group = group
  }

  isReady(): boolean {
    return this.ellipsoid !== null && this.group !== null
  }

  setViewportSize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
  }

  /**
   * Inverse de `group.matrixWorld`, recalculée seulement quand la matrice change.
   * En pratique elle est stable sur de nombreuses frames (ne bouge qu'au rebase
   * d'origine du tileset), donc les 25 picks/frame de `viewportBounds` et les tests
   * d'occlusion par marker partagent une seule inversion.
   */
  private groupInverse(): THREE.Matrix4 {
    const m = this.group!.matrixWorld
    if (!this.cachedMatrix.equals(m)) {
      this.cachedMatrix.copy(m)
      this.cachedInverse.copy(m).invert()
    }
    return this.cachedInverse
  }

  /** lat/lng (+ hauteur en mètres) → position monde (ECEF, appliquée au groupe). */
  latLngToWorld(p: LatLng, out = new THREE.Vector3(), height = 0): THREE.Vector3 {
    if (!this.ellipsoid || !this.group) return out.set(0, 0, 0)
    this.ellipsoid.getCartographicToPosition(p.lat * DEG2RAD, p.lng * DEG2RAD, height, out)
    out.applyMatrix4(this.group.matrixWorld)
    return out
  }

  /** Normale (verticale locale) au point, en repère monde. */
  worldNormal(p: LatLng, out = new THREE.Vector3()): THREE.Vector3 {
    if (!this.ellipsoid || !this.group) return out.set(0, 1, 0)
    this.ellipsoid.getCartographicToNormal(p.lat * DEG2RAD, p.lng * DEG2RAD, out)
    return out.transformDirection(this.group.matrixWorld).normalize()
  }

  /** Position monde → lat/lng. */
  worldToLatLng(v: THREE.Vector3): LatLng {
    if (!this.ellipsoid || !this.group) return { lat: 0, lng: 0 }
    this.scratchLocal.copy(v).applyMatrix4(this.groupInverse())
    const c = this.ellipsoid.getPositionToCartographic(this.scratchLocal, {
      lat: 0,
      lon: 0,
      height: 0,
    }) as { lat: number; lon: number; height: number }
    return { lat: c.lat * RAD2DEG, lng: c.lon * RAD2DEG }
  }

  /**
   * Hauteur (mètres au-dessus de l'ellipsoïde) de la **vraie surface des tuiles 3D**
   * à la verticale de `p`, par lancer de rayon descendant le long de la normale
   * locale. Renvoie `null` si aucune tuile n'est chargée à cet endroit.
   *
   * C'est ce qui permet de *poser* les markers sur le sol/bâti réel plutôt que sur
   * l'ellipsoïde WGS84 : sans ça, l'écart de hauteur (~45 m à Paris) se projette en
   * décalage horizontal variable sous la caméra en perspective → dérive au pan.
   */
  sampleSurfaceHeight(p: LatLng, maxDropMeters = 40000): number | null {
    if (!this.ellipsoid || !this.group) return null
    // Rayon en coordonnées MONDE (le raycaster lit `matrixWorld`) : origine haut
    // au-dessus du point le long de la normale, direction vers le bas.
    this.latLngToWorld(p, this.rayOrigin, 12000)
    this.worldNormal(p, this.rayDir).negate()
    this.groundRay.set(this.rayOrigin, this.rayDir)
    this.groundRay.far = maxDropMeters
    ;(this.groundRay as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true
    const hits = this.groundRay.intersectObject(this.group, true)
    if (hits.length === 0) return null
    return this.heightAtWorld(hits[0]!.point)
  }

  /**
   * Pixel écran → hauteur de la **vraie surface des tuiles 3D** sous ce point (m
   * au-dessus de l'ellipsoïde), ou `null` si aucune tuile n'est touchée. Réutilise le
   * raycaster interne (comme `pickLatLng`) — pas de raycaster dédié côté appelant.
   */
  pickHeight(clientX: number, clientY: number, camera: THREE.Camera): number | null {
    if (!this.ellipsoid || !this.group) return null
    this.ndc.set((clientX / this.width) * 2 - 1, -(clientY / this.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, camera)
    this.raycaster.far = Infinity
    ;(this.raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true
    const hits = this.raycaster.intersectObject(this.group, true)
    if (hits.length === 0) return null
    return this.heightAtWorld(hits[0]!.point)
  }

  /** Hauteur cartographique (m au-dessus ellipsoïde) d'un point en coordonnées MONDE. */
  heightAtWorld(world: THREE.Vector3): number | null {
    if (!this.ellipsoid || !this.group) return null
    this.hitLocal.copy(world).applyMatrix4(this.groupInverse())
    const c = this.ellipsoid.getPositionToCartographic(this.hitLocal, this.cartoScratch) as {
      height: number
    }
    return c.height
  }

  /**
   * Hauteur estimée du **niveau de la rue** (m au-dessus ellipsoïde) sous `p` :
   * minimum de la surface photogrammétrique sur une petite couronne autour du
   * point. La surface brute donne le **toit** au-dessus d'un bâtiment ; la rue
   * adjacente est plus basse → on la récupère en prenant le minimum local.
   *
   * Sans ça, un marker posé sur un toit (≈40 m au-dessus de la rue) « balaie »
   * les rues voisines quand on change l'angle/az de caméra (parallaxe de hauteur),
   * ce qui donne l'impression qu'il saute d'une rue à la rue parallèle.
   */
  sampleGroundHeight(p: LatLng, radiusMeters = 18): number | null {
    const center = this.sampleSurfaceHeight(p)
    if (center === null) return null
    let min = center
    const dLat = radiusMeters / 111320
    const dLng = radiusMeters / (111320 * Math.cos(p.lat * DEG2RAD))
    for (let a = 0; a < 360; a += 45) {
      const rad = a * DEG2RAD
      const h = this.sampleSurfaceHeight({
        lat: p.lat + dLat * Math.sin(rad),
        lng: p.lng + dLng * Math.cos(rad),
      })
      if (h !== null && h < min) min = h
    }
    return min
  }

  /** Position monde → pixels écran (+ profondeur NDC ; z>1 = derrière la caméra). */
  worldToScreen(v: THREE.Vector3, camera: THREE.Camera, out?: ScreenPoint): ScreenPoint {
    this.scratch.copy(v).project(camera)
    const sx = (this.scratch.x * 0.5 + 0.5) * this.width
    const sy = (-this.scratch.y * 0.5 + 0.5) * this.height
    if (out) {
      out.sx = sx
      out.sy = sy
      out.z = this.scratch.z
      return out
    }
    return { sx, sy, z: this.scratch.z }
  }

  /**
   * Un point monde est visible s'il fait face à la caméra (test d'horizon sur
   * l'ellipsoïde) : évite d'afficher les markers passés derrière le globe.
   */
  isAboveHorizon(worldPos: THREE.Vector3, cameraPos: THREE.Vector3): boolean {
    if (!this.ellipsoid || !this.group) return true
    this.scratchLocal.copy(worldPos).applyMatrix4(this.groupInverse())
    // `scratch` = normale monde au point ; `scratchLocal` réutilisé pour la
    // direction vers la caméra (2 vecteurs DISTINCTS, sinon le dot s'auto-annule).
    this.ellipsoid.getPositionToNormal(this.scratchLocal, this.scratch)
    this.scratch.transformDirection(this.group.matrixWorld)
    // Visible si la surface au point regarde vers la caméra.
    return this.scratch.dot(this.scratchLocal.subVectors(cameraPos, worldPos)) > 0
  }

  /** Distance monde (mètres) entre deux lat/lng. */
  groundDistance(a: LatLng, b: LatLng): number {
    const wa = this.latLngToWorld(a, new THREE.Vector3())
    const wb = this.latLngToWorld(b, this.scratch)
    return wa.distanceTo(wb)
  }

  /**
   * Repère tangent East-North-Up en un point, en coordonnées **monde** : origine
   * (position surface) + axes est/nord/haut. Sert à draper les formes 2D à plat
   * sur le globe (plan tangent local).
   */
  getENUAxes(
    p: LatLng,
    origin: THREE.Vector3,
    east: THREE.Vector3,
    north: THREE.Vector3,
    up: THREE.Vector3,
  ): void {
    if (!this.ellipsoid || !this.group) return
    this.ellipsoid.getEastNorthUpAxes(p.lat * DEG2RAD, p.lng * DEG2RAD, east, north, up, origin)
    origin.applyMatrix4(this.group.matrixWorld)
    east.transformDirection(this.group.matrixWorld)
    north.transformDirection(this.group.matrixWorld)
    up.transformDirection(this.group.matrixWorld)
  }

  /** Matrice de base monde d'un plan tangent (x→est, y→haut, z→nord). */
  enuBasis(origin: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3, up: THREE.Vector3, out = new THREE.Matrix4()): THREE.Matrix4 {
    out.makeBasis(east, up, north)
    out.setPosition(origin)
    return out
  }

  /**
   * Pixel écran → lat/lng. Vise d'abord la **vraie surface des tuiles 3D**
   * (sol/bâti visible) pour que « cliquer ici » pose la coordonnée exactement là
   * où on clique ; repli sur l'intersection de l'ellipsoïde (globe lointain, ciel).
   *
   * Coûteux (raycast des tuiles) : réservé au **placement au clic**, pas aux
   * calculs par frame — pour ceux-là voir `pickEllipsoidLatLng`.
   */
  pickLatLng(clientX: number, clientY: number, camera: THREE.Camera): LatLng | null {
    if (!this.ellipsoid || !this.group) return null
    this.ndc.set((clientX / this.width) * 2 - 1, -(clientY / this.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, camera)
    // 1) Surface réelle des tuiles (repère monde) → coordonnée sous le curseur exact.
    this.raycaster.far = Infinity
    ;(this.raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true
    const hits = this.raycaster.intersectObject(this.group, true)
    if (hits.length > 0) return this.worldToLatLng(hits[0]!.point)
    // 2) Repli ellipsoïde (aucune tuile touchée : horizon, océan, très haute altitude).
    return this.ellipsoidFromRay()
  }

  /**
   * Pixel écran → lat/lng par intersection de l'ellipsoïde **uniquement** (aucun
   * raycast de tuiles). Bon marché → utilisable à chaque frame (calcul des bounds
   * du viewport). `null` si le rayon passe au-dessus de l'horizon (ciel).
   */
  pickEllipsoidLatLng(clientX: number, clientY: number, camera: THREE.Camera): LatLng | null {
    if (!this.ellipsoid || !this.group) return null
    this.ndc.set((clientX / this.width) * 2 - 1, -(clientY / this.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, camera)
    return this.ellipsoidFromRay()
  }

  /** Intersection ellipsoïde du rayon courant de `this.raycaster` → lat/lng. */
  private ellipsoidFromRay(): LatLng | null {
    if (!this.ellipsoid || !this.group) return null
    const ray = this.rayScratch.copy(this.raycaster.ray).applyMatrix4(this.groupInverse())
    const hit = this.ellipsoid.intersectRay(ray, this.scratchLocal)
    if (!hit) return null
    const c = this.ellipsoid.getPositionToCartographic(hit, { lat: 0, lon: 0, height: 0 }) as {
      lat: number
      lon: number
      height: number
    }
    return { lat: c.lat * RAD2DEG, lng: c.lon * RAD2DEG }
  }
}

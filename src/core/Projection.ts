import { defaultConfig } from '../config/defaultConfig'
import type { MapConfig } from '../config/types'
import * as THREE from 'three'
import type { Ellipsoid } from '3d-tiles-renderer'
import type { LatLng } from '../shared'
import { CAMERA_FOV, DEG2RAD, M_PER_DEG, metersPerPixelAt, RAD2DEG } from './math'

export type { LatLng } from '../shared'
export type ScreenPoint = { sx: number; sy: number; z: number }

/**
 * Bornes d'altitude acceptées pour un échantillon de surface. Par défaut celles de la
 * Terre (mer Morte −430 m, Everest 8 849 m) : au-delà, l'échantillon est un artefact
 * du LOD racine du tileset (mesuré : −17 km à la vue globe) et vaut « rien touché » —
 * sinon il serait mémoïsé et draperait formes et vols des kilomètres sous la surface.
 *
 * Réglable (`performance.groundHeightRange`) : un tileset non terrestre — maquette,
 * intérieur, relevé aérien — serait entièrement rejeté par les bornes terrestres.
 */

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
  /**
   * Réglages de la carte, poussés par `MapEngine` (à la construction puis à chaud).
   *
   * Remplace l'ancien `setHeightRange` : les bornes de plausibilité n'étaient pas
   * seules à être réglables ici — la géométrie d'échantillonnage du sol (origine et
   * portée du rayon, rayon et densité de la couronne) était en dur, alors que c'est
   * le poste de raycasts le plus sollicité de la lib.
   */
  private config: MapConfig = defaultConfig

  setConfig(config: MapConfig): void {
    this.config = config
  }

  private get heightRange(): readonly [number, number] {
    return this.config.performance.groundHeightRange
  }

  /** `null` si l'échantillon sort des bornes : le point n'a rien touché d'exploitable. */
  private plausibleHeight(h: number | null): number | null {
    const [min, max] = this.heightRange
    return h !== null && h > min && h < max ? h : null
  }

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
  // Scratch dédiés au recalage par frame des bases ENU des formes drapées (enuBasisFor).
  private readonly enuOrigin = new THREE.Vector3()
  private readonly enuEast = new THREE.Vector3()
  private readonly enuNorth = new THREE.Vector3()
  private readonly enuUp = new THREE.Vector3()
  private readonly flatNormal = new THREE.Vector3()

  /**
   * Hauteur de surface de repli (m au-dessus de l'ellipsoïde), suivie par le moteur
   * (terrain sous le centre écran). Utilisée quand le raycast des tuiles ne touche
   * rien (tuiles pas encore chargées, océan…).
   */
  surfaceFallbackHeight = 0

  /**
   * Mode « surface plate » (carte 2D) : hauteur unique du plan visible (le fond 2D est
   * drapé à `terrainElevation`), ou `null` en 3D. Quand il est actif, pick et drapage
   * utilisent CE plan — jamais les tuiles 3D (invisibles mais toujours raycastables).
   */
  private flatHeight: number | null = null

  /**
   * Époque du régime de hauteur : incrémentée à chaque bascule 2D/3D. Les layers la
   * comparent par frame pour re-résoudre leurs hauteurs d'ancre mémoïsées (raycasts
   * uniquement au changement de mode, pas par frame).
   */
  heightEpoch = 0

  setFlatHeight(h: number | null): void {
    if (h === this.flatHeight) return
    this.flatHeight = h
    this.heightEpoch++
  }

  /**
   * Hauteur (m au-dessus de l'ellipsoïde) à laquelle draper une forme ancrée en `p`
   * pour qu'elle colle à la **surface visible**. C'est LE correctif anti-parallaxe des
   * formes : drapées à h=0 sur l'ellipsoïde alors que la surface visible est ~50–100 m
   * plus haut, elles se projetaient décalées et « glissaient » au pan — le bug corrigé
   * pour les markers via `sampleSurfaceHeight`. Renvoie `null` (indéterminée : aucune
   * tuile sous l'ancre) → l'appelant utilise `surfaceFallbackHeight` SANS le mémoïser
   * et retente plus tard (les tuiles arrivent en async).
   */
  resolveAnchorHeight(p: LatLng): number | null {
    if (this.flatHeight !== null) return this.flatHeight
    return this.sampleSurfaceHeight(p)
  }

  /** Fournit l'ellipsoïde et le groupe de tuiles (leur repère local = ECEF). */
  setContext(ellipsoid: Ellipsoid, group: THREE.Object3D): void {
    this.ellipsoid = ellipsoid
    this.group = group
  }

  /**
   * Racine RÉELLEMENT visée par les lancers de rayon, quand elle diffère du groupe de
   * repère (`setContext`). `null` = viser le groupe.
   *
   * Le groupe du `TilesRenderer` est un `TilesGroup` : son `raycast()` délègue au
   * renderer puis **renvoie `false`**, ce qui arrête la traversée de Three — donc rien
   * de ce qu'on y ajoute n'est jamais touché par un rayon. Une surface reconstruite
   * localement (raster interne, bâtiments extrudés) doit donc vivre à côté, et c'est
   * elle qu'on vise alors.
   */
  private raycastRoot: THREE.Object3D | null = null

  setRaycastRoot(root: THREE.Object3D | null): void {
    if (root === this.raycastRoot) return
    this.raycastRoot = root
    // Les hauteurs d'ancre mémoïsées par les couches ont été résolues contre l'ancienne
    // surface : elles doivent toutes être re-résolues.
    this.heightEpoch++
  }

  /** Cible des rayons : la racine dédiée si elle existe, le groupe de repère sinon. */
  private rayTarget(): THREE.Object3D | null {
    return this.raycastRoot ?? this.group
  }

  isReady(): boolean {
    return this.ellipsoid !== null && this.group !== null
  }

  setViewportSize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
  }

  /** Taille du viewport en pixels CSS — lue par le cadrage caméra (padding). */
  get viewportSize(): { width: number; height: number } {
    return { width: this.width, height: this.height }
  }

  /**
   * Inverse de `group.matrixWorld`, recalculée seulement quand la matrice change.
   * En pratique elle est stable sur de nombreuses frames (ne bouge qu'au rebase
   * d'origine du tileset), donc les 25 picks/frame de `viewportBounds` et les tests
   * d'occlusion par marker partagent une seule inversion.
   */
  private groupInverse(): THREE.Matrix4 {
    this.syncGroupMatrix()
    return this.cachedInverse
  }

  private groupEpochCount = 0

  private syncGroupMatrix(): void {
    const m = this.group?.matrixWorld
    if (m && !this.cachedMatrix.equals(m)) {
      this.cachedMatrix.copy(m)
      this.cachedInverse.copy(m).invert()
      this.groupEpochCount++
    }
  }

  /**
   * Époque du repère du tileset : incrémentée quand `group.matrixWorld` change
   * (rebase d'origine — événement rare). Les layers comparent cette valeur par
   * frame pour ne recaler leurs bases ENU qu'au rebase, au lieu de reconstruire
   * des matrices identiques 60×/s carte immobile.
   */
  groupEpoch(): number {
    this.syncGroupMatrix()
    return this.groupEpochCount
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
  sampleSurfaceHeight(p: LatLng, maxDropMeters = this.config.performance.groundSample.rayFarMeters): number | null {
    if (!this.ellipsoid || !this.group) return null
    // Rayon en coordonnées MONDE (le raycaster lit `matrixWorld`) : origine haut
    // au-dessus du point le long de la normale, direction vers le bas.
    this.latLngToWorld(p, this.rayOrigin, this.config.performance.groundSample.rayOriginMeters)
    this.worldNormal(p, this.rayDir).negate()
    this.groundRay.set(this.rayOrigin, this.rayDir)
    this.groundRay.far = maxDropMeters
    ;(this.groundRay as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true
    const target = this.rayTarget()
    if (!target) return null
    const hits = this.groundRay.intersectObject(target, true)
    if (hits.length === 0) return null
    return this.plausibleHeight(this.heightAtWorld(hits[0]!.point))
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
    const target = this.rayTarget()
    if (!target) return null
    const hits = this.raycaster.intersectObject(target, true)
    if (hits.length === 0) return null
    return this.plausibleHeight(this.heightAtWorld(hits[0]!.point))
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
  sampleGroundHeight(p: LatLng, radiusMeters = this.config.performance.groundSample.radiusMeters): number | null {
    const center = this.sampleSurfaceHeight(p)
    if (center === null) return null
    let min = center
    const dLat = radiusMeters / M_PER_DEG
    const dLng = radiusMeters / (M_PER_DEG * Math.cos(p.lat * DEG2RAD))
    // `samples` tirs répartis sur la couronne. Chaque appel coûte `1 + samples`
    // raycasts BVH : c'est le budget le plus sensible de la pose au sol, et il était
    // figé à 8 par un pas de 45° écrit en dur.
    const { samples } = this.config.performance.groundSample
    for (let i = 0; i < samples; i++) {
      const rad = (i / samples) * 2 * Math.PI
      const h = this.sampleSurfaceHeight({
        lat: p.lat + dLat * Math.sin(rad),
        lng: p.lng + dLng * Math.cos(rad),
      })
      if (h !== null && h < min) min = h
    }
    return min
  }

  /**
   * Résolution locale (mètres/pixel) au point `p` (à `height` m) pour la caméra
   * donnée : distance caméra→point, FOV vertical et hauteur d'écran. Sert à convertir
   * les épaisseurs de trait exprimées en **pixels** (style écran constant) en mètres
   * monde au moment de construire la géométrie.
   */
  metersPerPixel(p: LatLng, camera: THREE.Camera, viewportHeight: number, height = 0): number {
    this.latLngToWorld(p, this.scratch, height)
    const dist = camera.position.distanceTo(this.scratch)
    const fov = (camera as THREE.PerspectiveCamera).fov ?? CAMERA_FOV
    return metersPerPixelAt(dist, fov, viewportHeight)
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
    height = 0,
  ): void {
    if (!this.ellipsoid || !this.group) return
    this.ellipsoid.getEastNorthUpAxes(p.lat * DEG2RAD, p.lng * DEG2RAD, east, north, up, origin)
    // Origine relevée à la hauteur de la surface visible (axes inchangés) : un plan
    // drapé à h=0 sous un sol à ~50 m se projette décalé et glisse au pan (parallaxe).
    if (height !== 0) origin.addScaledVector(up, height)
    origin.applyMatrix4(this.group.matrixWorld)
    east.transformDirection(this.group.matrixWorld)
    north.transformDirection(this.group.matrixWorld)
    up.transformDirection(this.group.matrixWorld)
  }

  /** Matrice de base monde d'un plan tangent (x→est, y→haut, z→nord). */
  enuBasis(
    origin: THREE.Vector3,
    east: THREE.Vector3,
    north: THREE.Vector3,
    up: THREE.Vector3,
    out = new THREE.Matrix4(),
  ): THREE.Matrix4 {
    out.makeBasis(east, up, north)
    out.setPosition(origin)
    return out
  }

  /**
   * Écrit dans `out` la matrice de base ENU **monde** d'une ancre lat/lng. À rappeler
   * chaque frame sur la matrice figée d'une forme drapée : `group.matrixWorld` change
   * au **rebase d'origine du tileset** (caméra qui s'éloigne), et sans ce recalage la
   * géométrie resterait dans l'ancien repère → dérive au pan. Réutilise des scratch
   * internes (aucune allocation par appel).
   */
  enuBasisFor(anchor: LatLng, out: THREE.Matrix4, height = 0): THREE.Matrix4 {
    this.getENUAxes(anchor, this.enuOrigin, this.enuEast, this.enuNorth, this.enuUp, height)
    return this.enuBasis(this.enuOrigin, this.enuEast, this.enuNorth, this.enuUp, out)
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
    // Mode 2D : la surface visible est le PLAN du fond (terrainElevation), pas les
    // tuiles 3D — masquées mais toujours raycastables (three ignore `visible`). Sans
    // ce court-circuit, cliquer « sur la carte plate » ramènerait le toit d'un
    // bâtiment invisible → coordonnée décalée par rapport au point visé.
    if (this.flatHeight !== null) return this.ellipsoidFromRay(this.flatHeight)
    // 1) Surface réelle des tuiles (repère monde) → coordonnée sous le curseur exact.
    this.raycaster.far = Infinity
    ;(this.raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true
    const target = this.rayTarget()
    if (!target) return null
    const hits = this.raycaster.intersectObject(target, true)
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

  /**
   * Intersection du rayon courant de `this.raycaster` avec la surface « ellipsoïde
   * + `height` mètres » → lat/lng. Pour h ≠ 0 : le rayon est décalé de −h le long de
   * la verticale locale du premier impact puis ré-intersecté (h ≪ R → une itération
   * suffit, erreur ~h²/R sub-millimétrique).
   */
  private ellipsoidFromRay(height = 0): LatLng | null {
    if (!this.ellipsoid || !this.group) return null
    const ray = this.rayScratch.copy(this.raycaster.ray).applyMatrix4(this.groupInverse())
    let hit = this.ellipsoid.intersectRay(ray, this.scratchLocal)
    if (!hit) return null
    if (height !== 0) {
      this.ellipsoid.getPositionToNormal(this.scratchLocal, this.flatNormal)
      ray.origin.addScaledVector(this.flatNormal, -height)
      hit = this.ellipsoid.intersectRay(ray, this.scratchLocal)
      if (!hit) return null
    }
    const c = this.ellipsoid.getPositionToCartographic(hit, { lat: 0, lon: 0, height: 0 }) as {
      lat: number
      lon: number
      height: number
    }
    return { lat: c.lat * RAD2DEG, lng: c.lon * RAD2DEG }
  }
}

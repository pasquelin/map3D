import { defaultConfig } from '../config/defaultConfig'
import type { MapConfig } from '../config/types'
import * as THREE from 'three'
import type { Bounds, LatLng } from '../shared'
import { type AltitudeForBoundsOptions, altitudeForBounds, centerOfBounds } from './bounds'
import { EnuFrame } from './enu'
import type { Projection } from './Projection'
import { altitudeForZoom, clamp, easeInOutCubic, metersPerPixelAt, zoomForAltitude } from './math'

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

/**
 * Marge en **pixels** autour du contenu cadré. Un nombre s'applique aux 4 côtés.
 * La forme détaillée existe parce que l'app hôte superpose souvent des panneaux à
 * la carte : le contenu doit alors être centré dans la zone RESTÉE visible.
 */
export type FitPadding = number | { top?: number; right?: number; bottom?: number; left?: number }

export type FitBoundsOptions = AltitudeForBoundsOptions & {
  padding?: FitPadding
  /** Durée du vol en secondes ; `0` = repositionnement instantané. */
  duration?: number
}

const resolvePadding = (p: FitPadding | undefined): { top: number; right: number; bottom: number; left: number } =>
  typeof p === 'number'
    ? { top: p, right: p, bottom: p, left: p }
    : { top: p?.top ?? 0, right: p?.right ?? 0, bottom: p?.bottom ?? 0, left: p?.left ?? 0 }

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
  /**
   * Durées (s) des déplacements qui ne sont pas des vols ordinaires. Posées par
   * `<Map>` depuis `theme.animations`, comme `flyDuration` — le core n'a pas de
   * contexte de thème, mais il ne doit pas non plus figer un rythme.
   */
  panDuration = 0.5
  zoomDuration = 0.4
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

  /** Réglages de la carte, poussés par `MapEngine` (construction puis à chaud). */
  private config: MapConfig = defaultConfig

  setConfig(config: MapConfig): void {
    this.config = config
  }

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

  /** Dernier échantillon de sol — `sampleGroundHeight` coûte ~9 raycasts BVH, et
   *  certains appelants reviennent sur la même cible par frame (retarget d'intro,
   *  follow). Expiré après 2 s : le sol se raffine avec le streaming des tuiles. */
  private groundCache: { lat: number; lng: number; ground: number | null; at: number } | null = null

  /**
   * Borne une altitude de destination : ≤ `maxAltitude` ET ≥ sol réel (tuiles) +
   * `minGroundClearance`. Sol inconnu (tuiles pas chargées) → repli ellipsoïde ;
   * le géoïde négatif (mer Morte) reste légitime, le plancher le suit.
   * NB : le zoom molette ne passe pas ici — il est couvert par l'anti-collision
   * de GlobeControls.
   */
  private clampAltitude(p: LatLng, altitude: number): number {
    const now = performance.now()
    const c = this.groundCache
    // TTL et quantification du cache d'échantillon : ils évitent de relancer
    // `sampleGroundHeight` (≈9 raycasts BVH) à chaque frame d'un mouvement, et
    // c'est un arbitrage coût/fraîcheur — donc un réglage, pas un invariant.
    const { ttlMs, cellDeg } = this.config.performance.groundSample
    const cached = c && now - c.at < ttlMs && Math.abs(c.lat - p.lat) < cellDeg && Math.abs(c.lng - p.lng) < cellDeg
    const ground = cached ? c.ground : this.projection.sampleGroundHeight(p)
    if (!cached) this.groundCache = { lat: p.lat, lng: p.lng, ground, at: now }
    return Math.max(Math.min(altitude, this.maxAltitude), (ground ?? 0) + this.config.camera.minGroundClearance)
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
    this.placeNadir(p, this.clampAltitude(p, altitude), pos, quat)
    this.camera.position.copy(pos)
    this.camera.quaternion.copy(quat)
    this.camera.updateMatrixWorld()
  }

  flyTo(dest: Partial<LatLng> & { altitude?: number }, opts: FlyOptions = {}): void {
    this.followFn = null
    const state = this.getState()
    const target: LatLng = { lat: dest.lat ?? state.lat, lng: dest.lng ?? state.lng }
    const altitude = this.clampAltitude(target, opts.altitude ?? dest.altitude ?? state.altitude)
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
    f.altitude = this.clampAltitude(f.target, altitude)
    this.placeNadir(f.target, f.altitude, f.toPos, f.toQuat)
  }

  /** Interrompt le vol en cours (la caméra reste où elle est). */
  cancelFly(): void {
    this.fly = null
  }

  // ── Cadrage et recentrage ──

  /**
   * Cadre un ensemble géographique : la caméra se place à la verticale du centre,
   * à l'altitude qui fait tenir le cadre à l'écran.
   *
   * Le `padding` agit en deux temps — il réduit la surface utile (donc recule la
   * caméra), et **décale le centre visé** quand il est asymétrique, pour que le
   * contenu soit centré dans la zone restée visible et non dans le viewport entier.
   */
  fitBounds(bounds: Bounds, opts: FitBoundsOptions = {}): void {
    const center = centerOfBounds(bounds)
    const pad = resolvePadding(opts.padding)
    const { width, height } = this.projection.viewportSize
    // Surface utile après déduction des marges. Un padding absurde (plus large que
    // le viewport) est ramené à une bande minimale plutôt que de diviser par ~0.
    const usableW = Math.max(1, width - pad.left - pad.right)
    const usableH = Math.max(1, height - pad.top - pad.bottom)
    const zoomOut = Math.max(width / usableW, height / usableH)
    // Les défauts de cadrage viennent du thème (`camera.fitBounds`) ; un appel qui
    // fournit `margin`/`minAltitude`/`maxAltitude` garde la main dessus.
    let altitude = altitudeForBounds(bounds, { ...this.config.camera.fitBounds, ...opts }) * zoomOut

    // Décalage du centre : le milieu de la zone utile n'est le milieu de l'écran
    // que si les marges opposées sont égales.
    const dxPx = (pad.left - pad.right) / 2
    const dyPx = (pad.top - pad.bottom) / 2
    let target = center
    if (dxPx !== 0 || dyPx !== 0) {
      // Vue nadir : la hauteur au sol couverte vaut 2·altitude·tan(fov/2), donc la
      // résolution se déduit de l'altitude visée — pas de la position actuelle.
      const mpp = metersPerPixelAt(altitude, this.camera.fov, height)
      // Caméra décalée à l'OPPOSÉ en est (le contenu glisse vers la droite quand la
      // caméra va à gauche), et dans le même sens en nord (l'écran descend au sud).
      const frame = new EnuFrame(this.projection, center, 0)
      target = frame.toLatLng({ x: -dxPx * mpp, z: dyPx * mpp })
    }

    altitude = this.clampAltitude(target, altitude)
    if (opts.duration === 0) this.jumpTo(target, altitude)
    else this.flyTo(target, { altitude, duration: opts.duration })
  }

  /**
   * Recentre sur un point en **conservant l'altitude courante** (équivalent de
   * `setCenter`). Instantané ; `panTo` en est la version animée.
   */
  setCenter(p: LatLng): void {
    this.jumpTo(p, this.getState().altitude)
  }

  /** Recentre en douceur, altitude inchangée (équivalent de `panTo`). */
  panTo(p: LatLng, opts: FlyOptions = {}): void {
    this.flyTo(p, { duration: this.panDuration, ...opts })
  }

  /**
   * Niveau de zoom façon carte 2D (l'échelle Google : 0 = monde, ~20 = rue),
   * converti en altitude. Le point visé ne bouge pas.
   */
  setZoom(zoom: number, opts: { duration?: number } = {}): void {
    const s = this.getState()
    const altitude = altitudeForZoom(zoom)
    if (opts.duration === 0) this.jumpTo({ lat: s.lat, lng: s.lng }, altitude)
    else this.flyTo({ lat: s.lat, lng: s.lng }, { altitude, duration: opts.duration ?? this.zoomDuration })
  }

  /** Zoom courant sur la même échelle que `setZoom`. */
  getZoom(): number {
    return zoomForAltitude(this.getState().altitude)
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
      // Cible momentanément absente (marker clusterisé ou masqué par le filtre
      // « Couches ») : rendre la main aux contrôles au lieu de figer la caméra —
      // le suivi reprend dès que la cible réapparaît.
      if (!p) return false
      const altitude = this.getState().altitude
      // Plancher sol aussi en suivi (terrain haut : montagne, plateau) — le
      // cache d'échantillon absorbe l'appel par frame d'une cible mobile.
      const follow = this.config.camera.followAltitude
      this.placeNadir(
        p,
        this.clampAltitude(p, clamp(altitude, follow.min, follow.max)),
        this.followPos,
        this.followQuat,
      )
      this.camera.position.copy(this.followPos)
      this.camera.quaternion.copy(this.followQuat)
      return true
    }
    return false
  }
}

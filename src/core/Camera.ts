import { defaultConfig } from '../config/defaultConfig'
import type { MapConfig } from '../config/types'
import * as THREE from 'three'
import type { Bounds, LatLng } from '../shared'
import { type AltitudeForBoundsOptions, altitudeForBounds, centerOfBounds } from './bounds'
import { EnuFrame, headingFromForward, projectViewForward } from './enu'
import type { Projection } from './Projection'
import { altitudeForZoom, clamp, easeInOutCubic, metersPerPixelAt, zoomForAltitude } from './math'

export type CameraState = {
  lat: number
  lng: number
  /** Altitude de la caméra au-dessus de la surface (mètres). */
  altitude: number
  /**
   * Cap (rad), 0 = nord, positif vers l'est. **Toujours `0` dans `getState()`** — seul
   * `getPose()` le renseigne réellement (cf. son JSDoc pour le pourquoi).
   */
  heading: number
  /** Inclinaison (rad), 0 = nadir, π/2 = horizon. Même réserve que `heading`. */
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
  /**
   * Inclinaison max (rad) des poses reposées par `jumpToPose`/`flyToPose`. Posée par
   * `MapEngine.applyCameraLimits` depuis `camera.maxTilt2d`/`maxTilt3d` — comme
   * `maxAltitude`, la borne dépend du MODE et n'a donc pas sa place ici en dur : une vue
   * mémorisée en 3D et rechargée sur une carte plate se redresse au lieu de basculer.
   */
  maxTilt = Infinity

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

  /**
   * Pose COMPLÈTE : `getState()` avec un cap et une inclinaison réels, dans les
   * conventions du mode piéton (`PedestrianController`) — rad, 0 = nord / 0 = nadir.
   *
   * Méthode distincte, et non un `getState()` enrichi : ce dernier est appelé plusieurs
   * fois par frame (vol, suivi, `hasMoved`, near/far) et n'a pas besoin du repère tangent
   * que le cap réclame. Ici on est sur un chemin FROID — mémoriser ou relire une vue —,
   * donc les axes ENU et les vecteurs de travail se paient sans conséquence.
   *
   * `lat`/`lng` désignent le point au sol **sous l'œil**, jamais le point visé : c'est ce
   * qui rend l'aller-retour avec `jumpToPose` exact quelle que soit l'inclinaison.
   */
  getPose(): CameraState {
    const state = this.getState()
    if (!this.projection.isReady()) return state
    // Le cap et l'inclinaison se lisent sur `matrixWorld`, que seule la boucle du moteur
    // rafraîchit : lue depuis un clic d'interface — ou juste après le `update()` d'un vol —
    // elle a une frame de retard, et la vue mémorisée serait celle d'AVANT. Le recalcul est
    // gratuit hors boucle de frame, et c'est le seul point qui rend cette lecture fiable.
    this.camera.updateMatrixWorld()
    const origin = new THREE.Vector3()
    const east = new THREE.Vector3()
    const north = new THREE.Vector3()
    const up = new THREE.Vector3()
    this.projection.getENUAxes(state, origin, east, north, up)
    // Axe +Z caméra = son « arrière », c'est-à-dire la verticale en vue nadir : l'angle
    // qu'il fait avec la normale au sol EST l'inclinaison, sans raycast ni point visé.
    const back = new THREE.Vector3(0, 0, 1).transformDirection(this.camera.matrixWorld)
    const tilt = up.angleTo(back)
    // Visée projetée à plat, repli sur le haut de l'écran quand elle dégénère — la règle
    // partagée par `applyKeyNav` et l'entrée en piéton (cf. `projectViewForward`).
    const dir = projectViewForward(this.camera.matrixWorld, up, new THREE.Vector3())
    const heading = headingFromForward(dir, east, north)
    return { ...state, heading, tilt }
  }

  /**
   * Borne une altitude de destination : ≤ `maxAltitude` ET ≥ sol réel (tuiles) +
   * `minGroundClearance`. Sol inconnu (tuiles pas chargées) → repli ellipsoïde ;
   * le géoïde négatif (mer Morte) reste légitime, le plancher le suit.
   * NB : le zoom molette ne passe pas ici — il est couvert par l'anti-collision
   * de GlobeControls.
   *
   * La mémoïsation des ~9 raycasts vit dans `Projection` (`sampleGroundHeightCached`), sur
   * les mêmes clés de config. Cette classe en tenait sa propre copie à UNE entrée — sans
   * effet dès que deux cibles alternaient, et surtout aveugle à `heightEpoch` : après une
   * bascule 2D/3D, un vol se clampait encore sur l'ancienne surface.
   */
  private clampAltitude(p: LatLng, altitude: number): number {
    const ground = this.projection.sampleGroundHeightCached(p)
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

  /**
   * Généralisation de `placeNadir` à un cap et une inclinaison — `heading = tilt = 0` en
   * redonne exactement la pose (le « nord approximé par l'axe polaire projeté » de
   * `placeNadir` EST le nord ENU).
   *
   * L'inclinaison se prend SUR PLACE : la caméra pivote, elle n'orbite pas autour d'un
   * point visé. `p` reste donc le point au sol sous l'œil de part et d'autre, ce qui rend
   * `getPose` exactement inversible — une vue rechargée est celle qu'on avait mémorisée.
   *
   * Chemin froid (une pose par chargement de vue, puis l'interpolation du vol travaille
   * sur les quaternions déjà calculés) : les vecteurs de travail sont locaux, contrairement
   * à `placeNadir` que le mode suivi appelle par frame.
   */
  private placeOrbit(
    p: LatLng,
    altitude: number,
    heading: number,
    tilt: number,
    outPos: THREE.Vector3,
    outQuat: THREE.Quaternion,
  ): void {
    const origin = new THREE.Vector3()
    const east = new THREE.Vector3()
    const north = new THREE.Vector3()
    const up = new THREE.Vector3()
    this.projection.getENUAxes(p, origin, east, north, up)
    outPos.copy(origin).addScaledVector(up, altitude)
    // Direction du cap dans le plan tangent, puis base caméra three.js (X = droite,
    // Y = haut de l'écran, Z = arrière). Écrite d'un seul tenant plutôt qu'en deux
    // rotations enchaînées : au nadir le cap se lit sur Y, à l'horizon sur −Z, et cette
    // base est continue entre les deux — donc aucun cas limite à traiter à part.
    const bearing = new THREE.Vector3()
      .addScaledVector(north, Math.cos(heading))
      .addScaledVector(east, Math.sin(heading))
    const z = new THREE.Vector3().addScaledVector(up, Math.cos(tilt)).addScaledVector(bearing, -Math.sin(tilt))
    const y = new THREE.Vector3().addScaledVector(bearing, Math.cos(tilt)).addScaledVector(up, Math.sin(tilt))
    const x = new THREE.Vector3().crossVectors(y, z)
    outQuat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x.normalize(), y.normalize(), z.normalize()))
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

  /**
   * Repose instantanément une pose rendue par `getPose` — restaurer une vue mémorisée.
   *
   * Coupe vol ET suivi : recharger une vue est une prise de main, elle ne doit pas se
   * faire écraser à la frame suivante par un déplacement programmé qui courait encore.
   * L'altitude passe par `clampAltitude` (sol réel) et l'inclinaison par `maxTilt` (borne
   * du mode courant) : une vue reste chargeable sur une carte qui n'a plus les mêmes
   * capacités que celle où elle a été prise.
   */
  jumpToPose(pose: CameraState): void {
    this.fly = null
    this.followFn = null
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const p: LatLng = { lat: pose.lat, lng: pose.lng }
    this.placeOrbit(p, this.clampAltitude(p, pose.altitude), pose.heading, this.clampTilt(pose.tilt), pos, quat)
    this.camera.position.copy(pos)
    this.camera.quaternion.copy(quat)
    this.camera.updateMatrixWorld()
  }

  /**
   * Monte le tween de vol commun à `flyTo`/`flyToPose` — même interpolation, seule la
   * destination (nadir ou orbitale) diffère. `duration` en secondes (défaut `flyDuration`),
   * plancher `0.05` s ; `speed` normalise sur 60 fps (le tween avance par frame).
   */
  private startFly(
    toPos: THREE.Vector3,
    toQuat: THREE.Quaternion,
    target: LatLng,
    altitude: number,
    duration: number | undefined,
    tag?: string,
  ): void {
    const secs = Math.max(0.05, duration ?? this.flyDuration)
    this.fly = {
      fromPos: this.camera.position.clone(),
      fromQuat: this.camera.quaternion.clone(),
      toPos,
      toQuat,
      t: 0,
      speed: 1 / (secs * 60),
      target,
      altitude,
      tag,
    }
  }

  /** Version animée de `jumpToPose` — mêmes bornes, même prise de main. */
  flyToPose(pose: CameraState, opts: FlyOptions = {}): void {
    this.followFn = null
    const target: LatLng = { lat: pose.lat, lng: pose.lng }
    const altitude = this.clampAltitude(target, opts.altitude ?? pose.altitude)
    const toPos = new THREE.Vector3()
    const toQuat = new THREE.Quaternion()
    this.placeOrbit(target, altitude, pose.heading, this.clampTilt(pose.tilt), toPos, toQuat)
    this.startFly(toPos, toQuat, target, altitude, opts.duration, opts.tag)
  }

  /** Inclinaison bornée au mode courant, jamais négative (pas de bascule tête en bas). */
  private clampTilt(tilt: number): number {
    return clamp(tilt, 0, this.maxTilt)
  }

  flyTo(dest: Partial<LatLng> & { altitude?: number }, opts: FlyOptions = {}): void {
    this.followFn = null
    const state = this.getState()
    const target: LatLng = { lat: dest.lat ?? state.lat, lng: dest.lng ?? state.lng }
    const altitude = this.clampAltitude(target, opts.altitude ?? dest.altitude ?? state.altitude)
    const toPos = new THREE.Vector3()
    const toQuat = new THREE.Quaternion()
    this.placeNadir(target, altitude, toPos, toQuat)
    this.startFly(toPos, toQuat, target, altitude, opts.duration, opts.tag)
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

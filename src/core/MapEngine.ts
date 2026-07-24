import * as THREE from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { GlobeControls, TilesRenderer } from '3d-tiles-renderer'
import { CesiumIonAuthPlugin, GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins'
import { TiledGlobeLayer } from '../layers/TiledGlobeLayer'
import type { Bounds, LatLng } from '../shared'
import { Camera, type CameraState } from './Camera'
import { GoogleTileSource, TILE_SIZE } from './googleTiles'
import type { FrameContext, Layer, MapView } from './Layer'
import { clamp, DEG2RAD } from './math'
import { Projection } from './Projection'

export type PointerPhase = 'down' | 'move' | 'up'
/** Intercepteur d'entrée (outils de dessin) : renvoie true pour consommer. */
export type PointerInterceptor = (
  phase: PointerPhase,
  latLng: LatLng | null,
  event: PointerEvent,
) => boolean

/** Type de carte : 3D photoréaliste (Ion) ou fond 2D Google (plan). */
export type MapMode = '3d' | 'plan'

/** Inclinaison max en 2D (rad, mesurée depuis le nadir : 0 = vue du dessus). ~36° max
 *  → la vue ne plonge pas vers l'horizon → couverture de tuiles bornée. Défaut lib 0.45π. */
const TWO_D_MAX_ALTITUDE = Math.PI * 0.2

export type MapEngineOptions = {
  canvas: HTMLCanvasElement
  center: LatLng
  zoom: number
  background: string
  /** Clé Google Maps Platform → Photorealistic 3D Tiles en direct (prioritaire sur Ion). */
  googleMapsApiKey?: string
  /** Token Cesium Ion → Google Photorealistic 3D Tiles via Cesium. */
  cesiumIonToken?: string
  /** Asset Cesium Ion (défaut 2275207 = Google Photorealistic 3D Tiles). */
  cesiumIonAssetId?: string
  /** Affiche un globe ellipsoïde uni de repli quand aucune tuile n'est disponible. */
  fallbackGlobe: boolean
  /** Erreur d'écran cible (screen-space error) — qualité/perf. */
  errorTarget?: number
}

export type MapEvents = {
  camera: CameraState
  viewport: MapView
  click: { latLng: LatLng; originalEvent: PointerEvent }
}

type Listener<E extends keyof MapEvents> = (payload: MapEvents[E]) => void

const EARTH_CIRCUMFERENCE = 40_075_016
export const altitudeForZoom = (zoom: number): number => EARTH_CIRCUMFERENCE / Math.pow(2, zoom)
export const zoomForAltitude = (alt: number): number => Math.log2(EARTH_CIRCUMFERENCE / Math.max(1, alt))

/**
 * Cœur du moteur : scène Three, `TilesRenderer` (Google Photorealistic 3D Tiles
 * ou tileset custom), `GlobeControls` (navigation façon Google Earth), globe
 * ellipsoïde de repli, et boucle de rendu. Le repère est géocentrique (ECEF),
 * ce qui **ancre** markers et formes à leur coordonnée géographique.
 */
export class MapEngine {
  readonly scene = new THREE.Scene()
  readonly threeCamera: THREE.PerspectiveCamera
  readonly camera: Camera
  readonly projection = new Projection()
  readonly renderer: THREE.WebGLRenderer
  /** Overlay HTML ancré au repère 3D : les markers sont des `CSS2DObject`. */
  readonly labelRenderer: CSS2DRenderer
  readonly tiles: TilesRenderer
  readonly controls: GlobeControls
  /**
   * Ancre (enfant de `tiles.group`, transformée identité) pour les overlays qui doivent
   * hériter du repère du tileset mais rester visibles même quand la 3D est masquée (mode
   * 2D) — les markers `CSS2DObject` s'y attachent au lieu de `tiles.group` directement.
   */
  readonly overlayAnchor = new THREE.Group()

  inputInterceptor: PointerInterceptor | null = null

  private readonly canvas: HTMLCanvasElement
  private readonly layers = new Set<Layer>()
  private readonly listeners: { [E in keyof MapEvents]: Set<Listener<E>> } = {
    camera: new Set(),
    viewport: new Set(),
    click: new Set(),
  }
  private fallback: THREE.Object3D | null = null
  private size = { width: 1, height: 1 }
  private raf = 0
  private running = false
  private lastTime = 0
  private disposed = false
  private settleFrames = 0
  private lastState: CameraState | null = null
  /** Vue mémoïsée : les bounds viewport ne changent qu'au mouvement caméra / resize. */
  private viewDirty = true
  private cachedView: MapView | null = null

  private drag: { x: number; y: number; moved: number } | null = null

  private stars: THREE.Points | null = null
  private drawingMode = false
  /** Globe 2D Google tuilé (LOD/cache/prefetch), null si pas de clé. */
  private basemap2d: TiledGlobeLayer | null = null
  /** Inclinaison max d'origine de GlobeControls (rétablie en sortie de mode 2D). */
  private defaultMaxAltitude = 0.45 * Math.PI
  /** Distance max caméra↔centre Terre (limite de dézoom). 0 = illimité. */
  private maxCameraDistance = 0
  private readonly clampScratch = new THREE.Vector3()

  constructor(opts: MapEngineOptions) {
    this.canvas = opts.canvas
    this.renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: true })
    // pixelRatio = 1 imposé : le canvas fait EXACTEMENT la taille du parent (aucun
    // ×2 DPR, ni sur le backing store ni sur l'affichage).
    this.renderer.setPixelRatio(1)
    this.renderer.setClearColor(new THREE.Color(opts.background), 1)

    this.threeCamera = new THREE.PerspectiveCamera(60, 1, 1, 1e8)
    this.threeCamera.position.set(0, 0, 2e7)

    // Source de tuiles 3D : Cesium Ion (token) en priorité, sinon Google Maps Platform
    // en direct (clé). NB : les Photorealistic 3D Tiles Google sont bloquées pour les
    // comptes EEA → Ion reste la source fiable. Sans l'un ni l'autre, le TilesRenderer
    // reste vide → globe ellipsoïde de repli.
    const hasCustomTiles = !!(opts.cesiumIonToken || opts.googleMapsApiKey)
    this.tiles = new TilesRenderer()
    if (opts.cesiumIonToken) {
      this.tiles.registerPlugin(
        new CesiumIonAuthPlugin({
          apiToken: opts.cesiumIonToken,
          assetId: opts.cesiumIonAssetId ?? '2275207',
          autoRefreshToken: true,
        }),
      )
    } else if (opts.googleMapsApiKey) {
      this.tiles.registerPlugin(
        new GoogleCloudAuthPlugin({ apiToken: opts.googleMapsApiKey, autoRefreshToken: true }),
      )
    }
    if (opts.errorTarget !== undefined) this.tiles.errorTarget = opts.errorTarget
    this.tiles.setCamera(this.threeCamera)
    this.tiles.setResolutionFromRenderer(this.threeCamera, this.renderer)
    this.scene.add(this.tiles.group)
    // Ancre des overlays (markers) : partage la transformée du tileset mais n'est jamais
    // masquée avec les tuiles 3D (cf. setTiles3DVisible).
    this.overlayAnchor.name = 'm3d-overlay-anchor'
    this.tiles.group.add(this.overlayAnchor)

    this.projection.setContext(this.tiles.ellipsoid, this.tiles.group)

    // Fond 2D Google : couche indépendante (plan/terrain/trafic) drapée sur le globe,
    // rendue seulement en mode 2D (le tileset 3D est alors masqué). NB EEA : Google 2D
    // ne sert que roadmap/terrain/trafic (satellite/hybride bloqués).
    if (opts.googleMapsApiKey) {
      this.basemap2d = new TiledGlobeLayer(
        this.tiles.group,
        this.tiles.ellipsoid,
        new GoogleTileSource(opts.googleMapsApiKey),
      )
    }

    // Renderer HTML superposé au canvas : positionne chaque `CSS2DObject` via la
    // caméra Three (aucune projection écran manuelle → zéro dérive). `domElement`
    // laisse passer les clics (pointer-events:none) ; les markers les réactivent.
    this.labelRenderer = new CSS2DRenderer()
    const labelDom = this.labelRenderer.domElement
    labelDom.className = 'm3d-css2d'
    labelDom.style.position = 'absolute'
    labelDom.style.top = '0'
    labelDom.style.left = '0'
    labelDom.style.pointerEvents = 'none'
    // overflow visible : sinon menus/popups ancrés aux markers de bord sont coupés.
    labelDom.style.overflow = 'visible'
    this.canvas.parentElement?.appendChild(labelDom)

    if (opts.fallbackGlobe && !hasCustomTiles) {
      this.fallback = this.buildFallbackGlobe(opts.background)
      this.tiles.group.add(this.fallback)
    }

    this.controls = new GlobeControls()
    this.controls.setScene(this.scene)
    this.controls.setCamera(this.threeCamera)
    this.controls.setEllipsoid(this.tiles.ellipsoid, this.tiles.group)
    ;(this.controls as unknown as { tilesRenderer: TilesRenderer }).tilesRenderer = this.tiles
    this.controls.enableDamping = true
    this.defaultMaxAltitude = this.controls.maxAltitude
    this.controls.attach(this.canvas)

    this.camera = new Camera(this.threeCamera, this.projection)
    // Vue initiale : survol nadir du centre à l'altitude déduite du zoom.
    this.camera.jumpTo(opts.center, altitudeForZoom(opts.zoom))

    // Limite de dézoom : la Terre reste bien visible avec une petite marge d'espace,
    // jamais réduite à un point. maxCameraDistance = distance caméra↔centre Terre.
    const R = this.tiles.ellipsoid.radius.x
    this.maxCameraDistance = R * 2.5
    this.camera.maxAltitude = R * 1.5
    this.controls.maxDistance = R * 1.5

    // Fond étoilé : ajouté à la scène, rendu en premier (renderOrder -1, sans
    // écrire le depth) → toujours derrière la carte, sans altérer le pipeline.
    this.stars = this.buildStars()
    this.scene.add(this.stars)

    // Zoom molette actif sur TOUT l'overlay, même curseur sur un marker : on relaie
    // l'événement `wheel` reçu par l'overlay HTML vers le canvas (écouté par GlobeControls).
    labelDom.addEventListener('wheel', this.forwardWheel, { passive: false })

    this.bindInput()
  }

  /** Relaie une molette de l'overlay vers le canvas (zoom même au-dessus d'un marker). */
  private forwardWheel = (e: WheelEvent): void => {
    e.preventDefault()
    this.canvas.dispatchEvent(
      new WheelEvent('wheel', {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
        clientX: e.clientX,
        clientY: e.clientY,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        bubbles: false,
        cancelable: true,
      }),
    )
  }

  /** Nuage de points aléatoires sur une sphère → étoiles constantes à l'écran. */
  private buildStars(): THREE.Points {
    const count = 2600
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const R = 1e7
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1
      const theta = Math.random() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      pos[i * 3] = R * s * Math.cos(theta)
      pos[i * 3 + 1] = R * s * Math.sin(theta)
      pos[i * 3 + 2] = R * u
      const b = 0.55 + Math.random() * 0.45
      col[i * 3] = b
      col[i * 3 + 1] = b
      col[i * 3 + 2] = Math.min(1, b + 0.06) // léger bleuté
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const mat = new THREE.PointsMaterial({
      size: 2,
      sizeAttenuation: false,
      vertexColors: true,
      depthTest: false,
      depthWrite: false,
    })
    const stars = new THREE.Points(geo, mat)
    stars.renderOrder = -1
    stars.frustumCulled = false
    return stars
  }

  // ── Cycle de vie ──

  start(): void {
    if (this.running || this.disposed) return
    this.running = true
    this.lastTime = performance.now()
    const loop = (t: number) => {
      if (!this.running) return
      this.raf = requestAnimationFrame(loop)
      this.tick(t)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  setSize(width: number, height: number): void {
    this.size = { width: Math.max(1, width), height: Math.max(1, height) }
    // updateStyle=true : three fixe canvas.style.width/height en px CSS (= taille du
    // conteneur), le backing store restant à ×DPR. SANS ça, le canvas (élément
    // remplacé) garde sa largeur intrinsèque (attribut = ×DPR) → affiché 2× trop
    // grand, globe en bas-droite et markers décalés d'un facteur DPR.
    this.renderer.setSize(width, height, true)
    this.threeCamera.aspect = width / Math.max(1, height)
    this.threeCamera.updateProjectionMatrix()
    this.projection.setViewportSize(width, height)
    this.labelRenderer.setSize(width, height)
    this.tiles.setResolutionFromRenderer(this.threeCamera, this.renderer)
    // La taille du viewport change les bounds : invalide la vue mémoïsée.
    this.viewDirty = true
  }

  addLayer(layer: Layer): void {
    this.layers.add(layer)
  }

  removeLayer(layer: Layer): void {
    this.layers.delete(layer)
    layer.dispose()
  }

  on<E extends keyof MapEvents>(event: E, cb: Listener<E>): () => void {
    this.listeners[event].add(cb)
    return () => this.listeners[event].delete(cb)
  }

  private emit<E extends keyof MapEvents>(event: E, payload: MapEvents[E]): void {
    for (const cb of this.listeners[event]) cb(payload)
  }

  /**
   * Mode dessin : on **garde le zoom molette natif** de GlobeControls, mais on
   * **bloque déplacement + rotation** au drag. GlobeControls reste `enabled` (sinon
   * la molette est ignorée) ; `freezeControlsPanRotate()` force l'état à NONE chaque
   * frame → `_updateZoom` s'applique, `_updatePosition`/`_updateRotation` non.
   */
  setDrawing(active: boolean): void {
    this.drawingMode = active
    this.controls.enabled = true
  }

  /** Recentre en vue du dessus (nadir) à l'altitude courante. */
  flyToTopDown(): void {
    const s = this.camera.getState()
    this.camera.flyTo({ lat: s.lat, lng: s.lng, altitude: s.altitude }, { duration: 0.5 })
  }

  /** Recule jusqu'à voir tout le globe (vue monde), au-dessus du point courant. */
  flyToGlobe(): void {
    const s = this.camera.getState()
    this.camera.flyTo({ lat: s.lat, lng: s.lng, altitude: this.tiles.ellipsoid.radius.x }, { duration: 1.0 })
  }

  /**
   * Incline la caméra autour du point visé au centre écran, de `step` radians
   * (positif = plus incliné). L'angle est **borné** à `[0, controls.maxAltitude]`
   * (donc à la limite du mode courant en 2D) → jamais de bascule/tête à l'envers.
   */
  tiltBy(step: number): void {
    const center = this.projection.pickLatLng(this.size.width / 2, this.size.height / 2, this.threeCamera)
    if (!center) return
    const cam = this.threeCamera
    const pivot = this.projection.latLngToWorld(center, new THREE.Vector3(), 0)
    const up = this.projection.worldNormal(center, new THREE.Vector3())
    const right = new THREE.Vector3(1, 0, 0).transformDirection(cam.matrixWorld).normalize()
    const back = new THREE.Vector3()
    const savePos = cam.position.clone()
    const saveQuat = cam.quaternion.clone()

    const tiltFromNadir = (): number => up.angleTo(back.set(0, 0, 1).transformDirection(cam.matrixWorld))
    const current = tiltFromNadir()
    const max = Math.min(this.controls.maxAltitude, Math.PI * 0.44)
    const target = clamp(current + step, 0, max)
    const delta = target - current
    if (Math.abs(delta) < 1e-4) return

    const apply = (angle: number): number => {
      const q = new THREE.Quaternion().setFromAxisAngle(right, angle)
      cam.position.copy(savePos).sub(pivot).applyQuaternion(q).add(pivot)
      cam.quaternion.copy(saveQuat).premultiply(q)
      cam.updateMatrixWorld()
      return tiltFromNadir()
    }
    // L'axe `right` peut incliner dans un sens ou l'autre : on essaie +δ, et si le
    // résultat n'atteint pas la cible (mauvais sens), on prend −δ.
    if (Math.abs(apply(delta) - target) > 0.02) apply(-delta)
  }

  /** Type de carte affiché. '3d' = tuiles Ion photoréalistes ; 'plan' = globe 2D Google. */
  private mapMode: MapMode = '3d'

  /**
   * Bascule le type de carte. En 2D, le tileset 3D est masqué (et son `update` gelé
   * pour ne rien charger en fond), le globe tuilé Google prend le relais, et
   * l'inclinaison est **limitée** (`minAltitude` relevé) : une carte 2D à plat ne peut
   * pas couvrir jusqu'à l'horizon en tuiles → sinon fond bas-résolution étiré/étrange.
   * Nécessite une clé Google (sinon les modes 2D sont sans effet).
   */
  setMapMode(mode: MapMode): void {
    this.mapMode = mode
    const in2d = mode !== '3d'
    // Aligne le fond 2D sur l'altitude du terrain suivie en continu en 3D → même échelle.
    if (in2d) this.basemap2d?.setElevation(this.terrainElevation)
    // Limite l'inclinaison en 2D (borne la couverture de tuiles), libre en 3D.
    this.controls.maxAltitude = in2d ? TWO_D_MAX_ALTITUDE : this.defaultMaxAltitude
    // Le tileset 3D reste en cache (retour instantané) mais n'est ni rendu ni piloté.
    this.setTiles3DVisible(!in2d)
    this.basemap2d?.setVisible(in2d)
  }

  /** Masque/affiche uniquement les tuiles 3D — jamais l'ancre des markers ni le globe 2D. */
  private setTiles3DVisible(visible: boolean): void {
    for (const child of this.tiles.group.children) {
      if (child !== this.overlayAnchor && child !== this.basemap2d?.group) child.visible = visible
    }
  }

  /** Altitude du terrain (m) sous le centre écran, suivie en continu en mode 3D et
   *  appliquée au fond 2D pour qu'il coïncide avec la 3D (évite l'écart d'échelle). */
  private terrainElevation = 0

  /** (Ré)échantillonne l'altitude du terrain sous le centre écran (raycast BVH). No-op
   *  si rien touché → conserve la dernière valeur connue. À n'appeler qu'en mode 3D. */
  private trackTerrainElevation(): void {
    const e = this.projection.pickHeight(this.size.width / 2, this.size.height / 2, this.threeCamera)
    if (e !== null) this.terrainElevation = e
  }

  /** Affiche/masque le calque trafic Google (mode 2D uniquement). */
  setTrafficVisible(visible: boolean): void {
    this.basemap2d?.setTraffic(visible)
  }

  /** Neutralise pan/rotation de GlobeControls (état NONE + inerties nulles). */
  private freezeControlsPanRotate(): void {
    const c = this.controls as unknown as {
      state: number
      dragInertia: THREE.Vector3
      rotationInertia: THREE.Vector3
    }
    c.state = 0 // NONE
    c.dragInertia.set(0, 0, 0)
    c.rotationInertia.set(0, 0, 0)
  }

  getView(): MapView {
    return this.computeView(this.camera.getState())
  }

  /**
   * Alimente le globe 2D : zoom de tuile pour une résolution ~1:1 à l'écran (calculé
   * depuis la vraie résolution mètres/pixel — distance caméra→sol, FOV, hauteur écran —
   * et non l'altitude seule, sinon flou), et emprise **centrée sur la vue** dimensionnée
   * à l'écran (évite les bounds gonflés par l'inclinaison → compte de tuiles raisonnable).
   */
  private updateBasemap(state: CameraState): void {
    if (!this.basemap2d) return
    // Emprise = TOUT le terrain visible (viewportBounds, borné par l'inclinaison limitée)
    // → la couverture remplit la vue, pas juste une boîte centrale (sinon globe nu autour).
    const view = this.computeView(state)
    // Zoom pour une résolution ~1:1 au centre (mètres/pixel réels : distance→sol, FOV, écran).
    const distance = Math.max(1, state.altitude - this.terrainElevation)
    const groundHeight = 2 * distance * Math.tan((this.threeCamera.fov * DEG2RAD) / 2)
    const metersPerPixel = groundHeight / Math.max(1, this.size.height)
    // Résolution Web Mercator au zoom 0 (m/px à l'équateur) = circonférence / taille tuile.
    const equatorMetersPerPixel = EARTH_CIRCUMFERENCE / TILE_SIZE
    const zoom = Math.log2((equatorMetersPerPixel * Math.cos(state.lat * DEG2RAD)) / metersPerPixel)
    this.basemap2d.update(view.bounds, zoom)
  }

  // ── Boucle ──

  private tick(now: number): void {
    const dt = Math.min(0.1, (now - this.lastTime) / 1000)
    this.lastTime = now

    const controlling = this.camera.update()
    // En dessin : neutralise pan/rotation avant l'update (le zoom molette passe).
    if (this.drawingMode) this.freezeControlsPanRotate()
    if (!controlling && this.controls.enabled) this.controls.update()
    this.clampZoom()
    this.threeCamera.updateMatrixWorld()
    // En mode 2D le tileset 3D est masqué : on gèle son update (aucun fetch/parse/LOD en
    // fond) tout en gardant son cache pour un retour instantané. `updateMatrixWorld` reste
    // appelé — le repère du groupe sert encore à la projection (ancrage overlays/2D).
    if (this.mapMode === '3d') {
      // Résolution requise par le calcul d'erreur d'écran des tuiles (LOD).
      this.tiles.setResolutionFromRenderer(this.threeCamera, this.renderer)
      this.tiles.update()
    }
    this.tiles.group.updateMatrixWorld(true)
    // Suit l'altitude du terrain sous le centre écran (pour aligner le fond 2D au switch).
    if (this.mapMode === '3d') this.trackTerrainElevation()

    // État caméra calculé UNE fois par frame (chaque getState = inversion de matrice)
    // et réutilisé par updateNearFar/computeView/ctx.
    const state = this.camera.getState()
    if (controlling) this.updateNearFar(state)

    if (this.hasMoved(state)) {
      this.lastState = state
      this.viewDirty = true
      this.emit('camera', state)
      this.settleFrames = 0
    } else {
      this.settleFrames++
      if (this.settleFrames === 4) this.emit('viewport', this.computeView(state))
    }

    // Mode 2D : alimente le globe tuilé chaque frame (raffinement incrémental fluide).
    if (this.mapMode !== '3d') this.updateBasemap(state)

    // `view` (viewportBounds = raycasts ellipsoïde) est calculé à la demande :
    // aucun layer ne le lit par frame, seul l'event 'viewport' et getView() le forcent.
    const engine = this
    const ctx: FrameContext = {
      camera: this.threeCamera,
      cameraState: state,
      projection: this.projection,
      get view() {
        return engine.computeView(state)
      },
      size: this.size,
      dt,
    }
    for (const layer of this.layers) layer.update(ctx)
    for (const layer of this.layers) layer.project(ctx)

    // Étoiles en skybox : suivent la position caméra (distance constante = infini).
    if (this.stars) this.stars.position.copy(this.threeCamera.position)
    this.renderer.render(this.scene, this.threeCamera)
    // Overlay HTML (markers) : projeté avec une plage near/far ÉLARGIE. GlobeControls
    // garde une plage serrée pour la précision de profondeur du rendu WebGL — mais le
    // CSS2DRenderer masque tout marker dont le z sort de cette plage (un marker lointain
    // en vue inclinée passe au-delà du `far` → disparaît). Or near/far n'affecte QUE le z
    // de clipping, PAS la position x/y à l'écran : en l'élargissant juste pour les labels,
    // une alerte n'est jamais masquée par la caméra, sans dégrader la 3D.
    const savedNear = this.threeCamera.near
    const savedFar = this.threeCamera.far
    this.threeCamera.near = 0.1
    this.threeCamera.far = 1e9
    this.threeCamera.updateProjectionMatrix()
    this.labelRenderer.render(this.scene, this.threeCamera)
    this.threeCamera.near = savedNear
    this.threeCamera.far = savedFar
    this.threeCamera.updateProjectionMatrix()
  }

  /** Empêche de dézoomer au-delà de `maxCameraDistance` (Terre jamais un point). */
  private clampZoom(): void {
    if (this.maxCameraDistance <= 0) return
    this.clampScratch.setFromMatrixPosition(this.tiles.group.matrixWorld)
    const d = this.threeCamera.position.distanceTo(this.clampScratch)
    if (d > this.maxCameraDistance) {
      this.threeCamera.position
        .sub(this.clampScratch)
        .multiplyScalar(this.maxCameraDistance / d)
        .add(this.clampScratch)
    }
  }

  private hasMoved(state: CameraState): boolean {
    const p = this.lastState
    if (!p) return true
    return (
      Math.abs(p.lat - state.lat) > 1e-7 ||
      Math.abs(p.lng - state.lng) > 1e-7 ||
      Math.abs(p.altitude - state.altitude) > Math.max(1, state.altitude * 1e-4)
    )
  }

  private updateNearFar(state: CameraState): void {
    const dist = this.threeCamera.position.length()
    this.threeCamera.near = Math.max(1, state.altitude * 0.15)
    this.threeCamera.far = dist * 1.2 + 1e7
    this.threeCamera.updateProjectionMatrix()
  }

  /**
   * Vue courante (centre/zoom/bounds). Mémoïsée : `viewportBounds` (25 raycasts
   * ellipsoïde) n'est recalculé qu'au mouvement caméra ou au resize (`viewDirty`),
   * pas à chaque frame carte immobile.
   */
  private computeView(state: CameraState): MapView {
    if (!this.viewDirty && this.cachedView) return this.cachedView
    const view: MapView = {
      center: { lat: state.lat, lng: state.lng },
      zoom: zoomForAltitude(state.altitude),
      bounds: this.viewportBounds(state),
    }
    this.cachedView = view
    this.viewDirty = false
    return view
  }

  private viewportBounds(center: CameraState): Bounds {
    const { width, height } = this.size
    // Grille dense (pas seulement 4 coins) : en vue inclinée, les coins du haut
    // visent le ciel/horizon et ratent le sol → une bbox trop petite exclurait les
    // markers lointains (haut de l'écran), qui « disparaîtraient » alors qu'ils sont
    // à l'écran. Un échantillonnage 5×5 capte la bande de sol proche de l'horizon,
    // donc la bbox couvre tout le trapèze visible. Pick ellipsoïde = bon marché.
    const N = 5
    let north = -90
    let south = 90
    let east = -180
    let west = 180
    let hits = 0
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const cx = (ix / (N - 1)) * width
        const cy = (iy / (N - 1)) * height
        const ll = this.projection.pickEllipsoidLatLng(cx, cy, this.threeCamera)
        if (!ll) continue
        north = Math.max(north, ll.lat)
        south = Math.min(south, ll.lat)
        east = Math.max(east, ll.lng)
        west = Math.min(west, ll.lng)
        hits++
      }
    }
    if (hits < 2) {
      const span = Math.max(0.001, 180 / Math.pow(2, zoomForAltitude(center.altitude)))
      return {
        north: center.lat + span,
        south: center.lat - span,
        east: center.lng + span,
        west: center.lng - span,
      }
    }
    // Marge de sécurité : la bbox axis-aligned n'épouse pas exactement le trapèze de
    // vue ; on l'élargit un peu pour ne jamais masquer un marker réellement visible.
    const padLat = (north - south) * 0.15 + 1e-4
    const padLng = (east - west) * 0.15 + 1e-4
    return {
      north: north + padLat,
      south: south - padLat,
      east: east + padLng,
      west: west - padLng,
    }
  }

  private buildFallbackGlobe(background: string): THREE.Group {
    const group = new THREE.Group()
    const r = this.tiles.ellipsoid.radius
    const geo = new THREE.SphereGeometry(1, 96, 64)
    geo.scale(r.x, r.y, r.z)
    const ocean = new THREE.Color(background).lerp(new THREE.Color('#1b3b5f'), 0.7)
    const mat = new THREE.MeshBasicMaterial({ color: ocean })
    group.add(new THREE.Mesh(geo, mat))

    // Graticule pour percevoir la rotation du globe.
    const lineMat = new THREE.LineBasicMaterial({ color: 0x5b7aa5, transparent: true, opacity: 0.4 })
    const pts: THREE.Vector3[] = []
    const push = (lat: number, lon: number) => {
      const v = new THREE.Vector3()
      this.tiles.ellipsoid.getCartographicToPosition(lat * DEG2RAD, lon * DEG2RAD, 2000, v)
      pts.push(v)
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = -180; lon < 180; lon += 5) {
        push(lat, lon)
        push(lat, lon + 5)
      }
    }
    for (let lon = -180; lon < 180; lon += 30) {
      for (let lat = -85; lat < 85; lat += 5) {
        push(lat, lon)
        push(lat + 5, lon)
      }
    }
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts)
    group.add(new THREE.LineSegments(lineGeo, lineMat))
    return group
  }

  // ── Entrées (clic + interception dessin) ──

  private bindInput(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
  }

  private unbindInput(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
  }

  private pickAt(e: PointerEvent): LatLng | null {
    const rect = this.canvas.getBoundingClientRect()
    return this.projection.pickLatLng(e.clientX - rect.left, e.clientY - rect.top, this.threeCamera)
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.drag = { x: e.clientX, y: e.clientY, moved: 0 }
    if (this.inputInterceptor && e.button === 0) {
      this.inputInterceptor('down', this.pickAt(e), e)
    }
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (this.drag) this.drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY)
    // Transmet le survol (pointer up) à l'outil aussi : indispensable au mode clic
    // du polygone (élastique + aimant de fermeture entre deux clics).
    if (this.inputInterceptor) {
      this.inputInterceptor('move', this.pickAt(e), e)
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    const drag = this.drag
    this.drag = null
    if (this.inputInterceptor) {
      this.inputInterceptor('up', this.pickAt(e), e)
      return
    }
    // Clic « propre » (peu de mouvement) → événement de sélection carte.
    if (drag && drag.moved < 6) {
      const ll = this.pickAt(e)
      if (ll) this.emit('click', { latLng: ll, originalEvent: e })
    }
  }

  dispose(): void {
    this.disposed = true
    this.stop()
    this.unbindInput()
    for (const layer of this.layers) layer.dispose()
    this.layers.clear()
    this.basemap2d?.dispose()
    this.controls.dispose()
    this.tiles.dispose()
    this.renderer.dispose()
    if (this.stars) {
      this.stars.geometry.dispose()
      ;(this.stars.material as THREE.Material).dispose()
    }
    this.labelRenderer.domElement.removeEventListener('wheel', this.forwardWheel)
    this.labelRenderer.domElement.remove()
  }
}

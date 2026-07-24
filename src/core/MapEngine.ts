import * as THREE from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { GlobeControls, TilesRenderer } from '3d-tiles-renderer'
import { CesiumIonAuthPlugin } from '3d-tiles-renderer/plugins'
import type { Bounds, LatLng } from '../shared'
import { Camera, type CameraState } from './Camera'
import type { FrameContext, Layer, MapView } from './Layer'
import { DEG2RAD } from './math'
import { Projection } from './Projection'

export type PointerPhase = 'down' | 'move' | 'up'
/** Intercepteur d'entrée (outils de dessin) : renvoie true pour consommer. */
export type PointerInterceptor = (
  phase: PointerPhase,
  latLng: LatLng | null,
  event: PointerEvent,
) => boolean

export type MapEngineOptions = {
  canvas: HTMLCanvasElement
  center: LatLng
  zoom: number
  background: string
  /** Token Cesium Ion → Google Photorealistic 3D Tiles via Cesium. Seule source 3D. */
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

    // Source de tuiles 3D : Cesium Ion (Google Photorealistic 3D Tiles). Sans token,
    // le TilesRenderer reste vide → le globe ellipsoïde de repli prend le relais.
    const hasCustomTiles = !!opts.cesiumIonToken
    this.tiles = new TilesRenderer()
    if (opts.cesiumIonToken) {
      this.tiles.registerPlugin(
        new CesiumIonAuthPlugin({
          apiToken: opts.cesiumIonToken,
          assetId: opts.cesiumIonAssetId ?? '2275207',
          autoRefreshToken: true,
        }),
      )
    }
    if (opts.errorTarget !== undefined) this.tiles.errorTarget = opts.errorTarget
    this.tiles.setCamera(this.threeCamera)
    this.tiles.setResolutionFromRenderer(this.threeCamera, this.renderer)
    this.scene.add(this.tiles.group)

    this.projection.setContext(this.tiles.ellipsoid, this.tiles.group)

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
    // Résolution requise par le calcul d'erreur d'écran des tuiles (LOD).
    this.tiles.setResolutionFromRenderer(this.threeCamera, this.renderer)
    this.tiles.update()
    // Repère des tuiles à jour AVANT la projection des overlays (ancrage exact).
    this.tiles.group.updateMatrixWorld(true)

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

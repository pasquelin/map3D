import * as THREE from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { GlobeControls, TilesRenderer } from '3d-tiles-renderer'
import { CesiumIonAuthPlugin, GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins'
import { defaultConfig } from '../config/defaultConfig'
import type { MapConfig } from '../config/types'
import { TiledGlobeLayer } from '../layers/TiledGlobeLayer'
import type { Bounds, LatLng } from '../shared'
import { Camera, type CameraState } from './Camera'
import { GoogleTileSource, TILE_SIZE } from './googleTiles'
import type { FrameContext, Layer, MapView } from './Layer'
import { altitudeForZoom, CAMERA_FOV, clamp, DEG2RAD, EARTH_CIRCUMFERENCE, zoomForAltitude } from './math'
import { DragRegistry } from './DragRegistry'
import { Projection } from './Projection'
import { SelectableRegistry } from './Selectables'
import { SearchRegistry } from '../search/registry'
import { ClusterRegistry } from './ClusterRegistry'
import { MarkerRegistry } from './MarkerQuery'
import { TagFilter } from './TagFilter'

export type PointerPhase = 'down' | 'move' | 'up'
/** Intercepteur d'entrée (outils de dessin) : renvoie true pour consommer. */
export type PointerInterceptor = (phase: PointerPhase, latLng: LatLng | null, event: PointerEvent) => boolean

/** Type de carte : 3D photoréaliste (Ion) ou fond 2D Google (plan). */
export type MapMode = '3d' | 'plan'

export type MapEngineOptions = {
  canvas: HTMLCanvasElement
  center: LatLng
  zoom: number
  background: string
  /**
   * Couleur de l'océan des globes de repli (`theme.globe.oceanColor`).
   *
   * Elle existait dans le thème sans aucun consommateur, pendant que DEUX littéraux
   * différents la décidaient : `#1b3b5f` mélangé au fond ici, `0xaad3ff` dans
   * `TiledGlobeLayer` — deux océans de teintes opposées selon le globe affiché.
   */
  oceanColor: string
  /** Clé Google Maps Platform → Photorealistic 3D Tiles en direct (prioritaire sur Ion). */
  googleMapsApiKey?: string
  /** Token Cesium Ion → Google Photorealistic 3D Tiles via Cesium. */
  cesiumIonToken?: string
  /** Asset Cesium Ion (défaut 2275207 = Google Photorealistic 3D Tiles). */
  cesiumIonAssetId?: string
  /**
   * Type de carte au démarrage. Défaut : `'plan'` dès qu'une clé Google fournit le
   * fond 2D (plus lisible pour lire des positions), sinon `'3d'`. Sans clé, `'plan'`
   * est ignoré — comme `setMapMode`.
   *
   * NB coût : le fond 2D consomme le quota **Map Tiles API de votre clé Google**, là
   * où la 3D via `cesiumIonToken` est servie par Cesium Ion. Démarrer en 2D déplace
   * donc la facture, il ne la supprime pas.
   */
  mapMode?: MapMode
  /** Affiche un globe ellipsoïde uni de repli quand aucune tuile n'est disponible. */
  fallbackGlobe: boolean
  /** Erreur d'écran cible (screen-space error) — qualité/perf. */
  errorTarget?: number
  /**
   * Intro façon Google Earth (défaut true) : démarre en vue globe au-dessus de la
   * cible puis descend en vol animé jusqu'à `center`/`zoom`, une fois le terrain
   * streamé connu — l'altitude d'arrivée est comptée AU-DESSUS DU SOL et affinée
   * pendant la descente. La caméra ne naît jamais contre le terrain (sinon
   * l'anti-collision de GlobeControls la propulse à une distance dépendant de
   * l'ordre d'arrivée des tuiles → zoom différent à chaque refresh). Annulée à la
   * première interaction.
   */
  intro?: boolean
  /**
   * Clé localStorage de la sélection du filtre « Couches » (`engine.tags`).
   * `null` = pas de persistance ; une clé distincte par carte si plusieurs
   * `<Map>` cohabitent sur le même origin. Défaut : `m3d:tag-filter`.
   */
  tagStorageKey?: string | null
  /**
   * Réglages complets (cf. `MapConfig`). Optionnel : le moteur retombe sur
   * `defaultConfig`, si bien qu'il reste utilisable seul, hors React.
   */
  config?: MapConfig
  /**
   * Champ de vision vertical (degrés, défaut `CAMERA_FOV`). Fourni par `<Map>` depuis
   * `theme.camera.fov`. Lu une seule fois — cf. la construction de la caméra.
   */
  fov?: number
}

/** Mode du drag gauche : 'pan' (déplacer la carte, défaut) ou 'rotate' (pivoter la vue, = Maj maintenu). */
export type DragMode = 'pan' | 'rotate'

/**
 * Degré d'interactivité de la carte.
 *
 * - `true` (défaut) — tout est actif.
 * - `'view'` — **caméra figée** (ni pan, ni rotation, ni zoom molette) mais la carte
 *   reste vivante : markers cliquables, sélection, infobulles. Le cas d'un aperçu
 *   qu'on consulte sans pouvoir le déplacer.
 * - `false` — image inerte : plus aucun clic n'atteint la carte ni les markers.
 *
 * Dans les deux modes figés, les outils (dessin, loupe) sont neutralisés : leur
 * intercepteur n'est plus appelé.
 */
export type InteractiveMode = boolean | 'view'

/** Fond de carte affiché et calques optionnels qui en dépendent. */
export type BasemapState = {
  mode: MapMode
  traffic: boolean
  /**
   * Le trafic est un calque du fond 2D Google : indisponible en 3D et sans clé.
   * Diffusé plutôt que redérivé par chaque consommateur — l'UI n'a pas à
   * connaître la règle.
   */
  trafficAvailable: boolean
}

export type MapEvents = {
  camera: CameraState
  viewport: MapView
  click: { latLng: LatLng; originalEvent: PointerEvent }
  dragmode: DragMode
  basemap: BasemapState
  /**
   * La carte est **exploitable** : la projection résout des hauteurs, et un
   * `fitBounds`/`flyTo` vise le sol réel plutôt que l'ellipsoïde nu.
   *
   * À ne pas confondre avec « le moteur existe » — ça, c'est `useMap()`, disponible
   * immédiatement. `ready` attend en plus le terrain (3D) et la file de tuiles
   * vidée. Émis **une seule fois**, et rejoué aussitôt pour qui s'abonne après coup.
   */
  ready: MapEngine
}

type Listener<E extends keyof MapEvents> = (payload: MapEvents[E]) => void

// Définies dans `core/math` (avec l'échelle dont elles dérivent), ré-exportées ici :
// c'est de `MapEngine` que la lib les expose depuis toujours.
export { altitudeForZoom, zoomForAltitude }

/**
 * Attribut marquant une **surface carte** : un overlay au-dessus du canvas dont la
 * molette doit zoomer la carte (markers, formes/marquee, zone de la loupe…). Les
 * barres d'outils et panneaux ne le portent PAS — leur molette ne zoome pas.
 *
 * C'est une DONNÉE PORTÉE PAR L'ÉLÉMENT, pas une liste de classes connue du moteur :
 * une nouvelle surface se déclare elle-même en posant l'attribut, sans toucher au
 * core (et renommer une classe CSS ne casse rien).
 */
export const WHEEL_SURFACE_ATTR = 'data-m3d-wheel-surface'

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
  /** Filtre de visibilité par tags, partagé par toutes les couches (markers, dessins). */
  readonly tags: TagFilter
  /** Registre des sélectionnables externes (markers) consommé par l'outil sélection. */
  readonly selectables = new SelectableRegistry()
  /** Registre d'inventaire des markers (données sources, clusters inclus) consommé par l'outil loupe. */
  readonly markers = new MarkerRegistry()
  /**
   * Registre du regroupement COMMUN : les couches y versent leurs points, la surface
   * de clusters en fait des pastilles. Au niveau de la carte et non de la couche —
   * un cluster regroupe ce qui se superpose à l'écran, d'où que viennent les points.
   */
  readonly clusters = new ClusterRegistry()
  /** Registre des sources cherchables (markers, formes, dessins) consommé par la boîte de recherche. */
  readonly search = new SearchRegistry()
  /**
   * Registre du drag-and-drop générique (markers → dock favoris, et tout futur
   * usage) : source de vérité de l'état, zones de dépôt, diffusion. Piloté par la
   * couche React (`useDraggable`/`useDropZone`/`DragOverlay`).
   */
  readonly drag = new DragRegistry()
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
  /**
   * Parent commun des couches d'annotation WebGL (formes, dessins, tracés) : leur
   * donne un interrupteur de visibilité unique — masquées pendant l'intro, comme
   * les markers (elles flotteraient sur le vide pendant le streaming du globe).
   */
  readonly annotations = new THREE.Group()

  inputInterceptor: PointerInterceptor | null = null

  /** Clé Google exposée aux composants qui la réutilisent (ex. SearchBox → Places). */
  readonly googleMapsApiKey?: string

  private readonly canvas: HTMLCanvasElement
  private readonly layers = new Set<Layer>()
  private readonly listeners: { [E in keyof MapEvents]: Set<Listener<E>> } = {
    camera: new Set(),
    viewport: new Set(),
    click: new Set(),
    dragmode: new Set(),
    basemap: new Set(),
    ready: new Set(),
  }
  private dragMode: DragMode = 'pan'
  private interactiveMode: InteractiveMode = true
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

  private pointerDrag: { x: number; y: number; moved: number } | null = null

  private stars: THREE.Points | null = null
  private drawingMode = false
  /** Barre espace maintenue : gel pan/rotation levé le temps du pan caméra. */
  private drawingSuspended = false
  /** Globe 2D Google tuilé (LOD/cache/prefetch), null si pas de clé. */
  private basemap2d: TiledGlobeLayer | null = null
  /** Distance max caméra↔centre Terre (limite de dézoom). 0 = illimité. */
  private maxCameraDistance = 0
  private readonly clampScratch = new THREE.Vector3()
  /**
   * Réglages courants. Publics en lecture pour les couches, qui n'ont pas de contexte
   * React : `layer.engine.config.performance.…` est leur seul accès. Remplacés en bloc
   * par `setConfig` — jamais mutés en place, pour qu'une comparaison d'identité
   * suffise à détecter un changement.
   *
   * ⚠️ **Réservé au core.** Un composant ou un hook React lit `useConfig()`, JAMAIS
   * ceci. `<Map>` pose la config sur le moteur depuis un effet, et les effets d'un
   * enfant s'exécutent AVANT ceux de son parent : au render où `<Map config>` change,
   * ce champ porte encore la valeur précédente, et rien ne re-rendra l'enfant qui
   * l'aurait lue. Le contexte est la source de vérité React ; ce champ est son reflet
   * pour le code qui n'a pas accès aux hooks.
   */
  config: MapConfig

  /**
   * Durées (s) des recadrages de la barre de contrôles. Posées par `<Map>` depuis
   * `theme.animations`, comme celles de `Camera` : le rythme de la carte est une
   * question de thème, pas de moteur.
   */
  topDownDuration = 0.5
  globeDuration = 1.0

  /**
   * (Ré)applique les bornes de navigation de `config.camera` : dézoom max, plafond
   * d'altitude, inclinaison selon le mode courant.
   *
   * Appelée à la construction ET depuis `setConfig` : ces bornes sont recopiées dans
   * `GlobeControls`, qui ne les relit pas — sans cet appel, une config changée à chaud
   * laisserait la carte avec les limites de l'ancienne.
   */
  private applyCameraLimits(): void {
    const c = this.config.camera
    const R = this.tiles.ellipsoid.radius.x
    this.maxCameraDistance = R * c.maxDistanceFactor
    this.camera.maxAltitude = R * c.maxAltitudeFactor
    this.controls.maxDistance = R * c.maxAltitudeFactor
    this.controls.maxAltitude = this.mapMode === 'plan' ? c.maxTilt2d : c.maxTilt3d
  }

  constructor(opts: MapEngineOptions) {
    this.canvas = opts.canvas
    this.config = opts.config ?? defaultConfig
    this.projection.setConfig(this.config)
    this.googleMapsApiKey = opts.googleMapsApiKey
    this.tags = new TagFilter(opts.tagStorageKey)
    this.renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: this.config.performance.antialias })
    // DPR configurable (`performance.pixelRatio`, défaut 1) : à 1 le canvas fait
    // EXACTEMENT la taille du parent, sans ×2 rétine sur le backing store.
    this.renderer.setPixelRatio(this.config.performance.pixelRatio)
    this.renderer.setClearColor(new THREE.Color(opts.background), 1)

    // FOV lu une seule fois : il gouverne toutes les conversions mètres↔pixels de la
    // lib, largement mémoïsées. Le changer sur une carte montée laisserait des
    // résolutions périmées un peu partout — d'où l'absence de setter.
    this.threeCamera = new THREE.PerspectiveCamera(opts.fov ?? CAMERA_FOV, 1, 1, 1e8)
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
          assetId: opts.cesiumIonAssetId ?? this.config.providers.tiles3d.cesiumIonAssetId,
          autoRefreshToken: true,
        }),
      )
    } else if (opts.googleMapsApiKey) {
      this.tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: opts.googleMapsApiKey, autoRefreshToken: true }))
    }
    if (opts.errorTarget !== undefined) this.tiles.errorTarget = opts.errorTarget
    this.tiles.setCamera(this.threeCamera)
    this.tiles.setResolutionFromRenderer(this.threeCamera, this.renderer)
    this.scene.add(this.tiles.group)
    // Ancre des overlays (markers) : partage la transformée du tileset mais n'est jamais
    // masquée avec les tuiles 3D (cf. setTiles3DVisible).
    this.overlayAnchor.name = 'm3d-overlay-anchor'
    this.tiles.group.add(this.overlayAnchor)
    this.annotations.name = 'm3d-annotations'
    this.scene.add(this.annotations)

    this.projection.setContext(this.tiles.ellipsoid, this.tiles.group)

    // Fond 2D Google : couche indépendante (plan/terrain/trafic) drapée sur le globe,
    // rendue seulement en mode 2D (le tileset 3D est alors masqué). NB EEA : Google 2D
    // ne sert que roadmap/terrain/trafic (satellite/hybride bloqués).
    if (opts.googleMapsApiKey) {
      this.basemap2d = new TiledGlobeLayer(
        this.tiles.group,
        this.tiles.ellipsoid,
        new GoogleTileSource(opts.googleMapsApiKey, this.config.providers.tiles),
        this.config.providers.tiles,
        opts.oceanColor,
      )
    }

    // Renderer HTML superposé au canvas : positionne chaque `CSS2DObject` via la
    // caméra Three (aucune projection écran manuelle → zéro dérive). `domElement`
    // laisse passer les clics (pointer-events:none) ; les markers les réactivent.
    this.labelRenderer = new CSS2DRenderer()
    const labelDom = this.labelRenderer.domElement
    labelDom.className = 'm3d-css2d'
    labelDom.setAttribute(WHEEL_SURFACE_ATTR, '') // molette sur un marker = zoom carte
    labelDom.style.position = 'absolute'
    labelDom.style.top = '0'
    labelDom.style.left = '0'
    labelDom.style.pointerEvents = 'none'
    // overflow visible : sinon menus/popups ancrés aux markers de bord sont coupés.
    labelDom.style.overflow = 'visible'
    this.canvas.parentElement?.appendChild(labelDom)

    if (opts.fallbackGlobe && !hasCustomTiles) {
      this.fallback = this.buildFallbackGlobe(opts.oceanColor)
      this.tiles.group.add(this.fallback)
    }

    this.controls = new GlobeControls()
    /**
     * Surface d'interaction des contrôles = le TILESET, pas la scène entière.
     * `setScene` ne sert qu'au raycast de surface (point sous la caméra, cible de
     * zoom, garde d'altitude) — sa documentation le dit : « scene to raycast against
     * for surface-based interaction ».
     *
     * Lui passer `this.scene` y incluait `annotations`, donc TOUTES les formes,
     * tracés et liens : ils étaient retraversés à chaque frame par le raycast, et
     * une seule géométrie corrompue y faussait le picking caméra pour toute la
     * scène. Pire, une forme plaquée au sol pouvait servir de pivot de caméra à la
     * place du terrain.
     *
     * Le fond de carte 2D est lui aussi dans `tiles.group` (cf. `basemap2d` plus
     * bas) : la surface reste donc trouvable en mode plan comme en 3D.
     */
    this.controls.setScene(this.tiles.group)
    this.controls.setCamera(this.threeCamera)
    this.controls.setEllipsoid(this.tiles.ellipsoid, this.tiles.group)
    ;(this.controls as unknown as { tilesRenderer: TilesRenderer }).tilesRenderer = this.tiles
    this.controls.enableDamping = this.config.interaction.damping
    this.controls.attach(this.canvas)

    this.camera = new Camera(this.threeCamera, this.projection)
    this.camera.setConfig(this.config)
    if (opts.intro === false) {
      // Sans intro : survol nadir direct à l'altitude déduite du zoom (NB : comptée
      // depuis l'ellipsoïde, le terrain n'étant pas encore streamé).
      this.camera.jumpTo(opts.center, altitudeForZoom(opts.zoom))
    } else {
      // Intro : vue globe au-dessus de la cible ; le vol part quand le terrain est
      // connu (cf. intro dans tick). Départ déterministe, jamais sous le terrain.
      this.camera.jumpTo(opts.center, this.tiles.ellipsoid.radius.x * this.config.startup.introAltitudeFactor)
      this.intro = {
        center: opts.center,
        altitude: altitudeForZoom(opts.zoom),
        flying: false,
        startedAt: performance.now(),
      }
      this.setOverlaysVisible(false)
    }

    // Limite de dézoom : la Terre reste bien visible avec une petite marge d'espace,
    // jamais réduite à un point. maxCameraDistance = distance caméra↔centre Terre.
    this.applyCameraLimits()

    // Fond étoilé : ajouté à la scène, rendu en premier (renderOrder -1, sans
    // écrire le depth) → toujours derrière la carte, sans altérer le pipeline.
    this.stars = this.buildStars()
    this.scene.add(this.stars)

    // Zoom molette actif au-dessus des SURFACES CARTE (markers, formes/marquee,
    // zone loupe) : on relaie l'événement `wheel` qu'elles reçoivent vers le canvas
    // (écouté par GlobeControls). Le listener est posé sur le conteneur pour couvrir
    // ces surfaces où qu'elles soient dans l'arbre ; c'est `forwardWheel` qui décide
    // (les barres et panneaux d'UI, eux, ne doivent PAS zoomer la carte).
    this.canvas.parentElement?.addEventListener('wheel', this.forwardWheel, { passive: false })

    this.bindInput()

    // Mode de départ, en DERNIER (setMapMode touche controls, projection et l'intro,
    // tous construits au-dessus) : 2D par défaut dès que le fond Google existe. Passe
    // par setMapMode pour ne pas dupliquer les règles de bascule ; sans clé, sa garde
    // ramène au mode 3D.
    this.setMapMode(opts.mapMode ?? (this.basemap2d ? 'plan' : '3d'))
  }

  /**
   * Relaie une molette reçue par une surface carte vers le canvas (zoom même
   * au-dessus d'un marker ou de la zone loupe). Trois exceptions : une cible hors
   * des surfaces carte (UI), la molette NATIVE du canvas (déjà gérée par
   * GlobeControls — sinon double zoom), et un conteneur scrollable sous le curseur
   * (liste, panneau) qu'on laisse défiler normalement.
   */
  private forwardWheel = (e: WheelEvent): void => {
    const container = this.canvas.parentElement
    const target = e.target as HTMLElement | null
    // Le canvas ne porte pas l'attribut : le test couvre aussi son cas (sa molette
    // native va déjà à GlobeControls).
    if (!target?.closest?.(`[${WHEEL_SURFACE_ATTR}]`)) return
    for (let el: HTMLElement | null = target; el && el !== container; el = el.parentElement) {
      // `getComputedStyle` (flush de style) seulement pour un élément qui déborde
      // réellement — pré-filtre bon marché par le layout déjà calculé.
      if (el.scrollHeight > el.clientHeight) {
        const oy = getComputedStyle(el).overflowY
        if (oy === 'auto' || oy === 'scroll') return
      }
    }
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
    // Origine du garde-fou de `ready` : le temps passé AVANT le démarrage (montage
    // React, création du moteur) ne doit pas entamer le délai d'attente des tuiles.
    if (!this.readyEmitted) this.startedAt = this.lastTime
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
    /**
     * Plancher sur les DEUX dimensions, et tout ce qui suit part des valeurs
     * planchées. Un conteneur momentanément dégénéré (onglet inactif, display:none,
     * panneau replié, transition) mesure 0 : avec une largeur nulle, `aspect` vaut 0
     * et `makePerspective` divise par `(right - left) = 0` → matrice de projection
     * NaN. La contamination ne s'arrête pas là : elle ressort dans les raycasts (les
     * contrôles picorent la scène entière à chaque frame) ET dans `metersPerPixel`,
     * donc dans les épaisseurs de trait converties px→mètres, donc dans la géométrie
     * des layers. Le test en positif attrape aussi NaN.
     */
    const w = width > 1 ? width : 1
    const h = height > 1 ? height : 1
    this.size = { width: w, height: h }
    // updateStyle=true : three fixe canvas.style.width/height en px CSS (= taille du
    // conteneur), le backing store restant à ×DPR. SANS ça, le canvas (élément
    // remplacé) garde sa largeur intrinsèque (attribut = ×DPR) → affiché 2× trop
    // grand, globe en bas-droite et markers décalés d'un facteur DPR.
    this.renderer.setSize(w, h, true)
    this.threeCamera.aspect = w / h
    this.threeCamera.updateProjectionMatrix()
    this.projection.setViewportSize(w, h)
    this.labelRenderer.setSize(w, h)
    this.tiles.setResolutionFromRenderer(this.threeCamera, this.renderer)
    // La taille du viewport change les bounds : invalide la vue mémoïsée.
    this.viewDirty = true
  }

  addLayer(layer: Layer): void {
    this.layers.add(layer)
    // Config poussée à l'ajout : une couche montée après un `setConfig` doit partir
    // avec les réglages courants, pas avec ses défauts.
    layer.setConfig?.(this.config)
  }

  removeLayer(layer: Layer): void {
    this.layers.delete(layer)
    layer.dispose()
  }

  on<E extends keyof MapEvents>(event: E, cb: Listener<E>): () => void {
    this.listeners[event].add(cb)
    // `ready` ne se produit qu'une fois : un abonné monté après coup (couche ajoutée
    // tardivement, vue remontée) attendrait sinon un event définitivement passé.
    if (event === 'ready' && this.readyEmitted) (cb as Listener<'ready'>)(this)
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
    this.drawingSuspended = false
    // Le mode figé PRIME : monter une couche de dessin sur une carte non
    // interactive ne doit pas lui rendre la navigation dans le dos de l'hôte.
    this.controls.enabled = this.interactiveMode === true
  }

  /**
   * Remplace les réglages à chaud. Ce qui se règle sans reconstruire est appliqué
   * immédiatement (DPR, inertie, budgets de tuiles) ; le reste est relu à l'usage,
   * puisque les consommateurs lisent `engine.config` à chaque frame.
   *
   * Ce qui NE peut pas changer à chaud est volontairement ignoré ici : le FOV est
   * figé à la construction de la caméra Three, et le changer invaliderait toutes les
   * résolutions mémoïsées.
   */
  setConfig(config: MapConfig): void {
    if (this.config === config) return
    const prev = this.config
    this.config = config
    if (prev.performance.pixelRatio !== config.performance.pixelRatio) {
      this.renderer.setPixelRatio(config.performance.pixelRatio)
      this.renderer.setSize(this.size.width, this.size.height, false)
    }
    this.controls.enableDamping = config.interaction.damping
    this.basemap2d?.setConfig(config.providers.tiles)
    this.camera.setConfig(config)
    this.projection.setConfig(config)
    for (const layer of this.layers) layer.setConfig?.(config)
    // Bornes de navigation : recopiées dans `GlobeControls`, qui ne les relit pas.
    if (prev.camera !== config.camera) this.applyCameraLimits()
    this.viewDirty = true
  }

  /**
   * Fige (ou libère) l'interaction — cf. `InteractiveMode`.
   *
   * Passe par `controls.enabled` et une garde en amont des events, **pas** par
   * `inputInterceptor` : ce slot est unique et déjà disputé entre le dessin et la
   * loupe ; le lui voler laisserait l'outil affiché actif mais mort.
   */
  setInteractive(mode: InteractiveMode): void {
    if (this.interactiveMode === mode) return
    this.interactiveMode = mode
    this.controls.enabled = mode === true
    // Les markers sont du DOM qui réactive `pointer-events` élément par élément :
    // seule une règle descendante peut les recouvrir (le `pointer-events:none` du
    // conteneur CSS2D ne suffit pas, c'est justement ce qui les rend cliquables).
    this.canvas.parentElement?.classList.toggle('m3d-inert', mode === false)
  }

  get interactive(): InteractiveMode {
    return this.interactiveMode
  }

  /**
   * Suspension temporaire du mode dessin (barre espace maintenue) : le gel
   * pan/rotation est levé — la caméra se manipule normalement — sans quitter
   * l'outil ni perdre le tracé/geste en cours.
   */
  setDrawingSuspended(suspended: boolean): void {
    this.drawingSuspended = suspended
  }

  /** Recentre en vue du dessus (nadir) à l'altitude courante. */
  flyToTopDown(): void {
    const s = this.camera.getState()
    this.camera.flyTo({ lat: s.lat, lng: s.lng, altitude: s.altitude }, { duration: this.topDownDuration })
  }

  /** Recule jusqu'à voir tout le globe (vue monde), au-dessus du point courant. */
  flyToGlobe(): void {
    const s = this.camera.getState()
    this.camera.flyTo(
      { lat: s.lat, lng: s.lng, altitude: this.tiles.ellipsoid.radius.x },
      { duration: this.globeDuration },
    )
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
    const max = Math.min(this.controls.maxAltitude, this.config.camera.maxTilt3d)
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
  private basemapState: BasemapState = { mode: '3d', traffic: false, trafficAvailable: false }

  /**
   * Fond de carte courant — source de vérité de l'UI, avec l'événement `basemap`.
   * L'objet est **stable** tant que rien ne change : un consommateur React peut le
   * mettre en état sans re-rendre à chaque émission.
   */
  getBasemap(): BasemapState {
    return this.basemapState
  }

  /**
   * Recalcule l'état diffusé depuis les sources réelles (mode + calque), et n'émet
   * que sur changement effectif. Le trafic est lu sur la couche : en garder une
   * copie ici la laisserait diverger.
   */
  private syncBasemap(): void {
    const traffic = this.basemap2d?.trafficOn ?? false
    const trafficAvailable = !!this.basemap2d && this.mapMode !== '3d'
    const s = this.basemapState
    if (s.mode === this.mapMode && s.traffic === traffic && s.trafficAvailable === trafficAvailable) return
    this.basemapState = { mode: this.mapMode, traffic, trafficAvailable }
    this.emit('basemap', this.basemapState)
  }

  /**
   * Les fonds 2D et le trafic sont des services Google : sans clé, `setMapMode('plan')`
   * et `setTrafficVisible(true)` sont sans effet (voir leurs gardes). L'UI s'en sert
   * pour ne pas proposer des boutons inertes.
   */
  get supportsBasemap2d(): boolean {
    return !!this.basemap2d
  }

  /**
   * Bascule le type de carte. En 2D, le tileset 3D est masqué (et son `update` gelé
   * pour ne rien charger en fond), le globe tuilé Google prend le relais, et
   * l'inclinaison est **limitée** (`minAltitude` relevé) : une carte 2D à plat ne peut
   * pas couvrir jusqu'à l'horizon en tuiles → sinon fond bas-résolution étiré/étrange.
   * Nécessite une clé Google (sinon les modes 2D sont sans effet).
   */
  setMapMode(mode: MapMode): void {
    const in2d = mode !== '3d'
    // Sans fond 2D à afficher, basculer ne ferait que masquer les tuiles 3D sans
    // rien mettre à la place — carte vide. L'appel est ignoré, y compris en usage
    // vanilla où aucune UI ne filtre.
    if (in2d && !this.basemap2d) return
    // Idempotent, comme `setDragMode` et `setTrafficVisible` : recliquer le mode
    // actif ne rejoue ni l'intro ni le basculement des tuiles.
    if (mode === this.mapMode) return
    this.mapMode = mode
    // En 2D le terrain n'est plus suivi : une intro encore en attente ne partirait
    // jamais — on lance la descente tout de suite (le fond plat est à terrainElevation),
    // sauf si un autre pilotage caméra a déjà pris la main (l'intro s'efface alors).
    if (in2d && this.intro && !this.intro.flying) {
      if (this.camera.isControlling()) this.cancelIntro()
      else this.startIntroFlight()
    }
    // Aligne le fond 2D sur l'altitude du terrain suivie en continu en 3D → même échelle.
    if (in2d) this.basemap2d?.setElevation(this.terrainElevation)
    // En 2D, pick ET drapage des formes visent le PLAN du fond (même hauteur que le
    // basemap) — pas les tuiles 3D invisibles ; en 3D, retour à la surface réelle.
    this.projection.setFlatHeight(in2d ? this.terrainElevation : null)
    // Limite l'inclinaison en 2D (borne la couverture de tuiles), libre en 3D.
    this.controls.maxAltitude = in2d ? this.config.camera.maxTilt2d : this.config.camera.maxTilt3d
    // Le tileset 3D reste en cache (retour instantané) mais n'est ni rendu ni piloté.
    this.setTiles3DVisible(!in2d)
    this.basemap2d?.setVisible(in2d)
    // Le trafic est un calque du fond 2D : repasser en 3D l'éteint. La règle est
    // celle de `setTrafficVisible`, appelée plutôt que recopiée ici.
    if (!in2d) this.setTrafficVisible(false)
    this.syncBasemap()
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
  /** true dès qu'un échantillon de terrain a réellement touché les tuiles. */
  private terrainKnown = false

  /**
   * Vol d'intro façon Google Earth : `center`/`altitude` (au-dessus du sol) demandés
   * au constructeur. `flying=false` = en attente du terrain streamé (bornée par
   * `INTRO_MAX_WAIT_MS`) ; `flying=true` = descente en cours, destination affinée
   * chaque frame (`retargetFlyAltitude`) au fil du raffinement des tuiles. `null` =
   * terminé ou annulé. L'intro **s'efface devant tout autre pilotage caméra**
   * (interaction, flyTo programmatique, suivi) — elle ne vole jamais la main.
   */
  private intro: { center: LatLng; altitude: number; flying: boolean; startedAt: number } | null = null

  /** Intro encore active (attente du terrain ou descente en cours). */
  get introActive(): boolean {
    return this.intro !== null
  }

  private readyEmitted = false
  /** Horodatage de `start()` — origine du garde-fou d'attente de `ready`. */
  private startedAt = 0

  /** La carte est-elle exploitable ? (cf. l'event `ready`) */
  get ready(): boolean {
    return this.readyEmitted
  }

  /**
   * Émet `ready` dès que la carte est exploitable, ou au bout du garde-fou.
   *
   * En 3D, « exploitable » veut dire que le terrain a été touché au moins une fois
   * et que la file de tuiles est vidée — c'est exactement la condition qui décide
   * du décollage de l'intro, et c'est le seuil à partir duquel un cadrage vise le
   * sol réel. En 2D il n'y a pas de terrain à attendre : la projection suffit.
   */
  private checkReady(now: number): void {
    if (this.readyEmitted) return
    const usable =
      this.projection.isReady() && (this.mapMode !== '3d' || (this.terrainKnown && this.tiles.loadProgress >= 1))
    if (!usable && now - this.startedAt < this.config.startup.readyMaxWaitMs) return
    this.readyEmitted = true
    this.emit('ready', this)
  }

  private readonly cancelIntro = (): void => {
    // N'annule QUE le vol d'intro : un vol de recherche/suivi qui a pris la main
    // n'est jamais tué par une interaction destinée à stopper l'intro.
    if (this.camera.isFlying('intro')) this.camera.cancelFly()
    this.intro = null
    this.setOverlaysVisible(true)
  }

  /**
   * Masque/révèle les overlays (markers WebGL de `overlayAnchor` + CSS2D via la
   * classe `m3d-intro` du conteneur, avec fondu). Pendant l'intro, la planète
   * streame encore : des markers flottant sur le vide avant que le globe
   * n'apparaisse font désordre — ils ne se montrent qu'à l'atterrissage.
   */
  private setOverlaysVisible(visible: boolean): void {
    this.overlayAnchor.visible = visible
    this.annotations.visible = visible
    this.canvas.parentElement?.classList.toggle('m3d-intro', !visible)
  }

  /** (Ré)échantillonne l'altitude du terrain sous le centre écran (raycast BVH). No-op
   *  si rien touché → conserve la dernière valeur connue. À n'appeler qu'en mode 3D. */
  private trackTerrainElevation(): void {
    // Les bornes de plausibilité (artefacts du LOD racine) sont appliquées DANS
    // Projection.pickHeight/sampleSurfaceHeight — un seul endroit pour tous les appelants.
    const e = this.projection.pickHeight(this.size.width / 2, this.size.height / 2, this.threeCamera)
    if (e !== null) {
      this.terrainElevation = e
      this.terrainKnown = true
      // Repli de hauteur des formes drapées quand leur raycast d'ancre ne touche rien.
      this.projection.surfaceFallbackHeight = e
    }
  }

  // Durée du vol d'intro et attente max des tuiles : `startup.introDuration` /
  // `startup.introMaxWaitMs`. Le garde-fou évite qu'une source en échec (403, token
  // invalide, réseau) laisse la carte bloquée en vue globe, overlays masqués.

  /** Lance la descente de l'intro vers la cible, au-dessus du sol connu. */
  private startIntroFlight(): void {
    if (!this.intro || this.intro.flying) return
    this.intro.flying = true
    this.camera.flyTo(
      { ...this.intro.center, altitude: this.terrainElevation + this.intro.altitude },
      { duration: this.config.startup.introDuration, tag: 'intro' },
    )
  }

  /**
   * Avance la machine à états de l'intro (appelée chaque tick) : lance la descente
   * quand le terrain est connu, affine la destination pendant le vol, se termine à
   * l'atterrissage. Le vol passe par `Camera.flyTo` — le même chemin éprouvé que la
   * recherche de lieux — jamais par téléportation derrière GlobeControls. L'intro
   * s'efface (overlays révélés) dès qu'un autre pilotage caméra prend la main.
   */
  private updateIntro(now: number): void {
    const intro = this.intro
    if (!intro) return
    if (!intro.flying) {
      // Un vol programmatique (recherche…) ou un suivi a pris la main pendant
      // l'attente : l'intro s'efface au lieu de l'écraser à son décollage.
      if (this.camera.isControlling()) {
        this.cancelIntro()
        return
      }
      // Décollage quand le terrain est connu ET la file de tuiles vidée
      // (`loadProgress` = 1) : la planète est visible AVANT la descente. Au-delà du
      // délai max (tuiles en échec), on part quand même avec la meilleure hauteur
      // connue — même arrivée que l'ancien placement direct, jamais de blocage.
      const ready = this.terrainKnown && this.tiles.loadProgress >= 1
      if (!ready && now - intro.startedAt < this.config.startup.introMaxWaitMs) return
      this.startIntroFlight()
      return
    }
    if (this.camera.isFlying('intro')) {
      // Le sol se précise pendant la descente (LOD) → la destination suit.
      this.camera.retargetFlyAltitude(this.terrainElevation + intro.altitude, 'intro')
    } else {
      // Atterri, ou remplacé par un autre vol/suivi (qui garde la main) : l'intro est
      // finie dans les deux cas — cancelIntro est l'unique sortie de l'état (le
      // cancelFly y est un no-op : plus de vol taggé 'intro').
      this.cancelIntro()
    }
  }

  /** Affiche/masque le calque trafic Google (mode 2D uniquement). */
  setTrafficVisible(visible: boolean): void {
    // En 3D le calque n'a pas de support : accepter l'état donnerait un bouton
    // allumé sans rien à l'écran. `setTraffic` est déjà idempotent.
    this.basemap2d?.setTraffic(visible && this.mapMode !== '3d')
    this.syncBasemap()
  }

  /**
   * Altitude du terrain (m au-dessus de l'ellipsoïde) sous le centre écran — suivie
   * en continu en 3D. Sert aux consommateurs qui raisonnent en altitude **au-dessus
   * du sol** (seuils de zoom UI) : `state.altitude` est ellipsoïdale, et l'écart
   * (jusqu'à des milliers de mètres en montagne) fausserait leurs seuils.
   */
  get terrainHeight(): number {
    return this.terrainElevation
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
  private updateBasemap(state: CameraState, refine: boolean): void {
    if (!this.basemap2d) return
    // Emprise = TOUT le terrain visible (viewportBounds, borné par l'inclinaison limitée)
    // → la couverture remplit la vue, pas juste une boîte centrale (sinon globe nu autour).
    const view = this.computeView(state)
    // Zoom pour une résolution ~1:1 au centre — même définition m/px que les épaisseurs
    // de trait des layers (Projection.metersPerPixel : distance→sol réel, FOV, écran).
    const metersPerPixel = this.projection.metersPerPixel(
      { lat: state.lat, lng: state.lng },
      this.threeCamera,
      this.size.height,
      this.terrainElevation,
    )
    // Résolution Web Mercator au zoom 0 (m/px à l'équateur) = circonférence / taille tuile.
    const equatorMetersPerPixel = EARTH_CIRCUMFERENCE / TILE_SIZE
    const zoom = Math.log2((equatorMetersPerPixel * Math.cos(state.lat * DEG2RAD)) / metersPerPixel)
    this.basemap2d.update(view.bounds, zoom, refine)
  }

  // ── Boucle ──

  private tick(now: number): void {
    const dt = Math.min(0.1, (now - this.lastTime) / 1000)
    this.lastTime = now

    const controlling = this.camera.update()
    // En dessin : neutralise pan/rotation avant l'update (le zoom molette passe).
    // Suspendu (barre espace) : la caméra reprend la main sans quitter l'outil.
    if (this.drawingMode && !this.drawingSuspended) this.freezeControlsPanRotate()
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
    this.updateIntro(now)
    this.checkReady(now)

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
      if (this.settleFrames === this.config.performance.viewportSettleFrames)
        this.emit('viewport', this.computeView(state))
    }

    // Mode 2D : alimente le globe tuilé chaque frame (raffinement incrémental fluide).
    // Pendant un vol/suivi (`controlling`), on NE demande PAS les niveaux traversés :
    // ils défileraient sans être vus et coûteraient des centaines de tuiles Google
    // par descente d'intro. Le raffinement reprend à l'atterrissage.
    if (this.mapMode !== '3d') this.updateBasemap(state, !controlling)

    // `view` (viewportBounds = raycasts ellipsoïde) est calculé à la demande :
    // aucun layer ne le lit par frame, seul l'event 'viewport' et getView() le forcent.
    // Alias nécessaire : `this` dans le getter ci-dessous désignerait `ctx`, pas le
    // moteur. Une flèche ne peut pas être un getter, et lier la méthode calculerait
    // la vue à chaque frame — ce que ce getter paresseux existe justement pour éviter.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
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
    // Même seuil que les couches (`HeightResettle`, `MarkerLayer`) : il était dix
    // fois plus fin ici, si bien que le moteur émettait `camera` pour un mouvement
    // que les couches jugeaient nul — elles ne re-échantillonnaient donc pas.
    const eps = this.config.performance.cameraMoveEpsilon
    return (
      Math.abs(p.lat - state.lat) > eps.deg ||
      Math.abs(p.lng - state.lng) > eps.deg ||
      Math.abs(p.altitude - state.altitude) > Math.max(eps.altitudeMinMeters, state.altitude * eps.altitudeRatio)
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
    // Densité réglable (`performance.boundsPickGrid`) : le coût est en n².
    // Plancher à 2 — en dessous, `N - 1` diviserait par zéro.
    const N = Math.max(2, Math.round(this.config.performance.boundsPickGrid))
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
    // Réglable (`performance.boundsMargin`) — c'est elle qui décide combien de données
    // l'application charge à chaque déplacement.
    const pad = this.config.performance.boundsMargin
    const padLat = (north - south) * pad + 1e-4
    const padLng = (east - west) * pad + 1e-4
    return {
      north: north + padLat,
      south: south - padLat,
      east: east + padLng,
      west: west - padLng,
    }
  }

  private buildFallbackGlobe(oceanColor: string): THREE.Group {
    const group = new THREE.Group()
    const r = this.tiles.ellipsoid.radius
    const geo = new THREE.SphereGeometry(1, 96, 64)
    geo.scale(r.x, r.y, r.z)
    const ocean = new THREE.Color(oceanColor)
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

  /**
   * Bascule le comportement du drag GAUCHE : 'rotate' pivote la vue autour du
   * point cliqué comme si Maj était maintenu (bouton MapControls pour les
   * utilisateurs qui ne connaissent pas le modificateur), 'pan' (défaut) déplace
   * la carte. Maj/clic droit/2 doigts continuent de pivoter dans les deux modes.
   */
  setDragMode(mode: DragMode): void {
    if (this.dragMode === mode) return
    this.dragMode = mode
    this.emit('dragmode', mode)
  }

  getDragMode(): DragMode {
    return this.dragMode
  }

  /**
   * Mode rotation : GlobeControls choisit pivoter/déplacer en lisant `e.shiftKey`
   * au pointerdown — on shadow la propriété sur L'INSTANCE de l'événement, en
   * capture sur `window` (s'exécute AVANT les listeners du canvas, quel que soit
   * leur ordre d'enregistrement), sans re-dispatch : le pointer capture et le
   * reste de la chaîne d'événements restent intacts.
   */
  private readonly forceRotateModifier = (e: PointerEvent): void => {
    if (this.dragMode === 'rotate' && e.target === this.canvas && e.button === 0) {
      Object.defineProperty(e, 'shiftKey', { value: true })
    }
  }

  private bindInput(): void {
    window.addEventListener('pointerdown', this.forceRotateModifier, true)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    // Toute interaction annule l'intro (on ne vole jamais la caméra à l'utilisateur).
    this.canvas.addEventListener('pointerdown', this.cancelIntro)
    this.canvas.addEventListener('wheel', this.cancelIntro, { passive: true })
  }

  private unbindInput(): void {
    window.removeEventListener('pointerdown', this.forceRotateModifier, true)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointerdown', this.cancelIntro)
    this.canvas.removeEventListener('wheel', this.cancelIntro)
  }

  /**
   * Coordonnées **client** (celles d'un `PointerEvent`, repère fenêtre) → lat/lng.
   * Public : toute couche DOM externe (overlay custom, poignée d'édition, symbole
   * déplaçable) en a besoin et n'a pas accès au canvas.
   *
   * `fallbackToEllipsoid` rend un point même quand le curseur ne touche aucune
   * tuile (ciel, zone non chargée) : indispensable à un geste en cours, qui ne doit
   * pas se figer parce que le pointeur a débordé.
   */
  pickLatLngAtClient(clientX: number, clientY: number, fallbackToEllipsoid = false): LatLng | null {
    const rect = this.canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const hit = this.projection.pickLatLng(x, y, this.threeCamera)
    if (hit || !fallbackToEllipsoid) return hit
    return this.projection.pickEllipsoidLatLng(x, y, this.threeCamera)
  }

  private pickAt(e: PointerEvent): LatLng | null {
    return this.pickLatLngAtClient(e.clientX, e.clientY)
  }

  /** Les outils (dessin, loupe) ne reçoivent rien tant que la carte est figée. */
  private get toolsActive(): boolean {
    return this.interactiveMode === true
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.pointerDrag = { x: e.clientX, y: e.clientY, moved: 0 }
    if (this.toolsActive && this.inputInterceptor && e.button === 0) {
      this.inputInterceptor('down', this.pickAt(e), e)
    }
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (this.pointerDrag) this.pointerDrag.moved += Math.abs(e.movementX) + Math.abs(e.movementY)
    // Transmet le survol (pointer up) à l'outil aussi : indispensable au mode clic
    // du polygone (élastique + aimant de fermeture entre deux clics).
    if (this.toolsActive && this.inputInterceptor) {
      this.inputInterceptor('move', this.pickAt(e), e)
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    const drag = this.pointerDrag
    this.pointerDrag = null
    // L'interceptor rend un booléen « consommé » : false (ex. dessin suspendu par
    // la barre espace) → l'événement reste au moteur, le `click` doit être émis.
    if (this.toolsActive && this.inputInterceptor?.('up', this.pickAt(e), e)) return
    // Carte totalement inerte : aucun clic n'en sort. En `'view'` il passe — c'est
    // ce qui distingue « consultable » de « image ».
    if (this.interactiveMode === false) return
    // Clic « propre » (peu de mouvement) → événement de sélection carte.
    if (drag && drag.moved < this.config.interaction.cleanClickPx) {
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
    this.canvas.parentElement?.removeEventListener('wheel', this.forwardWheel)
    this.labelRenderer.domElement.remove()
  }
}

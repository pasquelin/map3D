import * as THREE from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { GlobeControls, TilesRenderer } from '3d-tiles-renderer'
import { CesiumIonAuthPlugin, GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins'
import { defaultConfig } from '../config/defaultConfig'
import type { MapConfig, TileProvider, TilesConfig } from '../config/types'
import {
  type BuildingHighlight,
  type BuildingPickResult,
  BuildingsLayer,
  type BuildingRef,
} from '../layers/BuildingsLayer'
import { defaultTheme } from '../theme/defaultTheme'
import { TiledGlobeLayer } from '../layers/TiledGlobeLayer'
import type { Bounds, LatLng } from '../shared'
import {
  type BasemapState,
  type BasemapSupport,
  canEnterMode,
  deriveBasemapCapabilities,
  type MapMode,
} from './basemap'
import { boundsOfCircle, boundsOfLatLngs } from './bounds'
import { Camera, type CameraState } from './Camera'
import { HEADING_EPSILON, projectViewForward } from './enu'
import { GroundedState } from './GroundedState'
import { PedestrianController, type PedestrianPose } from './PedestrianController'
import { isGroundPlacement } from './pedestrianPlacement'
import {
  type CameraMode,
  type ImmersionLevel,
  type LookAngles,
  type PedestrianPhase,
  type PedestrianState,
  samePedestrianState,
} from './pedestrianState'
import { pedestrianView } from './pedestrianView'
import { PluginEnrichment } from './PluginEnrichment'
import { PluginRegistry } from './PluginRegistry'
import { TemplateRegistry } from './templates/TemplateRegistry'
import type { ApplyMode, Template } from './templates/types'
import { defaultPluginFetchPolicy } from '../plugins/fetchPolicy'
import { TILE_SIZE } from './googleTiles'
import { createTileSource } from './tileSource'
import type { FrameContext, Layer, MapView } from './Layer'
import {
  altitudeForZoom,
  CAMERA_FOV,
  metersPerPixelAt,
  clamp,
  DEG2RAD,
  EARTH_CIRCUMFERENCE,
  easeInOutCubic,
  zoomForAltitude,
} from './math'
import { viewScaleDistance } from './viewScale'
import { Sky } from './Sky'
import { subsolarPoint } from './sun'
import { DragRegistry } from './DragRegistry'
import { NavKeys } from './NavKeys'
import { Projection } from './Projection'
import { SelectableRegistry } from './Selectables'
import { SearchRegistry } from '../search/registry'
import { ClusterRegistry } from './ClusterRegistry'
import { MarkerRegistry } from './MarkerQuery'
import { TagFilter } from './TagFilter'

export type PointerPhase = 'down' | 'move' | 'up'
/** Intercepteur d'entrée (outils de dessin) : renvoie true pour consommer. */
export type PointerInterceptor = (phase: PointerPhase, latLng: LatLng | null, event: PointerEvent) => boolean

// Le domaine du fond de carte (mode + capacités) vit dans `./basemap`, avec sa table de
// vérité en fonction pure. Ré-exporté ici : c'est de `MapEngine` que les consommateurs
// (et `src/index.ts`) l'importent depuis toujours.
export type { BasemapState, MapMode } from './basemap'
export type { BuildingHighlight, BuildingRef } from '../layers/BuildingsLayer'

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
  /**
   * Façades et toits des bâtiments extrudés du fournisseur interne
   * (`theme.globe.buildingColor` / `buildingRoofColor`). Comme `oceanColor`, lues au
   * montage : une charte qui change ne reconstruit pas la géométrie déjà extrudée.
   */
  buildingColor?: string
  buildingRoofColor?: string
  /** Éclaircissement du toit d'une emprise colorée par la donnée (`theme.globe.buildingRoofLighten`). */
  buildingRoofLighten?: number
  /**
   * Soleil de convention des façades (`theme.globe.buildingSunAzimuth` /
   * `buildingShadeMin`). Lu au montage comme les couleurs : l'ombrage est cuit dans les
   * couleurs de sommets, il ne coûte donc rien à la frame — et ne se repeint pas.
   */
  buildingSunAzimuth?: number
  buildingShadeMin?: number
  /**
   * Teintes du bâtiment survolé et du bâtiment dont le menu est ouvert
   * (`theme.globe.buildingHoverColor` / `buildingSelectColor`). Lues au montage comme les
   * précédentes : elles ne repeignent pas un highlight en cours.
   */
  buildingHoverColor?: string
  buildingSelectColor?: string
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
   * Clé localStorage de l'état des plugins (`null` = pas de persistance). Défaut :
   * `config.data.storageKeys.plugins`.
   */
  pluginStorageKey?: string | null
  /**
   * Clé localStorage des templates de dessin (`null` = pas de persistance). Défaut :
   * `config.data.storageKeys.templates`.
   */
  templateStorageKey?: string | null
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

/**
 * Ce qu'un bâtiment désigné rend à l'hôte. Aucun texte : c'est `buildingMenu` qui compose
 * ce qui s'affiche — la lib ne sait pas ce qu'un bâtiment représente pour l'application.
 */
export type BuildingInfo = {
  /** `feature.id` MVT ; `null` quand la donnée n'en portait pas. */
  featureId: number | null
  /** Point CLIQUÉ sur le volume — pas le centre de l'emprise. */
  lat: number
  lng: number
  /** Hauteurs de l'emprise, en mètres au-dessus du sol. */
  height: number
  minHeight: number
  /** Attributs demandés par `providers.buildings.pickFields` ; vide sans liste. */
  props: Record<string, unknown>
  /**
   * Emprise du bâtiment — de quoi le CADRER : `camera.fitBounds(info.bounds)`.
   *
   * La lib ne recadre rien d'elle-même : un vol non demandé à chaque clic déplacerait la
   * carte sous le menu qui vient de s'ouvrir. C'est une entrée de `buildingMenu` à écrire,
   * comme le reste de son contenu.
   */
  bounds: Bounds
}

/** Le bâtiment désigné, et de quoi le re-désigner (mise en évidence). */
export type BuildingHit = { ref: BuildingRef; info: BuildingInfo }

/**
 * Compteurs de rendu (cf. `MapEngine.stats`).
 *
 * Ce qu'il faut regarder en premier : `drawCalls` (coût par objet dessiné), `painted` face
 * à `frames`, et `resolutionScale` (le GPU tient-il la cadence). `overlays` compte les
 * markers suivis, masqués compris — c'est lui qui pilote le coût du `CSS2DRenderer`.
 */
export type MapStats = {
  /** État de la dernière frame peinte. */
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  /** `CSS2DObject` suivis (markers montés, visibles ou non). */
  overlays: number
  /** Résolution courante, en fraction de `performance.pixelRatio`. */
  resolutionScale: number
  /** CUMULS depuis le démarrage — à lire en différence entre deux relevés. */
  painted: number
  frames: number
}

export type MapEvents = {
  camera: CameraState
  viewport: MapView
  click: { latLng: LatLng; originalEvent: PointerEvent }
  dragmode: DragMode
  basemap: BasemapState
  /**
   * Le mode piéton a changé d'état — entrée, sortie, niveau d'immersion, disponibilité, ou
   * rotation perceptible. Émis SUR CHANGEMENT, jamais par frame (cf. `samePedestrianState`).
   */
  pedestrian: PedestrianState
  /** L'outil « sélectionner un bâtiment » vient d'être armé ou quitté. */
  buildingpickmode: boolean
  /**
   * Un bâtiment du volume interne a été cliqué, l'outil actif. La lib n'en fait rien
   * d'elle-même : c'est `<Map buildingMenu>` qui décide de ce qui s'ouvre.
   */
  buildingclick: { hit: BuildingHit; originalEvent: PointerEvent }
  /** Un template a été créé/renommé (`engine.templates.save`/`rename`). */
  templatesave: Template
  /** Un template a été supprimé. */
  templateremove: { id: string }
  /** Un template a été appliqué au dessin courant. */
  templateapply: { id: string; mode: ApplyMode }
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

// Rayon de la sphère d'étoiles (repère local, avant mise à l'échelle par frame). La valeur
// exacte importe peu : le rayon monde est recalé chaque frame sous le far courant.
const STAR_RADIUS = 1e7

/** Garde-fou sous `adaptiveResolution.minRatio` : à zéro, le tampon de rendu n'existe plus. */
const MIN_RESOLUTION_SCALE = 0.05

/**
 * Cœur du moteur : scène Three, `TilesRenderer` (Google Photorealistic 3D Tiles
 * ou tileset custom), `GlobeControls` (navigation façon Google Earth), globe
 * ellipsoïde de repli, et boucle de rendu. Le repère est géocentrique (ECEF),
 * ce qui **ancre** markers et formes à leur coordonnée géographique.
 */
export class MapEngine {
  readonly scene = new THREE.Scene()
  readonly threeCamera: THREE.PerspectiveCamera
  /**
   * Jumelle de `threeCamera` réservée au `CSS2DRenderer` : même pose, même champ, plage de
   * profondeur élargie (`performance.overlayDepth`). Sa matrice monde est RECOPIÉE au
   * moment du rendu — d'où `matrixWorldAutoUpdate = false`, sans quoi le `CSS2DRenderer`
   * la recalculerait depuis une position qu'on ne lui a jamais donnée.
   */
  private readonly labelCamera: THREE.PerspectiveCamera
  readonly camera: Camera
  readonly projection = new Projection()
  /** Filtre de visibilité par tags, partagé par toutes les couches (markers, dessins). */
  readonly tags: TagFilter
  /** Registre des plugins (contrat, activation, config) — partagé, agnostique React. */
  readonly plugins: PluginRegistry
  /** Registre des templates de dessin (sauvegardes nommées) — partagé, agnostique React. */
  readonly templates: TemplateRegistry
  /** Orchestrateur d'enrichissement au pick de bâtiment (event-driven sur `buildingclick`). */
  readonly enrichment: PluginEnrichment
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
   * Ancre des overlays DOM (markers `CSS2DObject`) — repère du tileset, mais visible même
   * quand la 3D est masquée (mode 2D). FRÈRE du groupe de tuiles et non son enfant, comme
   * `internalSurface` : sa matrice en est recopiée (cf. `mirrorTileFrame`).
   *
   * Sous `tiles.group`, le `CSS2DRenderer` traversait le tileset photoréaliste entier —
   * deux fois par frame, projection puis tri z — pour trouver quelques dizaines de markers.
   * Et `TilesGroup.updateMatrixWorld` ignorant `force`, un marker déplacé n'y voyait jamais
   * sa matrice monde recalculée autrement que par un `getWorldPosition()` par marker.
   */
  readonly overlayAnchor = new THREE.Group()
  /** Racine des overlays DOM, imposée par le tri z du `CSS2DRenderer`. Jamais rendue en WebGL. */
  private readonly labelScene = new THREE.Scene()
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
    pedestrian: new Set(),
    buildingpickmode: new Set(),
    buildingclick: new Set(),
    templatesave: new Set(),
    templateremove: new Set(),
    templateapply: new Set(),
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

  private buildingPickMode = false
  /** Scratch NDC du pick de bâtiment — un objet, jamais un par mouvement de pointeur. */
  private readonly pickNdc = new THREE.Vector2()
  /** Coins de l'emprise cliquée — quatre points réutilisés, alloués une seule fois. */
  private readonly pickCorners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]

  private stars: THREE.Points | null = null
  /** Ciel atmosphérique procédural (null quand `config.sky.enabled` est faux). */
  private sky: Sky | null = null
  /** Point subsolaire figé (dépend de la seule date) — recalculé à `applySky`, pas par frame. */
  private subsolar: LatLng = { lat: 0, lng: 0 }
  /** Instant du soleil résolu (ms epoch) ; capturé une fois quand `config.sky.date` vaut 0. */
  private skyEpoch = 0
  private drawingMode = false
  /** Barre espace maintenue : gel pan/rotation levé le temps du pan caméra. */
  private drawingSuspended = false
  /**
   * Globe 2D tuilé (LOD/cache/prefetch). Toujours monté : c'est sa SOURCE qui peut
   * manquer (`basemap2d.hasSource`), et elle peut apparaître à chaud — cf. le
   * constructeur.
   */
  private readonly basemap2d: TiledGlobeLayer
  /**
   * Volume du fournisseur interne : bâtiments extrudés depuis les tuiles vectorielles.
   * Monté comme le fond 2D — inconditionnellement, sa SOURCE pouvant manquer.
   */
  private readonly buildings: BuildingsLayer
  /**
   * Surface reconstruite localement : fond raster interne + bâtiments extrudés.
   *
   * FRÈRE du groupe de tuiles, jamais son enfant : `TilesGroup.raycast()` délègue au
   * `TilesRenderer` puis renvoie `false`, ce qui arrête la traversée de Three — tout
   * enfant y est donc invisible aux rayons. C'est ce qui privait le fond 2D, puis les
   * bâtiments, de toute collision et de tout drapage.
   *
   * Sa transformée est recopiée du groupe de tuiles à chaque frame : les deux surfaces
   * partagent ainsi exactement le même repère (ECEF local), sans en dépendre.
   */
  private readonly internalSurface = new THREE.Group()
  /** Un tileset 3D photoréaliste est disponible (token Cesium Ion ou clé Google) — figé au montage. */
  private readonly has3dTileset: boolean
  /**
   * D'où vient le volume — `providers.tiles3d.provider`, relu à chaud par `setConfig`.
   *
   * Sur `'internal'`, le tileset photoréaliste n'est ni rendu ni piloté : son `update`
   * étant gelé, il n'émet AUCUNE requête (le premier fetch part au premier `update`),
   * donc rien ne se facture — sans avoir à remonter la carte pour changer d'avis.
   */
  private provider3d: TileProvider
  /**
   * Déplacement continu au clavier. Monté d'office : sans touche maintenue il ne coûte
   * rien, et `setKeyNavEnabled` le rend à qui de droit quand les flèches lui reviennent.
   */
  private readonly navKeys: NavKeys
  // Base tangente et rotation du déplacement clavier — recalculées par frame, jamais allouées.
  private readonly navUp = new THREE.Vector3()
  private readonly navForward = new THREE.Vector3()
  private readonly navRight = new THREE.Vector3()
  private readonly navDir = new THREE.Vector3()
  private readonly navAxis = new THREE.Vector3()
  private readonly navCenter = new THREE.Vector3()
  private readonly navQuat = new THREE.Quaternion()
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
   * Recopie les bornes de navigation dans `GlobeControls` et `Camera`, qui ne les
   * relisent pas. Appelée à chaque changement de config ET de mode : plusieurs de ces
   * bornes dépendent du mode.
   *
   * ⚠️ Trois réglages de `camera` étaient **déclarés, documentés et branchés nulle part** :
   * `minZoom`, `maxZoom`, et `minGroundClearance` hors des vols programmés. La molette
   * n'était donc bornée que par le `cameraRadius` de `GlobeControls` — 5 m par défaut,
   * jamais réglé : on descendait au ras du pavé, nez contre une façade.
   */
  private applyCameraLimits(): void {
    const c = this.config.camera
    const R = this.tiles.ellipsoid.radius.x
    this.maxCameraDistance = R * c.maxDistanceFactor
    this.camera.maxAltitude = R * c.maxAltitudeFactor
    // `minZoom` et `maxAltitudeFactor` bornent le même éloignement en deux unités : le plus
    // contraignant gagne, plutôt que l'un des deux soit ignoré.
    this.controls.maxDistance = Math.min(R * c.maxAltitudeFactor, altitudeForZoom(c.minZoom))
    /**
     * Plancher de descente. `minDistance` borne la distance caméra ↔ **point visé** (là où
     * le rayon du curseur touche la surface, bâtiments compris) : c'est donc une garde
     * juste aussi en vue inclinée, là où une simple borne d'altitude ne dirait rien.
     *
     * Le mode décide, comme pour l'inclinaison : une carte plate se lit d'autant mieux
     * qu'on s'en approche, un volume non.
     */
    this.controls.minDistance = altitudeForZoom(this.mapMode === '3d' ? c.maxZoom3d : c.maxZoom)
    // Garde au sol de la molette et du pan, que `Camera.clampAltitude` n'applique qu'aux
    // vols programmés — le réglage annonçait pourtant « le sol RÉEL, tuiles comprises ».
    this.controls.cameraRadius = c.minGroundClearance
    this.controls.maxAltitude = this.mapMode === 'plan' ? c.maxTilt2d : c.maxTilt3d
    // La même borne pour les poses REPOSÉES (`Camera.jumpToPose`) : `GlobeControls` ne borne
    // que ce que l'utilisateur incline à la main, une vue mémorisée arrive par un autre
    // chemin et doit trouver la limite du mode où elle atterrit, pas celle d'où elle vient.
    this.camera.maxTilt = this.controls.maxAltitude
  }

  constructor(opts: MapEngineOptions) {
    this.canvas = opts.canvas
    this.config = opts.config ?? defaultConfig
    this.projection.setConfig(this.config)
    this.navKeys = new NavKeys(this.config.interaction.shortcuts.navigate)
    this.googleMapsApiKey = opts.googleMapsApiKey
    this.tags = new TagFilter(opts.tagStorageKey)
    /**
     * Le filtre « Couches » bascule la visibilité de meshes WebGL (`DrawLayer`, formes,
     * tracés) depuis une case à cocher d'un panneau — sans geste sur le canvas, sans
     * mouvement de caméra, sans recalage. Le brancher ICI, sur le registre plutôt que sur
     * chaque couche qui l'écoute, couvre tout abonné présent et à venir.
     */
    this.unbindTagPaint = this.tags.onSelection(this.invalidate)
    const pluginKey = opts.pluginStorageKey === undefined ? this.config.data.storageKeys.plugins : opts.pluginStorageKey
    this.plugins = new PluginRegistry(pluginKey, this.config.data.positionSaveDebounceMs)
    this.enrichment = new PluginEnrichment(this, this.plugins, defaultPluginFetchPolicy)
    const templateKey =
      opts.templateStorageKey === undefined ? this.config.data.storageKeys.templates : opts.templateStorageKey
    this.templates = new TemplateRegistry(templateKey, this.config.data.positionSaveDebounceMs)
    // Le registre relaie ses changements aux abonnés `engine.on('template…')`.
    this.templates.onSave = (t) => this.emit('templatesave', t)
    this.templates.onRemove = (id) => this.emit('templateremove', { id })
    this.templates.onApply = (id, mode) => this.emit('templateapply', { id, mode })
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: this.config.performance.antialias,
      powerPreference: this.config.performance.powerPreference,
    })
    // DPR configurable (`performance.pixelRatio`, défaut 1) : à 1 le canvas fait
    // EXACTEMENT la taille du parent, sans ×2 rétine sur le backing store.
    this.renderer.setPixelRatio(this.config.performance.pixelRatio)
    this.renderer.setClearColor(new THREE.Color(opts.background), 1)

    // FOV lu une seule fois : il gouverne toutes les conversions mètres↔pixels de la
    // lib, largement mémoïsées. Le changer sur une carte montée laisserait des
    // résolutions périmées un peu partout — d'où l'absence de setter.
    this.threeCamera = new THREE.PerspectiveCamera(opts.fov ?? CAMERA_FOV, 1, 1, 1e8)
    this.threeCamera.position.set(0, 0, 2e7)
    const overlayDepth = this.config.performance.overlayDepth
    this.labelCamera = new THREE.PerspectiveCamera(
      this.threeCamera.fov,
      1,
      overlayDepth.nearMeters,
      overlayDepth.farMeters,
    )
    this.labelCamera.matrixWorldAutoUpdate = false

    // Source de tuiles 3D : Cesium Ion (token) en priorité, sinon Google Maps Platform
    // en direct (clé). NB : les Photorealistic 3D Tiles Google sont bloquées pour les
    // comptes EEA → Ion reste la source fiable. Sans l'un ni l'autre, le TilesRenderer
    // reste vide → globe ellipsoïde de repli.
    //
    // Les plugins sont enregistrés dès qu'un token/une clé existe, indépendamment de
    // `providers.tiles3d.provider` : c'est la VISIBILITÉ et l'`update` du tileset que ce
    // réglage commande (cf. `applyModeVisibility` et `tick`), ce qui le rend modifiable à
    // chaud dans les deux sens. Un tileset jamais updaté n'émet aucune requête.
    this.provider3d = this.config.providers.tiles3d.provider
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
    // Ancre des overlays (markers) : partage la transformée du tileset sans en être
    // l'enfant, et vit dans sa propre scène (cf. `overlayAnchor`).
    this.overlayAnchor.name = 'm3d-overlay-anchor'
    this.overlayAnchor.matrixAutoUpdate = false
    this.labelScene.add(this.overlayAnchor)
    // Les matrices monde de `labelScene` sont mises à jour par le moteur, ENTRE la passe
    // de lecture et la passe d'écriture (cf. `tick`) : le `CSS2DRenderer` la refaire
    // rendrait la descente deux fois, et `MarkerLayer.project` lirait la première.
    this.labelScene.matrixWorldAutoUpdate = false
    // Racine immobile : sans ça, son `updateMatrix()` par frame marquait sa matrice monde
    // à recalculer, ce que la descente propage ensuite à TOUT le sous-arbre — soit une
    // matrice monde recomposée par marker et par frame, quand bien même aucun n'a bougé.
    this.labelScene.matrixAutoUpdate = false
    this.annotations.name = 'm3d-annotations'
    this.scene.add(this.annotations)

    this.projection.setContext(this.tiles.ellipsoid, this.tiles.group)

    // Fond 2D : couche indépendante drapée sur le globe, rendue en mode plan (le tileset
    // 3D est alors masqué). NB EEA : Google 2D ne sert que roadmap/terrain/trafic
    // (satellite/hybride bloqués) ; le fournisseur interne, lui, sert son propre style.
    //
    // Le calque est monté INCONDITIONNELLEMENT, la source pouvant être absente : il était
    // créé sous condition de clé Google, ce qui rendait le fond 2D définitivement
    // indisponible pour toute la session — renseigner une origine interne à chaud
    // n'aurait rien pu y changer. C'est `hasSource` qui porte désormais la
    // disponibilité, et le calque inerte ne coûte qu'une sphère masquée.
    // Capturée AVANT la fabrique : sans ça, la closure retient tout `MapEngineOptions`
    // (conteneur, canvas, callbacks) pour la durée de vie de la carte.
    const apiKey = opts.googleMapsApiKey
    this.internalSurface.name = 'm3d-internal-surface'
    // Matrice pilotée à la main (recopiée du groupe de tuiles chaque frame).
    this.internalSurface.matrixAutoUpdate = false
    this.scene.add(this.internalSurface)
    this.basemap2d = new TiledGlobeLayer(
      this.internalSurface,
      this.tiles.ellipsoid,
      (cfg, origin) => createTileSource(cfg, origin, apiKey),
      this.config.providers.tiles,
      this.config.providers.internal,
      opts.oceanColor,
    )
    // Anisotropie résolue une fois : `0` en config = le maximum que le GPU sait faire.
    // C'est ce qui tient un sol net en vue rasante, où un mipmap seul produit du moiré.
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy()
    const wanted = this.config.performance.textureAnisotropy
    this.basemap2d.anisotropy = wanted > 0 ? Math.min(wanted, maxAniso) : maxAniso
    // Volume interne. Même règle que le fond 2D : monté d'office, inerte sans origine.
    this.buildings = new BuildingsLayer(
      this.internalSurface,
      this.tiles.ellipsoid,
      this.config.providers.buildings,
      this.config.providers.internal,
      {
        wall: opts.buildingColor ?? defaultTheme.globe.buildingColor,
        roof: opts.buildingRoofColor ?? defaultTheme.globe.buildingRoofColor,
        roofLighten: opts.buildingRoofLighten ?? defaultTheme.globe.buildingRoofLighten,
        shading: {
          azimuth: opts.buildingSunAzimuth ?? defaultTheme.globe.buildingSunAzimuth,
          min: opts.buildingShadeMin ?? defaultTheme.globe.buildingShadeMin,
        },
        hover: opts.buildingHoverColor ?? defaultTheme.globe.buildingHoverColor,
        select: opts.buildingSelectColor ?? defaultTheme.globe.buildingSelectColor,
      },
    )
    this.has3dTileset = hasCustomTiles

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
     * ⚠️ Ce groupe est un `TilesGroup` : son `raycast()` interroge le `TilesRenderer`
     * puis renvoie `false`, ce qui ARRÊTE la traversée de Three. Seules les tuiles
     * répondent donc, jamais ce qu'on ajoute au groupe — le fond raster n'a ainsi
     * jamais été raycastable, d'où le `flatHeight` du mode plan.
     *
     * La surface reconstruite localement vit pour cette raison à côté
     * (`internalSurface`), et `applyModeVisibility` désigne celle des deux à viser.
     */
    this.controls.setScene(this.tiles.group)
    this.controls.setCamera(this.threeCamera)
    this.controls.setEllipsoid(this.tiles.ellipsoid, this.tiles.group)
    ;(this.controls as unknown as { tilesRenderer: TilesRenderer }).tilesRenderer = this.tiles
    this.controls.enableDamping = this.config.interaction.damping
    this.controls.attach(this.canvas)

    this.camera = new Camera(this.threeCamera, this.projection)
    this.camera.setConfig(this.config)
    // Troisième pilote caméra, monté d'office : au repos il ne coûte rien (aucun rayon,
    // aucun calcul), et `cameraMode` décide seul de qui écrit dans la caméra.
    // Repli de gravité = le sol ANALYTIQUE (plat, gratuit), jamais la couronne du placement :
    // en interne il corrige la caméra suspendue au-dessus de la nappe raster non raycastable ;
    // en externe il vaut `null`, et la gravité garde alors la hauteur précédente plutôt que de
    // relancer les ~9 rayons de `sampleGroundHeight` à chaque frame au-dessus d'un trou de tuile.
    this.pedestrianCtl = new PedestrianController(
      this.threeCamera,
      this.projection,
      this.navKeys,
      () => this.flatGroundElevation,
    )
    this.pedestrianCtl.setConfig(this.config)
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

    // Ciel atmosphérique : monté par-dessus les étoiles, mais invisible tant que l'altitude
    // reste haute (opacité pilotée par frame). La vue globe part donc identique à avant.
    this.applySky()

    // Zoom molette actif au-dessus des SURFACES CARTE (markers, formes/marquee,
    // zone loupe) : on relaie l'événement `wheel` qu'elles reçoivent vers le canvas
    // (écouté par GlobeControls). Le listener est posé sur le conteneur pour couvrir
    // ces surfaces où qu'elles soient dans l'arbre ; c'est `forwardWheel` qui décide
    // (les barres et panneaux d'UI, eux, ne doivent PAS zoomer la carte).
    this.canvas.parentElement?.addEventListener('wheel', this.forwardWheel, { passive: false })

    this.bindInput()

    // Mode de départ, en DERNIER (setMapMode touche controls, projection et l'intro,
    // tous construits au-dessus) : plan par défaut dès qu'un fond 2D est servable — clé
    // Google ou origine interne. Passe par setMapMode pour ne pas dupliquer les règles
    // de bascule ; sans source, sa garde ramène au mode 3D.
    this.setMapMode(opts.mapMode ?? (this.basemap2d.hasSource ? 'plan' : '3d'))
    // `setMapMode` sort par sa garde d'idempotence quand le mode demandé est DÉJÀ celui
    // de départ ('3d') : la scène resterait alors dans son état de construction, où fond
    // et bâtiments sont masqués. On applique donc l'état une fois, explicitement.
    this.applyModeVisibility()
    this.syncBasemap()
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
    const R = STAR_RADIUS
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

  /**
   * (Re)configure le ciel depuis `config.sky` : le crée/le détruit selon `enabled`, pousse
   * les uniforms statiques (atmosphère + nuages) et fige le point subsolaire depuis la date.
   * Appelée au montage et à chaque `setConfig` — jamais par frame.
   */
  private applySky(): void {
    const cfg = this.config.sky
    if (!cfg.enabled) {
      if (this.sky) {
        this.scene.remove(this.sky)
        this.sky.dispose()
        this.sky = null
      }
      return
    }
    if (!this.sky) {
      this.sky = new Sky()
      this.scene.add(this.sky)
    }
    const u = this.sky.uniforms
    u.turbidity.value = cfg.turbidity
    u.rayleigh.value = cfg.rayleigh
    u.mieCoefficient.value = cfg.mieCoefficient
    u.mieDirectionalG.value = cfg.mieDirectionalG
    u.cloudCoverage.value = cfg.clouds.coverage
    u.cloudDensity.value = cfg.clouds.density
    u.cloudScale.value = cfg.clouds.scale
    u.cloudElevation.value = cfg.clouds.elevation
    // `date` explicite (> 0) : instant fixe. Sinon on fige l'heure de montage, capturée
    // une seule fois puis conservée (jour/nuit stable au fil des `setConfig`).
    if (cfg.date > 0) {
      this.subsolar = subsolarPoint(new Date(cfg.date))
    } else {
      if (this.skyEpoch === 0) this.skyEpoch = Date.now()
      this.subsolar = subsolarPoint(new Date(this.skyEpoch))
    }
  }

  /**
   * Fondu et orientation du ciel, par frame. Opacité déduite de l'altitude (invisible au-
   * dessus de `fade.start` → plein sous `fade.end`) : au-delà, on sort tôt et le ciel ne
   * coûte rien en vue globe. Sinon on oriente `up` (verticale locale) et `sunPosition`
   * (normale au point subsolaire) en repère monde, et on colle le dome à la caméra.
   */
  private updateSky(state: CameraState): void {
    const sky = this.sky
    if (!sky) return
    const { start, end } = this.config.sky.fade
    const opacity = easeInOutCubic(clamp((start - state.altitude) / Math.max(1, start - end), 0, 1))
    if (opacity <= 0) {
      sky.visible = false
      return
    }
    sky.visible = true
    const u = sky.uniforms
    u.opacity.value = opacity
    // Écrit droit dans les Vector3 des uniforms (déjà alloués) — pas de scratch ni de
    // copie, et `state` sert de `LatLng` sans littéral intermédiaire. Zéro-alloc par frame.
    this.projection.worldNormal(state, u.up.value)
    this.projection.worldNormal(this.subsolar, u.sunPosition.value)
    sky.position.copy(this.threeCamera.position)
    /**
     * Grand devant la caméra pour remplir l'écran sans être rogné par le near ; la
     * profondeur est de toute façon forcée au far par le shader.
     *
     * ⚠️ Le plancher était ABSOLU (100 km). En mode piéton le far tombe à la distance de
     * vue (~1 km) : le dôme se retrouvait entièrement au-delà du plan lointain, donc éliminé
     * par le frustum culling — ciel noir. Le plancher est désormais relatif au near, ce qui
     * garde le dôme DANS le frustum quelle que soit la profondeur de vue.
     */
    sky.scale.setScalar(Math.max(this.threeCamera.far * 0.5, this.threeCamera.near * 100))
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
    // La jumelle des overlays suit le cadrage, jamais la plage de profondeur (cf.
    // `labelCamera`) : c'est le seul moment où sa projection a besoin d'être refaite.
    this.labelCamera.aspect = this.threeCamera.aspect
    this.labelCamera.updateProjectionMatrix()
    this.projection.setViewportSize(w, h)
    this.labelRenderer.setSize(w, h)
    this.invalidate()
    this.tiles.setResolutionFromRenderer(this.threeCamera, this.renderer)
    // La taille du viewport change les bounds : invalide la vue mémoïsée.
    this.viewDirty = true
  }

  addLayer(layer: Layer): void {
    this.layers.add(layer)
    // Config poussée à l'ajout : une couche montée après un `setConfig` doit partir
    // avec les réglages courants, pas avec ses défauts. Même raison pour la vue au ras
    // du sol : une couche montée pendant la marche naîtrait sinon en réglage orbital.
    layer.setConfig?.(this.config)
    if (this.grounded.active) layer.setGrounded?.(true)
    this.invalidate()
  }

  removeLayer(layer: Layer): void {
    this.layers.delete(layer)
    layer.dispose()
    this.invalidate()
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
    // Un outil de dessin et le pick de bâtiment se disputent le même clic : le dernier armé
    // gagne. Ici plutôt que dans chaque bouton — tous les chemins qui arment un tracé
    // (barre, raccourci, API) passent par là.
    if (active) this.setBuildingPickMode(false)
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
    this.invalidate()
    if (prev.performance.pixelRatio !== config.performance.pixelRatio) this.applyResolution()
    const depth = config.performance.overlayDepth
    if (prev.performance.overlayDepth !== depth) {
      this.labelCamera.near = depth.nearMeters
      this.labelCamera.far = depth.farMeters
      this.labelCamera.updateProjectionMatrix()
    }
    this.controls.enableDamping = config.interaction.damping
    // Relu AVANT le fond : c'est lui qui décide du fournisseur effectif de celui-ci
    // (cf. `effectiveTilesConfig`).
    this.provider3d = config.providers.tiles3d.provider
    // L'origine du serveur interne est PARTAGÉE : le fond 2D et le volume la lisent au
    // même endroit (`providers.internal`), puisque les deux sortent du même serveur.
    this.basemap2d.setConfig(this.effectiveTilesConfig(), config.providers.internal)
    this.buildings.setConfig(config.providers.buildings, config.providers.internal)
    this.navKeys.setConfig(config.interaction.shortcuts.navigate)
    this.camera.setConfig(config)
    this.pedestrianCtl.setConfig(config)
    // Distance de vue ou brouillard modifiés en cours de marche : la vue se repose.
    if (this.cameraMode === 'pedestrian' && this.pedestrianPhase === 'active') this.applyPedestrianView()
    this.projection.setConfig(config)
    for (const layer of this.layers) layer.setConfig?.(config)
    // Ciel : recrée/détruit selon `enabled` et repousse atmosphère + nuages + date.
    this.applySky()
    // Bornes de navigation : recopiées dans `GlobeControls`, qui ne les relit pas.
    if (prev.camera !== config.camera) this.applyCameraLimits()
    /**
     * Les fournisseurs ont pu changer (bascule à chaud) : le fond 2D peut apparaître ou
     * disparaître sous nos pieds, et le volume passer du photoréaliste à l'interne. Si le
     * mode courant n'a plus de quoi s'afficher, on part vers l'autre — dans les DEUX sens,
     * là où seul le retour vers `'3d'` était traité : retirer le token Ion en 3D externe
     * laissait la carte sur un mode vide.
     *
     * `setMapMode` porte les règles de bascule (intro, trafic, visibilité) ; les rejouer
     * ici en écrivant `mapMode` à la main laissait par exemple le calque trafic allumé
     * sous un mode qui ne le sert pas, prêt à réapparaître au retour en plan.
     */
    const caps = deriveBasemapCapabilities(this.mapMode, this.basemapSupport(), this.basemap2d.trafficOn)
    if (!canEnterMode(caps, this.mapMode)) this.setMapMode(this.mapMode === '3d' ? 'plan' : '3d')
    this.applyModeVisibility()
    this.syncBasemap()
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

  /** Qui pilote la caméra — `'pedestrian'` gèle `GlobeControls` et branche le contrôleur. */
  private cameraMode: CameraMode = 'orbit'
  private pedestrianPhase: PedestrianPhase = 'placing'
  private immersion: ImmersionLevel = 'explore'
  private readonly pedestrianCtl: PedestrianController
  private pedestrianState: PedestrianState = {
    mode: 'orbit',
    phase: 'placing',
    immersion: 'explore',
    available: false,
    heading: 0,
    pitch: 0,
  }
  /** Near/far orbitaux sauvegardés à l'entrée en piéton, rendus à la sortie. */
  private savedNearFar: { near: number; far: number } | null = null
  /** Scratch de lecture de la couleur de fond (source du brouillard) — jamais alloué à chaud. */
  private readonly fogColor = new THREE.Color()

  /** Type de carte affiché — cf. `MapMode` : 'plan' = carte plate, '3d' = volume. */
  private mapMode: MapMode = '3d'
  private basemapState: BasemapState = deriveBasemapCapabilities(
    '3d',
    {
      hasBasemap2d: false,
      sourceSupportsTraffic: false,
      provider3d: 'external',
      has3dTileset: false,
      hasRelief: false,
      hasBuildings: false,
    },
    false,
  )

  /**
   * Fond de carte courant — source de vérité de l'UI, avec l'événement `basemap`.
   * L'objet est **stable** tant que rien ne change : un consommateur React peut le
   * mettre en état sans re-rendre à chaque émission.
   */
  getBasemap(): BasemapState {
    return this.basemapState
  }

  /**
   * Ce que les sources réelles savent faire, à l'instant présent. Lu (jamais copié) :
   * une copie divergerait de la source au premier changement de config.
   *
   * `hasRelief`/`hasBuildings` restent faux : le relief terrain-RGB et les bâtiments
   * extrudés du fournisseur interne sont les phases suivantes de la feature. Ce sont
   * eux qui donneront un mode '3d' au fournisseur interne.
   */
  private basemapSupport(): BasemapSupport {
    return {
      hasBasemap2d: this.basemap2d.hasSource,
      sourceSupportsTraffic: this.basemap2d.supportsTraffic,
      provider3d: this.provider3d,
      has3dTileset: this.has3dTileset,
      // Le relief terrain-RGB est la phase suivante de la feature.
      hasRelief: false,
      hasBuildings: this.buildings.hasSource,
    }
  }

  /**
   * Recalcule l'état diffusé depuis les sources réelles (mode + calque + capacités), et
   * n'émet que sur changement effectif — l'objet doit rester stable pour un consommateur
   * React qui le met en état.
   */
  private syncBasemap(): void {
    const next = deriveBasemapCapabilities(this.mapMode, this.basemapSupport(), this.basemap2d.trafficOn)
    const s = this.basemapState
    const changed = !(
      s.mode === next.mode &&
      s.traffic === next.traffic &&
      s.trafficAvailable === next.trafficAvailable &&
      s.canPlan === next.canPlan &&
      s.can3d === next.can3d &&
      s.canPickBuildings === next.canPickBuildings
    )
    if (changed) {
      this.basemapState = next
      this.emit('basemap', this.basemapState)
      // Le volume interne quitté, l'outil de sélection n'a plus rien à désigner : le laisser
      // armé afficherait un curseur de sélection sur une carte plate. Ici et pas dans
      // `setMapMode` : plusieurs chemins retirent le volume (bascule, config qui change de
      // fournisseur), et tous passent par cette publication.
      if (!next.canPickBuildings) this.setBuildingPickMode(false)
    }
    /**
     * Mode piéton : publié À CHAQUE passage, y compris quand le fond n'a pas bougé.
     *
     * ⚠️ Sous le retour anticipé d'origine, la disponibilité n'était jamais publiée au
     * démarrage — le fond n'y change pas — et le bouton restait absent de la barre à vie.
     * `syncPedestrian` porte sa propre garde d'égalité : rien n'est émis pour rien.
     *
     * APRÈS l'écriture de `basemapState` : `pedestrianAvailable()` le lit, et le faire avant
     * lui aurait fait voir l'état précédent — donc réagir un cran en retard.
     */
    if (!this.pedestrianAvailable()) this.exitPedestrian()
    this.syncPedestrian()
  }

  /**
   * Une carte plate est-elle servable ? (clé Google en fournisseur externe, origine
   * renseignée en interne). `setMapMode('plan')` est sans effet quand c'est faux, et
   * l'UI s'en sert pour ne pas proposer un bouton inerte.
   *
   * Conservé comme alias de `getBasemap().canPlan` : c'est l'API publique historique.
   */
  get supportsBasemap2d(): boolean {
    return this.basemap2d.hasSource
  }

  /**
   * Bascule le type de carte — cf. `MapMode`. En plan, le tileset 3D est masqué (et son
   * `update` gelé pour ne rien charger en fond), le globe tuilé prend le relais, et
   * l'inclinaison est **limitée** (`minAltitude` relevé) : une carte plate ne peut pas
   * couvrir jusqu'à l'horizon en tuiles → sinon fond bas-résolution étiré/étrange.
   * Un mode sans rien à afficher est sans effet — cf. `canEnterMode`.
   */
  setMapMode(mode: MapMode): void {
    const in2d = mode !== '3d'
    /**
     * Basculer vers un mode que rien n'alimente ne ferait que masquer ce qui est à
     * l'écran — carte vide. L'appel est ignoré, y compris en usage vanilla et depuis la
     * prop `mapMode`, où aucune UI ne filtre.
     *
     * ⚠️ La garde n'existait que pour `'plan'` : entrer en `'3d'` sans tileset ni volume
     * interne masquait le fond pour ne rien mettre à la place. On ne refuse toutefois que
     * s'il reste OÙ ALLER — sans aucun fournisseur configuré, la carte garde son mode et
     * son globe de repli plutôt que de n'avoir plus aucun mode légal.
     */
    const caps = deriveBasemapCapabilities(mode, this.basemapSupport(), this.basemap2d.trafficOn)
    if (!canEnterMode(caps, mode) && canEnterMode(caps, in2d ? '3d' : 'plan')) return
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
    this.applyModeVisibility()
    // Le trafic est un calque du fond 2D : repasser en 3D l'éteint. La règle est
    // celle de `setTrafficVisible`, appelée plutôt que recopiée ici.
    if (!in2d) this.setTrafficVisible(false)
    this.syncBasemap()
  }

  // ── Mode piéton (cf. `PedestrianController`) ──

  /**
   * Le mode piéton est-il proposable ? Il lui faut **du volume à l'écran**, quel qu'en soit
   * le fournisseur : tuiles photoréalistes en externe, bâtiments extrudés (porteurs d'un
   * BVH) en interne. Dans les deux cas la surface est raycastable, et c'est tout ce dont la
   * collision et la gravité ont besoin — `applyModeVisibility` pose d'ailleurs le même
   * `setFlatHeight(null)` pour les deux.
   *
   * C'est exactement la règle de `can3d`, réutilisée plutôt que réécrite : une seconde table
   * de vérité aurait dérivé au premier fournisseur ajouté. Le mode plan, lui, reste exclu —
   * un fond plat n'a pas de relief à parcourir à hauteur d'homme.
   */
  private pedestrianAvailable(): boolean {
    return this.mapMode === '3d' && this.basemapState.can3d
  }

  /** État piéton courant — source de vérité de l'UI, avec l'événement `pedestrian`. */
  getPedestrian(): PedestrianState {
    return this.pedestrianState
  }

  /**
   * Où se tient le piéton et ce qu'il regarde — `null` en orbite. À lire pour MÉMORISER une
   * vue première personne, `enterPedestrian(p, look)` en étant la restitution.
   *
   * Volontairement hors de `PedestrianState` : cet état-là est diffusé par événement et doit
   * rester STABLE tant que rien ne change (cf. `syncPedestrian`), alors que la position
   * bouge à chaque pas — l'y mettre ferait réémettre, donc re-rendre React, à chaque frame
   * de marche. Ici c'est une lecture à la demande, sur un chemin froid.
   */
  getPedestrianPose(): PedestrianPose | null {
    return this.cameraMode === 'pedestrian' ? this.pedestrianCtl.getPose() : null
  }

  /**
   * Recalcule l'état diffusé et n'émet que sur changement effectif — l'objet doit rester
   * stable pour un consommateur React qui le met en état (cf. `syncBasemap`, même règle).
   */
  private syncPedestrian(): void {
    // Accesseurs plutôt que `getPose()` : appelé À CHAQUE FRAME en marche, il y allouait
    // deux objets par tour pour deux nombres.
    const next: PedestrianState = {
      mode: this.cameraMode,
      phase: this.pedestrianPhase,
      immersion: this.immersion,
      available: this.pedestrianAvailable(),
      heading: this.pedestrianCtl.heading,
      pitch: this.pedestrianCtl.pitch,
    }
    if (samePedestrianState(this.pedestrianState, next)) return
    this.pedestrianState = next
    this.emit('pedestrian', next)
  }

  /** Arme le curseur de placement : le clic suivant choisit le point d'entrée. */
  enterPedestrianPlacement(): void {
    if (!this.pedestrianAvailable() || this.cameraMode === 'pedestrian') return
    this.pedestrianPhase = 'placing'
    this.cameraMode = 'pedestrian'
    this.inputInterceptor = this.placementInterceptor
    this.canvas.parentElement?.classList.add('m3d-pedestrian-place')
    this.syncPedestrian()
  }

  /**
   * Le point visé est-il posable ? Vraie question du curseur de placement : la surface sous
   * le pixel doit être au niveau de la rue, pas sur un toit (cf. `isGroundPlacement`).
   */
  canPlacePedestrian(clientX: number, clientY: number): boolean {
    if (!this.pedestrianAvailable()) return false
    const c = this.config.pedestrian.placement
    /**
     * Mémoïsation du survol : une validation coûte le rayon d'écran PLUS la couronne de sol
     * (~9 rayons). `pointermove` tire bien plus vite que la frame, et recalculer à chaque
     * pixel saturait la boucle de rendu — la carte devenait inutilisable dès qu'on visait.
     */
    const now = performance.now()
    const last = this.placeProbe
    if (
      last &&
      now - last.at < c.refreshMs &&
      Math.abs(clientX - last.x) <= c.refreshSlopPx &&
      Math.abs(clientY - last.y) <= c.refreshSlopPx
    ) {
      return last.ok
    }
    const picked = this.projection.pickLatLngHeight(clientX, clientY, this.threeCamera)
    const ok = picked
      ? isGroundPlacement(picked.height, this.groundLevelAt(picked.latLng, c.ringRadiusMeters), c.maxRoofDeltaMeters)
      : false
    this.placeProbe = { x: clientX, y: clientY, at: now, ok }
    return ok
  }

  /** Dernière validation de survol — cf. la mémoïsation de `canPlacePedestrian`. */
  private placeProbe: { x: number; y: number; at: number; ok: boolean } | null = null

  /** Dernier rafraîchissement de la couverture de tuiles en marche (`tileRefreshMs`). */
  private tileFeedAt = 0

  /**
   * Niveau de rue sous un point, avec repli sur l'élévation suivie du terrain.
   *
   * Le repli n'est pas un confort : en fournisseur INTERNE, le sol est un raster drapé que
   * les rayons ne rencontrent pas — seuls les bâtiments sont des volumes. `sampleGroundHeight`
   * y rend donc `null` au-dessus de la moindre chaussée, et sans repli le placement était
   * refusé partout sauf sur les toits.
   */
  private groundLevelAt(p: LatLng, ringRadiusMeters: number): number | null {
    /**
     * Le court-circuit du sol analytique vit désormais DANS `sampleGroundHeight` (cf.
     * `Projection.setGroundPlane`, poussé par `syncGroundPlane`) : il servait au placement
     * piéton, à la gravité et au suivi de terrain, mais pas aux markers, qui appellent la
     * projection directement et se posaient donc sur les toits. Une seule porte pour tout
     * le monde, et cette méthode n'est plus qu'un nom pour le rayon de couronne.
     */
    return this.projection.sampleGroundHeight(p, ringRadiusMeters)
  }

  /**
   * Sol ANALYTIQUE du fournisseur courant, ou `null` s'il faut un rayon pour le connaître.
   *
   * Le volume interne drape une nappe PLATE à hauteur connue, délibérément non raycastable
   * (cf. `makeUnraycastable`) : la lire est exact ET gratuit. Source unique, lue par le
   * placement, la gravité et le suivi de terrain — trois chemins qui divergeaient chacun à
   * leur façon dès qu'un rayon revenait bredouille.
   */
  private get flatGroundElevation(): number | null {
    return this.provider3d === 'internal' ? this.basemap2d.groundElevation : null
  }

  /**
   * Pousse le sol analytique à la projection, par frame. Le setter court-circuite à valeur
   * égale — c'est donc une comparaison, pas un travail.
   *
   * Par frame et non au changement de fournisseur : la nappe suit l'élévation du terrain, qui
   * se précise avec le streaming des tuiles. Un seul point de synchronisation vaut mieux que
   * de traquer chaque écriture de `basemap2d.setElevation`.
   */
  private syncGroundPlane(): void {
    this.projection.setGroundPlane(this.flatGroundElevation)
  }

  /**
   * Entre en première personne à un point de rue. Rend `false` si le point n'est pas posable
   * ou si le mode n'est pas disponible — l'appelant n'a alors rien à défaire.
   *
   * `look` restitue un regard connu (cap + tangage, rad) au lieu de reprendre celui de la
   * caméra qu'on quitte : c'est ce qui rend une vue piéton MÉMORISABLE, `getPedestrianPose`
   * en étant la lecture symétrique.
   */
  enterPedestrian(p: LatLng, look?: LookAngles): boolean {
    if (!this.pedestrianAvailable()) return false
    const c = this.config.pedestrian.placement
    // Même repli que la validation du curseur : les deux doivent voir le MÊME sol, sinon un
    // point validé en survol serait refusé au clic.
    const ground = this.groundLevelAt(p, c.ringRadiusMeters)
    if (ground === null) return false
    // L'utilisateur prend la main : ni intro ni vol programmé ne doivent lui résister.
    this.cancelIntro()
    this.camera.cancelFly()
    this.cameraMode = 'pedestrian'
    this.pedestrianPhase = 'active'
    this.immersion = 'explore'
    this.releasePlacement()
    // GELÉ, pas détaché : `controls.enabled = false` neutralise ses handlers DOM tout en
    // gardant son état interne pour le retour en orbite.
    this.controls.enabled = false
    this.pedestrianCtl.enter(p, ground, look)
    // Les formes drapées cessent de se dessiner par-dessus le décor : à hauteur d'homme
    // elles recouvriraient tout l'écran (cf. `setGroundedView`).
    this.setGroundedView(true)
    this.applyPedestrianView()
    this.syncPedestrian()
    return true
  }

  /** Quitte le mode piéton et rend la caméra à `GlobeControls`. */
  exitPedestrian(): void {
    if (this.cameraMode === 'orbit') return
    this.cameraMode = 'orbit'
    this.pedestrianPhase = 'placing'
    this.immersion = 'explore'
    this.releasePlacement()
    this.setGroundedView(false)
    this.restoreOrbitView()
    this.controls.enabled = this.interactiveMode === true
    this.syncPedestrian()
  }

  setPedestrianImmersion(level: ImmersionLevel): void {
    if (this.cameraMode !== 'pedestrian' || this.pedestrianPhase !== 'active') return
    if (this.immersion === level) return
    this.immersion = level
    this.syncPedestrian()
  }

  /** Delta de regard (pixels), accumulé et appliqué une fois par frame — cf. spec §9. */
  addPedestrianLook(dxPx: number, dyPx: number): void {
    if (this.cameraMode !== 'pedestrian') return
    this.pedestrianCtl.addLook(dxPx, dyPx)
  }

  /**
   * Rend le slot d'entrée et efface les classes du curseur.
   *
   * Le slot n'est relâché que s'il est ENCORE à nous : un outil de dessin a pu le reprendre
   * entre-temps, et le remettre à `null` le laisserait affiché actif mais mort — le piège
   * que documente déjà `useYieldsTool`.
   */
  private releasePlacement(): void {
    if (this.inputInterceptor === this.placementInterceptor) this.inputInterceptor = null
    this.canvas.parentElement?.classList.remove('m3d-pedestrian-place', 'm3d-pedestrian-ok', 'm3d-pedestrian-blocked')
  }

  /**
   * Intercepteur du mode placement — même slot que le dessin et la loupe
   * (`engine.inputInterceptor`), donc même exclusivité. Il rend `true` pour consommer
   * l'événement : sinon le clic de placement déclencherait aussi un `click` de carte.
   */
  private readonly placementInterceptor: PointerInterceptor = (phase, latLng, e) => {
    if (this.cameraMode !== 'pedestrian' || this.pedestrianPhase !== 'placing') return false
    const root = this.canvas.parentElement
    if (phase === 'move') {
      // Validation EN DIRECT : le curseur dit si le clic passerait, avant de cliquer.
      const ok = this.canPlacePedestrian(e.clientX, e.clientY)
      root?.classList.toggle('m3d-pedestrian-ok', ok)
      root?.classList.toggle('m3d-pedestrian-blocked', !ok)
      return true
    }
    if (phase === 'up' && latLng) {
      // Point invalide : IGNORÉ, sans quitter le mode — le curseur reste « interdit » et
      // l'utilisateur vise ailleurs. Refuser en fermant punirait un simple ratage.
      if (this.canPlacePedestrian(e.clientX, e.clientY)) this.enterPedestrian(latLng)
      return true
    }
    return phase === 'down'
  }

  /**
   * Vue rasante : near/far dédiés + brouillard. Le `far` borné fait couper les tuiles
   * lointaines par le frustum culling — le `TilesRenderer` ne les demande jamais.
   *
   * ⚠️ Poser `scene.fog` à chaud ne recompile PAS les shaders déjà compilés : three décide
   * du code brouillard à la compilation du programme. Sans l'invalidation qui suit, les
   * tuiles déjà chargées resteraient nettes derrière un brouillard qui n'existerait que
   * pour les suivantes.
   */
  private applyPedestrianView(): void {
    const c = this.config.pedestrian
    const v = pedestrianView(c.viewDistanceMeters, c.nearMeters, c.fogStartMeters)
    if (!this.savedNearFar) this.savedNearFar = { near: this.threeCamera.near, far: this.threeCamera.far }
    this.threeCamera.near = v.near
    this.threeCamera.far = v.far
    this.threeCamera.updateProjectionMatrix()
    // Couleur lue du renderer plutôt que mémorisée : c'est la même source que le fond
    // réellement peint, et elle ne peut donc pas en diverger.
    this.renderer.getClearColor(this.fogColor)
    const fog = this.scene.fog
    if (fog instanceof THREE.Fog) {
      fog.color.copy(this.fogColor)
      fog.near = v.fogNear
      fog.far = v.fogFar
      return
    }
    this.scene.fog = new THREE.Fog(this.fogColor.getHex(), v.fogNear, v.fogFar)
    this.refreshFogMaterials()
  }

  /** Rend à l'orbite ses near/far calculés (cf. `updateNearFar`) et retire le brouillard. */
  private restoreOrbitView(): void {
    const saved = this.savedNearFar
    this.savedNearFar = null
    if (this.scene.fog) {
      this.scene.fog = null
      this.refreshFogMaterials()
    }
    if (!saved) return
    this.threeCamera.near = saved.near
    this.threeCamera.far = saved.far
    this.threeCamera.updateProjectionMatrix()
  }

  /**
   * Invalide les programmes des matériaux déjà compilés — la seule façon de faire prendre
   * (ou retirer) le brouillard sur ce qui est DÉJÀ à l'écran. Coût : une traversée, à
   * l'entrée et à la sortie du mode. Jamais par frame.
   */
  /**
   * Annonce aux couches que la caméra passe (ou non) au ras du sol — elles en déduisent le
   * test de profondeur de leurs annotations plates (cf. `flatMaterial`).
   *
   * ⚠️ C'est une DIFFUSION, pas une retouche des matériaux en scène. Le balayage qu'elle
   * remplace ne pouvait pas tenir, pour deux raisons mesurées :
   * — il ne rattrapait pas les drapes reconstruits après lui (le resettle LOD en rebâtit
   *   ~100 ms après l'entrée, avec le réglage par défaut) ;
   * — il forçait le MÊME réglage à tous les matériaux d'annotation, donc en sortie il
   *   passait aussi `volumeMaterial` et `edgeMaterial` à `false`, alors qu'un volume doit
   *   toujours être occulté par le bâti qui passe devant lui.
   */
  private setGroundedView(grounded: boolean): void {
    if (!this.grounded.set(grounded)) return
    for (const layer of this.layers) layer.setGrounded?.(grounded)
  }

  /** Vue au ras du sol courante — rejouée à l'ajout d'une couche (cf. `addLayer`). */
  private readonly grounded = new GroundedState()

  private refreshFogMaterials(): void {
    // LES DEUX surfaces : le tileset photoréaliste ET la surface reconstruite localement
    // (raster interne + bâtiments extrudés). Le mode piéton s'ouvre sur l'un comme sur
    // l'autre (cf. `pedestrianAvailable`) — n'en traiter qu'une laissait le fournisseur
    // interne net derrière un brouillard qui n'existait que pour l'externe.
    for (const root of [this.tiles.group, this.internalSurface]) {
      root.traverse((o) => {
        const material = (o as THREE.Mesh).material
        if (!material) return
        if (Array.isArray(material)) for (const m of material) m.needsUpdate = true
        else material.needsUpdate = true
      })
    }
  }

  /**
   * Réglages de tuiles réellement appliqués au fond.
   *
   * En volume interne, le fond SOUS les bâtiments doit sortir du même serveur qu'eux,
   * même si l'hôte a choisi Google pour la 2D : deux fournisseurs, ce sont deux
   * millésimes et deux généralisations de la même ville — les emprises extrudées ne
   * tombent alors pas sur les bâtiments dessinés dans le raster.
   */
  private effectiveTilesConfig(): TilesConfig {
    const tiles = this.config.providers.tiles
    return this.mapMode === '3d' && this.provider3d === 'internal' ? { ...tiles, provider: 'internal' } : tiles
  }

  /**
   * Applique le mode courant à la scène : qui est visible, à quelle hauteur on pique, et
   * jusqu'où la caméra peut s'incliner.
   *
   * Rassemblé en un point unique parce que ces décisions se prennent aussi HORS bascule
   * de mode — changer de fournisseur à chaud doit les rejouer (cf. `setConfig`). Réparties
   * dans `setMapMode`, elles n'étaient rejouées que par un clic sur le bouton.
   *
   * **Règle d'ISO-fonctionnement** : les deux fournisseurs de volume doivent se comporter
   * à l'identique. Ce qui suit ne conditionne donc au fournisseur que ce qui EST le
   * fournisseur (quelle géométrie est montée, quelle surface les rayons visent) ; tout ce
   * qui décrit un comportement — pick, drapage, suivi d'altitude, inclinaison — est
   * commun. Les écarts de coût qui justifiaient jadis un traitement de faveur sont réglés
   * à la source : hiérarchie de tuiles côté externe, BVH côté interne.
   */
  private applyModeVisibility(): void {
    // Point de convergence de tout ce qui change la composition de l'image (mode 2D/3D,
    // fournisseur, trafic) : une seule demande de peinture y suffit pour tous.
    this.invalidate()
    const in2d = this.mapMode !== '3d'
    const external3d = this.provider3d === 'external'
    // Le fond peut devoir changer de fournisseur avec le mode (cf. `effectiveTilesConfig`).
    this.basemap2d.setConfig(this.effectiveTilesConfig(), this.config.providers.internal)
    /**
     * Volume interne : le tileset photoréaliste ne se montre JAMAIS — et le fond raster
     * reste affiché, y compris en mode '3d'. C'est lui que le relief du serveur interne
     * déformera ; sans cette règle, passer en 3D interne vide l'écran (tileset masqué,
     * volume interne pas encore reconstruit).
     */
    const show3dTileset = !in2d && external3d
    /**
     * Altitude de la surface reconstruite localement — fond raster ET volumes la
     * partagent : deux références différentes feraient flotter les bâtiments au-dessus du
     * raster, ou les y enfonceraient.
     *
     * Posée en mode plan SEULEMENT : en 3D, `terrainElevation` capte les TOITS, et la
     * géométrie se reconstruirait à chaque variation.
     */
    if (in2d) {
      this.basemap2d.setElevation(this.terrainElevation)
      this.buildings.setElevation(this.terrainElevation)
    }
    /**
     * Pick et drapage visent le PLAN du fond en mode plan ; en 3D, la surface réelle —
     * pour les DEUX fournisseurs de volume, à l'identique.
     *
     * Un `flatHeight` non nul court-circuite tout lancer de rayon
     * (`Projection.resolveAnchorHeight` le renvoie tel quel) : le poser en 3D priverait le
     * volume de toute collision. Ce qui rendait ce court-circuit tentant côté interne — le
     * coût du rayon — n'existe plus : les bâtiments portent un BVH.
     */
    this.projection.setFlatHeight(in2d ? this.terrainElevation : null)
    // Bornes qui dépendent du mode : inclinaison (bornée en plan, pour borner la couverture
    // de tuiles) et plancher de descente. Rejouées par `applyCameraLimits`, source unique —
    // recopier la seule inclinaison ici laissait le plancher figé sur le mode de départ.
    this.applyCameraLimits()
    /**
     * Surface visée par les rayons — garde caméra (`GlobeControls`) et drapage
     * (`Projection`) : chaque fournisseur expose la géométrie qu'il affiche réellement.
     *
     * Dépend du seul FOURNISSEUR DE VOLUME, jamais du mode : en externe c'est toujours
     * le `TilesRenderer` qui répond — y compris en mode plan, comme depuis toujours —
     * sinon la surface d'appui de la caméra changeait sous les pieds d'un hôte Ion.
     *
     * Les deux cibles sont désormais du même ordre de coût, ce qui est la condition pour
     * que ce choix reste invisible : `TilesGroup` descend par la hiérarchie de volumes du
     * `TilesRenderer`, et la surface interne par le BVH de chaque tuile de bâtiments (cf.
     * `core/bvh`). Sans cela, `GlobeControls` seul en lançait deux par frame sur les
     * ~131 000 triangles bruts d'une tuile dense — la carte en devenait inutilisable.
     */
    const rayTarget = external3d ? this.tiles.group : this.internalSurface
    this.controls.setScene(rayTarget)
    this.projection.setRaycastRoot(rayTarget === this.tiles.group ? null : rayTarget)
    // Le tileset 3D reste en cache (retour instantané) mais n'est ni rendu ni piloté.
    this.setTiles3DVisible(show3dTileset)
    this.basemap2d.setVisible(in2d || !external3d)
    // Les volumes internes n'ont de sens qu'en mode '3d', et seulement si c'est d'eux que
    // le volume doit venir. `buildingsHidden` : masqués en plus quand ils ne peuvent couvrir
    // toute la vue (cf. `updateBuildingsFade`) — SANS toucher au fond 2D ni au mode.
    this.buildings.setVisible(!in2d && !external3d && !this.buildingsHidden)
  }

  /** Bâtiments internes masqués car incapables de couvrir toute la vue (cf. `updateBuildingsFade`). */
  private buildingsHidden = false
  /** Opacité courante des bâtiments, animée dans le temps (0 = masqués, 1 = pleins). */
  private buildingsOpacity = 1

  /**
   * Affiche les bâtiments internes SEULEMENT s'ils couvrent toute la vue (`want`), sinon les
   * fond puis les masque, gèle et **détruit** (RAM/VRAM rendues, rechargés au retour). Tout
   * ou rien — jamais de carré partiel. Fondu piloté par le TEMPS (`volumeFadeMs`), pas par le
   * zoom : disparition/apparition douce. Ne touche NI le mode NI le fond 2D. Interne seulement.
   */
  private updateBuildingsFade(dt: number, want: boolean): void {
    const cfg = this.config.providers.tiles3d
    const target = !cfg.hideVolumeWhenClamped || want ? 1 : 0
    if (this.buildingsOpacity === target && this.buildingsHidden === target <= 0) return
    // Apparition : montrer AVANT de faire monter l'opacité (sinon le fondu est invisible).
    if (target > 0 && this.buildingsHidden) {
      this.buildingsHidden = false
      this.buildings.setVisible(this.mapMode === '3d' && this.provider3d === 'internal')
    }
    const step = cfg.volumeFadeMs > 0 ? (dt * 1000) / cfg.volumeFadeMs : 1
    this.buildingsOpacity =
      target > this.buildingsOpacity
        ? Math.min(target, this.buildingsOpacity + step)
        : Math.max(target, this.buildingsOpacity - step)
    this.buildings.setOpacity(this.buildingsOpacity)
    this.invalidate()
    // Fondu terminé à 0 : masquer + LIBÉRER la mémoire (le feed recharge au retour).
    if (this.buildingsOpacity <= 0 && !this.buildingsHidden) {
      this.buildingsHidden = true
      this.buildings.setVisible(false)
      this.buildings.releaseAll()
    }
  }

  /** Masque/affiche uniquement les tuiles 3D — jamais l'ancre des markers ni le globe 2D. */
  private setTiles3DVisible(visible: boolean): void {
    // L'ancre des overlays comme la surface interne vivent désormais HORS de ce groupe
    // (cf. `overlayAnchor`, `internalSurface`) : il ne reste ici que des tuiles.
    for (const child of this.tiles.group.children) child.visible = visible
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

  /**
   * Interrompt le vol de démarrage et révèle les overlays. **Toute prise de main doit
   * passer par là** — un geste (cf. `bindInput`), une entrée en piéton, ou une vue
   * mémorisée qu'on recharge : sans cet appel l'intro continue de piloter la caméra et
   * reprend la main à la frame suivante, effaçant la vue qui vient d'être posée.
   */
  readonly cancelIntro = (): void => {
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
    this.invalidate()
  }

  /** (Ré)échantillonne l'altitude du terrain sous le centre écran (raycast BVH). No-op
   *  si rien touché → conserve la dernière valeur connue. À n'appeler qu'en mode 3D. */
  private trackTerrainElevation(): void {
    // Les bornes de plausibilité (artefacts du LOD racine) sont appliquées DANS
    // Projection.pickHeight/sampleSurfaceHeight — un seul endroit pour tous les appelants.
    const picked = this.projection.pickHeight(this.size.width / 2, this.size.height / 2, this.threeCamera)
    /**
     * Repli analytique quand le rayon ne touche rien — pas un confort, la condition de
     * décollage de l'intro.
     *
     * ⚠️ En fournisseur INTERNE, la seule géométrie touchable est le bâti extrudé, qui ne
     * se charge qu'à BASSE altitude. Or l'intro attend `terrainKnown` depuis la vue
     * planétaire, et c'est elle qui fait descendre la caméra : la condition ne pouvait pas
     * être satisfaite avant d'être devenue inutile. Le garde-fou de `introMaxWaitMs`
     * partait donc à CHAQUE démarrage à froid — mesuré : intro décollée à 8,4 s, terrain
     * réellement connu à 11,0 s. Le sol interne étant plat et à hauteur connue, il n'y a
     * rien à attendre.
     */
    const e = picked ?? this.flatGroundElevation
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

  /**
   * Affiche/masque le calque trafic (mode plan uniquement).
   *
   * Le trafic est une propriété de la tuile Google — `layerTypes` demandé à la session —
   * pas une surcouche transparente : un fournisseur qui ne le sert pas (serveur interne)
   * n'a rien à allumer, et l'accepter donnerait un bouton allumé sans rien à l'écran.
   * Même règle qu'en 3D. `setTraffic` est par ailleurs déjà idempotent.
   */
  setTrafficVisible(visible: boolean): void {
    const supported = this.basemap2d.supportsTraffic && this.mapMode !== '3d'
    this.basemap2d.setTraffic(visible && supported)
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
  /**
   * Zoom de tuile donnant une résolution ~1:1 AU CENTRE de l'écran — calculé depuis la
   * vraie résolution mètres/pixel (distance caméra→sol, FOV, hauteur écran), même
   * définition que les épaisseurs de trait des layers.
   *
   * À ne PAS confondre avec `MapView.zoom`, déduit de l'emprise : celui-là s'effondre dès
   * qu'on incline (la vue porte jusqu'à l'horizon), au point de passer sous les seuils
   * d'affichage — les bâtiments cessaient alors d'être demandés, donc de s'afficher ET
   * d'arrêter la caméra.
   */
  private tileZoomAtCenter(state: CameraState): number {
    const metersPerPixel = this.projection.metersPerPixel(
      { lat: state.lat, lng: state.lng },
      this.threeCamera,
      this.size.height,
      this.terrainElevation,
    )
    return this.tileZoomFor(state.lat, metersPerPixel)
  }

  /**
   * Niveau de détail des tuiles pendant la MARCHE, calculé à une distance de référence
   * (`pedestrian.tileDetailDistanceMeters`) et non à la distance caméra→sol.
   *
   * ⚠️ Celle-ci vaut 1,70 m à hauteur d'homme : le calcul ordinaire réclame alors le zoom
   * maximal sur toute la distance de vue — des dizaines de milliers de tuiles pour une rue,
   * et le déplacement s'arrête net. On raisonne donc sur la distance à laquelle on regarde.
   */
  private tileZoomWalking(state: CameraState): number {
    const mpp = metersPerPixelAt(
      this.config.pedestrian.tileDetailDistanceMeters,
      this.threeCamera.fov,
      this.size.height,
    )
    return this.tileZoomFor(state.lat, mpp)
  }

  /** Zoom Web Mercator correspondant à une résolution au sol, à une latitude donnée. */
  private tileZoomFor(lat: number, metersPerPixel: number): number {
    // Résolution Web Mercator au zoom 0 (m/px à l'équateur) = circonférence / taille tuile.
    const equatorMetersPerPixel = EARTH_CIRCUMFERENCE / TILE_SIZE
    return Math.log2((equatorMetersPerPixel * Math.cos(lat * DEG2RAD)) / metersPerPixel)
  }

  /**
   * Sol sous le CENTRE DE L'ÉCRAN — le point réellement regardé, autour duquel se
   * centrent les couronnes de tuiles (cascade du fond, volume des bâtiments).
   *
   * À distinguer de `view.center`, qui est le point sous la CAMÉRA : en vue inclinée les
   * deux sont très éloignés, et centrer sur la caméra dépense le budget derrière
   * l'observateur. Intersection analytique de l'ellipsoïde — aucun rayon lancé dans la
   * scène, donc gratuit par frame ; repli sur le point caméra si la vue porte sur le vide.
   */
  private aimPoint(view: MapView): LatLng {
    return (
      this.projection.pickEllipsoidLatLng(this.size.width / 2, this.size.height / 2, this.threeCamera) ?? view.center
    )
  }

  /**
   * Déplacement au clavier — translation de la caméra dans le PLAN TANGENT au sol, dans
   * le repère de la vue : « tout droit » suit le sol, jamais la ligne de visée.
   *
   * C'est ce qui le distingue du mode vol intégré de `GlobeControls` (`enableFlight`),
   * qui translate selon les axes propres de la caméra : à 79° d'inclinaison, sa flèche
   * haut plonge dans le décor. Ce mode vol reste la base toute trouvée de la navigation
   * FPS à venir — sa vitesse est déjà mise à l'échelle de la hauteur au-dessus du sol —
   * mais il écoute son `domElement` (donc exige le focus) et câble W/S/A/D/Q/E en dur,
   * dont trois touches sont prises par les outils de dessin. Les liaisons de
   * `interaction.shortcuts.navigate` sont là pour lui servir aussi le jour venu : seul le
   * modèle de déplacement changera, pas les touches.
   *
   * Appelé AVANT `controls.update()`, dont la garde au sol (`cameraRadius`) rattrape donc
   * le mouvement dans la même frame.
   */
  private applyKeyNav(dt: number): void {
    const axis = this.navKeys.axis()
    if (!axis) return
    // L'utilisateur prend la main : ni intro ni vol programmé ne doivent lui résister.
    this.cancelIntro()
    this.camera.cancelFly()

    const cam = this.threeCamera
    /**
     * Verticale RADIALE (caméra → centre du globe), et non la normale à l'ellipsoïde :
     * c'est l'axe autour duquel la rotation ci-dessous conserve exactement la distance au
     * centre. L'écart entre les deux est de l'ordre du dixième de degré, sans effet sur
     * une direction de déplacement.
     */
    this.navCenter.setFromMatrixPosition(this.tiles.group.matrixWorld)
    this.navUp.subVectors(cam.position, this.navCenter)
    const radius = this.navUp.length()
    if (radius < 1) return
    this.navUp.divideScalar(radius)

    // Axe de visée projeté à plat, repli haut-écran au nadir (cf. `projectViewForward`,
    // règle partagée avec l'entrée en piéton et `getPose`) — la direction que l'utilisateur
    // lit comme « devant ». Nadir pur : la projection reste nulle, on renonce à la frame.
    projectViewForward(cam.matrixWorld, this.navUp, this.navForward)
    if (this.navForward.lengthSq() < HEADING_EPSILON) return
    this.navForward.normalize()
    this.navRight.crossVectors(this.navForward, this.navUp).normalize()

    const keyPan = this.config.camera.keyPan
    // Hauteur AU-DESSUS DU SOL, pas altitude ellipsoïdale : sinon la vitesse s'emballerait
    // au-dessus d'un relief élevé. L'état de la frame précédente suffit pour une vitesse.
    const above = Math.max(
      1,
      (this.lastState?.altitude ?? this.config.camera.fitBounds.minAltitude) - this.terrainElevation,
    )
    const step = above * keyPan.speed * (axis.boost ? keyPan.boost : 1) * dt
    // Diagonale normalisée : deux touches ne doivent pas aller plus vite qu'une.
    const norm = axis.forward !== 0 && axis.right !== 0 ? Math.SQRT1_2 : 1
    this.navDir
      .set(0, 0, 0)
      .addScaledVector(this.navForward, axis.forward * norm)
      .addScaledVector(this.navRight, axis.right * norm)

    /**
     * ⚠️ On fait TOURNER la caméra autour du centre du globe, on ne la translate pas.
     *
     * La translation était le vrai défaut : sur une sphère, avancer en ligne droite écarte
     * la caméra de la surface et laisse son orientation en arrière, si bien que
     * `GlobeControls` la redresse à chaque frame — y compris en ROULIS. Or, au nadir, la
     * direction « devant » se lit justement sur le haut de l'écran : elle suivait donc ce
     * roulis, la direction dérivait d'une frame à l'autre, et le déplacement se refermait
     * en cercle.
     *
     * Une rotation rigide (position ET orientation par le même quaternion) déplace la
     * caméra SUR le globe : distance au sol, inclinaison et cap relatif au terrain sont
     * conservés par construction, et il ne reste rien à redresser. C'est aussi ce que fait
     * le glisser à la souris — d'où l'écart de comportement entre les deux.
     */
    this.navAxis.crossVectors(this.navUp, this.navDir)
    if (this.navAxis.lengthSq() < 1e-12) return
    this.navQuat.setFromAxisAngle(this.navAxis.normalize(), step / radius)
    cam.position.sub(this.navCenter).applyQuaternion(this.navQuat).add(this.navCenter)
    cam.quaternion.premultiply(this.navQuat)
    cam.updateMatrixWorld()
  }

  /**
   * Coupe/rétablit le déplacement au clavier. À couper quand les flèches reviennent
   * légitimement à autre chose — c'est le cas du déplacement d'une sélection de dessin,
   * que `<DrawLayer>` réclame tant qu'il y en a une.
   *
   * `owner` identifie le demandeur : le déplacement ne reprend qu'une fois TOUTES les
   * coupures levées. Sans lui, le dernier appelant décidait pour tous, et un
   * consommateur qui se démonte rendait les flèches à la caméra sous le nez d'un autre
   * qui les voulait encore. Omis, l'appel vaut pour un demandeur anonyme unique — le
   * comportement historique, pour un hôte qui n'en a qu'un.
   */
  setKeyNavEnabled(enabled: boolean, owner = 'default'): void {
    this.navKeys.setEnabled(enabled, owner)
  }

  // ── Boucle ──

  /** Frames de rendu encore dues. Décrémenté à chaque peinture (cf. `invalidate`). */
  private dirtyFrames = 1
  /** Date de la dernière frame réellement peinte — origine du filet `maxIdleMs`. */
  private paintedAt = 0
  /** Pose de la caméra à la dernière frame — détecteur de mouvement du rendu à la demande. */
  private readonly lastCamMatrix = new THREE.Matrix4()
  /** Désabonnement du repaint sur le filtre de tags (cf. constructeur). */
  private readonly unbindTagPaint: () => void

  /**
   * Demande à peindre les prochaines frames (`performance.renderOnDemand.idleFrames`).
   *
   * À appeler dès qu'on change quelque chose de VISIBLE hors boucle de frame : données
   * d'une couche, thème, réglages, sélection, taille. Le moteur le fait déjà pour tout ce
   * qu'il pilote (caméra, tuiles, modes) et les couches pour leur travail en cours
   * (`ctx.invalidate`) — c'est l'hôte qui touche à la scène directement, ou une couche
   * tierce, qui en a l'usage.
   *
   * Flèche liée : passée telle quelle dans le `FrameContext` de chaque frame.
   */
  readonly invalidate = (): void => {
    this.dirtyFrames = Math.max(this.dirtyFrames, this.config.performance.renderOnDemand.idleFrames)
  }

  /**
   * Cette frame doit-elle être peinte ?
   *
   * Consomme une frame due, sinon retombe sur le filet `maxIdleMs`. Le travail EN COURS
   * (tuiles en vol, montages en attente) est une condition CONTINUE, pas une demande : on
   * la teste en dernier, quand la carte est par ailleurs au repos — pendant un déplacement
   * la frame est déjà due, et l'interroger coûterait un `loadProgress` pour rien.
   */
  private shouldPaint(now: number): boolean {
    const cfg = this.config.performance.renderOnDemand
    if (!cfg.enabled) return true
    if (this.dirtyFrames > 0) {
      this.dirtyFrames--
      return true
    }
    if (this.tilesBusy()) return true
    return cfg.maxIdleMs > 0 && now - this.paintedAt >= cfg.maxIdleMs
  }

  /** Ratio de résolution courant, en fraction de `performance.pixelRatio`. */
  private resolutionScale = 1
  /** Frames peintes depuis la dernière décision de résolution, et leur temps cumulé. */
  private frameSamples = 0
  private frameMsTotal = 0

  /**
   * SEUL point d'écriture de la résolution de rendu, qui n'est jamais que
   * `pixelRatio × resolutionScale`. Le réglage et la charge y arrivent par deux chemins
   * (`setConfig`, `adaptResolution`), et les tenir séparément revenait à ce que chacun
   * écrase le facteur de l'autre.
   *
   * `setPixelRatio` refait lui-même le `setSize` avec la dernière taille CSS connue : le
   * redemander ici réallouait le tampon de rendu deux fois par palier.
   *
   * ⚠️ Écrire `canvas.width/height` VIDE le tampon de rendu : tout appelant doit repeindre
   * dans la foulée, sinon le navigateur compose un canvas noir. D'où `invalidate()` ici —
   * qui garantit la peinture, mais à la frame SUIVANTE : un appel en cours de `tick` doit
   * en plus se placer avant les passes de rendu (cf. son site d'appel dans `tick`).
   */
  private applyResolution(): void {
    this.invalidate()
    this.renderer.setPixelRatio(this.config.performance.pixelRatio * this.resolutionScale)
    // La résolution entre dans le calcul d'erreur d'écran des tuiles : sans ça, le LOD
    // continuerait de viser la finesse de l'ancienne définition.
    this.tiles.setResolutionFromRenderer(this.threeCamera, this.renderer)
  }

  /**
   * Ajuste la résolution de rendu sur la charge réelle (`performance.adaptiveResolution`).
   *
   * Échantillonné sur les seules frames PEINTES, mais la grandeur mesurée reste l'intervalle
   * entre TICKS : c'est lui qui monte quand le CPU ou le GPU sature, et il reste nominal
   * quand la carte se repose — au repos on peut donc remonter à pleine définition, ce qui
   * est exactement le moment de le faire.
   */
  private adaptResolution(frameMs: number): void {
    const cfg = this.config.performance.adaptiveResolution
    // Désactivée à chaud : la résolution est RENDUE avant de sortir, sinon le canvas
    // resterait figé au dernier palier réduit, sans plus personne pour le relever.
    if (!cfg.enabled) {
      if (this.resolutionScale !== 1) {
        this.resolutionScale = 1
        this.applyResolution()
      }
      return
    }
    this.frameMsTotal += frameMs
    if (++this.frameSamples < cfg.sampleFrames) return
    const avg = this.frameMsTotal / this.frameSamples
    this.frameSamples = 0
    this.frameMsTotal = 0
    // Plancher de SÛRETÉ et non de réglage : à ratio nul le tampon de rendu ferait zéro
    // pixel de côté, ce qui casse le contexte — `minRatio` décide au-dessus.
    const min = Math.max(MIN_RESOLUTION_SCALE, cfg.minRatio)
    let next = this.resolutionScale
    if (avg > cfg.targetFrameMs) next = Math.max(min, next - cfg.step)
    // Remontée seulement avec de la marge (80 % du budget) : au ras de la cible, monter
    // d'un cran repasse au-dessus, et la résolution se met à osciller à chaque fenêtre.
    else if (avg < cfg.targetFrameMs * 0.8) next = Math.min(1, next + cfg.step)
    if (next === this.resolutionScale) return
    this.resolutionScale = next
    this.applyResolution()
  }

  /** Compteurs de rendu — de quoi juger une optimisation au lieu de la supposer (`MapStats`). */
  stats(): MapStats {
    const info = this.renderer.info
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      overlays: this.overlayAnchor.children.length,
      resolutionScale: this.resolutionScale,
      painted: this.paintedFrames,
      frames: this.totalFrames,
    }
  }

  /** Frames écoulées / réellement peintes — dénominateur et numérateur de `stats()`. */
  private totalFrames = 0
  private paintedFrames = 0

  /** Un fournisseur de tuiles a-t-il du travail en vol (téléchargement, parse, montage) ? */
  private tilesBusy(): boolean {
    if (this.mapMode === '3d' && this.provider3d === 'external') return this.tiles.loadProgress < 1
    return this.basemap2d.busy || this.buildings.busy
  }

  private tick(now: number): void {
    const dt = Math.min(0.1, (now - this.lastTime) / 1000)
    this.lastTime = now
    this.totalFrames++

    const controlling = this.camera.update()
    // En dessin : neutralise pan/rotation avant l'update (le zoom molette passe).
    // Suspendu (barre espace) : la caméra reprend la main sans quitter l'outil.
    if (this.drawingMode && !this.drawingSuspended) this.freezeControlsPanRotate()
    /**
     * Le piéton est le TROISIÈME pilote (cf. `Camera.update`) et prime sur les deux autres :
     * `GlobeControls` est gelé, et `applyKeyNav` — dont le modèle orbital fait TOURNER la
     * caméra autour du centre du globe — laisse la place au modèle de marche. Les touches,
     * elles, restent exactement les mêmes (`interaction.shortcuts.navigate`).
     *
     * `clampZoom` est sauté avec : il ramène la caméra au-dessus d'une altitude plancher,
     * ce qui expulserait le piéton du sol à chaque frame.
     */
    if (this.cameraMode === 'pedestrian' && this.pedestrianPhase === 'active') {
      this.pedestrianCtl.update(dt)
      this.syncPedestrian()
    } else {
      // Avant `controls.update()`, dont la garde au sol rattrape le mouvement dans la frame.
      if (this.controls.enabled) this.applyKeyNav(dt)
      if (!controlling && this.controls.enabled) this.controls.update()
      this.clampZoom()
    }
    this.threeCamera.updateMatrixWorld()
    // En mode 2D le tileset 3D est masqué : on gèle son update (aucun fetch/parse/LOD en
    // fond) tout en gardant son cache pour un retour instantané. `updateMatrixWorld` reste
    // appelé — le repère du groupe sert encore à la projection (ancrage overlays/2D).
    // Volume interne : même en mode '3d', le tileset photoréaliste reste gelé — c'est ce
    // qui garantit qu'il n'émet aucune requête (donc aucune facturation) quand l'hôte a
    // choisi de reconstruire le volume depuis son propre serveur.
    if (this.mapMode === '3d' && this.provider3d === 'external') {
      // Résolution requise par le calcul d'erreur d'écran des tuiles (LOD).
      this.tiles.setResolutionFromRenderer(this.threeCamera, this.renderer)
      this.tiles.update()
    }
    this.tiles.group.updateMatrixWorld(true)
    // Les deux groupes qui partagent le repère du tileset sans en être enfants.
    // `internalSurface` descend sur place (ses tuiles sont posées) ; l'ancre des overlays
    // attend que les couches aient écrit les positions de leurs markers, plus bas.
    if (this.mirrorTileFrame(this.internalSurface)) this.internalSurface.updateMatrixWorld(true)
    this.mirrorTileFrame(this.overlayAnchor)
    // Suit l'altitude du terrain sous le centre écran (pour aligner le fond 2D au switch).
    // Sauté seulement quand on MARCHE : ce rayon centre-écran vise alors l'horizon et ne
    // mesure rien d'utile. Pendant le placement il reste indispensable — c'est le repli de
    // sol du fournisseur interne (cf. `groundLevelAt`), qui serait figé sans lui.
    if (this.mapMode === '3d' && this.pedestrianPhase !== 'active') this.trackTerrainElevation()
    // Après le suivi de terrain : c'est lui qui fait bouger la nappe du fournisseur interne.
    this.syncGroundPlane()
    this.updateIntro(now)
    this.checkReady(now)

    // État caméra calculé UNE fois par frame (chaque getState = inversion de matrice)
    // et réutilisé par updateNearFar/computeView/ctx.
    const state = this.camera.getState()
    // En piéton, near/far sont posés par `applyPedestrianView` : les recalculer à l'orbitale
    // (`near = altitude × 0,15`) mettrait le plan proche à des dizaines de mètres devant
    // l'œil — plus rien de proche ne serait rendu.
    if (controlling && this.cameraMode === 'orbit') this.updateNearFar(state)

    /**
     * Une caméra qui a bougé, si peu que ce soit, repeint tout l'écran — c'est donc la
     * matrice monde qu'on compare, et pas `hasMoved`. Celui-ci porte un seuil MÉTIER (il
     * décide de l'événement `camera` et des re-échantillonnages) qui ignore l'orientation :
     * tourner la tête sur place ne déplace ni lat, ni lng, ni altitude.
     */
    if (!this.lastCamMatrix.equals(this.threeCamera.matrixWorld)) {
      this.lastCamMatrix.copy(this.threeCamera.matrixWorld)
      this.invalidate()
    }

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
    /**
     * Le fond tuilé est alimenté en mode plan, ET en mode '3d' avec volume interne — où il
     * reste à l'écran (cf. `applyModeVisibility`) : sans cela il serait figé sur les tuiles
     * du dernier passage en 2D, donc vide dès le premier déplacement. Les volumes, eux, ne
     * sont alimentés que quand ils sont à l'écran.
     *
     * Les deux conditions sont vraies EN MÊME TEMPS en volume interne : emprise, résolution
     * et point visé sont donc calculés une seule fois pour les deux calques — ils l'étaient
     * deux fois, dont deux intersections d'ellipsoïde et leurs allocations, par frame.
     */
    /**
     * Sauté en piéton : `computeView` y déclenche `viewportBounds` (grille de 25 raycasts
     * d'ellipsoïde), dont la moitié des rayons part dans le ciel à l'horizontale au sol — et
     * aucun des deux calques alimentés ici n'est à l'écran en 3D externe.
     */
    const feedBasemap = (this.mapMode !== '3d' || this.provider3d === 'internal') && this.basemap2d.hasSource
    const internal3d = this.mapMode === '3d' && this.provider3d === 'internal'
    if (feedBasemap || internal3d) {
      /**
       * Emprise = TOUT le terrain visible (viewportBounds, borné par l'inclinaison limitée)
       * → la couverture remplit la vue, pas juste une boîte centrale (sinon globe nu autour).
       *
       * ⚠️ Sauf en piéton : à hauteur d'homme la grille de `viewportBounds` tire la moitié de
       * ses rayons vers le ciel, et le cadre qui en sort part à l'horizon. Le disque de la
       * distance de vue est à la fois juste et gratuit — c'est exactement ce que le
       * brouillard laisse voir. Sans lui, le décor du volume interne restait au niveau de
       * détail du survol : sol flou et bâtiments grossiers, à un mètre des yeux.
       */
      const walking = this.cameraMode === 'pedestrian' && this.pedestrianPhase === 'active'
      /**
       * En marche, la couverture n'est refaite qu'à `tileRefreshMs`.
       *
       * ⚠️ Chaque passage reconstruit la CASCADE entière (`TiledGlobeLayer.update`) : un
       * anneau de tuiles par niveau, du plus fin jusqu'au niveau de base. À hauteur d'homme
       * le niveau le plus fin est élevé, donc la cascade compte une quinzaine de crans et
       * frôle le plafond du cache — les tuiles évincées sont aussitôt redemandées, et le
       * rechargement devient perpétuel. À 3 m/s, quatre passages par seconde suffisent.
       */
      const due = !walking || now - this.tileFeedAt >= this.config.pedestrian.tileRefreshMs
      if (walking && due) this.tileFeedAt = now
      const view = walking ? null : this.computeView(state)
      const bounds = view
        ? view.bounds
        : boundsOfCircle(this.pedestrianCtl.position, this.config.pedestrian.viewDistanceMeters)
      const tileZoom = walking ? this.tileZoomWalking(state) : this.tileZoomAtCenter(state)
      const aim = view ? this.aimPoint(view) : this.pedestrianCtl.position
      // Bâtiments internes : affichés seulement quand le zoom AU POINT VISÉ est suffisant.
      // `tileZoom` tient compte de la DISTANCE (résolution mètres/pixel au centre) : haut/loin
      // ou dézoomé → zoom bas → masqués ; proche → zoom haut → affichés. Critère indépendant
      // de l'inclinaison (contrairement à l'emprise, qui explose à l'horizon dès qu'on incline).
      // Sous `minViewZoom`, les bâtiments « ne couvrent que quelques pixels » (cf. son JSDoc) :
      // même seuil pour les masquer ET arrêter de les demander. Fondu + destruction RAM inchangés.
      if (this.provider3d === 'internal') {
        const b = this.config.providers.buildings
        // Seuil décalé de `showZoomOffset` : la 3D reste affichée un cran de plus au dézoom,
        // pour s'aligner sur les empreintes du fond 2D (dessinées ~1 zoom au-dessus).
        const showAt = b.minViewZoom - b.showZoomOffset
        const enabled = this.config.providers.tiles3d.hideVolumeWhenClamped
        this.updateBuildingsFade(dt, internal3d && (!enabled || tileZoom >= showAt))
      }
      // Fond 2D en UN niveau uniforme sur toute l'emprise (pas de boîte de détail au centre),
      // à plat COMME en vue inclinée : le zoom au point visé décide déjà du niveau, l'inclinaison
      // n'a pas à y changer quoi que ce soit. La cascade n'est gardée qu'en marche (piéton), où
      // le gradient près→loin à hauteur d'homme est justement voulu.
      const uniform = this.config.providers.tiles.uniformDetail && !walking
      if (feedBasemap && due) this.basemap2d.update(bounds, tileZoom, aim, !controlling, uniform)
      // Gelé quand les bâtiments sont masqués (rien à streamer).
      if (internal3d && !this.buildingsHidden && due) this.buildings.update(bounds, tileZoom, aim)
    }

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
      invalidate: this.invalidate,
    }
    for (const layer of this.layers) layer.update(ctx)
    /**
     * Charnière entre la passe de LECTURE et la passe d'ÉCRITURE : `update` vient de poser
     * les positions locales des overlays, `project` va lire leurs matrices monde, et le
     * `CSS2DRenderer` les lira encore plus bas. UNE descente pour les trois — c'est ce qui
     * autorise `MarkerLayer` à lire `obj.matrixWorld` directement, au lieu de remonter la
     * chaîne par marker via `getWorldPosition`.
     */
    this.labelScene.updateMatrixWorld()
    for (const layer of this.layers) layer.project(ctx)

    /**
     * Rien à peindre : la frame s'arrête ici.
     *
     * Tout ce qui précède a bien eu lieu — les couches ont avancé, les tuiles ont progressé,
     * les overlays DOM sont à jour. Seules les deux passes de RENDU sont sautées, et elles
     * ne reproduiraient qu'une image identique. C'est aussi ce qui rend la bascule sûre :
     * aucun état ne dépend d'avoir été peint.
     */
    if (!this.shouldPaint(now)) return
    this.paintedAt = now
    this.paintedFrames++

    /**
     * Charge mesurée sur l'INTERVALLE entre frames, pas sur le temps passé dans `tick`.
     *
     * `render()` ne fait qu'empiler des commandes : chronométrer notre propre code ne
     * verrait jamais un GPU saturé — le CPU rendrait la main aussitôt, et le navigateur
     * absorberait le retard en espaçant les frames. C'est justement cet espacement qui le
     * dit, et il capte les deux goulots d'un coup.
     *
     * Échantillonné sur les seules frames PEINTES — d'où sa place APRÈS la garde, mais
     * ⚠️ AVANT les passes de rendu : changer de palier réalloue le tampon (cf.
     * `applyResolution`), et le faire une fois la frame peinte la jetait juste avant que le
     * navigateur ne la compose — un écran noir d'une frame à chaque palier.
     */
    this.adaptResolution(dt * 1000)

    // Étoiles en skybox : collées à la caméra, et surtout RECALÉES sous le far courant.
    // GlobeControls resserre le far à ~distance-horizon (bien < STAR_RADIUS) en vue posée :
    // à rayon fixe, les étoiles étaient clippées, d'où la grande bande noire entre l'espace
    // (haut) et le ciel (bas). On garde donc leur rayon monde à 0.9·far — toujours dans le
    // frustum. `sizeAttenuation:false` fige la taille écran et `depthTest:false` les tient
    // derrière la carte : ni la distance ni l'échelle ne se voient, seule la visibilité change.
    if (this.stars) {
      this.stars.position.copy(this.threeCamera.position)
      this.stars.scale.setScalar((this.threeCamera.far * 0.9) / STAR_RADIUS)
    }
    // Ciel atmosphérique : fondu + orientation (sort tôt et gratuit en vue globe).
    this.updateSky(state)
    this.renderer.render(this.scene, this.threeCamera)
    /**
     * Overlay HTML (markers) : projeté avec une plage near/far ÉLARGIE. GlobeControls garde
     * une plage serrée pour la précision de profondeur du rendu WebGL — mais le
     * `CSS2DRenderer` masque tout marker dont le z sort de cette plage (un marker lointain
     * en vue inclinée passe au-delà du `far` → disparaît). Or near/far n'affecte QUE le z
     * de clipping, PAS la position x/y à l'écran : en l'élargissant juste pour les labels,
     * une alerte n'est jamais masquée par la caméra, sans dégrader la 3D.
     *
     * L'élargissement se fait sur une caméra JUMELLE, jamais sur celle du rendu : la
     * déborner puis la reborner coûtait deux `updateProjectionMatrix` par frame, et
     * laissait surtout, l'espace de deux instructions, une caméra dont le near/far mentait
     * à quiconque la lisait (couche, plugin, hôte).
     */
    this.labelCamera.matrixWorld.copy(this.threeCamera.matrixWorld)
    this.labelCamera.matrixWorldInverse.copy(this.threeCamera.matrixWorldInverse)
    this.labelRenderer.render(this.labelScene, this.labelCamera)
  }

  /**
   * Aligne un groupe FRÈRE sur le repère du tileset, et dit si la transformée a bougé (en
   * pratique jamais). `matrixAutoUpdate` étant coupé sur ces groupes, c'est ici que se pose
   * le drapeau qui autorisera la prochaine descente à recalculer leur matrice monde.
   *
   * ⚠️ La recopie est gardée, et pas seulement par économie : un `copy()` par frame ne
   * suffirait pas — il ne lève aucun drapeau — tandis que forcer `updateMatrixWorld(true)`
   * recalculerait la matrice monde des centaines de tuiles raster et de bâtiments. C'est
   * exactement le travail que `TilesGroup` épargne à ses enfants, et le perdre suffisait à
   * faire ramer la carte, fournisseur externe compris.
   */
  private mirrorTileFrame(target: THREE.Object3D): boolean {
    if (target.matrix.equals(this.tiles.group.matrix)) return false
    target.matrix.copy(this.tiles.group.matrix)
    target.matrixWorldNeedsUpdate = true
    return true
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
      zoom: zoomForAltitude(this.scaleDistance(state)),
      bounds: this.viewportBounds(state),
    }
    this.cachedView = view
    this.viewDirty = false
    return view
  }

  /**
   * Distance qui donne l'échelle de la vue : caméra → point VISÉ, et non altitude.
   *
   * `altitude = distance × cos(tilt)` : s'incliner la fait chuter sans que rien ne change à
   * l'écran, et le zoom qui en dérivait grimpait d'autant (mesuré : 14,75 à plat, 18,46 à
   * 85°, de quoi franchir `clustering.maxZoom` et éteindre tous les regroupements). Le même
   * piège coûtait déjà ses tuiles au fond raster, d'où `tileZoomAtCenter` — mais `MapView.zoom`,
   * lui, était resté sur l'altitude, et il commande le décor `static`, les clusters, et
   * l'event `viewport` que l'hôte écoute.
   *
   * À plat, le point visé est sous la caméra : la distance VAUT l'altitude, et rien ne change.
   */
  private scaleDistance(state: CameraState): number {
    const aim = this.projection.pickEllipsoidLatLng(this.size.width / 2, this.size.height / 2, this.threeCamera)
    let picked: number | null = null
    if (aim) {
      this.projection.latLngToWorld(aim, this.scaleScratch, this.terrainElevation)
      picked = this.threeCamera.position.distanceTo(this.scaleScratch)
    }
    // En marche, le regard porte jusqu'à l'horizon : sans borne, le piéton lirait l'échelle
    // de son point de fuite et passerait sous les seuils d'affichage du décor. Même distance
    // de référence que le niveau de détail des tuiles (cf. `tileZoomWalking`).
    const cap = this.cameraMode === 'pedestrian' ? this.config.pedestrian.tileDetailDistanceMeters : 0
    return viewScaleDistance(picked, state.altitude, cap)
  }

  private readonly scaleScratch = new THREE.Vector3()

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
   * Mise en évidence des bâtiments, ouverte à la couche React : c'est elle qui tient le
   * menu contextuel ouvert, donc elle seule sait combien de temps un bâtiment reste
   * « sélectionné ». Le survol, lui, appartient au moteur.
   *
   * Façade et non la couche nue : recolorer un mesh change l'image, et l'appelant est du
   * DOM hors canvas (ouverture ET fermeture du menu, Échap, clic dans un résultat de
   * recherche) — donc rien que les listeners du canvas puissent voir. Sans ce relais, le
   * bâtiment restait teinté jusqu'à la frame de sécurité.
   */
  get buildingPicker(): { setHighlight(ref: BuildingRef | null, kind: BuildingHighlight): void } {
    return this.buildingPickerFacade
  }

  private readonly buildingPickerFacade = {
    setHighlight: (ref: BuildingRef | null, kind: BuildingHighlight): void => {
      this.buildings.setHighlight(ref, kind)
      this.invalidate()
    },
  }

  /**
   * Arme ou quitte l'outil « sélectionner un bâtiment ».
   *
   * La navigation caméra reste ENTIÈRE : l'outil n'intercepte rien, il lit les mêmes
   * `pointermove`/`pointerup` que le moteur et ne retient que le clic propre (cf.
   * `interaction.cleanClickPx`). Un glissé reste donc un déplacement de carte.
   *
   * Sans volume interne à l'écran, la demande est ignorée — il n'y aurait rien à désigner.
   */
  setBuildingPickMode(on: boolean): void {
    const next = on && this.basemapState.canPickBuildings
    if (next === this.buildingPickMode) return
    this.buildingPickMode = next
    // Le survol ne survit pas à la sortie du mode : le bâtiment resterait coloré.
    if (!next) this.buildings.setHighlight(null, 'hover')
    // Style INLINE : il l'emporte sur le `grab` de la feuille injectée (qui n'est pas
    // `!important`), et il porte une valeur de config là où une classe serait figée.
    this.canvas.style.cursor = next ? this.config.interaction.buildingPick.cursor : ''
    this.emit('buildingpickmode', next)
  }

  getBuildingPickMode(): boolean {
    return this.buildingPickMode
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
    this.navKeys.bind()
    /**
     * Toute interaction repeint, sans chercher à savoir ce qu'elle a changé.
     *
     * Filet posé À LA SOURCE plutôt qu'au fil des dizaines de conséquences possibles
     * (survol d'un bâtiment, poignée de dessin saisie, inertie de `GlobeControls`, geste
     * d'un plugin) : une interaction dure quelques centaines de millisecondes, et peindre
     * pendant ce temps est exactement ce qu'on veut. Ce sont les longues plages SANS
     * interaction que le rendu à la demande vise.
     */
    this.canvas.addEventListener('pointerdown', this.invalidate)
    this.canvas.addEventListener('pointermove', this.invalidate)
    window.addEventListener('pointerup', this.invalidate)
    this.canvas.addEventListener('wheel', this.invalidate, { passive: true })
    // Le clavier n'a rien à signaler : `applyKeyNav` déplace la caméra AVANT le test de
    // pose de cette même frame, qui la voit donc bouger.
    window.addEventListener('pointerdown', this.forceRotateModifier, true)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    // Toute interaction annule l'intro (on ne vole jamais la caméra à l'utilisateur).
    this.canvas.addEventListener('pointerdown', this.cancelIntro)
    this.canvas.addEventListener('wheel', this.cancelIntro, { passive: true })
  }

  private unbindInput(): void {
    this.navKeys.unbind()
    this.canvas.removeEventListener('pointerdown', this.invalidate)
    this.canvas.removeEventListener('pointermove', this.invalidate)
    window.removeEventListener('pointerup', this.invalidate)
    this.canvas.removeEventListener('wheel', this.invalidate)
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

  /**
   * Bâtiment sous le pointeur — brut : sa référence et le point d'impact en repère MONDE.
   *
   * Aucune géodésie ici : le survol l'appelle à chaque mouvement du pointeur et n'a besoin
   * que de la référence. C'est `buildingHitOf` qui convertit, au clic seulement.
   */
  private pickBuildingAt(e: PointerEvent): BuildingPickResult | null {
    const rect = this.canvas.getBoundingClientRect()
    this.pickNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    return this.buildings.pick(this.pickNdc, this.threeCamera)
  }

  /**
   * Complète un pick en `BuildingHit` : coordonnée du point cliqué et emprise du volume.
   *
   * `worldToLatLng` ramène le point au repère du groupe puis à l'ellipsoïde — la même
   * conversion que `pickLatLng`, donc exactement la coordonnée d'un clic carte au même
   * pixel. L'emprise, elle, vient des quatre coins que la couche mesure sur la plage de
   * sommets du bâtiment : de quoi le cadrer avec `camera.fitBounds`.
   */
  private buildingHitOf(hit: BuildingPickResult): BuildingHit {
    const ll = this.projection.worldToLatLng(hit.point)
    // `boundsOfLatLngs` et non un min/max à la main : il déroule les longitudes autour d'une
    // référence, donc un bâtiment à cheval sur l'antiméridien rend un cadre étroit au lieu
    // d'en faire le tour du globe.
    const corners = this.buildings.cornersOf(hit.ref, this.pickCorners)
      ? this.pickCorners.map((c) => this.projection.worldToLatLng(c))
      : // Tuile disparue entre le rayon et ici : l'emprise se réduit au point cliqué, ce qui
        // laisse `fitBounds` recentrer sans cadrer — plutôt qu'une boîte vide ou infinie.
        [ll]
    const bounds = boundsOfLatLngs(corners) ?? { north: ll.lat, south: ll.lat, east: ll.lng, west: ll.lng }
    return { ref: hit.ref, info: { ...this.buildings.attrsOf(hit.ref), lat: ll.lat, lng: ll.lng, bounds } }
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
    /**
     * Mode piéton, niveau exploration : le regard suit le glisser bouton gauche enfoncé.
     * Exiger le bouton est ce qui garde markers et symboles cliquables — un clic « propre »
     * (déplacement sous le seuil, cf. `onPointerUp`) reste un clic carte.
     *
     * Le delta est ACCUMULÉ ici et appliqué une seule fois dans le tick : `pointermove` peut
     * tirer plusieurs fois par frame (spec §9).
     */
    if (this.cameraMode === 'pedestrian' && this.pedestrianPhase === 'active' && this.pointerDrag) {
      this.pedestrianCtl.addLook(e.movementX, e.movementY)
      return
    }
    // Transmet le survol (pointer up) à l'outil aussi : indispensable au mode clic
    // du polygone (élastique + aimant de fermeture entre deux clics).
    if (this.toolsActive && this.inputInterceptor) {
      this.inputInterceptor('move', this.pickAt(e), e)
    }
    // Survol du bâtiment visé. Un seul raycast BVH, et seulement l'outil armé.
    if (this.buildingPickMode) this.buildings.setHighlight(this.pickBuildingAt(e)?.ref ?? null, 'hover')
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
    // Outil de sélection armé : un clic propre désigne un bâtiment, et NE PRODUIT PAS de
    // `click` carte — l'hôte recevrait sinon deux intentions pour un seul geste.
    if (this.buildingPickMode && drag && drag.moved < this.config.interaction.cleanClickPx) {
      const hit = this.pickBuildingAt(e)
      if (hit) {
        this.emit('buildingclick', { hit: this.buildingHitOf(hit), originalEvent: e })
        return
      }
    }
    // Clic « propre » (peu de mouvement) → événement de sélection carte.
    if (drag && drag.moved < this.config.interaction.cleanClickPx) {
      const ll = this.pickAt(e)
      if (ll) this.emit('click', { latLng: ll, originalEvent: e })
    }
  }

  dispose(): void {
    this.disposed = true
    this.stop()
    this.canvas.style.cursor = ''
    this.unbindInput()
    this.unbindTagPaint()
    for (const layer of this.layers) layer.dispose()
    this.layers.clear()
    this.basemap2d.dispose()
    this.buildings.dispose()
    this.scene.remove(this.internalSurface)
    this.controls.dispose()
    this.tiles.dispose()
    this.renderer.dispose()
    if (this.stars) {
      this.stars.geometry.dispose()
      ;(this.stars.material as THREE.Material).dispose()
    }
    if (this.sky) this.sky.dispose()
    this.enrichment.dispose()
    this.plugins.dispose()
    this.templates.dispose()
    this.canvas.parentElement?.removeEventListener('wheel', this.forwardWheel)
    this.labelRenderer.domElement.remove()
  }
}

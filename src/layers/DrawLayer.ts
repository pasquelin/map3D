import * as THREE from 'three'
import { defaultConfig } from '../config/defaultConfig'
import type { MapConfig } from '../config/types'
import { EnuFrame } from '../core/enu'
import { GroundedState } from '../core/GroundedState'
import type { SymbolRenderer } from '../symbols/types'
import { HEIGHT_EPSILON, HeightResettle } from '../core/resettle'
import type { FrameContext, Layer } from '../core/Layer'
import type { StatContribution } from '../core/viewStats'
import { boundsContains } from '../core/MarkerQuery'
import type { PointerInterceptor, PointerPhase } from '../core/MapEngine'
import type { Projection } from '../core/Projection'
import type { SelectableRegistry } from '../core/Selectables'
import { clamp } from '../core/math'
import { countTags } from '../core/TagFilter'
import { sameShape } from './draw/shapeEquality'
import { polygonAreaM2, predicateSegments, ringInsideRing } from '../core/geodesy'
import { ringOfShape, type ShapeData } from './ShapeLayer'
import { EditController, type HandleId } from './draw/EditController'
import { History } from './draw/History'
import { type ScreenPt, pointInPolygon, screenBBox, segDistPx } from './draw/hitTest'
import { type SelectMode, SelectionManager } from './draw/SelectionManager'
import { type OverlayShape, SelectionOverlay } from './draw/SelectionOverlay'
import {
  type Pt,
  DEFAULT_STROKE_OPACITY,
  MEASURE_STROKE_OPACITY,
  arrowHead,
  circlePoints,
  dashedRibbon,
  diagonalToCorners,
  disposeObject3D,
  endTicks,
  fillGeo,
  fillMaterial,
  filletPolygon,
  ribbon,
  strokeMaterial,
  strokePolylines,
} from '../core/geometry'
import type { Bounds, LatLng } from '../shared'
import { defaultLabels } from '../labels/defaultLabels'
import { makeDistanceFormatter } from '../labels/measure'

export type DrawTool =
  'select' | 'line' | 'polygon' | 'rect' | 'circle' | 'freehand' | 'arrow' | 'measure' | 'erase' | 'symbol'
/**
 * Membres du sous-menu « Mesures » de la barre d'outils.
 *
 * Une seule rangée aujourd'hui — le sous-menu ne s'ouvre donc pas, et le bouton agit
 * directement (cf. `useHoverFlyout`). Le châssis reste en place pour la rangée suivante : la
 * grille de coordonnées y a vécu un temps, avant de rejoindre les contrôles de vue, où elle a
 * sa place puisqu'elle survit au repli de la barre.
 *
 * Déclaré ICI et non côté React : `labels/types` en a besoin, et le faire descendre d'un
 * composant ferait dépendre les libellés de l'arbre React.
 */
export type MeasureTool = 'measure'
export type { SelectMode } from './draw/SelectionManager'
/** Style de trait d'une forme — absent = `'solid'`. */
export type StrokeStyle = 'solid' | 'dashed' | 'dotted'
/** `width` : épaisseur de trait en **pixels écran** (constante au zoom, comme toute carte). */
export type DrawDefaults = {
  color: string
  /** Couleur de remplissage — absente = `color` (rétro-compatible). */
  fillColor?: string
  /** 0 = pas de bordure (le remplissage seul est rendu). */
  width: number
  fillOpacity: number
  /** Opacité de la bordure — absente = 0.95 (0.85 pour la règle). */
  strokeOpacity?: number
  stroke?: StrokeStyle
  /** Rectangles : rayon d'angle en % du petit côté (0–50). */
  radius?: number
}

/** Patch de style applicable à une sélection ou aux défauts d'un outil. */
export type DrawStyle = {
  color?: string
  fillColor?: string
  width?: number
  fillOpacity?: number
  strokeOpacity?: number
  stroke?: StrokeStyle
  radius?: number
}

/**
 * Métadonnées métier libres attachées à une forme, transportées **telles quelles**
 * de bout en bout (dessin → `toGeoJSON` → `fromGeoJSON`) et jamais interprétées ni
 * rendues par la lib. C'est là que l'application hôte loge son identité (uuid de
 * base, groupes, titre, actif…) sans que la lib ait à connaître son modèle.
 *
 * ⚠️ Les valeurs doivent être **sérialisables** (`structuredClone`) : chaque geste
 * pousse un snapshot de la collection dans l'historique undo/redo, qui les clone.
 * Une fonction, un `Symbol` ou un nœud DOM y feraient échouer le clonage — donc le
 * geste. Stockez un identifiant, pas un callback ni une instance vivante.
 */
export type ShapeMeta = Record<string, unknown>

/**
 * Symbole d'une forme `kind: 'symbol'` : la **clé de catalogue** et sa variante
 * (affiliation), jamais le graphisme. Champ dédié plutôt que `meta`, qui appartient
 * à l'application hôte et que la lib ne doit pas interpréter.
 */
export type ShapeSymbol = { key: string; variant?: string }

export type Drawing = {
  id: string
  kind: DrawTool
  /** Nom lisible — cf. `MarkerData.title` : indexé par la recherche, affiché en liste. */
  title?: string
  points: LatLng[]
  /** Couleur de bordure (et de remplissage si `fillColor` est absent). */
  color: string
  fillColor?: string
  width: number
  fillOpacity: number
  /** Opacité de la bordure — absente = 0.95 (0.85 pour la règle). */
  strokeOpacity?: number
  stroke?: StrokeStyle
  /** Rectangles : rayon d'angle en % du petit côté (0–50). */
  radius?: number
  /**
   * Forme protégée (ex. limite de zone imposée par l'app hôte) : ni sélection, ni
   * édition, ni gomme, ni « Tout effacer » — seuls `fromGeoJSON`/`setLocked` la changent.
   */
  locked?: boolean
  closed: boolean
  /** Tags de filtrage (panneau « Couches ») — défaut `['draw', kind]`. */
  tags: string[]
  /** Métadonnées de l'app hôte — opaques pour la lib (cf. `ShapeMeta`). */
  meta?: ShapeMeta
  /** `kind: 'symbol'` uniquement : entrée de catalogue à plaquer sur les 4 coins. */
  symbol?: ShapeSymbol
}

/**
 * Forme telle que vue par l'application hôte : identité stable, géométrie, style
 * regroupé et métadonnées. C'est la monnaie d'échange des events granulaires et de
 * l'API par identité — le type `Drawing` interne, lui, reste à plat pour le rendu.
 */
export type DrawnShape = {
  id: string
  kind: DrawTool
  /** Nom lisible — cf. `MarkerData.title`. */
  title?: string
  points: LatLng[]
  closed: boolean
  style: DrawStyle
  tags: string[]
  locked?: boolean
  meta?: ShapeMeta
  /** `kind: 'symbol'` uniquement (cf. `ShapeSymbol`). */
  symbol?: ShapeSymbol
}

/** Forme à insérer — `id` absent = généré. */
// `tags` optionnel : `addShape` les déduit du kind (et de la clé de symbole) quand
// ils manquent — c'est ce que fait déjà son corps. Les exiger ici poussait chaque
// appelant interne à réécrire à la main la règle de `defaultTags`, qui a fini par
// diverger entre le symbole POSÉ et le symbole IMPORTÉ.
export type NewShape = Omit<DrawnShape, 'id' | 'closed' | 'tags'> & {
  id?: string
  closed?: boolean
  tags?: string[]
}

/** Patch d'une forme existante : seuls les champs fournis changent. */
export type ShapePatch = {
  points?: LatLng[]
  closed?: boolean
  /** Nom lisible — `''` le retire. */
  title?: string
  /** Fusionné champ par champ avec le style courant. */
  style?: DrawStyle
  tags?: string[]
  locked?: boolean
  /** **Remplace** les métadonnées (pas de fusion) — pour patcher :
   *  `updateShape(id, { meta: { ...getShape(id)?.meta, uuid } })`. */
  meta?: ShapeMeta
}

/**
 * Mutation programmatique : `silent` n'émet **aucun** event (ni granulaire, ni
 * `onChange`). Indispensable quand l'hôte réinjecte dans la carte ce qu'il vient de
 * recevoir de son backend — sans quoi l'écho relancerait sa propre mutation.
 */
export type MutateOptions = { silent?: boolean }

/** Motif de refus d'une forme (cf. `DrawConstraints`). */
export type DrawRejectReason = 'outOfLimits' | 'maxArea'

/**
 * Règles métier imposées au **dessin utilisateur**. Une forme qui les viole est
 * annulée (création) ou remise dans son état d'avant (édition), et `onReject` est
 * notifié pour que l'hôte affiche son propre message.
 *
 * Les mutations programmatiques (`addShape`, `updateShape`, `fromGeoJSON`) n'y sont
 * PAS soumises : quand l'application injecte une forme, elle sait ce qu'elle fait,
 * et refuser silencieusement ses données serait pire que tout.
 */
export type DrawConstraints = {
  /**
   * Périmètres autorisés : une forme doit tenir entièrement dans **au moins un**
   * d'entre eux. Ces formes ne sont pas dessinées par la couche — affichez-les avec
   * `<ShapeLayer>` (ou en formes verrouillées) selon le rendu voulu.
   */
  limits?: ShapeData[]
  /** Aire maximale (m²) d'une forme fermée. Les lignes ouvertes ne sont pas concernées. */
  maxAreaM2?: number
}

type GeoJSONFeature = {
  type: 'Feature'
  /** Identité stable (`Feature.id` du standard GeoJSON) : préservée au round-trip. */
  id?: string
  geometry:
    | { type: 'LineString'; coordinates: number[][] }
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'Point'; coordinates: number[] }
  properties: {
    kind: DrawTool
    /** Nom lisible — préservé au round-trip, comme l'identité. */
    title?: string
    color: string
    width: number
    fillOpacity: number
    tags?: string[]
    fillColor?: string
    strokeOpacity?: number
    stroke?: StrokeStyle
    radius?: number
    locked?: boolean
    meta?: ShapeMeta
    /** `kind: 'symbol'` : entrée de catalogue à replaquer à l'import. */
    symbol?: ShapeSymbol
  }
}
export type GeoJSONFeatureCollection = { type: 'FeatureCollection'; features: GeoJSONFeature[] }

/**
 * Tags par défaut d'une forme. Un symbole est tagué `['symbol', <clé>]` plutôt que
 * `['draw', 'symbol']` : dans le panneau « Couches », l'utilisateur veut filtrer
 * « les hôpitaux », pas « les symboles » en bloc.
 */
function defaultTags(kind: DrawTool, symbol?: ShapeSymbol): string[] {
  return kind === 'symbol' && symbol ? ['symbol', symbol.key] : ['draw', kind]
}

let seq = 0

/**
 * Outils de dessin sur le globe : formes stockées en lat/lng et drapées en plan
 * tangent (ENU). Le picking renvoie directement des lat/lng (intersection
 * ellipsoïde). Ligne, polygone (clics + Entrée), rectangle, cercle, main levée,
 * flèche, mesure (label ancré), gomme, annuler, tout effacer, GeoJSON in/out.
 */
export class DrawLayer implements Layer {
  readonly group = new THREE.Group()

  tool: DrawTool | null = null
  defaults: DrawDefaults
  /** Tentative d'action (gomme, sélection…) sur une forme verrouillée — feedback UI. */
  onLockedHit?: (d: Drawing) => void
  /** Notifiée à chaque changement de sélection (ids des formes, ids des markers). */
  onSelectionChange?: (ids: string[], markerIds: ReadonlyArray<string | number>) => void
  /**
   * Events **par forme**, émis au moment exact du changement — contrairement à
   * `onChange` qui sérialise toute la collection, coalescée à 1×/frame. Une app qui
   * fait du CRUD par identité (une mutation par forme) branche ceux-ci ; `onChange`
   * reste le bon choix pour un état global contrôlé.
   */
  onShapeAdd?: (s: DrawnShape) => void
  onShapeUpdate?: (s: DrawnShape) => void
  onShapeDelete?: (s: DrawnShape) => void
  /**
   * L'utilisateur demande à ÉDITER une forme (double-clic). Intention d'ouvrir une
   * fiche côté hôte — pas une mutation : rien n'a changé sur la carte.
   */
  onShapeEdit?: (s: DrawnShape) => void
  /** Règles métier du dessin utilisateur (`null` = aucune). */
  constraints: DrawConstraints | null = null
  /** Forme refusée par les contraintes — l'hôte affiche son propre feedback. */
  onReject?: (reason: DrawRejectReason, s: DrawnShape) => void
  /**
   * Défauts **par outil** (réglages persistés, cf. `DrawSettings`) — prioritaire
   * sur `defaults` pour les nouvelles formes quand il est fourni.
   */
  defaultsFor?: (tool: DrawTool) => DrawDefaults

  private drawings: Drawing[] = []

  /**
   * Contribution au panneau de diagnostic (cf. `CounterRegistry`).
   *
   * Le balayage est fait ICI et non dans `update()` : appelé à la cadence du panneau et
   * seulement pendant qu'il est ouvert, il ne coûte rien le reste du temps. C'était la
   * différence entre 8 balayages par seconde et 60, panneau fermé compris.
   *
   * Sort au PREMIER sommet trouvé. ⚠️ Le pire cas est donc le dessin HORS cadre, parcouru
   * entièrement — c'est acceptable à cette cadence, mais ce serait le point à reprendre
   * (bbox mémoïsée par dessin) si un hôte portait des milliers de tracés denses.
   */
  stats(bounds: Bounds): StatContribution {
    let visible = 0
    for (const d of this.drawings) {
      for (const p of d.points) {
        if (boundsContains(bounds, p)) {
          visible++
          break
        }
      }
    }
    return { kind: 'drawings', visible, total: this.drawings.length }
  }
  private readonly history = new History()
  private overlaySel: SelectionOverlay | null = null
  private readonly selection = new SelectionManager({
    list: () => this.drawings,
    hitTest: (p, tol) => this.hitTest(p, tol),
    screenContour: (d) => this.screenContour(d),
    isSelectable: (d) => !d.locked && this.isShown(d),
    onLockedHit: (d) => this.lockedFeedback(d),
    selectionChanged: () => {
      const markerIds = this.selection.markerIds
      this.externalSelectables?.apply(new Set(markerIds))
      this.onSelectionChange?.(this.selection.ids, markerIds)
      this.overlayDirty = true
      this.syncSelectionOverlay()
    },
    eventToScreen: (e) => this.eventToScreen(e),
    beginBodyDrag: (latLng) => (latLng ? this.editCtl.beginMove(latLng) : false),
    externalItems: () => this.externalSelectables?.items() ?? [],
    interaction: () => this.config.interaction,
  })
  private externalSelectables: SelectableRegistry | null = null
  /** Désabonnement du `onItemsChanged` du registre courant. */
  private offSelectables: (() => void) | null = null
  private editCtl!: EditController
  /** Formes mutées pendant un geste — reconstruites au prochain `update()`. */
  private readonly pendingEdit = new Set<string>()
  /** Garde anti-spam du hit-test de survol (1×/frame max). */
  private hoverChecked = false
  /** L'overlay de sélection affichait du contenu à la frame précédente. */
  private overlayActive = false
  /** L'overlay doit être recalculé (caméra/sélection/geste ont bougé). */
  private overlayDirty = true
  /** Rect du conteneur, mémoïsé par frame (getBoundingClientRect force un layout). */
  private overlayRect: DOMRect | null = null
  /** Rayon englobant local (m depuis l'ancre) par forme — pré-rejet du hit-test. */
  private readonly boundRadius = new Map<string, number>()
  /** Émission `onChange` en attente — flushée 1×/frame dans `update()`. */
  private pendingEmit = false
  /** Horodatages des dernières rafales (coalescence d'historique). */
  private lastNudge = 0
  private lastStyle = 0
  /** Barre espace : interception levée, tracé en cours gelé. */
  private suspended = false
  /** Maj enfoncée (aperçu du curseur de rotation avant même le drag). */
  private rotateHint = false
  /** Le pointeur survole une forme non verrouillée (curseur move/rotation). */
  private hoverShape = false
  /** Index id → dessin, maintenu avec `drawings` : les boucles par frame font des
   *  lookups O(1) au lieu de `drawings.find` O(n) (O(n²) par frame sinon). */
  private readonly byId = new Map<string, Drawing>()
  private live: Drawing | null = null
  private mode: 'idle' | 'click' | 'drag' = 'idle'
  private readonly meshes = new Map<string, THREE.Group>()
  /**
   * Hauteur de drapage (m au-dessus de l'ellipsoïde) par dessin, à l'ancre : SANS
   * elle, les formes seraient rendues à h=0 sur l'ellipsoïde, ~50–100 m sous la
   * surface visible → décalage au curseur et glissement au pan (parallaxe).
   * `null` = **non résolue** (tuiles absentes) : le repli est utilisé sans jamais
   * être mémoïsé comme définitif — la fenêtre resettle reste ouverte jusqu'à
   * résolution. Invalidée au changement de `Projection.heightEpoch` (bascule 2D/3D)
   * et raffinée par lots après mouvement caméra (streaming LOD).
   */
  private readonly heights = new Map<string, number | null>()
  private heightEpoch = -1
  private readonly resettle = new HeightResettle(() => this.config)
  private groupEpochSeen = -1
  private stableRuns = 0
  private retryTick = 0
  /**
   * Résolution (m/px) utilisée au dernier build de chaque dessin. L'épaisseur de
   * trait est un style **écran** (px) convertie en mètres à la construction : quand
   * le zoom fait dériver la résolution hors d'une bande d'hystérésis (±25 %), la
   * géométrie est reconstruite — jamais de rebuild par frame.
   */
  private readonly builtMpp = new Map<string, number>()
  private viewH = 1
  private readonly labels = new Map<string, HTMLDivElement>()
  private readonly camScratch = new THREE.Vector3()
  private lastCamera: THREE.Camera | null = null
  /** true quand le curseur aimante le 1er sommet du polygone (fermeture facile). */
  private snapping = false
  /**
   * Prédicat de visibilité par tags (filtre « Couches »). Appliqué en basculant
   * `visible` sur le groupe de meshes — **jamais** de rebuild de géométrie. Le
   * dessin en cours (`live`) reste toujours visible pour ne pas dessiner à l'aveugle.
   */
  private isTagVisible: (tags: readonly string[]) => boolean = () => true
  /**
   * Dessins commités PENDANT qu'un filtre les masquerait : exemptés jusqu'au
   * prochain changement de sélection — sinon la forme s'évapore sous le curseur
   * au relâchement (le statut `live` tombe à l'instant du commit).
   */
  private readonly filterExempt = new Set<string>()

  /**
   * Fournisseur de graphisme des symboles, injecté par la couche React (défaut :
   * catalogue MIL-STD). `null` = aucun symbole n'est rendu — la lib ne dépend pas
   * d'un catalogue en particulier, elle ne connaît que des clés.
   */
  symbolRenderer: SymbolRenderer | null = null

  /**
   * Réglages courants, posés par la couche React (même patron que `symbolRenderer`).
   * Le core n'a pas de contexte : plutôt que de traîner le moteur entier jusqu'ici, on
   * lui donne l'arbre de valeurs dont il a besoin. `defaultConfig` tant que rien n'est
   * posé, si bien qu'un usage direct du core reste possible.
   */
  config: MapConfig = defaultConfig

  /**
   * Pose les réglages. Passe par une méthode plutôt qu'une affectation directe parce
   * que la profondeur d'historique doit être propagée : `History` détient sa propre
   * pile et doit la tronquer si le plafond baisse.
   */
  setConfig(config: MapConfig): void {
    this.config = config
    this.history.setDepth(config.interaction.history.depth)
  }

  /** Vue au ras du sol — cf. `Layer.setGrounded` et `GroundedState`. */
  private readonly grounded = new GroundedState()

  /** Test de profondeur des matériaux plats, relu à chaque `rebuildOne`. */
  private get flatDepthTest(): boolean {
    return this.grounded.active
  }

  setGrounded(grounded: boolean): void {
    if (!this.grounded.set(grounded)) return
    // Reconstruction plutôt que retouche : `rebuildOne` reste le seul endroit qui décide
    // de la profondeur (cf. `DrapedLayer.setGrounded`). Deux fois par session piétonne.
    for (const d of this.drawings) this.rebuildOne(d, false)
  }

  constructor(
    /** Parent — utiliser `engine.annotations` pour hériter du masquage pendant l'intro. */
    private readonly scene: THREE.Object3D,
    private readonly projection: Projection,
    private readonly overlay: HTMLElement,
    defaults: DrawDefaults,
    private renderOrder = 4,
    private onChange?: (geojson: GeoJSONFeatureCollection) => void,
  ) {
    this.group.name = 'm3d-draw'
    this.defaults = defaults
    this.scene.add(this.group)
    this.overlaySel = new SelectionOverlay(overlay)
    this.editCtl = new EditController(projection, {
      targets: () => this.selectedEditable(),
      anchorHeight: (d) => this.heightFor(d),
      toScreen: (p, h) => this.toScreen(p, h),
      snapshotBefore: () => {
        this.history.push(this.drawings)
        this.captureEditGuard(this.selectedEditable())
      },
      afterMutate: (changed) => {
        // Coalescé : reconstruit au prochain update() (1×/frame), pas par pointermove.
        for (const d of changed) this.pendingEdit.add(d.id)
      },
      commit: (changed) => this.commitEdit(changed),
      interaction: () => this.config.interaction,
    })
    this.overlaySel.onHandle = (id, phase, e) => this.onHandlePointer(id, phase, e)
  }

  /**
   * Id interne libre. Le compteur seul ne suffit plus depuis que `fromGeoJSON`
   * réutilise les ids fournis : un import de `draw-7` dans une session neuve
   * collisionnerait avec la 8e forme dessinée. La boucle est bornée en pratique
   * (elle ne tourne que sur des ids réellement occupés).
   */
  private nextId(): string {
    let id = `draw-${seq++}`
    while (this.byId.has(id)) id = `draw-${seq++}`
    return id
  }

  /**
   * Contour géodésique RÉEL d'une forme (rect → 4 coins, cercle → 48 points), et
   * non ses points de contrôle : une contrainte doit juger ce qui est affiché.
   * Réutilise `localGeometry`, seul endroit qui sait développer chaque variante.
   */
  private ringOf(d: Drawing): LatLng[] {
    if (d.points.length < 2 || !this.projection.isReady()) return d.points.map((p) => ({ ...p }))
    const frame = new EnuFrame(this.projection, d.points[0]!, this.heightFor(d))
    return this.localGeometry(d, frame).points.map((p) => frame.toLatLng(p))
  }

  /** Motif de refus d'une forme, ou `null` si elle passe. */
  private violation(d: Drawing): DrawRejectReason | null {
    const c = this.constraints
    if (!c) return null
    // La règle mesure, elle ne délimite rien : la contraindre n'aurait pas de sens.
    if (d.kind === 'measure') return null
    const ring = this.ringOf(d)
    if (c.limits && c.limits.length > 0) {
      // « Au moins un » périmètre, pas leur union : deux limites disjointes ne
      // doivent pas autoriser une forme qui chevauche le vide entre les deux.
      // Densité de prédicat alignée sur celle du rendu (cf. `predicateSegments`) :
      // au défaut les deux valent 64, mais un hôte qui monte `circleSegments` doit
      // voir le test suivre, sans quoi un point visiblement dans la zone en sort.
      const segments = predicateSegments(this.config.performance.circleSegments)
      const inside = c.limits.some((lim) => ringInsideRing(ring, ringOfShape(lim, segments)))
      if (!inside) return 'outOfLimits'
    }
    if (c.maxAreaM2 !== undefined && d.closed && polygonAreaM2(ring) > c.maxAreaM2) return 'maxArea'
    return null
  }

  /**
   * Points d'avant le geste d'édition, par forme. Une forme dont l'édition viole
   * les contraintes est **remise dans son état d'avant** plutôt que refusée après
   * coup : l'utilisateur ne perd pas une zone existante en la déplaçant mal.
   */
  private readonly editGuard = new Map<string, LatLng[]>()

  /** Mémorise l'état d'avant geste des formes sur le point d'être éditées. */
  private captureEditGuard(targets: readonly Drawing[]): void {
    if (!this.constraints) return
    this.editGuard.clear()
    for (const d of targets)
      this.editGuard.set(
        d.id,
        d.points.map((p) => ({ ...p })),
      )
  }

  /** Vue hôte d'une forme (identité + géométrie + style groupé + meta). */
  private toShape(d: Drawing): DrawnShape {
    const s: DrawnShape = {
      id: d.id,
      kind: d.kind,
      points: d.points.map((p) => ({ lat: p.lat, lng: p.lng })),
      closed: d.closed,
      style: {
        color: d.color,
        fillColor: d.fillColor,
        width: d.width,
        fillOpacity: d.fillOpacity,
        strokeOpacity: strokeOpacityOf(d),
        stroke: d.stroke ?? 'solid',
        radius: d.radius,
      },
      tags: [...d.tags],
    }
    if (d.title) s.title = d.title
    if (d.locked) s.locked = true
    if (d.meta) s.meta = d.meta
    if (d.symbol) s.symbol = { ...d.symbol }
    return s
  }

  /** Fin d'un geste d'édition : hauteurs/mpp invalidées (l'ancre a bougé), rebuild, émission. */
  private commitEdit(changed: readonly Drawing[]): void {
    // Une forme supprimée/remplacée PENDANT le geste (Suppr, undo…) ne doit pas
    // être reconstruite : son mesh deviendrait un fantôme hors collection.
    const alive = changed.filter((d) => this.byId.get(d.id) === d)
    for (const d of changed) this.pendingEdit.delete(d.id)
    if (alive.length === 0) return
    // Édition refusée : la forme retrouve ses points d'avant le geste. Le rebuild
    // qui suit s'applique donc à l'état restauré — rien de spécial à défaire.
    const refused: Array<{ d: Drawing; reason: DrawRejectReason }> = []
    for (const d of alive) {
      const reason = this.violation(d)
      if (!reason) continue
      const before = this.editGuard.get(d.id)
      if (before) d.points = before.map((p) => ({ ...p }))
      refused.push({ d, reason })
    }
    this.editGuard.clear()
    for (const d of alive) {
      this.heights.delete(d.id)
      this.builtMpp.delete(d.id)
    }
    this.resettle.open()
    for (const d of alive) this.rebuildOne(d, false)
    this.overlayDirty = true
    for (const { d, reason } of refused) this.onReject?.(reason, this.toShape(d))
    // Une forme restaurée n'a PAS changé du point de vue de l'hôte : pas d'`update`.
    const rejected = new Set(refused.map((r) => r.d.id))
    for (const d of alive) if (!rejected.has(d.id)) this.onShapeUpdate?.(this.toShape(d))
    this.emitChange()
  }

  /** Drag d'une poignée : le curseur écran est re-piqué en lat/lng (même picking que la souris). */
  private onHandlePointer(id: HandleId, phase: PointerPhase, e: PointerEvent): void {
    if (!this.lastCamera) return
    const s = this.eventToScreen(e)
    const latLng =
      this.projection.pickLatLng(s.x, s.y, this.lastCamera) ??
      this.projection.pickEllipsoidLatLng(s.x, s.y, this.lastCamera)
    if (phase === 'down') {
      if (!latLng) return
      if (id.type === 'scale') this.editCtl.beginScale(latLng, { u: id.u, v: id.v })
      else this.editCtl.beginVertex(latLng, id.shapeId, id.index)
    } else if (phase === 'move') {
      this.editCtl.move(latLng, e.shiftKey)
    } else {
      this.editCtl.end()
    }
    this.overlayDirty = true
    this.updateRotateCursor()
  }

  setTool(tool: DrawTool | null): void {
    // Un geste d'édition en cours (drag) est annulé — sinon il resterait actif
    // et transformerait la forme à la reprise de l'outil sélection.
    if (this.editCtl?.active) this.editCtl.cancel()
    // Un polygone en cours (mode clic) est VALIDÉ au changement d'outil au lieu
    // d'être jeté — sinon cliquer sur « main » fait disparaître le tracé.
    if (this.live && this.mode === 'click' && this.live.kind === 'polygon') this.closeCurrent()
    else this.cancelLive()
    // Quitter l'outil sélection abandonne sélection et marquee en cours.
    if (this.tool === 'select' && tool !== 'select') {
      this.selection.escape()
      this.selection.clear()
    }
    this.tool = tool
    // Routage des clics markers : actif seulement pendant l'outil sélection.
    this.syncSelectableConsumer()
    // État de survol remis à zéro : pas de curseur rotation fantôme à la reprise.
    this.hoverShape = false
    this.overlay.parentElement?.classList.remove('m3d-hover-shape')
    this.updateRotateCursor()
  }

  // ── API par identité (CRUD piloté par l'app hôte) ──

  /** Toutes les formes, dans l'ordre de la collection. */
  getShapes(): DrawnShape[] {
    return this.drawings.map((d) => this.toShape(d))
  }

  getShape(id: string): DrawnShape | null {
    const d = this.byId.get(id)
    return d ? this.toShape(d) : null
  }

  /** Dernière forme de la collection — celle qui vient d'être dessinée. */
  getLastShape(): DrawnShape | null {
    const d = this.drawings[this.drawings.length - 1]
    return d ? this.toShape(d) : null
  }

  /**
   * Pose un symbole du catalogue à une coordonnée.
   *
   * C'est une forme d'UN SEUL point, rendue en marker DOM par la couche React : un
   * pictogramme doit rester lisible et de taille constante à tout zoom et toute
   * inclinaison, ce qu'une emprise au sol (rect, cercle) ne permet pas. Il vit
   * néanmoins dans la collection de dessin, et hérite donc de l'historique, du
   * GeoJSON, des tags et des events par forme.
   */
  placeSymbol(key: string, at: LatLng, variant?: string): string {
    return this.addShape({
      kind: 'symbol',
      points: [at],
      closed: false,
      symbol: { key, variant },
      style: {},
    })
  }

  /**
   * Signature de l'état des symboles (identités, positions, variantes). Permet à la
   * couche de rendu de ne recalculer QUE lorsqu'un symbole change réellement : le
   * compteur de révision, lui, bumpe à chaque frame d'un tracé en cours.
   */
  symbolsVersion(): string {
    let sig = ''
    for (const d of this.drawings) {
      if (d.kind !== 'symbol' || !d.symbol || !d.points[0]) continue
      sig += `${d.id}:${d.points[0].lat},${d.points[0].lng},${d.symbol.key},${d.symbol.variant ?? ''};`
    }
    return sig
  }

  /**
   * Symboles posés, pour la couche de rendu (markers DOM). Les autres formes n'y
   * figurent pas : elles sont rendues en WebGL par cette classe.
   */
  symbolShapes(): Array<{ id: string; at: LatLng; symbol: ShapeSymbol; tags: readonly string[] }> {
    const out: Array<{ id: string; at: LatLng; symbol: ShapeSymbol; tags: readonly string[] }> = []
    for (const d of this.drawings) {
      if (d.kind === 'symbol' && d.symbol && d.points[0]) {
        // Copies, comme `toShape` : ce que rend la lib ne doit jamais être une
        // poignée sur son état interne.
        out.push({
          id: d.id,
          at: { lat: d.points[0].lat, lng: d.points[0].lng },
          symbol: { ...d.symbol },
          tags: [...d.tags],
        })
      }
    }
    return out
  }

  /** Déplace un symbole (repositionnement de son marker). */
  moveSymbol(id: string, at: LatLng): boolean {
    return this.updateShape(id, { points: [at] })
  }

  /** Insère une forme et renvoie son id (généré si absent). */
  addShape(shape: NewShape, opts: MutateOptions = {}): string {
    this.history.push(this.drawings)
    const d = this.insertShape(shape)
    if (!opts.silent) {
      this.onShapeAdd?.(this.toShape(d))
      this.emitChange()
    }
    return d.id
  }

  /** Insertion nue : ni historique ni event — les appelants s'en chargent (une
   *  seule entrée d'historique pour un remplacement de collection entier). */
  private insertShape(shape: NewShape): Drawing {
    const closed = shape.closed ?? (shape.kind === 'rect' || shape.kind === 'circle' || shape.kind === 'polygon')
    const base = this.defaultsFor?.(shape.kind) ?? this.defaults
    const st = shape.style ?? {}
    const d: Drawing = {
      id: shape.id && !this.byId.has(shape.id) ? shape.id : this.nextId(),
      kind: shape.kind,
      title: shape.title,
      points: shape.points.map((p) => ({ lat: p.lat, lng: p.lng })),
      color: st.color ?? base.color,
      fillColor: st.fillColor ?? base.fillColor,
      width: st.width ?? base.width,
      fillOpacity: st.fillOpacity ?? base.fillOpacity,
      strokeOpacity: st.strokeOpacity ?? base.strokeOpacity,
      stroke: st.stroke ?? base.stroke,
      radius: shape.kind === 'rect' ? (st.radius ?? base.radius) : undefined,
      locked: shape.locked || undefined,
      closed,
      tags: shape.tags ? [...shape.tags] : defaultTags(shape.kind, shape.symbol),
      meta: shape.meta,
      symbol: shape.symbol ? { ...shape.symbol } : undefined,
    }
    this.drawings.push(d)
    this.byId.set(d.id, d)
    this.rebuildOne(d, false)
    return d
  }

  /** Applique un patch à une forme. Renvoie false si l'id est inconnu. */
  updateShape(id: string, patch: ShapePatch, opts: MutateOptions = {}): boolean {
    const d = this.byId.get(id)
    if (!d) return false
    this.history.push(this.drawings)
    // La géométrie change → l'ancre bouge : hauteur et résolution mémoïsées sont
    // périmées (même précaution que `commitEdit`), sinon la forme est drapée à la
    // hauteur de son ancien emplacement.
    const moved = patch.points !== undefined
    if (moved) d.points = patch.points!.map((p) => ({ lat: p.lat, lng: p.lng }))
    if (patch.closed !== undefined) d.closed = patch.closed
    if (patch.title !== undefined) d.title = patch.title || undefined
    if (patch.tags !== undefined) d.tags = [...patch.tags]
    if (patch.locked !== undefined) d.locked = patch.locked || undefined
    if (patch.meta !== undefined) d.meta = patch.meta
    const st = patch.style
    if (st) {
      if (st.color !== undefined) d.color = st.color
      if (st.fillColor !== undefined) d.fillColor = st.fillColor
      if (st.width !== undefined) d.width = st.width
      if (st.fillOpacity !== undefined) d.fillOpacity = st.fillOpacity
      if (st.strokeOpacity !== undefined) d.strokeOpacity = st.strokeOpacity
      if (st.stroke !== undefined) d.stroke = st.stroke
      if (st.radius !== undefined && d.kind === 'rect') d.radius = st.radius
    }
    if (moved) {
      this.heights.delete(d.id)
      this.builtMpp.delete(d.id)
      this.resettle.open()
    }
    this.rebuildOne(d, false)
    this.overlayDirty = true
    if (!opts.silent) {
      this.onShapeUpdate?.(this.toShape(d))
      this.emitChange()
    }
    return true
  }

  /** Supprime une forme (verrouillée comprise : l'appel vient du code hôte). */
  removeShape(id: string, opts: MutateOptions = {}): boolean {
    const d = this.byId.get(id)
    if (!d) return false
    // Un geste d'édition en cours sur cette forme reconstruirait un mesh fantôme.
    if (this.editCtl.active) this.editCtl.abort()
    this.history.push(this.drawings)
    const gone = this.toShape(d)
    this.dropDrawing(id)
    this.byId.delete(id)
    this.drawings = this.drawings.filter((x) => x.id !== id)
    this.selection.prune()
    if (!opts.silent) {
      this.onShapeDelete?.(gone)
      this.emitChange()
    }
    return true
  }

  /**
   * Remplace toute la collection. Contrairement à `fromGeoJSON`, les events
   * granulaires sont émis par différence (ajouts/modifs/suppressions) : l'app hôte
   * qui synchronise depuis son backend voit exactement ce qui a bougé.
   */
  replaceShapes(shapes: readonly NewShape[], opts: MutateOptions = {}): void {
    const before = new Map(this.drawings.map((d) => [d.id, this.toShape(d)]))
    this.history.push(this.drawings)
    this.editCtl.abort()
    for (const d of this.drawings) this.dropDrawing(d.id)
    this.drawings = []
    this.byId.clear()
    this.cancelLive()
    for (const s of shapes) this.insertShape(s)
    this.selection.prune()
    if (!opts.silent) {
      this.emitDiff(before)
      this.emitChange()
    }
  }

  // ── Sélection ──

  /** Mode du sélecteur (marquee rectangle, polygone, lasso). */
  setSelectMode(mode: SelectMode): void {
    this.selection.mode = mode
  }

  /** Sélectionne par ids (les formes verrouillées/masquées sont filtrées). */
  select(ids: readonly string[]): void {
    this.selection.set(ids)
  }

  /**
   * Branche (ou débranche avec `null`) le registre des sélectionnables externes
   * (markers, `engine.selectables`). Le core gère TOUT le cycle de vie : prune de
   * la sélection quand le jeu d'éléments change, et routage des clics (consumer)
   * quand l'outil sélection est actif — un intégrateur vanilla n'a rien d'autre
   * à câbler. Les markers restent exclus de toute édition (move/resize/rotation).
   */
  setExternalSelectables(registry: SelectableRegistry | null): void {
    if (registry === this.externalSelectables) return
    this.offSelectables?.()
    if (this.externalSelectables) this.externalSelectables.consumer = null
    this.externalSelectables = registry
    this.offSelectables = registry
      ? registry.onItemsChanged(() => this.selection.pruneExternal((id) => registry.has(id)))
      : null
    this.syncSelectableConsumer()
  }

  /** Pose/retire le consumer du registre — la politique Maj = additif vit ICI. */
  private syncSelectableConsumer(): void {
    if (!this.externalSelectables) return
    this.externalSelectables.consumer =
      this.tool === 'select' ? { pick: (id, modifiers) => this.selection.pickExternal(id, modifiers.shiftKey) } : null
  }

  /** Désélectionne des sélectionnables externes (croix d'un groupe de badges). */
  deselectExternal(ids: ReadonlyArray<string | number>): void {
    this.selection.deselectExternal(ids)
  }

  /**
   * Emprise écran de la sélection, comme élément — l'ancre du panneau de style quand
   * c'est une forme qui l'ouvre. `null` tant que l'overlay n'est pas monté.
   */
  selectionBoxEl(): SVGRectElement | null {
    return this.overlaySel?.boxEl ?? null
  }

  /** Détail des formes sélectionnées (kind par id) — pour les badges de sélection. */
  selectionDetails(): Array<{ id: string; kind: DrawTool }> {
    const out: Array<{ id: string; kind: DrawTool }> = []
    for (const id of this.selection.ids) {
      const d = this.byId.get(id)
      if (d) out.push({ id: d.id, kind: d.kind })
    }
    return out
  }

  /** Formes sélectionnées éditables (jamais verrouillées) — unique point de vérité. */
  private selectedEditable(): Drawing[] {
    return this.drawings.filter((d) => this.selection.has(d.id) && !d.locked)
  }

  getSelection(): string[] {
    return this.selection.ids
  }

  clearSelection(): void {
    this.selection.clear()
  }

  /** Sélectionne toutes les formes visibles non verrouillées (formes uniquement,
   *  jamais les markers : « tout sélectionner » reste un geste d'édition). */
  selectAll(): void {
    this.selection.set(this.drawings.map((d) => d.id))
  }

  /** Supprime les formes sélectionnées (une entrée d'historique). */
  deleteSelected(): void {
    const ids = new Set(this.selectedEditable().map((d) => d.id))
    if (ids.size === 0) return
    // Un geste en cours sur ces formes est abandonné — sans quoi son commit au
    // pointer-up reconstruirait un mesh fantôme pour une forme supprimée.
    this.editCtl.abort()
    this.history.push(this.drawings)
    const removed = this.drawings.filter((d) => ids.has(d.id)).map((d) => this.toShape(d))
    for (const id of ids) {
      this.dropDrawing(id)
      this.byId.delete(id)
    }
    this.drawings = this.drawings.filter((d) => !ids.has(d.id))
    this.selection.prune()
    for (const s of removed) this.onShapeDelete?.(s)
    this.emitChange()
  }

  /**
   * Applique un patch de style aux formes sélectionnées (restyle = rebuild simple,
   * aucune invalidation de hauteur). Une rafale de changements (drag d'un picker)
   * = UNE entrée d'historique (coalescence `interaction.history.coalesceMs`).
   */
  setStyleForSelection(patch: DrawStyle): void {
    const ds = this.selectedEditable()
    if (ds.length === 0) return
    const now = Date.now()
    if (now - this.lastStyle > this.config.interaction.history.coalesceMs) this.history.push(this.drawings)
    this.lastStyle = now
    for (const d of ds) {
      if (patch.color !== undefined) d.color = patch.color
      if (patch.fillColor !== undefined) d.fillColor = patch.fillColor
      if (patch.width !== undefined) d.width = patch.width
      if (patch.fillOpacity !== undefined) d.fillOpacity = patch.fillOpacity
      if (patch.strokeOpacity !== undefined) d.strokeOpacity = patch.strokeOpacity
      if (patch.stroke !== undefined) d.stroke = patch.stroke
      if (patch.radius !== undefined && d.kind === 'rect') d.radius = patch.radius
      // Rebuild coalescé (1×/frame) : le picker natif émet en continu pendant le drag.
      this.pendingEdit.add(d.id)
    }
    for (const d of ds) this.onShapeUpdate?.(this.toShape(d))
    this.emitChange()
  }

  /** Style commun des formes sélectionnées — champ hétérogène = absent ; null si sélection vide. */
  styleOfSelection(): DrawStyle | null {
    const ds = this.drawings.filter((d) => this.selection.has(d.id))
    if (ds.length === 0) return null
    const first = ds[0]!
    const style: DrawStyle = {
      color: first.color,
      fillColor: first.fillColor,
      width: first.width,
      fillOpacity: first.fillOpacity,
      strokeOpacity: strokeOpacityOf(first),
      stroke: first.stroke ?? 'solid',
    }
    for (const d of ds.slice(1)) {
      if (d.color !== style.color) style.color = undefined
      if (d.fillColor !== style.fillColor) style.fillColor = undefined
      if (d.width !== style.width) style.width = undefined
      if (d.fillOpacity !== style.fillOpacity) style.fillOpacity = undefined
      if (strokeOpacityOf(d) !== style.strokeOpacity) style.strokeOpacity = undefined
      if ((d.stroke ?? 'solid') !== style.stroke) style.stroke = undefined
    }
    // Rayon d'angle : pertinent seulement si la sélection contient des rects.
    const rects = ds.filter((d) => d.kind === 'rect')
    if (rects.length > 0) {
      const r0 = rects[0]!.radius ?? 0
      style.radius = rects.every((r) => (r.radius ?? 0) === r0) ? r0 : undefined
    }
    return style
  }

  /** true si la sélection contient au moins une forme de ce type. */
  selectionHas(kind: DrawTool): boolean {
    return this.drawings.some((d) => this.selection.has(d.id) && d.kind === kind)
  }

  /** Duplique les formes sélectionnées (clones décalés de ~12 px, nouvelle sélection). */
  duplicateSelected(): void {
    const ds = this.selectedEditable()
    if (ds.length === 0) return
    this.history.push(this.drawings)
    const clones: Drawing[] = []
    for (const d of ds) {
      const clone = structuredClone(d) as Drawing
      clone.id = this.nextId()
      clone.locked = undefined
      // Décalage bas-droite à l'écran : +est / −nord en mètres locaux.
      const frame = new EnuFrame(this.projection, d.points[0]!, this.heightFor(d))
      const off = this.config.interaction.duplicateOffsetPx * this.mppFor(d)
      clone.points = d.points.map((p) => {
        const l = frame.local(p)
        return frame.toLatLng({ x: l.x + off, z: l.z - off })
      })
      this.drawings.push(clone)
      this.byId.set(clone.id, clone)
      this.rebuildOne(clone, false)
      clones.push(clone)
    }
    this.selection.set(clones.map((c) => c.id))
    for (const c of clones) this.onShapeAdd?.(this.toShape(c))
    this.emitChange()
  }

  /** Déplace la sélection de (dx,dy) px écran — flèches du clavier (Maj = ×10). */
  nudgeSelection(dxPx: number, dyPx: number): void {
    const ds = this.selectedEditable()
    if (ds.length === 0) return
    // Une rafale de nudges = UNE entrée d'historique (coalescence `interaction.history.coalesceMs`).
    const now = Date.now()
    if (now - this.lastNudge > this.config.interaction.history.coalesceMs) this.history.push(this.drawings)
    this.lastNudge = now
    // Le nudge clavier ne passe pas par `EditController` : il pose son propre garde.
    this.captureEditGuard(ds)
    for (const d of ds) {
      const frame = new EnuFrame(this.projection, d.points[0]!, this.heightFor(d))
      const mpp = this.mppFor(d)
      const dx = dxPx * mpp
      const dz = -dyPx * mpp
      d.points = d.points.map((p) => {
        const l = frame.local(p)
        return frame.toLatLng({ x: l.x + dx, z: l.z + dz })
      })
    }
    this.commitEdit(ds)
  }

  /**
   * Échap en cascade, tous outils : geste d'édition → annulé ; marquee → annulé ;
   * sélection → vidée ; tracé en cours → abandonné (PAS commité). Renvoie true si
   * consommé (le caller ne doit alors pas quitter l'outil).
   */
  escape(): boolean {
    if (this.editCtl.active) {
      this.editCtl.cancel()
      return true
    }
    if (this.tool === 'select') return this.selection.escape()
    if (this.live) {
      this.cancelLive()
      return true
    }
    return false
  }

  /** Verrouille/déverrouille des formes (réservé au code hôte — aucune UI n'y touche). */
  setLocked(ids: readonly string[], locked: boolean): void {
    const changed: Drawing[] = []
    for (const id of ids) {
      const d = this.byId.get(id)
      if (d && !!d.locked !== locked) {
        d.locked = locked || undefined
        changed.push(d)
      }
    }
    if (changed.length === 0) return
    this.selection.prune()
    for (const d of changed) this.onShapeUpdate?.(this.toShape(d))
    this.emitChange()
  }

  private eventToScreen(e: PointerEvent): ScreenPt {
    // Au plus 1 mesure de layout par frame, même à 250 Hz de pointermove.
    const r = (this.overlayRect ??= this.overlay.getBoundingClientRect())
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  /** Feedback « forme protégée » : flash du contour + cadenas au centre. */
  private lockedFeedback(d: Drawing): void {
    this.onLockedHit?.(d)
    const c = this.screenContour(d)
    if (!c || !this.overlaySel) return
    const bb = screenBBox(c.pts)
    const center = bb ? { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 } : c.pts[0]!
    this.overlaySel.flashLock(c, center)
  }

  /** Repositionne contours/bbox/marquee/poignées de la sélection (px écran, chaque frame). */
  private syncSelectionOverlay(): void {
    if (!this.overlaySel) return
    const marquee = this.selection.marquee()
    // Feature au repos (aucune sélection, aucun marquee) : zéro travail par frame —
    // un dernier sync vide efface l'overlay, puis on dort jusqu'au prochain contenu.
    if (this.selection.size === 0 && !marquee) {
      if (this.overlayActive) {
        this.overlaySel.sync([], null, null, [])
        this.overlayActive = false
      }
      return
    }
    // Rien n'a bougé (caméra immobile, pas de geste) : l'overlay affiché est valide.
    if (!this.overlayDirty) return
    this.overlayDirty = false
    this.overlayActive = true
    const shapes: OverlayShape[] = []
    const all: ScreenPt[] = []
    for (const id of this.selection.ids) {
      const d = this.byId.get(id)
      if (!d) continue
      const c = this.screenContour(d)
      if (!c) continue
      shapes.push(c)
      for (const p of c.pts) all.push(p)
    }
    const handles = this.tool === 'select' && shapes.length > 0 ? this.editCtl.layout() : []
    this.overlaySel.sync(shapes, shapes.length > 0 ? screenBBox(all) : null, marquee, handles)
  }

  setDefaults(d: Partial<DrawDefaults>): void {
    this.defaults = { ...this.defaults, ...d }
  }

  /** Visibilité d'un dessin sous le filtre « Couches » — le dessin en cours et les
   *  commits frais (exemptés) restent toujours visibles. */
  private isShown(d: Drawing): boolean {
    return d === this.live || this.filterExempt.has(d.id) || this.isTagVisible(d.tags)
  }

  /**
   * Applique le filtre « Couches » : bascule la visibilité des meshes existants
   * (O(n) toggles, aucun rebuild) et mémorise le prédicat pour les rebuilds/labels.
   * Un changement de sélection réaffirme le filtre → les exemptions de commit tombent.
   */
  setTagVisibility(isVisible: (tags: readonly string[]) => boolean): void {
    this.isTagVisible = isVisible
    this.filterExempt.clear()
    for (const [id, enu] of this.meshes) {
      const d = this.drawingFor(id)
      if (d) enu.visible = this.isShown(d)
    }
    // Une forme sélectionnée que le filtre vient de masquer sort de la sélection.
    this.selection.prune()
  }

  /** Compteurs de tags des dessins commités (registre du panneau « Couches »). */
  tagCounts(): Map<string, number> {
    return countTags(this.drawings, (d) => d.tags)
  }

  /**
   * Suspension (barre espace) : l'interception souris est levée — les événements
   * retombent sur les contrôles caméra — mais tracé/geste en cours restent GELÉS
   * (pas annulés) et reprennent au relâchement de la touche.
   */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended
    this.updateRotateCursor()
  }

  /** Maj enfoncée/relâchée : annonce la rotation (curseur dédié dès l'appui). */
  setRotateHint(on: boolean): void {
    this.rotateHint = on
    this.updateRotateCursor()
  }

  /**
   * Curseur de rotation : pendant un drag de rotation, ou Maj enfoncée en mode
   * sélection **au survol d'une forme** — jamais sur le vide (Maj sert aussi à
   * l'ajout à la sélection : un curseur de rotation partout serait trompeur).
   */
  private updateRotateCursor(): void {
    const rotating =
      this.editCtl.rotating || (this.rotateHint && this.tool === 'select' && !this.suspended && this.hoverShape)
    this.overlay.parentElement?.classList.toggle('m3d-rotating', rotating)
  }

  readonly interceptor: PointerInterceptor = (phase, latLng, e) => {
    if (this.suspended) {
      // Le bouton souris relâché PENDANT la suspension clôture proprement le
      // geste/tracé gelé — sinon la forme suivrait le curseur après reprise.
      if (phase === 'up') {
        if (this.editCtl.active) {
          this.editCtl.end()
          this.updateRotateCursor()
        } else if (this.live && this.mode === 'drag') {
          this.commitLive()
        }
      }
      return false
    }
    if (!this.tool) return false
    if (this.tool === 'select') {
      // Geste d'édition en cours (drag du corps) : il consomme move/up.
      if (this.editCtl.active) {
        if (phase === 'move') this.editCtl.move(latLng, e.shiftKey)
        else if (phase === 'up') this.editCtl.end()
        this.updateRotateCursor()
        this.overlayDirty = true
        return true
      }
      // Curseur « déplacer » au survol d'une forme (throttlé à 1 hit-test/frame).
      if (phase === 'move' && latLng && !this.hoverChecked) {
        this.hoverChecked = true
        const hit = this.hitTest(latLng)
        const hover = !!hit && !hit.locked
        if (hover !== this.hoverShape) {
          this.hoverShape = hover
          this.overlay.parentElement?.classList.toggle('m3d-hover-shape', hover)
          // Maj déjà enfoncée : le curseur de rotation suit l'entrée/sortie de forme.
          this.updateRotateCursor()
        }
      }
      // Double-clic sur une forme : intention d'édition côté hôte (ouvrir une
      // fiche). Notification PURE — l'event n'est pas consommé, la sélection et
      // l'édition sur place suivent leur cours normal.
      if (phase === 'down' && e.detail === 2 && latLng && this.onShapeEdit) {
        const hit = this.hitTest(latLng)
        if (hit) this.onShapeEdit(this.toShape(hit))
      }
      const consumed = this.selection.handle(phase, latLng, e)
      // Le marquee suit le curseur : recalcul de l'overlay seulement quand il y a
      // quelque chose à animer (pas au simple survol).
      if (phase !== 'move' || this.selection.marquee()) this.overlayDirty = true
      return consumed
    }
    if (!latLng) return true
    if (this.tool === 'erase') {
      if (phase === 'down') this.eraseAt(latLng)
      return true
    }
    return this.handleDraw(phase, latLng)
  }

  private handleDraw(phase: PointerPhase, p: LatLng): boolean {
    if (!this.tool) return false
    if (this.tool === 'polygon') {
      if (phase === 'down') {
        if (this.live && this.mode === 'click') {
          // Aimant : clic près du 1er sommet (≥3 sommets posés) → ferme le polygone.
          const first = this.live.points[0]!
          if (this.live.points.length >= 4 && (this.snapping || this.nearFirst(first, p))) {
            this.snapping = false
            this.closeCurrent()
            return true
          }
          this.live.points.push(p)
        } else {
          // 2 points au départ (sommet figé + point élastique) → N clics = N sommets.
          this.startLive(p, 'click', [p, { ...p }])
        }
        this.rebuildLive()
      } else if (phase === 'move' && this.live) {
        const first = this.live.points[0]!
        // Colle l'arête d'aperçu au 1er sommet quand on en est proche (fermeture facile).
        this.snapping = this.nearFirst(first, p)
        this.live.points[this.live.points.length - 1] = this.snapping ? { ...first } : p
        this.rebuildLive()
      }
      return true
    }
    if (this.tool === 'freehand') {
      if (phase === 'down') this.startLive(p, 'drag')
      else if (phase === 'move' && this.live) {
        const last = this.live.points[this.live.points.length - 1]!
        // Décimation en px écran (convertie en mètres à la résolution courante).
        const minMeters =
          Math.max(this.config.interaction.freehandMinStepPx, this.live.width * 0.4) * this.mppFor(this.live)
        if (this.projection.groundDistance(last, p) > minMeters) {
          this.live.points.push(p)
          this.rebuildLive()
        }
      } else if (phase === 'up') this.commitLive()
      return true
    }
    if (phase === 'down') this.startLive(p, 'drag', [p, p])
    else if (phase === 'move' && this.live) {
      this.live.points[this.live.points.length - 1] = p
      this.rebuildLive()
    } else if (phase === 'up') this.commitLive()
    return true
  }

  closeCurrent(): void {
    if (this.tool === 'select') {
      this.selection.closeMarquee()
      return
    }
    if (!this.live) return
    if (this.live.kind === 'polygon') {
      this.live.points.pop()
      this.live.closed = this.live.points.length > 2
    }
    this.commitLive()
  }

  private startLive(p: LatLng, mode: 'click' | 'drag', points?: LatLng[]): void {
    if (!this.tool) return
    const base = this.defaultsFor?.(this.tool) ?? this.defaults
    this.live = {
      id: this.nextId(),
      kind: this.tool,
      points: points ?? [p],
      color: base.color,
      fillColor: base.fillColor,
      // Sans réglages par outil, la règle reste une cote fine (2 px) par défaut.
      width: !this.defaultsFor && this.tool === 'measure' ? 2 : base.width,
      fillOpacity: base.fillOpacity,
      strokeOpacity: base.strokeOpacity,
      stroke: base.stroke,
      radius: this.tool === 'rect' ? base.radius : undefined,
      closed: this.tool === 'rect' || this.tool === 'circle',
      tags: ['draw', this.tool],
    }
    this.mode = mode
  }

  private commitLive(): void {
    const d = this.live
    this.live = null
    this.mode = 'idle'
    if (!d) return
    if (d.points.length < 2) {
      this.dropDrawing(d.id)
      return
    }
    // Contrainte évaluée AVANT toute trace : une forme refusée ne doit laisser ni
    // mesh, ni entrée d'historique, ni `onChange` — comme si le geste n'avait pas eu lieu.
    const refused = this.violation(d)
    if (refused) {
      this.dropDrawing(d.id)
      this.onReject?.(refused, this.toShape(d))
      return
    }
    this.history.push(this.drawings)
    this.drawings.push(d)
    this.byId.set(d.id, d)
    if (!this.isTagVisible(d.tags)) this.filterExempt.add(d.id)
    this.rebuildOne(d, false)
    this.onShapeAdd?.(this.toShape(d))
    this.emitChange()
  }

  private cancelLive(): void {
    if (!this.live) return
    this.dropDrawing(this.live.id)
    this.live = null
    this.mode = 'idle'
  }

  /** Annule la dernière action (création, suppression, édition, style). */
  undo(): void {
    const prev = this.history.undo(this.drawings)
    if (prev) this.restore(prev)
  }

  /** Rétablit la dernière action annulée. */
  redo(): void {
    const next = this.history.redo(this.drawings)
    if (next) this.restore(next)
  }

  get canUndo(): boolean {
    return this.history.canUndo
  }

  get canRedo(): boolean {
    return this.history.canRedo
  }

  /**
   * Remplace la collection par un snapshot d'historique et reconstruit tout.
   * Deux invariants survivent à l'historique :
   * - les formes VERROUILLÉES (contrat `locked` : seul le code hôte les change —
   *   un Ctrl+Z ne doit ni les supprimer ni les déverrouiller) ;
   * - les exemptions de filtre (une forme dessinée sous filtre actif reste
   *   visible — sinon un undo la ferait disparaître de l'écran en silence).
   */
  private restore(state: Drawing[]): void {
    this.cancelLive()
    this.editCtl.abort()
    // Snapshot AVANT mutation : un undo qui défait une création doit émettre la
    // suppression correspondante, sinon l'app hôte garde en base une forme qui
    // n'est plus sur la carte (l'ancienne carte Google n'avait pas d'undo — cette
    // capacité est propre à map3d, et son incohérence le serait aussi).
    const before = new Map(this.drawings.map((d) => [d.id, this.toShape(d)]))
    const lockedById = new Map(this.drawings.filter((d) => d.locked).map((d) => [d.id, d]))
    const exempt = new Set(this.filterExempt)
    for (const d of this.drawings) {
      if (!lockedById.has(d.id)) this.dropDrawing(d.id)
    }
    const next: Drawing[] = []
    for (const d of state) {
      const cur = lockedById.get(d.id)
      if (cur) {
        // L'instance courante (verrouillée) fait foi — son mesh est conservé.
        next.push(cur)
        lockedById.delete(d.id)
      } else {
        next.push(d)
      }
    }
    // Formes verrouillées absentes du snapshot (créées/verrouillées depuis) : conservées.
    next.push(...lockedById.values())
    this.drawings = next
    this.byId.clear()
    for (const d of next) {
      this.byId.set(d.id, d)
      if (exempt.has(d.id)) this.filterExempt.add(d.id)
    }
    for (const d of next) {
      if (!this.meshes.has(d.id)) this.rebuildOne(d, false)
    }
    this.selection.prune()
    this.emitDiff(before)
    this.emitChange()
  }

  /** Events granulaires déduits d'un remplacement en masse (undo/redo). */
  private emitDiff(before: ReadonlyMap<string, DrawnShape>): void {
    if (!this.onShapeAdd && !this.onShapeUpdate && !this.onShapeDelete) return
    for (const d of this.drawings) {
      const prev = before.get(d.id)
      const now = this.toShape(d)
      if (!prev) this.onShapeAdd?.(now)
      else if (!sameShape(prev, now)) this.onShapeUpdate?.(now)
    }
    for (const [id, s] of before) {
      if (!this.byId.has(id)) this.onShapeDelete?.(s)
    }
  }

  /** Efface les dessins **visibles** ; sous filtre actif, les dessins masqués sont
   *  conservés, ainsi que les formes verrouillées (pas de perte silencieuse). */
  clear(): void {
    const kept: Drawing[] = []
    const dropped: Drawing[] = []
    for (const d of this.drawings) {
      if (this.isShown(d) && !d.locked) dropped.push(d)
      else kept.push(d)
    }
    if (dropped.length === 0 && !this.live) return
    if (dropped.length > 0) this.history.push(this.drawings)
    const removed = dropped.map((d) => this.toShape(d))
    for (const d of dropped) this.dropDrawing(d.id)
    this.drawings = kept
    this.byId.clear()
    for (const d of kept) this.byId.set(d.id, d)
    this.cancelLive()
    for (const s of removed) this.onShapeDelete?.(s)
    this.emitChange()
  }

  /**
   * Contour écran d'un dessin — sa géométrie **réelle** (rect → 4 coins, cercle →
   * 48 pts), pas ses points de contrôle — projeté à SA hauteur de drapage :
   * comparé à une autre hauteur, la parallaxe fausserait les tolérances en px.
   */
  private screenContour(d: Drawing): { pts: ScreenPt[]; closed: boolean } | null {
    // Symbole = marker DOM, sans contour géométrique : il est donc aussi hors du
    // marquee/lasso des formes (c'est la sélection de MARKERS qui le prend en charge).
    if (d.kind === 'symbol') return null
    if (d.points.length < 1 || !this.projection.isReady()) return null
    const h = this.heightFor(d)
    const frame = new EnuFrame(this.projection, d.points[0]!, h)
    const { points, closed } = this.localGeometry(d, frame)
    const pts: ScreenPt[] = []
    for (const lp of points) {
      const s = this.toScreen(frame.toLatLng(lp), h)
      if (s) pts.push(s)
    }
    return pts.length > 0 ? { pts, closed } : null
  }

  /**
   * Forme la plus haute sous le point, en cohérence avec l'AFFICHAGE (`isShown` :
   * exemptions de filtre incluses). Deux passes : d'abord les CONTOURS de toutes
   * les formes (les traits sont rendus au-dessus des remplissages — cliquer le
   * trait d'une ligne posée sous un rect rempli doit toucher la ligne), puis les
   * intérieurs remplis. Pré-rejet bon marché par rayon englobant avant de
   * construire le contour complet (le survol appelle ceci à chaque frame).
   */
  hitTest(p: LatLng, tolPx = this.config.interaction.shapeHitTolerancePx): Drawing | null {
    type Candidate = { d: Drawing; sp: ScreenPt; pts: ScreenPt[]; closed: boolean }
    const candidates: Candidate[] = []
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i]!
      if (!this.isShown(d)) continue
      // Un symbole est un marker DOM : c'est lui qui reçoit les clics (et le
      // repositionnement). Le laisser dans le hit-test géométrique le rendrait
      // sélectionnable comme une forme, avec des poignées qu'il n'a pas.
      if (d.kind === 'symbol') continue
      const h = this.heightFor(d)
      const sp = this.toScreen(p, h)
      if (!sp) continue
      // Pré-rejet : curseur plus loin de l'ancre que le rayon englobant (en px).
      const radius = this.boundRadius.get(d.id)
      if (radius !== undefined) {
        const anchor = this.toScreen(d.points[0]!, h)
        if (anchor && Math.hypot(sp.x - anchor.x, sp.y - anchor.y) > radius / this.mppFor(d) + tolPx) continue
      }
      const contour = this.screenContour(d)
      if (!contour) continue
      candidates.push({ d, sp, pts: contour.pts, closed: contour.closed })
    }
    for (const c of candidates) {
      if (c.pts.length === 1) {
        if (Math.hypot(c.sp.x - c.pts[0]!.x, c.sp.y - c.pts[0]!.y) < tolPx) return c.d
        continue
      }
      const segs = c.closed ? c.pts.length : c.pts.length - 1
      for (let k = 0; k < segs; k++) {
        const a = c.pts[k]!
        const b = c.pts[(k + 1) % c.pts.length]!
        if (segDistPx(c.sp.x, c.sp.y, a.x, a.y, b.x, b.y) < tolPx) return c.d
      }
    }
    for (const c of candidates) {
      if (c.closed && c.d.fillOpacity > 0 && c.pts.length >= 3 && pointInPolygon(c.sp, c.pts)) return c.d
    }
    return null
  }

  private eraseAt(p: LatLng): void {
    const d = this.hitTest(p)
    if (!d) return
    if (d.locked) {
      this.onLockedHit?.(d)
      return
    }
    this.history.push(this.drawings)
    this.dropDrawing(d.id)
    const i = this.drawings.indexOf(d)
    if (i >= 0) this.drawings.splice(i, 1)
    this.byId.delete(d.id)
    this.onShapeDelete?.(this.toShape(d))
    this.emitChange()
  }

  // ── Rendu (drapé ENU) ──

  private localGeometry(d: Drawing, frame: EnuFrame): { points: Pt[]; closed: boolean } {
    if (d.kind === 'rect' && d.points.length >= 2) {
      // 4 coins stockés (rect édité/tourné) tels quels ; sinon 2 points diagonaux
      // (tracé initial, anciens GeoJSON) → 4 coins axis-aligned (rétro-compatible).
      let corners: Pt[]
      if (d.points.length >= 4) {
        corners = d.points.slice(0, 4).map((p) => frame.local(p))
      } else {
        corners = diagonalToCorners(frame.local(d.points[0]!), frame.local(d.points[d.points.length - 1]!))
      }
      const pct = clamp(d.radius ?? 0, 0, 50)
      if (pct > 0) {
        const w = Math.hypot(corners[1]!.x - corners[0]!.x, corners[1]!.z - corners[0]!.z)
        const h = Math.hypot(corners[3]!.x - corners[0]!.x, corners[3]!.z - corners[0]!.z)
        const r = (pct / 100) * Math.min(w, h)
        if (r > 1e-6) return { points: filletPolygon(corners, r), closed: true }
      }
      return { points: corners, closed: true }
    }
    if (d.kind === 'circle' && d.points.length >= 2) {
      const c = frame.local(d.points[0]!)
      const e = frame.local(d.points[d.points.length - 1]!)
      const r = Math.hypot(e.x - c.x, e.z - c.z)
      return { points: circlePoints(c, r, this.config.performance.circleSegments), closed: true }
    }
    return { points: d.points.map((p) => frame.local(p)), closed: d.closed }
  }

  /** Dessin (commité ou en cours) portant cet id — lookup O(1). */
  private drawingFor(id: string): Drawing | null {
    return this.byId.get(id) ?? (this.live?.id === id ? this.live : null)
  }

  /**
   * Hauteur de drapage du dessin : mémoïsée quand elle est **résolue** (raycast ayant
   * touché une tuile, ou plan 2D), puis raffinée par la fenêtre resettle. Non résolue
   * (`null`) → repli renvoyé SANS mémoïsation définitive, retenté via la fenêtre.
   */
  private heightFor(d: Drawing): number {
    const cached = this.heights.get(d.id)
    if (cached !== undefined && cached !== null) return cached
    if (cached === undefined) {
      const h = this.projection.resolveAnchorHeight(d.points[0]!)
      this.heights.set(d.id, h)
      // Tuiles fines de la zone en cours de streaming : re-échantillonnage à suivre.
      this.resettle.open()
      if (h !== null) return h
    }
    return this.projection.surfaceFallbackHeight
  }

  /** Résolution courante (m/px) à l'ancre du dessin — 1 tant que la caméra est inconnue. */
  private mppFor(d: Drawing): number {
    if (!this.lastCamera || d.points.length < 1) return 1
    return this.projection.metersPerPixel(d.points[0]!, this.lastCamera, this.viewH, this.heightFor(d))
  }

  private rebuildOne(d: Drawing, preview: boolean): void {
    this.removeMeshes(d.id)
    const height = this.heightFor(d)
    if (!this.projection.isReady() || d.points.length < 1) return
    const frame = new EnuFrame(this.projection, d.points[0]!, height)
    const { points, closed } = this.localGeometry(d, frame)
    // Rayon englobant local (m depuis l'ancre) — pré-rejet du hit-test de survol.
    let maxR = 0
    for (const pt of points) {
      const r = pt.x * pt.x + pt.z * pt.z
      if (r > maxR) maxR = r
    }
    this.boundRadius.set(d.id, Math.sqrt(maxR))
    // Épaisseur de trait : px écran → mètres monde à la résolution courante.
    const mpp = this.mppFor(d)
    // width 0 = pas de bordure — sauf la flèche dont la tête a besoin d'une base.
    const effWidth = d.kind === 'arrow' ? Math.max(d.width, 1) : d.width
    const widthMeters = effWidth * mpp
    this.builtMpp.set(d.id, mpp)

    const enu = frame.group()

    // Un symbole n'a PAS de géométrie WebGL : il est rendu en marker DOM par la
    // couche React (toujours face à l'écran, donc lisible à toute inclinaison, et
    // de taille constante). Seule sa position vit ici, avec l'historique et le GeoJSON.
    if (d.kind === 'symbol') {
      this.group.add(enu)
      this.meshes.set(d.id, enu)
      return
    }

    if (closed && points.length > 2 && d.fillOpacity > 0) {
      const fg = fillGeo(points)
      if (fg) {
        const m = new THREE.Mesh(
          fg,
          fillMaterial(d.fillColor ?? d.color, this.flatDepthTest, d.fillOpacity * (preview ? 0.6 : 1)),
        )
        m.renderOrder = this.renderOrder
        enu.add(m)
      }
    }
    const strokeOpacity = preview ? 0.6 : strokeOpacityOf(d)
    if (effWidth > 0) {
      let rg: THREE.BufferGeometry | null
      if (d.kind === 'measure') {
        // Cote d'architecte ⊢––⊣ : trait fin pointillé + butées perpendiculaires.
        rg = dashedRibbon(points, widthMeters, 8 * mpp, 6 * mpp, false)
        const tg = strokePolylines(endTicks(points, 10 * mpp), widthMeters)
        if (tg) {
          const m = new THREE.Mesh(tg, strokeMaterial(d.color, this.flatDepthTest, strokeOpacity))
          m.renderOrder = this.renderOrder + 1
          enu.add(m)
        }
      } else if (d.stroke === 'dashed') {
        rg = dashedRibbon(points, widthMeters, 10 * mpp, 7 * mpp, closed)
      } else if (d.stroke === 'dotted') {
        rg = dashedRibbon(points, widthMeters, widthMeters, Math.max(widthMeters * 1.6, 3 * mpp), closed)
      } else {
        rg = ribbon(points, widthMeters, closed)
      }
      if (rg) {
        const m = new THREE.Mesh(rg, strokeMaterial(d.color, this.flatDepthTest, strokeOpacity))
        m.renderOrder = this.renderOrder + 1
        enu.add(m)
      }
    }
    if (d.kind === 'arrow') {
      const ah = arrowHead(points, widthMeters)
      if (ah) {
        const m = new THREE.Mesh(ah, strokeMaterial(d.color, this.flatDepthTest, strokeOpacity))
        m.renderOrder = this.renderOrder + 1
        enu.add(m)
      }
    }
    // Filtre « Couches » : un dessin commité masqué le reste après rebuild (LOD/zoom).
    enu.visible = this.isShown(d)
    this.group.add(enu)
    this.meshes.set(d.id, enu)
    if (d.kind === 'measure') this.ensureLabel(d)
  }

  private rebuildLive(): void {
    if (this.live) this.rebuildOne(this.live, true)
  }

  /** Retire meshes + label d'un dessin (rebuildable : les mémos hauteur/mpp survivent). */
  private removeMeshes(id: string): void {
    const g = this.meshes.get(id)
    if (g) {
      disposeObject3D(g)
      this.group.remove(g)
      this.meshes.delete(id)
    }
    const label = this.labels.get(id)
    if (label) {
      label.remove()
      this.labels.delete(id)
    }
  }

  /** Oublie complètement un dessin supprimé : meshes, label ET mémos hauteur/mpp. */
  private dropDrawing(id: string): void {
    this.removeMeshes(id)
    this.heights.delete(id)
    this.builtMpp.delete(id)
    this.boundRadius.delete(id)
    this.filterExempt.delete(id)
  }

  private ensureLabel(d: Drawing): void {
    let label = this.labels.get(d.id)
    if (!label) {
      label = document.createElement('div')
      label.className = 'm3d-measure-label'
      this.overlay.appendChild(label)
      this.labels.set(d.id, label)
    }
    label.textContent = this.formatDistance(this.measureLength(d.points))
  }

  /**
   * Formatage du label de distance de la règle — injectable (traduction) : la
   * couche React le remplace par les gabarits `labels.measure` du provider.
   */
  formatDistance: (meters: number) => string = makeDistanceFormatter(defaultLabels.measure)

  private measureLength(points: LatLng[]): number {
    let total = 0
    for (let i = 0; i < points.length - 1; i++) total += this.projection.groundDistance(points[i]!, points[i + 1]!)
    return total
  }

  update(ctx: FrameContext): void {
    this.lastCamera = ctx.camera
    this.viewH = ctx.size.height
    this.hoverChecked = false
    this.overlayRect = null
    this.flushEmit()
    // Recalage LOD en cours, ou forme en cours d'édition à reconstruire : dans les deux
    // cas la géométrie va changer cette frame ou les suivantes.
    if (this.resettle.active || this.pendingEdit.size > 0) ctx.invalidate()
    // Rebuild coalescé des formes en cours d'édition (1×/frame max).
    if (this.pendingEdit.size > 0) {
      for (const id of this.pendingEdit) {
        const d = this.drawingFor(id)
        if (d) this.rebuildOne(d, false)
      }
      this.pendingEdit.clear()
      this.overlayDirty = true
    }
    let heightsChanged = false
    // Bascule 2D/3D : la surface de référence change → hauteurs re-résolues.
    if (this.heightEpoch !== this.projection.heightEpoch) {
      this.heightEpoch = this.projection.heightEpoch
      this.heights.clear()
      this.resettle.open()
      this.stableRuns = 0
      heightsChanged = true
    }
    // `note` sert aussi de garde « caméra immobile » : bande d'épaisseur et bases
    // sont sautées intégralement au repos.
    const camMoved = this.resettle.note(ctx.cameraState)
    if (camMoved) this.stableRuns = 0

    // Suit le raffinement des tuiles (LOD) par petits lots amortis.
    const ids = this.resettle.batch(this.meshes.size)
    if (ids.length > 0) {
      const keys = [...this.meshes.keys()]
      for (const i of ids) {
        const id = keys[i]!
        const d = this.drawingFor(id)
        if (!d || d.points.length < 1) continue
        const h = this.projection.resolveAnchorHeight(d.points[0]!)
        if (h === null) continue
        const prev = this.heights.get(id)
        if (prev == null || Math.abs(h - prev) > HEIGHT_EPSILON) {
          this.heights.set(id, h)
          heightsChanged = true
          this.stableRuns = 0
        } else {
          this.stableRuns++
        }
      }
    }
    // Cycle complet stable → fenêtre fermée tôt.
    if (this.meshes.size > 0 && this.stableRuns >= this.meshes.size) {
      this.resettle.close()
      this.stableRuns = 0
    }
    // Ancres jamais résolues : retentative à basse cadence, ciblée sur elles seules.
    if (++this.retryTick % this.config.performance.resettle.retryFrames === 0) {
      for (const [id, h] of this.heights) {
        if (h !== null) continue
        const d = this.drawingFor(id)
        if (!d || d.points.length < 1) continue
        const nh = this.projection.resolveAnchorHeight(d.points[0]!)
        if (nh !== null) {
          this.heights.set(id, nh)
          heightsChanged = true
        }
      }
    }

    // Caméra/hauteurs ont bougé → les positions écran de l'overlay sont périmées.
    if (camMoved || heightsChanged) this.overlayDirty = true
    // Épaisseur px écran : le ratio ne peut changer que si caméra/hauteurs ont bougé.
    if (camMoved || heightsChanged) {
      const mppBand = this.config.performance.resettle.mppBand
      let toRebuild: Drawing[] | null = null
      for (const [id] of this.meshes) {
        const d = this.drawingFor(id)
        const built = this.builtMpp.get(id)
        if (!d || built === undefined) continue
        const ratio = this.mppFor(d) / built
        if (ratio > mppBand || ratio < 1 / mppBand) (toRebuild ??= []).push(d)
      }
      if (toRebuild) for (const d of toRebuild) this.rebuildOne(d, d === this.live)
    }
    // Bases ENU : recalées au rebase du tileset ou au changement de hauteur seulement
    // (un rebuild arrive déjà avec sa base fraîche) — jamais par frame au repos.
    const gEpoch = this.projection.groupEpoch()
    if (gEpoch !== this.groupEpochSeen || heightsChanged) {
      this.groupEpochSeen = gEpoch
      this.refreshBases()
    }
  }

  /**
   * Recale la base ENU (matrice figée) de chaque forme depuis son ancre. Le tileset
   * **rebase son origine** quand la caméra s'éloigne (`group.matrixWorld` change,
   * cf. Projection) : sans ce recalage, la géométrie drapée resterait dans l'ancien
   * repère monde et **dériverait** sous la carte au pan (2D comme 3D). La géométrie
   * locale 2D est invariante au rebase (transformée rigide) — seule la base doit
   * suivre. Appelé au rebase et au changement de hauteur, pas par frame.
   */
  private refreshBases(): void {
    if (!this.projection.isReady()) return
    for (const [id, enu] of this.meshes) {
      const d = this.drawingFor(id)
      if (!d || d.points.length < 1) continue
      this.projection.enuBasisFor(d.points[0]!, enu.matrix, this.heightFor(d))
      enu.matrixWorldNeedsUpdate = true
    }
  }

  /** Projette un lat/lng (à `height` m) en pixels écran (null si derrière la caméra / non prêt). */
  private toScreen(p: LatLng, height = 0): { x: number; y: number } | null {
    if (!this.lastCamera) return null
    const w = this.projection.latLngToWorld(p, this.camScratch, height)
    const s = this.projection.worldToScreen(w, this.lastCamera)
    return s.z <= 1 ? { x: s.sx, y: s.sy } : null
  }

  /** Curseur proche du 1er sommet à l'écran (≥3 sommets posés) → aimant de fermeture. */
  private nearFirst(first: LatLng, cur: LatLng): boolean {
    if (!this.live || this.live.points.length < 4) return false
    const h = this.heightFor(this.live)
    const a = this.toScreen(first, h)
    const b = this.toScreen(cur, h)
    return !!(a && b && Math.hypot(a.x - b.x, a.y - b.y) < this.config.interaction.closeSnapPx)
  }

  project(ctx: FrameContext): void {
    this.lastCamera = ctx.camera
    for (const [id, label] of this.labels) {
      const d = this.drawingFor(id)
      if (!d || d.points.length < 2) {
        label.style.display = 'none'
        continue
      }
      const mid = d.points[Math.floor(d.points.length / 2)]!
      // camScratch réutilisé : pas d'allocation Vector3 par label et par frame
      // (`toScreen`, l'autre utilisateur du scratch, n'est jamais appelé ici).
      const world = this.projection.latLngToWorld(mid, this.camScratch, this.heightFor(d))
      const visible = this.projection.isAboveHorizon(world, ctx.camera.position)
      const s = this.projection.worldToScreen(world, ctx.camera)
      const show = visible && s.z <= 1 && this.isShown(d)
      label.style.display = show ? 'block' : 'none'
      if (show) label.style.transform = `translate3d(${s.sx}px, ${s.sy}px, 0) translate(-50%, -50%)`
    }
    this.syncSelectionOverlay()
  }

  toGeoJSON(): GeoJSONFeatureCollection {
    return {
      type: 'FeatureCollection',
      features: this.drawings.map((d) => {
        const coords = d.points.map((p) => [p.lng, p.lat])
        const props: GeoJSONFeature['properties'] = {
          kind: d.kind,
          color: d.color,
          width: d.width,
          fillOpacity: d.fillOpacity,
          tags: d.tags,
        }
        if (d.title) props.title = d.title
        if (d.fillColor !== undefined) props.fillColor = d.fillColor
        if (d.strokeOpacity !== undefined) props.strokeOpacity = d.strokeOpacity
        if (d.stroke !== undefined && d.stroke !== 'solid') props.stroke = d.stroke
        if (d.radius) props.radius = d.radius
        if (d.locked) props.locked = true
        if (d.meta) props.meta = d.meta
        // Sans la clé de catalogue, un symbole réimporté serait un quad vide :
        // la géométrie ne dit pas QUEL symbole plaquer dessus.
        if (d.symbol) props.symbol = { ...d.symbol }
        // Un symbole est ponctuel : `Point` et non `LineString`, dont la
        // spécification GeoJSON exige au moins deux positions.
        if (d.kind === 'symbol' && coords[0]) {
          return { type: 'Feature', id: d.id, geometry: { type: 'Point', coordinates: coords[0] }, properties: props }
        }
        if (d.closed) {
          const ring = [...coords, coords[0]!]
          return { type: 'Feature', id: d.id, geometry: { type: 'Polygon', coordinates: [ring] }, properties: props }
        }
        return { type: 'Feature', id: d.id, geometry: { type: 'LineString', coordinates: coords }, properties: props }
      }),
    }
  }

  fromGeoJSON(fc: GeoJSONFeatureCollection): void {
    // Remplacement piloté par l'app hôte : non annulable (protège aussi les zones
    // verrouillées fraîchement injectées d'un Ctrl+Z utilisateur).
    this.history.reset()
    this.clearAll()
    for (const f of fc.features) {
      const props = f.properties
      const coords =
        f.geometry.type === 'Polygon'
          ? f.geometry.coordinates[0]!
          : f.geometry.type === 'Point'
            ? [f.geometry.coordinates]
            : f.geometry.coordinates
      const points = coords.map((c) => ({ lng: c[0]!, lat: c[1]! }))
      // Anneau GeoJSON : dernier point = 1er (fermeture) — retiré du modèle interne,
      // sinon un rect [a,b,a] réimporté devient dégénéré (diagonale a→a).
      if (f.geometry.type === 'Polygon' && points.length > 1) {
        const a = points[0]!
        const b = points[points.length - 1]!
        if (Math.abs(a.lat - b.lat) < 1e-12 && Math.abs(a.lng - b.lng) < 1e-12) points.pop()
      }
      const d: Drawing = {
        // Identité FOURNIE prioritaire : sans quoi l'app hôte perdrait le lien
        // entre ses formes et ses enregistrements à chaque import→export→import.
        // Un id déjà pris dans cette collection retombe sur un id libre.
        id: f.id && !this.byId.has(f.id) ? f.id : this.nextId(),
        kind: props.kind,
        title: props.title,
        points,
        color: props.color,
        fillColor: props.fillColor,
        width: props.width,
        fillOpacity: props.fillOpacity,
        strokeOpacity: props.strokeOpacity,
        stroke: props.stroke,
        radius: props.radius,
        symbol: props.symbol ? { ...props.symbol } : undefined,
        locked: props.locked,
        closed: f.geometry.type === 'Polygon',
        // `defaultTags` et non un littéral : un symbole importé recevait sinon
        // ['draw','symbol'] là où le même symbole POSÉ reçoit ['symbol', <clé>] —
        // le panneau « Couches » se comportait donc différemment selon la provenance.
        tags: props.tags ?? defaultTags(props.kind, props.symbol),
        meta: props.meta,
      }
      this.drawings.push(d)
      this.byId.set(d.id, d)
      this.rebuildOne(d, false)
    }
    // Une sélection courante peut survivre à l'import : les ids fournis sont
    // conservés, donc `prune` ne retire que ce qui a réellement disparu.
    this.selection.prune()
    this.emitChange()
  }

  /** Remplacement intégral (import GeoJSON) : contrairement à `clear()`, les formes
   *  verrouillées et masquées partent aussi — la nouvelle collection fait foi. */
  private clearAll(): void {
    this.editCtl.abort()
    for (const d of this.drawings) this.dropDrawing(d.id)
    this.drawings = []
    this.byId.clear()
    this.cancelLive()
  }

  /** Émission coalescée : 1 sérialisation GeoJSON max par frame, même quand un
   *  picker/nudge mitraille les mutations (le flush vit dans `update()`). */
  private emitChange(): void {
    this.pendingEmit = true
  }

  private flushEmit(): void {
    if (!this.pendingEmit) return
    this.pendingEmit = false
    this.onChange?.(this.toGeoJSON())
  }

  dispose(): void {
    // Efface les anneaux de sélection des markers (les nœuds DOM leur survivent)
    // puis débranche le registre (consumer + abonnement prune).
    this.externalSelectables?.apply(new Set())
    this.setExternalSelectables(null)
    for (const d of [...this.drawings]) this.dropDrawing(d.id)
    this.cancelLive()
    this.drawings = []
    this.byId.clear()
    this.overlaySel?.dispose()
    this.overlaySel = null
    // Pas de curseur fantôme après démontage.
    this.overlay.parentElement?.classList.remove('m3d-rotating', 'm3d-hover-shape')
    this.scene.remove(this.group)
  }
}

/** Opacité de bordure effective — la règle est plus discrète par défaut (0.85). */
function strokeOpacityOf(d: Drawing): number {
  return d.strokeOpacity ?? (d.kind === 'measure' ? MEASURE_STROKE_OPACITY : DEFAULT_STROKE_OPACITY)
}

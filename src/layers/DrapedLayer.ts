import * as THREE from 'three'
import { defaultConfig } from '../config/defaultConfig'
import type { MapConfig } from '../config/types'
import type { FrameContext, Layer } from '../core/Layer'
import type { Projection } from '../core/Projection'
import { clearGroup, disposeObject3D } from '../core/geometry'
import { GroundedState } from '../core/GroundedState'
import { DrapeSync } from '../core/resettle'
import type { LatLng } from '../shared'

/**
 * Groupe drapé auto-porteur : sa base ENU, l'ancre qui l'a produite, la hauteur de
 * drapage et la résolution du build. Une sous-classe peut l'étendre (tête animée,
 * étiquette DOM, visuel source…).
 *
 * `height: null` = **non résolue** (tuiles absentes au build) : le repli a été
 * utilisé pour la géométrie, jamais mémoïsé comme définitif — `DrapeSync` garde la
 * fenêtre ouverte jusqu'à résolution.
 */
export type Drape<TItem> = {
  enu: THREE.Group
  anchor: LatLng
  height: number | null
  /** Résolution (m/px) au moment du build — sert la bande d'hystérésis d'épaisseur. */
  mpp: number
  item: TItem
}

/**
 * Base des couches **drapées sur le globe** : formes, tracés, liens. Porte tout le
 * protocole de drapage, qui était recopié à l'identique dans chaque couche —
 * notamment le câblage des huit callbacks de `DrapeSync`, mot pour mot, trois fois.
 *
 * Une sous-classe ne déclare plus que ce qui la distingue vraiment :
 * l'ancre de ses items (`anchorOf`), la construction de sa géométrie (`buildDrape`),
 * et éventuellement un travail par frame (`onUpdate`) ou une libération propre
 * (`onDropDrape`).
 *
 * Le protocole lui-même (raffinement LOD par lots, rebuild individuel au
 * franchissement de la bande d'épaisseur, réapplication des bases au rebase, purge
 * des drapes devenus invalides) reste dans `core/resettle` : cette classe n'en est
 * que le point de branchement.
 */
export abstract class DrapedLayer<TItem, TDrape extends Drape<TItem> = Drape<TItem>> implements Layer {
  readonly group = new THREE.Group()
  protected readonly drapes: TDrape[] = []
  private readonly sync: DrapeSync
  /** Caméra de la dernière frame — `null` avant le premier `update` (mpp = 1). */
  protected lastCamera: THREE.Camera | null = null
  protected viewH = 1

  constructor(
    /** Parent — `engine.annotations` pour hériter du masquage pendant l'intro. */
    protected readonly scene: THREE.Object3D,
    protected readonly projection: Projection,
    /** Nom du groupe Three (lisible dans un inspecteur de scène). */
    groupName: string,
  ) {
    this.group.name = groupName
    this.scene.add(this.group)
    // Accesseur et non valeur figée : `setConfig` remplace l'arbre, et le protocole
    // de drapage relit ses budgets à chaque frame.
    this.sync = new DrapeSync(
      projection,
      {
        count: () => this.drapes.length,
        getHeight: (i) => this.drapes[i]!.height,
        setHeight: (i, h) => {
          this.drapes[i]!.height = h
        },
        resolve: (i) => this.projection.resolveAnchorHeight(this.drapes[i]!.anchor),
        mppRatio: (i) => {
          const d = this.drapes[i]!
          return this.mpp(d.anchor, this.heightOf(d)) / d.mpp
        },
        rebuild: (i) => this.rebuildDrape(i),
        remove: (i) => this.dropDrape(i),
        applyBasis: (i) => {
          const d = this.drapes[i]!
          this.projection.enuBasisFor(d.anchor, d.enu.matrix, this.heightOf(d))
          d.enu.matrixWorldNeedsUpdate = true
        },
      },
      () => this.config,
    )
  }

  /**
   * Réglages courants, posés par la couche React — même patron que `DrawLayer`.
   * `defaultConfig` tant que rien n'est posé : le core reste utilisable seul.
   */
  config: MapConfig = defaultConfig

  setConfig(config: MapConfig): void {
    this.config = config
  }

  /** Vue au ras du sol — cf. `Layer.setGrounded` et `GroundedState`. */
  private readonly grounded = new GroundedState()

  /**
   * Test de profondeur à donner aux matériaux PLATS, à relire dans chaque `buildDrape`.
   *
   * Volumes et arêtes n'en dépendent pas : ils testent toujours la profondeur (cf.
   * `volumeMaterial`, `edgeMaterial`). Les confondre est ce qui rendait un balayage
   * global faux dans un sens comme dans l'autre.
   */
  protected get flatDepthTest(): boolean {
    return this.grounded.active
  }

  setGrounded(grounded: boolean): void {
    if (!this.grounded.set(grounded)) return
    /**
     * On RECONSTRUIT plutôt que de retoucher les matériaux en place : `buildDrape` est
     * alors le seul endroit qui décide de la profondeur, et il n'existe pas de second
     * chemin susceptible de diverger. Retoucher aurait de toute façon laissé passer les
     * drapes reconstruits ensuite par le resettle — le défaut même qu'on corrige ici.
     *
     * Deux fois par session piétonne (entrée, sortie), jamais par frame.
     */
    for (let i = this.drapes.length - 1; i >= 0; i--) {
      if (this.rebuildDrape(i)) continue
      this.dropDrape(i) // Échec = drape devenu invalide.
    }
  }

  /** Retire un drape : libère son hors-scène (étiquette DOM…) puis le sort de la liste. */
  private dropDrape(i: number): void {
    this.onDropDrape?.(this.drapes[i]!)
    this.drapes.splice(i, 1)
  }

  /** Ancre géo d'un item : origine de son repère ENU. Doit tolérer un item vide. */
  protected abstract anchorOf(item: TItem): LatLng

  /**
   * Construit le groupe drapé d'un item. `height` null = non résolue : utiliser
   * `heightOr(height)` pour la géométrie, et **conserver le null** dans le drape
   * renvoyé — c'est lui qui maintient la fenêtre de re-échantillonnage ouverte.
   * Renvoie null si l'item n'est pas représentable (moins de 2 points, etc.).
   *
   * `previous` n'est fourni QUE lors d'un rebuild : il permet de **transférer** au
   * nouveau drape un état hors-scène qu'il serait faux de recréer (typiquement une
   * étiquette DOM — un élément recréé à la cadence du rebuild clignoterait, perdrait
   * son `:hover` et se déroberait sous le curseur). Sa géométrie, elle, est déjà
   * libérée à cet instant : n'y toucher plus.
   */
  protected abstract buildDrape(item: TItem, height: number | null, previous?: TDrape): TDrape | null

  /** Travail par frame propre à la couche (animations), après la synchro du drapage. */
  protected onUpdate?(ctx: FrameContext): void

  /** Libération d'un drape retiré (étiquette DOM, ressource hors scène). */
  protected onDropDrape?(drape: TDrape): void

  /** Hauteur exploitable d'un drape : la résolue, ou le repli de surface. */
  protected heightOf(d: TDrape): number {
    return d.height ?? this.projection.surfaceFallbackHeight
  }

  /** Idem depuis une hauteur brute — à utiliser dans `buildDrape`. */
  protected heightOr(height: number | null): number {
    return height ?? this.projection.surfaceFallbackHeight
  }

  /** Résolution courante (m/px) à une ancre — 1 tant que la caméra est inconnue. */
  protected mpp(anchor: LatLng, height: number): number {
    if (!this.lastCamera) return 1
    return this.projection.metersPerPixel(anchor, this.lastCamera, this.viewH, height)
  }

  /**
   * Reconstruit toute la couche depuis son jeu d'items. À appeler par les setters de
   * la sous-classe (`setShapes`, `setPaths`, `setDefaults`…).
   */
  protected rebuildAll(items: readonly TItem[]): void {
    clearGroup(this.group)
    this.drapes.length = 0
    if (!this.projection.isReady()) return
    for (const item of items) {
      const d = this.buildDrape(item, this.projection.resolveAnchorHeight(this.anchorOf(item)))
      if (!d) continue
      this.drapes.push(d)
      this.group.add(d.enu)
    }
    // Les tuiles fines de la zone arrivent en streaming : re-échantillonnage à suivre.
    this.sync.invalidate()
  }

  /**
   * Reconstruit UN drape (bande d'épaisseur franchie) en réutilisant sa hauteur
   * mémoïsée — pas de raycast, pas de rebuild global. false = devenu invalide.
   */
  protected rebuildDrape(i: number): boolean {
    const old = this.drapes[i]!
    disposeObject3D(old.enu)
    this.group.remove(old.enu)
    const d = this.buildDrape(old.item, old.height, old)
    // Échec : `DrapeSync` enchaîne sur `remove(i)`, donc `onDropDrape` libérera
    // l'état hors-scène de l'ancien drape — rien à défaire ici.
    if (!d) return false
    this.drapes[i] = d
    this.group.add(d.enu)
    return true
  }

  /** Force un re-échantillonnage des hauteurs (ancre déplacée, données changées). */
  protected invalidateDrapes(): void {
    this.sync.invalidate()
  }

  update(ctx: FrameContext): void {
    this.lastCamera = ctx.camera
    this.viewH = ctx.size.height
    if (this.projection.isReady()) this.sync.update(ctx.cameraState)
    // Recalage en cours : les drapes se reposent sur la surface au fil du streaming, donc
    // l'image change encore sans que rien d'autre ne bouge.
    if (this.sync.active) ctx.invalidate()
    this.onUpdate?.(ctx)
  }

  /** Passe écran (overlays 2D). Vide par défaut : la plupart des couches drapées
   *  n'ont rien à repositionner en pixels. */
  project(_ctx: FrameContext): void {}

  dispose(): void {
    for (const d of this.drapes) this.onDropDrape?.(d)
    clearGroup(this.group)
    this.drapes.length = 0
    this.scene.remove(this.group)
  }
}

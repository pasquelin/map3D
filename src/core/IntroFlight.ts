import type { MapConfig } from '../config/types'
import type { LatLng } from '../shared'
import type { MapMode } from './basemap'
import type { Camera } from './Camera'
import type { Projection } from './Projection'
import type { TilesRenderer } from '3d-tiles-renderer'

/**
 * Dépendances injectées par le moteur. Références stables (caméra, tuiles, projection)
 * passées directement ; état mutable (config, mode, terrain) lu via getter pour rester
 * live ; effets côté moteur (overlays, émission de `ready`) passés en callback — d'où
 * l'ABSENCE de dépendance au type `MapEngine` (pas de cycle, pas d'accès à ses privés).
 */
export type IntroDeps = {
  camera: Camera
  tiles: TilesRenderer
  projection: Projection
  config: () => MapConfig
  mapMode: () => MapMode
  terrainElevation: () => number
  terrainKnown: () => boolean
  setOverlaysVisible: (visible: boolean) => void
  emitReady: () => void
}

/**
 * Machine à états du vol de démarrage façon Google Earth + garde-fou d'émission de `ready`.
 *
 * `flying=false` = en attente du terrain streamé (bornée par `startup.introMaxWaitMs`) ;
 * `flying=true` = descente en cours, destination affinée chaque frame
 * (`retargetFlyAltitude`) au fil du raffinement des tuiles. `null` = terminé ou annulé.
 * L'intro **s'efface devant tout autre pilotage caméra** (interaction, flyTo
 * programmatique, suivi) — elle ne vole jamais la main. `ready` n'est émis qu'UNE fois
 * (garde `readyEmitted`), avec la même condition « terrain touché + file de tuiles vidée »
 * qui décide du décollage.
 */
export class IntroFlight {
  private intro: { center: LatLng; altitude: number; flying: boolean; startedAt: number } | null = null
  private readyEmitted = false
  /** Origine du garde-fou d'attente de `ready` (posé par le moteur à `start()`). */
  private startedAt = 0

  constructor(private readonly deps: IntroDeps) {}

  /** Intro encore active (attente du terrain ou descente en cours). */
  get active(): boolean {
    return this.intro !== null
  }

  /** La carte est-elle exploitable ? (cf. l'event `ready`) */
  get ready(): boolean {
    return this.readyEmitted
  }

  /** En attente du terrain, décollage pas encore lancé — sonde du basculement 2D. */
  isWaitingToFly(): boolean {
    return this.intro !== null && !this.intro.flying
  }

  /**
   * Arme l'intro : vue globe déjà posée par le moteur, on attend le terrain pour décoller.
   * Masque les overlays (markers flottant sur le vide avant l'apparition du globe font désordre).
   */
  begin(center: LatLng, altitude: number): void {
    this.intro = { center, altitude, flying: false, startedAt: performance.now() }
    this.deps.setOverlaysVisible(false)
  }

  /** Fixe l'origine du garde-fou de `ready` (horodatage de `start()`), tant qu'il n'a pas été émis. */
  markStarted(time: number): void {
    if (!this.readyEmitted) this.startedAt = time
  }

  /**
   * Émet `ready` dès que la carte est exploitable, ou au bout du garde-fou.
   *
   * En 3D, « exploitable » veut dire que le terrain a été touché au moins une fois et que la
   * file de tuiles est vidée — exactement la condition qui décide du décollage de l'intro.
   * En 2D il n'y a pas de terrain à attendre : la projection suffit.
   */
  checkReady(now: number): void {
    if (this.readyEmitted) return
    const usable =
      this.deps.projection.isReady() &&
      (this.deps.mapMode() !== '3d' || (this.deps.terrainKnown() && this.deps.tiles.loadProgress >= 1))
    if (!usable && now - this.startedAt < this.deps.config().startup.readyMaxWaitMs) return
    this.readyEmitted = true
    this.deps.emitReady()
  }

  /**
   * Interrompt le vol de démarrage et révèle les overlays. **Toute prise de main doit
   * passer par là** — un geste, une entrée en piéton, ou une vue mémorisée qu'on recharge :
   * sans cet appel l'intro continue de piloter la caméra et reprend la main à la frame
   * suivante, effaçant la vue qui vient d'être posée.
   */
  cancel(): void {
    // N'annule QUE le vol d'intro : un vol de recherche/suivi qui a pris la main n'est
    // jamais tué par une interaction destinée à stopper l'intro.
    if (this.deps.camera.isFlying('intro')) this.deps.camera.cancelFly()
    this.intro = null
    this.deps.setOverlaysVisible(true)
  }

  /** Lance la descente de l'intro vers la cible, au-dessus du sol connu. */
  startFlight(): void {
    if (!this.intro || this.intro.flying) return
    this.intro.flying = true
    this.deps.camera.flyTo(
      { ...this.intro.center, altitude: this.deps.terrainElevation() + this.intro.altitude },
      { duration: this.deps.config().startup.introDuration, tag: 'intro' },
    )
  }

  /**
   * Avance la machine à états de l'intro (appelée chaque tick) : lance la descente quand le
   * terrain est connu, affine la destination pendant le vol, se termine à l'atterrissage. Le
   * vol passe par `Camera.flyTo` — le même chemin éprouvé que la recherche de lieux — jamais
   * par téléportation derrière GlobeControls. L'intro s'efface (overlays révélés) dès qu'un
   * autre pilotage caméra prend la main.
   */
  update(now: number): void {
    const intro = this.intro
    if (!intro) return
    if (!intro.flying) {
      // Un vol programmatique (recherche…) ou un suivi a pris la main pendant l'attente :
      // l'intro s'efface au lieu de l'écraser à son décollage.
      if (this.deps.camera.isControlling()) {
        this.cancel()
        return
      }
      // Décollage quand le terrain est connu ET la file de tuiles vidée (`loadProgress` = 1) :
      // la planète est visible AVANT la descente. Au-delà du délai max (tuiles en échec), on
      // part quand même avec la meilleure hauteur connue — jamais de blocage.
      const ready = this.deps.terrainKnown() && this.deps.tiles.loadProgress >= 1
      if (!ready && now - intro.startedAt < this.deps.config().startup.introMaxWaitMs) return
      this.startFlight()
      return
    }
    if (this.deps.camera.isFlying('intro')) {
      // Le sol se précise pendant la descente (LOD) → la destination suit.
      this.deps.camera.retargetFlyAltitude(this.deps.terrainElevation() + intro.altitude, 'intro')
    } else {
      // Atterri, ou remplacé par un autre vol/suivi (qui garde la main) : l'intro est finie
      // dans les deux cas — `cancel` est l'unique sortie de l'état (le cancelFly y est un
      // no-op : plus de vol taggé 'intro').
      this.cancel()
    }
  }
}

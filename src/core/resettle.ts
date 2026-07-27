import { defaultConfig } from '../config/defaultConfig'
import type { MapConfig, PerformanceConfig } from '../config/types'
import type { CameraState } from './Camera'
import type { Projection } from './Projection'

/**
 * Variation de hauteur (m) au-delà de laquelle la surface a réellement changé.
 * Reste une constante : c'est un seuil de bruit d'échantillonnage, pas un arbitrage
 * coût/qualité — l'abaisser ferait rebuild sur du bruit, l'élever raterait de vrais
 * mouvements de surface.
 */
export const HEIGHT_EPSILON = 0.5

/** Réglages de re-échantillonnage — cf. `performance.resettle`. */
export type ResettleConfig = PerformanceConfig['resettle']


/**
 * Fenêtre de re-échantillonnage des hauteurs drapées, calquée sur celle des
 * markers (`MarkerLayer.settleStatic`) : la surface photogrammétrique **change**
 * quand les tuiles se raffinent en streaming (LOD), donc une hauteur échantillonnée
 * une seule fois devient fausse de dizaines de mètres → la forme « glisse » sur la
 * carte. La fenêtre s'ouvre au mouvement caméra ou à l'ajout de formes (le
 * streaming suit immédiatement), se ferme au repos, et `batch()` cadence ~1 frame
 * sur 3 par petits lots → quelques raycasts amortis, jamais un coût permanent.
 */
export class HeightResettle {
  private frames = 0
  private tick = 0
  private cursor = 0
  private readonly last = { lat: 0, lng: 0, alt: 0 }

  /**
   * Source de config relue à chaque appel — le seuil de mouvement et les cadences
   * étaient écrits en dur ici, et les mêmes nombres l'étaient aussi dans
   * `MarkerLayer` et `MapEngine`, avec des valeurs qui avaient divergé.
   */
  constructor(private readonly cfg: () => MapConfig = () => defaultConfig) {}

  /** Ouvre (ou prolonge) la fenêtre — à appeler à l'ajout/rebuild de formes. */
  open(frames = this.cfg().performance.resettle.windowFrames): void {
    this.frames = Math.max(this.frames, frames)
  }

  /** Ferme la fenêtre (re-échantillonnage devenu inutile : hauteurs stables). */
  close(): void {
    this.frames = 0
  }

  /**
   * Ouvre la fenêtre si la caméra a bougé depuis le dernier appel, et renvoie ce
   * booléen : il sert AUSSI de garde « caméra immobile » aux appelants (les calculs
   * dépendant de la caméra — m/px, bande d'hystérésis — sont sautés au repos).
   */
  note(cam: CameraState): boolean {
    const eps = this.cfg().performance.cameraMoveEpsilon
    const moved =
      Math.abs(cam.lat - this.last.lat) > eps.deg ||
      Math.abs(cam.lng - this.last.lng) > eps.deg ||
      Math.abs(cam.altitude - this.last.alt) > Math.max(eps.altitudeMinMeters, cam.altitude * eps.altitudeRatio)
    if (moved) {
      this.open()
      this.last.lat = cam.lat
      this.last.lng = cam.lng
      this.last.alt = cam.altitude
    }
    return moved
  }

  /** Indices (round-robin, ≤ `batch`) à re-échantillonner cette frame ; [] hors cadence. */
  batch(count: number, batch = this.cfg().performance.resettle.batch): number[] {
    if (count === 0 || this.frames <= 0) return []
    this.frames--
    if (++this.tick % this.cfg().performance.resettle.everyNFrames !== 0) return []
    const k = Math.min(batch, count)
    const out: number[] = []
    for (let i = 0; i < k; i++) out.push((this.cursor + i) % count)
    this.cursor = (this.cursor + k) % count
    return out
  }
}

/**
 * Accès d'un layer à ses éléments drapés, par index. `rebuild` renvoie false quand
 * l'élément est devenu invalide — `remove` est alors appelé et l'index re-visité.
 */
export type DrapeOps = {
  count(): number
  /** Hauteur mémoïsée de l'élément i (`null` = non résolue → repli utilisé). */
  getHeight(i: number): number | null
  setHeight(i: number, h: number | null): void
  /** Résout la hauteur de surface à l'ancre de l'élément i (`null` = tuiles absentes). */
  resolve(i: number): number | null
  /** Ratio résolution m/px courante / celle du dernier build (épaisseur px écran). */
  mppRatio(i: number): number
  /** Reconstruit l'élément i (bande d'épaisseur franchie) ; false = devenu invalide. */
  rebuild(i: number): boolean
  remove(i: number): void
  /** Recale la base ENU de l'élément i. */
  applyBasis(i: number): void
}

/**
 * Protocole complet de synchronisation des éléments drapés, partagé par les layers
 * (Shape/Path — DrawLayer garde une variante keyée par id mais les mêmes constantes) :
 *
 * 1. bascule 2D/3D (`Projection.heightEpoch`) → toutes les hauteurs invalidées ;
 * 2. garde « caméra immobile » (`note`) : bande d'épaisseur sautée au repos ;
 * 3. raffinement LOD par lots amortis, fermeture anticipée après un cycle stable ;
 * 4. ancres jamais résolues retentées à basse cadence (pas de fenêtre permanente) ;
 * 5. bande d'hystérésis ±25 % → rebuild INDIVIDUEL ;
 * 6. bases ENU recalées au rebase du tileset (`groupEpoch`) ou au changement de
 *    hauteur seulement — zéro travail par frame carte immobile.
 */
export class DrapeSync {
  private readonly resettle: HeightResettle
  private heightEpoch = -1
  private groupEpochSeen = -1
  private stableRuns = 0
  private retryTick = 0

  constructor(
    private readonly projection: Projection,
    private readonly ops: DrapeOps,
    /**
     * Config complète relue à chaque frame (elle change à chaud). Complète et non
     * seulement `performance.resettle` : la fenêtre de re-échantillonnage a aussi
     * besoin du seuil de mouvement caméra, qui vit à côté et qu'elle codait en dur.
     */
    private readonly cfg: () => MapConfig = () => defaultConfig,
  ) {
    this.resettle = new HeightResettle(cfg)
  }

  private perf(): ResettleConfig {
    return this.cfg().performance.resettle
  }

  /** À appeler après un (re)build d'éléments : rouvre la fenêtre de re-échantillonnage. */
  invalidate(): void {
    this.resettle.open()
    this.stableRuns = 0
  }

  /** Avance le protocole — à appeler chaque frame depuis `update()` du layer. */
  update(cam: CameraState): void {
    const ops = this.ops
    const perf = this.perf()
    let heightsChanged = false

    // Bascule 2D/3D : la surface de référence change → tout est à re-résoudre.
    if (this.heightEpoch !== this.projection.heightEpoch) {
      this.heightEpoch = this.projection.heightEpoch
      for (let i = 0, n = ops.count(); i < n; i++) ops.setHeight(i, null)
      this.invalidate()
      heightsChanged = true
    }
    const camMoved = this.resettle.note(cam)
    if (camMoved) this.stableRuns = 0

    // Raffinement LOD par lots amortis.
    for (const i of this.resettle.batch(ops.count())) {
      if (this.refine(i)) heightsChanged = true
    }
    // Cycle complet sans changement → surfaces stables, fenêtre fermée tôt.
    const n = ops.count()
    if (n > 0 && this.stableRuns >= n) {
      this.resettle.close()
      this.stableRuns = 0
    }
    // Ancres jamais résolues : retentative à basse cadence, ciblée sur elles seules.
    if (++this.retryTick % perf.retryFrames === 0) {
      for (let i = 0; i < ops.count(); i++) {
        if (ops.getHeight(i) === null && this.refine(i)) heightsChanged = true
      }
    }
    // Bande d'épaisseur px : ne peut bouger que si caméra/hauteurs ont bougé.
    if (camMoved || heightsChanged) {
      for (let i = 0; i < ops.count(); i++) {
        const r = ops.mppRatio(i)
        if (r > perf.mppBand || r < 1 / perf.mppBand) {
          if (!ops.rebuild(i)) {
            ops.remove(i)
            i--
          }
        }
      }
    }
    // Bases ENU : rebase du tileset ou changement de hauteur seulement.
    const gEpoch = this.projection.groupEpoch()
    if (gEpoch !== this.groupEpochSeen || heightsChanged) {
      this.groupEpochSeen = gEpoch
      for (let i = 0, m = ops.count(); i < m; i++) ops.applyBasis(i)
    }
  }

  /** Re-résout l'élément i ; true si sa hauteur a réellement changé. */
  private refine(i: number): boolean {
    const h = this.ops.resolve(i)
    if (h === null) return false
    const prev = this.ops.getHeight(i)
    if (prev === null || Math.abs(h - prev) > HEIGHT_EPSILON) {
      this.ops.setHeight(i, h)
      this.stableRuns = 0
      return true
    }
    this.stableRuns++
    return false
  }
}

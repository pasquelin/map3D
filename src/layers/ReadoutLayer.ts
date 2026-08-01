import * as THREE from 'three'
import { headingFromForward, projectViewForward, tiltFromNadir } from '../core/enu'
import type { FrameContext, Layer } from '../core/Layer'
import { zoomForAltitude } from '../core/math'
import type { ReadoutField, ReadoutFormatter } from '../labels/readout'
import { setText } from './setText'

/** Cellules de valeur du bloc, écrites par cette couche. Absente ou `null` = non affichée. */
export type ReadoutCells = Partial<Record<ReadoutField, HTMLElement | null>>

/**
 * Couche qui alimente le bloc de lecture de la vue (`<CameraReadout>`).
 *
 * **Pourquoi une couche et non un abonnement à l'événement `camera`** : cet événement
 * porte un seuil MÉTIER qui ignore délibérément l'orientation (cf. `MapEngine.hasMoved`)
 * — tourner sur place ne change ni lat, ni lng, ni altitude, donc rien n'est émis. Un
 * cap branché dessus resterait figé pendant toute une rotation, précisément le geste
 * qu'on le regarde faire. La passe `project()`, elle, voit chaque frame.
 *
 * C'est aussi sa place naturelle : `project()` EST la passe d'écriture DOM de la lib,
 * après toutes les lectures — le bloc y écrit son texte comme `MarkerLayer` y écrit ses
 * `translate3d`.
 *
 * Deux gardes, dans cet ordre, parce que `project()` est appelé à chaque frame de la
 * boucle même quand rien n'est peint :
 * 1. la **cadence** (`intervalMs`), qui borne les écritures à ce que l'œil peut suivre ;
 * 2. la **matrice caméra**, qui coupe tout quand la vue n'a pas bougé — sans elle, une
 *    carte immobile reformaterait cinq valeurs identiques huit fois par seconde,
 *    indéfiniment. Elle porte l'orientation, ce que `cameraState` ne fait pas.
 *
 * La cadence n'est PAS remise à zéro quand la seconde garde coupe : le premier mouvement
 * après une pause s'affiche donc immédiatement, sans attendre un tour de cadence.
 */
export class ReadoutLayer implements Layer {
  private cells: ReadoutCells
  private format: ReadoutFormatter
  private intervalMs: number
  private lastWrite = Number.NEGATIVE_INFINITY
  /** Aucune matrice mémorisée encore : la toute première frame doit écrire. */
  private primed = false

  // Scratch réutilisés : cette couche ne doit rien allouer par frame. `EnuFrame` en
  // construirait sept (l'instance et six vecteurs) pour n'en lire que trois.
  private readonly origin = new THREE.Vector3()
  private readonly east = new THREE.Vector3()
  private readonly north = new THREE.Vector3()
  private readonly up = new THREE.Vector3()
  private readonly forward = new THREE.Vector3()
  private readonly lastMatrix = new THREE.Matrix4()

  constructor(cells: ReadoutCells, format: ReadoutFormatter, intervalMs: number) {
    this.cells = cells
    this.format = format
    this.intervalMs = intervalMs
  }

  /** Nouveaux libellés (langue, unités, décimales) : la prochaine frame réécrit tout. */
  setFormat(format: ReadoutFormatter): void {
    this.format = format
    this.primed = false
  }

  setInterval(intervalMs: number): void {
    this.intervalMs = intervalMs
  }

  /** Grandeurs affichées : les cellules changent quand `fields` change. */
  setCells(cells: ReadoutCells): void {
    this.cells = cells
    this.primed = false
  }

  update(): void {}

  project(ctx: FrameContext): void {
    const now = performance.now()
    if (now - this.lastWrite < this.intervalMs) return
    if (this.primed && this.lastMatrix.equals(ctx.camera.matrixWorld)) return
    this.lastMatrix.copy(ctx.camera.matrixWorld)
    this.primed = true
    this.lastWrite = now

    const c = this.cells
    const s = ctx.cameraState
    // Chaque garde évite un formatage `Intl` : une grandeur non déclarée n'est pas
    // seulement invisible, elle n'est pas calculée.
    if (c.altitude) setText(c.altitude, this.format.altitude(s.altitude))
    if (c.latitude) setText(c.latitude, this.format.coord(s.lat))
    if (c.longitude) setText(c.longitude, this.format.coord(s.lng))
    if (c.zoom) setText(c.zoom, this.format.zoom(zoomForAltitude(s.altitude)))

    // Cap et inclinaison se lisent sur la MATRICE, jamais dans `cameraState` :
    // `getState()` les rend tous deux nuls. Même règle que `Camera.getPose` et l'entrée
    // en piéton — d'où les helpers partagés, pour que producteur et lecteur ne divergent
    // pas de 90°. Les axes ENU leur servent aux deux : une seule lecture pour la paire.
    if (c.heading || c.tilt) {
      ctx.projection.getENUAxes(s, this.origin, this.east, this.north, this.up)
      if (c.tilt) setText(c.tilt, this.format.tilt(tiltFromNadir(ctx.camera.matrixWorld, this.up, this.forward)))
      if (c.heading) {
        // APRÈS l'inclinaison : les deux se partagent le scratch `forward`, et seul le cap
        // a besoin que la visée y survive jusqu'au `headingFromForward`.
        const forward = projectViewForward(ctx.camera.matrixWorld, this.up, this.forward)
        setText(c.heading, this.format.heading(headingFromForward(forward, this.east, this.north)))
      }
    }
  }

  /** Les cellules appartiennent à React, qui les démonte : rien à libérer ici. */
  dispose(): void {}
}

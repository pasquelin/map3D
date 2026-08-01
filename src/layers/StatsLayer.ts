// Couche qui alimente le panneau de diagnostic (`<StatsPanel>`).
//
// Même marché que `ReadoutLayer`, et pour la même raison : React pose le DOM une fois,
// le moteur l'écrit. Un panneau de performance rafraîchi par `useState` re-rendrait un
// arbre entier plusieurs fois par seconde — il deviendrait le poste le plus coûteux de
// la carte, dans un panneau dont le rôle est justement de dire qui coûte cher.
//
// Le partage du travail avec `ReadoutLayer` est délibéré : les grandeurs de CAMÉRA
// restent à sa charge (il sait déjà les calculer, y compris le cap et l'inclinaison que
// l'événement `camera` ignore), et cette couche ne porte que le diagnostic. Le panneau
// monte les deux et leur donne des cellules distinctes — aucune logique n'est recopiée.

import type { MapConfig } from '../config/types'
import type { FrameContext, Layer } from '../core/Layer'
import { type StatField, statLevel, type ViewStats } from '../core/viewStats'
import type { StatFormatter } from '../labels/stats'

/** Cellules de valeur du panneau. Absente ou `null` = grandeur non affichée. */
export type StatCells = Partial<Record<StatField, HTMLElement | null>>

/** Écrit une valeur en évitant le reflow d'une écriture identique (le cas le plus fréquent). */
const setText = (el: HTMLElement, text: string): void => {
  if (el.textContent !== text) el.textContent = text
}

/** Classe de verdict posée sur la cellule — le CSS la relie aux teintes du thème. */
const LEVEL_CLASS = { ok: 'm3d-stat-ok', warn: 'm3d-stat-warn', bad: 'm3d-stat-bad' } as const

/** Classe de mise en forme de la valeur, posée par le composant et jamais retirée. */
const BASE_CLASS = 'm3d-stat'

export class StatsLayer implements Layer {
  private cells: StatCells
  private format: StatFormatter
  private intervalMs: number
  private config: MapConfig
  private lastWrite = Number.NEGATIVE_INFINITY
  /**
   * Instantané RÉUTILISÉ d'un rafraîchissement à l'autre : `viewStats` écrit dedans plutôt
   * que de rendre un objet neuf. Un panneau de diagnostic qui alloue à chaque passage
   * fausse ce qu'il affiche.
   */
  private readonly snapshot: ViewStats = {}
  /** Dernier verdict écrit par cellule — évite de retoucher `className` sans changement. */
  private readonly levels = new Map<StatField, string>()

  constructor(
    cells: StatCells,
    format: StatFormatter,
    intervalMs: number,
    config: MapConfig,
    /**
     * Lecture de l'instantané. Injectée plutôt que prise sur `FrameContext` : celui-ci ne
     * porte pas le moteur, et une couche n'a pas à remonter jusqu'à lui pour lire un
     * compteur.
     */
    private readonly read: (out: ViewStats) => ViewStats,
  ) {
    this.cells = cells
    this.format = format
    this.intervalMs = intervalMs
    this.config = config
  }

  setConfig(config: MapConfig): void {
    this.config = config
  }

  /** Réglages vivants du panneau — remplacés à chaud quand les libellés changent. */
  setCells(cells: StatCells, format: StatFormatter, intervalMs: number): void {
    this.cells = cells
    this.format = format
    this.intervalMs = intervalMs
    // La prochaine passe doit écrire, même si la cadence n'est pas échue : les cellules
    // viennent d'être remplacées et sont vides.
    this.lastWrite = Number.NEGATIVE_INFINITY
    this.levels.clear()
  }

  update(): void {}

  /**
   * Écrit les valeurs, à cadence bornée.
   *
   * Une seule garde ici, là où `ReadoutLayer` en a deux : la matrice caméra ne dit rien de
   * ces grandeurs-là. Un compte de tuiles, une cadence ou une mémoire changent carte
   * immobile — c'est même le cas qu'on regarde le plus (le chargement en cours).
   *
   * La collecte elle-même est derrière la cadence : tant que le panneau est fermé, la
   * couche n'est pas montée, et ouverte elle ne coûte que quelques lectures par seconde.
   */
  project(_ctx: FrameContext): void {
    const now = performance.now()
    if (now - this.lastWrite < this.intervalMs) return
    this.lastWrite = now

    const stats = this.read(this.snapshot)
    const thresholds = this.config.performance.statThresholds
    for (const key of Object.keys(this.cells) as StatField[]) {
      const el = this.cells[key]
      if (!el) continue
      const value = stats[key]
      if (value === undefined) continue
      setText(el, this.format.field(key, value))
      // Une grandeur SANS seuil ne porte pas de verdict : pas de couleur plutôt qu'un vert
      // qui affirmerait que tout va bien d'un compte de textures.
      const next = thresholds[key] ? LEVEL_CLASS[statLevel(value, thresholds[key])] : ''
      if (this.levels.get(key) === next) continue
      this.levels.set(key, next)
      // COMPOSÉE, jamais écrasée : `m3d-stat` porte la mise en forme de la valeur, le
      // verdict n'est qu'une couleur par-dessus.
      el.className = next ? `${BASE_CLASS} ${next}` : BASE_CLASS
    }
  }

  dispose(): void {
    this.levels.clear()
  }
}

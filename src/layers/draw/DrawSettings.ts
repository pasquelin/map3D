import { defaultConfig } from '../../config/defaultConfig'
import { MEASURE_STROKE_OPACITY } from '../../core/geometry'
import type { DrawTool, StrokeStyle } from '../DrawLayer'

/** Réglages complets d'un outil de dessin (défauts des prochaines formes). */
export type ToolSettings = {
  color: string
  fillColor?: string
  width: number
  fillOpacity: number
  /** Opacité de la bordure (0.95 par défaut). */
  strokeOpacity?: number
  stroke: StrokeStyle
  /** Rectangles : rayon d'angle en % du petit côté (0–50). */
  radius?: number
}

const STORAGE_VERSION = 1

type Overrides = Partial<Record<DrawTool, Partial<ToolSettings>>>

/** Particularités par outil, SOUS les overrides utilisateur — unique point de vérité
 *  (la règle est une cote fine et discrète, pas un trait de dessin). */
const TOOL_BASE: Overrides = {
  measure: { width: 2, strokeOpacity: MEASURE_STROKE_OPACITY },
}

/**
 * Réglages **par outil**, persistés en localStorage (même pattern que TagFilter) :
 * fusion base (thème/props) < overrides utilisateur. Chaque outil garde ses
 * propres couleur/épaisseur/style de trait/opacité (+ rayon pour le rectangle) —
 * la règle a une épaisseur fine par défaut. Réactif via `onChange` (branché sur
 * `useSyncExternalStore` côté React).
 */
export class DrawSettings {
  private overrides: Overrides = {}
  private readonly listeners = new Set<() => void>()
  /** Compteur incrémenté à chaque changement — snapshot pour useSyncExternalStore. */
  version = 0

  constructor(
    private base: ToolSettings,
    private readonly storage: Storage | null,
    /** Clé de persistance — à distinguer si plusieurs cartes cohabitent. */
    private readonly storageKey: string = defaultConfig.data.storageKeys.drawSettings,
  ) {
    this.load()
  }

  /** Base issue du thème/props (sous les overrides persistés). */
  setBase(base: ToolSettings): void {
    this.base = base
    this.bump()
  }

  /** Réglages effectifs d'un outil (base thème < particularités outil < overrides). */
  get(tool: DrawTool): ToolSettings {
    return { ...this.base, ...TOOL_BASE[tool], ...this.overrides[tool] }
  }

  set(tool: DrawTool, patch: Partial<ToolSettings>): void {
    this.overrides[tool] = { ...this.overrides[tool], ...patch }
    this.persist()
    this.bump()
  }

  /** Remise aux défauts d'un outil, ou de tous (sans argument). */
  reset(tool?: DrawTool): void {
    if (tool) delete this.overrides[tool]
    else this.overrides = {}
    this.persist()
    this.bump()
  }

  /** true si l'outil a des réglages personnalisés (badge « modifié »). */
  isCustomized(tool: DrawTool): boolean {
    const o = this.overrides[tool]
    return !!o && Object.keys(o).length > 0
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private bump(): void {
    this.version++
    for (const cb of this.listeners) cb()
  }

  private persist(): void {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify({ v: STORAGE_VERSION, tools: this.overrides }))
    } catch {
      // Stockage indisponible (quota, navigation privée) : réglages non persistés.
    }
  }

  private load(): void {
    try {
      const raw = this.storage?.getItem(this.storageKey)
      if (!raw) return
      const data = JSON.parse(raw) as { v: number; tools: Overrides }
      if (data.v === STORAGE_VERSION && data.tools && typeof data.tools === 'object') {
        this.overrides = data.tools
      }
    } catch {
      // JSON corrompu : on repart des défauts.
    }
  }
}

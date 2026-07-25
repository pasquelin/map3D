import type { PointerPhase } from '../../core/MapEngine'
import type { LatLng } from '../../shared'
import type { Drawing } from '../DrawLayer'
import { type ScreenPt, shapeTouchesSelector } from './hitTest'

/** Mode de l'outil sélection : marquee rectangle, polygone à clics, ou lasso libre. */
export type SelectMode = 'rect' | 'poly' | 'lasso'

/** Contrat fourni par DrawLayer (accès contrôlé — pas de structures privées). */
export type SelectHost = {
  list(): readonly Drawing[]
  hitTest(p: LatLng, tolPx?: number): Drawing | null
  screenContour(d: Drawing): { pts: ScreenPt[]; closed: boolean } | null
  isSelectable(d: Drawing): boolean
  onLockedHit(d: Drawing): void
  /** La sélection a changé (notifie l'app + resync overlay). */
  selectionChanged(): void
  /** Coordonnées canvas (px) d'un événement pointeur. */
  eventToScreen(e: PointerEvent): ScreenPt
  /** Un drag commence sur le corps d'une forme sélectionnée → bascule en édition. */
  beginBodyDrag?(latLng: LatLng | null): boolean
}

const CLICK_SLOP_PX = 4
const CLOSE_SNAP_PX = 16
const LASSO_MIN_STEP_PX = 3

/**
 * Sélection des dessins : clic simple (Maj = toggle), marquee rectangle/polygone/
 * lasso avec sémantique « touche = sélectionné » (façon Figma). Machine à états
 * pilotée par l'interceptor de DrawLayer quand l'outil `select` est actif.
 */
export class SelectionManager {
  mode: SelectMode = 'rect'

  private readonly sel = new Set<string>()
  private pressed: { id: string; additive: boolean; start: ScreenPt; dragging: boolean } | null = null
  /** Tracé du sélecteur en cours (px canvas). `poly` = mode clics (persiste entre up/down). */
  private marqueePts: ScreenPt[] | null = null
  private marqueeKind: SelectMode = 'rect'
  private marqueeAdditive = false

  constructor(private readonly host: SelectHost) {}

  get ids(): string[] {
    return [...this.sel]
  }

  has(id: string): boolean {
    return this.sel.has(id)
  }

  get size(): number {
    return this.sel.size
  }

  /** Remplace la sélection (les formes non sélectionnables sont filtrées). */
  set(ids: readonly string[]): void {
    const valid = new Set<string>()
    for (const d of this.host.list()) {
      if (ids.includes(d.id) && this.host.isSelectable(d)) valid.add(d.id)
    }
    if (sameSet(valid, this.sel)) return
    this.sel.clear()
    for (const id of valid) this.sel.add(id)
    this.host.selectionChanged()
  }

  clear(): void {
    if (this.sel.size === 0) return
    this.sel.clear()
    this.host.selectionChanged()
  }

  /** Retire les ids disparus ou devenus non sélectionnables (undo, filtre tags…). */
  prune(): void {
    const alive = new Set<string>()
    for (const d of this.host.list()) if (this.host.isSelectable(d)) alive.add(d.id)
    let changed = false
    for (const id of [...this.sel]) {
      if (!alive.has(id)) {
        this.sel.delete(id)
        changed = true
      }
    }
    if (changed) this.host.selectionChanged()
  }

  /** Tracé du sélecteur en cours pour l'overlay (null hors marquee). */
  marquee(): { pts: ScreenPt[]; kind: SelectMode } | null {
    return this.marqueePts && this.marqueePts.length > 1 ? { pts: this.marqueePts, kind: this.marqueeKind } : null
  }

  /**
   * Échap en cascade : annule le marquee en cours, sinon vide la sélection.
   * Renvoie true si consommé (le caller ne doit alors PAS quitter l'outil).
   */
  escape(): boolean {
    if (this.marqueePts) {
      this.marqueePts = null
      this.host.selectionChanged()
      return true
    }
    if (this.sel.size > 0) {
      this.clear()
      return true
    }
    return false
  }

  /** Entrée : ferme le marquee polygone en cours. */
  closeMarquee(): boolean {
    if (this.marqueePts && this.marqueeKind === 'poly') {
      this.finalizeMarquee()
      return true
    }
    return false
  }

  handle(phase: PointerPhase, latLng: LatLng | null, e: PointerEvent): boolean {
    const s = this.host.eventToScreen(e)
    if (phase === 'down') return this.onDown(s, latLng, e)
    if (phase === 'move') return this.onMove(s, latLng)
    return this.onUp()
  }

  private onDown(s: ScreenPt, latLng: LatLng | null, e: PointerEvent): boolean {
    // Marquee polygone en cours : chaque clic pose un sommet, clic près du 1er ferme.
    if (this.marqueePts && this.marqueeKind === 'poly') {
      const first = this.marqueePts[0]!
      if (this.marqueePts.length > 3 && Math.hypot(s.x - first.x, s.y - first.y) < CLOSE_SNAP_PX) {
        this.finalizeMarquee()
      } else {
        this.marqueePts.push(s)
      }
      return true
    }
    const hit = latLng ? this.host.hitTest(latLng) : null
    if (hit?.locked) {
      this.host.onLockedHit(hit)
      return true
    }
    if (hit && this.host.isSelectable(hit)) {
      this.pressed = { id: hit.id, additive: e.shiftKey, start: s, dragging: false }
      return true
    }
    // Clic dans le vide → démarre un sélecteur (drag pour rect/lasso, clics pour poly).
    this.marqueeAdditive = e.shiftKey
    this.marqueeKind = this.mode
    this.marqueePts = this.mode === 'poly' ? [s, { ...s }] : [s]
    return true
  }

  private onMove(s: ScreenPt, latLng: LatLng | null): boolean {
    if (this.pressed) {
      if (!this.pressed.dragging && Math.hypot(s.x - this.pressed.start.x, s.y - this.pressed.start.y) > CLICK_SLOP_PX) {
        this.pressed.dragging = true
        // Drag du corps : sélectionne la forme si besoin puis délègue à l'édition.
        if (!this.pressed.additive && !this.sel.has(this.pressed.id)) this.set([this.pressed.id])
        if (this.host.beginBodyDrag?.(latLng)) this.pressed = null
      }
      return true
    }
    if (!this.marqueePts) return true
    if (this.marqueeKind === 'rect') {
      const a = this.marqueePts[0]!
      this.marqueePts = [a, { x: s.x, y: a.y }, s, { x: a.x, y: s.y }]
    } else if (this.marqueeKind === 'lasso') {
      const last = this.marqueePts[this.marqueePts.length - 1]!
      if (Math.hypot(s.x - last.x, s.y - last.y) > LASSO_MIN_STEP_PX) this.marqueePts.push(s)
    } else {
      // poly : le dernier sommet est l'élastique qui suit le curseur.
      this.marqueePts[this.marqueePts.length - 1] = s
    }
    return true
  }

  private onUp(): boolean {
    if (this.pressed) {
      const { id, additive, dragging } = this.pressed
      this.pressed = null
      if (!dragging) {
        if (additive) {
          if (this.sel.has(id)) this.sel.delete(id)
          else this.sel.add(id)
          this.host.selectionChanged()
        } else {
          this.set([id])
        }
      }
      return true
    }
    if (this.marqueePts && this.marqueeKind !== 'poly') {
      // Drag minuscule = clic dans le vide → désélectionne, SAUF en mode additif
      // (Maj) : un Maj+clic raté ne détruit pas la sélection accumulée.
      if (this.marqueePts.length < 2) {
        this.marqueePts = null
        if (!this.marqueeAdditive) this.clear()
        this.host.selectionChanged()
      } else {
        this.finalizeMarquee()
      }
      return true
    }
    return true
  }

  private finalizeMarquee(): void {
    const selector = this.marqueePts
    this.marqueePts = null
    if (!selector || selector.length < 3) {
      this.host.selectionChanged()
      return
    }
    const hits: string[] = []
    for (const d of this.host.list()) {
      if (!this.host.isSelectable(d)) continue
      const contour = this.host.screenContour(d)
      if (contour && shapeTouchesSelector(contour.pts, contour.closed, selector)) hits.push(d.id)
    }
    this.set(this.marqueeAdditive ? [...this.sel, ...hits] : hits)
    // set() ne notifie que si le contenu change — resync overlay pour effacer le tracé.
    this.host.selectionChanged()
  }
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

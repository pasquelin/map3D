import type { InteractionConfig } from '../../config/types'
import type { PointerPhase } from '../../core/MapEngine'
import type { SelectableScreenItem } from '../../core/Selectables'
import type { LatLng } from '../../shared'
import type { Drawing } from '../DrawLayer'
import { pointInPolygon, type ScreenPt, shapeTouchesSelector } from './hitTest'

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
  /** Sélectionnables externes (markers) visibles, en px canvas — lu au finalize. */
  externalItems?(): SelectableScreenItem[]
  /**
   * Seuils de geste courants. Lu à CHAQUE usage plutôt que capturé au montage : la
   * config change à chaud (bascule souris ↔ tactile), et une valeur figée à la
   * construction survivrait au changement.
   */
  interaction(): InteractionConfig
}

/**
 * Sélection des dessins ET des sélectionnables externes (markers) : clic simple
 * (Maj = toggle), marquee rectangle/polygone/lasso avec sémantique « touche =
 * sélectionné » (façon Figma) ; Alt/⌘ pendant le marquee = markers seulement.
 * Machine à états pilotée par l'interceptor de DrawLayer quand l'outil `select`
 * est actif. Les markers vivent dans un Set séparé (`extSel`) : ils ne passent
 * jamais par l'édition (move/resize/rotation = formes uniquement).
 */
export class SelectionManager {
  mode: SelectMode = 'rect'

  private readonly sel = new Set<string>()
  /** Sélection externe (markers) — ids libres côté hôte, pas de namespacing. */
  private readonly extSel = new Set<string | number>()
  private pressed: { id: string; additive: boolean; start: ScreenPt; dragging: boolean } | null = null
  /** Tracé du sélecteur en cours (px canvas). `poly` = mode clics (persiste entre up/down). */
  private marqueePts: ScreenPt[] | null = null
  private marqueeKind: SelectMode = 'rect'
  private marqueeAdditive = false
  /** Alt/⌘ enfoncé pendant le marquee : seuls les markers sont pris en compte. */
  private marqueeMarkersOnly = false

  constructor(private readonly host: SelectHost) {}

  get ids(): string[] {
    return [...this.sel]
  }

  /** Ids des sélectionnables externes (markers) sélectionnés. */
  get markerIds(): (string | number)[] {
    return [...this.extSel]
  }

  has(id: string): boolean {
    return this.sel.has(id)
  }

  get size(): number {
    return this.sel.size
  }

  /**
   * Réécrit les DEUX populations sans notifier — unique endroit qui mute les
   * Sets en bloc. Renvoie true si le contenu a changé ; chaque geste appelant
   * notifie alors UNE fois (au lieu d'une notification par population).
   */
  private write(shapeIds: readonly string[], markerIds: ReadonlyArray<string | number>): boolean {
    const shapes = new Set<string>()
    for (const d of this.host.list()) {
      if (shapeIds.includes(d.id) && this.host.isSelectable(d)) shapes.add(d.id)
    }
    const markers = new Set(markerIds)
    const changed = !sameSet(shapes, this.sel) || !sameSet(markers, this.extSel)
    if (changed) {
      this.sel.clear()
      for (const id of shapes) this.sel.add(id)
      this.extSel.clear()
      for (const id of markers) this.extSel.add(id)
    }
    return changed
  }

  /** Remplace la sélection de formes (markers intacts — sert l'API publique `select`). */
  set(ids: readonly string[]): void {
    if (this.write(ids, [...this.extSel])) this.host.selectionChanged()
  }

  clear(): void {
    if (this.write([], [])) this.host.selectionChanged()
  }

  /** Clic sur un sélectionnable externe (routé par le consumer du registre). */
  pickExternal(id: string | number, additive: boolean): void {
    if (additive) {
      if (this.extSel.has(id)) this.extSel.delete(id)
      else this.extSel.add(id)
      this.host.selectionChanged()
    } else if (this.write([], [id])) {
      this.host.selectionChanged()
    }
  }

  /** Désélectionne des sélectionnables externes (croix d'un groupe de badges). */
  deselectExternal(ids: ReadonlyArray<string | number>): void {
    let changed = false
    for (const id of ids) if (this.extSel.delete(id)) changed = true
    if (changed) this.host.selectionChanged()
  }

  /** Retire les sélectionnables externes disparus (données, filtre tags…). */
  pruneExternal(isAlive: (id: string | number) => boolean): void {
    let changed = false
    for (const id of [...this.extSel]) {
      if (!isAlive(id)) {
        this.extSel.delete(id)
        changed = true
      }
    }
    if (changed) this.host.selectionChanged()
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
    if (this.sel.size > 0 || this.extSel.size > 0) {
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
    if (phase === 'move') return this.onMove(s, latLng, e)
    return this.onUp()
  }

  private onDown(s: ScreenPt, latLng: LatLng | null, e: PointerEvent): boolean {
    // Marquee polygone en cours : chaque clic pose un sommet, clic près du 1er ferme.
    if (this.marqueePts && this.marqueeKind === 'poly') {
      const first = this.marqueePts[0]!
      if (
        this.marqueePts.length > 3 &&
        Math.hypot(s.x - first.x, s.y - first.y) < this.host.interaction().closeSnapPx
      ) {
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
    this.marqueeMarkersOnly = e.altKey || e.metaKey
    this.marqueeKind = this.mode
    this.marqueePts = this.mode === 'poly' ? [s, { ...s }] : [s]
    return true
  }

  private onMove(s: ScreenPt, latLng: LatLng | null, e: PointerEvent): boolean {
    if (this.pressed) {
      if (
        !this.pressed.dragging &&
        Math.hypot(s.x - this.pressed.start.x, s.y - this.pressed.start.y) > this.host.interaction().clickSlopPx
      ) {
        this.pressed.dragging = true
        // Drag du corps : sélectionne la forme si besoin puis délègue à l'édition.
        if (!this.pressed.additive && !this.sel.has(this.pressed.id) && this.write([this.pressed.id], []))
          this.host.selectionChanged()
        if (this.host.beginBodyDrag?.(latLng)) this.pressed = null
      }
      return true
    }
    if (!this.marqueePts) return true
    // Ré-échantillonné à chaque événement : Alt/⌘ peut être pressé en cours de tracé.
    this.marqueeMarkersOnly = e.altKey || e.metaKey
    if (this.marqueeKind === 'rect') {
      const a = this.marqueePts[0]!
      this.marqueePts = [a, { x: s.x, y: a.y }, s, { x: a.x, y: s.y }]
    } else if (this.marqueeKind === 'lasso') {
      const last = this.marqueePts[this.marqueePts.length - 1]!
      if (Math.hypot(s.x - last.x, s.y - last.y) > this.host.interaction().lassoMinStepPx) this.marqueePts.push(s)
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
          if (this.write([id], [])) this.host.selectionChanged()
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
    const markersOnly = this.marqueeMarkersOnly
    this.marqueeMarkersOnly = false
    if (!selector || selector.length < 3) {
      this.host.selectionChanged()
      return
    }
    // Formes : sautées si Alt/⌘ (markers seulement). Alt filtre ce que le
    // sélecteur voit ; la sémantique remplace/ajoute reste portée par Maj seul.
    const hits: string[] = []
    if (!markersOnly) {
      for (const d of this.host.list()) {
        if (!this.host.isSelectable(d)) continue
        const contour = this.host.screenContour(d)
        if (contour && shapeTouchesSelector(contour.pts, contour.closed, selector)) hits.push(d.id)
      }
    }
    // Markers : un point est « touché » s'il est DANS le sélecteur.
    const extHits: (string | number)[] = []
    for (const it of this.host.externalItems?.() ?? []) {
      if (pointInPolygon({ x: it.x, y: it.y }, selector)) extHits.push(it.id)
    }
    const nextShapes = this.marqueeAdditive ? [...this.sel, ...hits] : hits
    const nextMarkers = this.marqueeAdditive ? [...this.extSel, ...extHits] : extHits
    this.write(nextShapes, nextMarkers)
    // Notification unique : porte le changement de sélection ET l'effacement du tracé.
    this.host.selectionChanged()
  }
}

function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

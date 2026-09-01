import type { InteractionConfig } from '../../config/types'
import type { PointerPhase } from '../../core/pointer'
import {
  kindAllowed,
  type SelectableGroup,
  type SelectableInfo,
  type SelectablePolicy,
  type SelectableScreenItem,
} from '../../core/Selectables'
import { type LatLng, sameSet } from '../../shared'
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
  /** Sélectionnables externes (markers, tracés, clusters) visibles, en px canvas — lu au finalize. */
  externalItems?(): SelectableScreenItem[]
  /** Clic générique sur un objet drapé externe (tracé) sous le curseur — id ou null. */
  externalHitTest?(x: number, y: number, tolPx: number): string | number | null
  /** Métadonnées d'un sélectionnable externe (kind, type, groupe éventuel). */
  externalInfo?(id: string | number): SelectableInfo | null
  /** Politique de sélectionnabilité courante (relue à chaud). */
  selectionPolicy?(): SelectablePolicy
  /**
   * Outil gomme en mode marquee actif ? Tiré à la demande (comme `interaction()`), jamais
   * recopié ici : un marquee finalisé EFFACE alors au lieu d'établir une sélection. La
   * machine à états (rect/poly/lasso) est réutilisée telle quelle ; seule la finalisation
   * diverge, vers `eraseMarquee` (le host gère collecte/suppression/`onErase`).
   */
  eraseActive?(): boolean
  eraseMarquee?(selector: ScreenPt[]): void
  /**
   * Seuils de geste courants. Lu à CHAQUE usage plutôt que capturé au montage : la
   * config change à chaud (bascule souris ↔ tactile), et une valeur figée à la
   * construction survivrait au changement.
   */
  interaction(): InteractionConfig
}

/** État d'un pressé sur un objet externe drapé (tracé) — pické au relâchement. */
type PressedExternal = { id: string | number; additive: boolean; start: ScreenPt; dragging: boolean }

/**
 * Sélection des dessins, des sélectionnables externes (markers, tracés) ET des
 * agrégats pliables (clusters) : clic simple (Maj = toggle), marquee
 * rectangle/polygone/lasso avec sémantique « touche = sélectionné » (façon
 * Figma) ; Alt/⌘ pendant le marquee = objets non-formes seulement. Machine à
 * états pilotée par l'interceptor de DrawLayer quand l'outil `select` est actif.
 *
 * Trois populations séparées : les formes (`sel`, éditables), les externes plats
 * (`extSel` — markers ET tracés, jamais édités), et les groupes (`groupSel` —
 * clusters, capturés par leurs membres pour survivre au recompute de la pastille).
 */
export class SelectionManager {
  mode: SelectMode = 'rect'

  private readonly sel = new Set<string>()
  /** Sélection externe plate (markers + tracés) — ids libres côté hôte, pas de namespacing interne. */
  private readonly extSel = new Set<string | number>()
  /** Groupes sélectionnés (clusters) : clé = String(id de l'agrégat) → membres résolus. */
  private readonly groupSel = new Map<string, SelectableGroup>()
  private pressed: { id: string; additive: boolean; start: ScreenPt; dragging: boolean } | null = null
  private pressedExternal: PressedExternal | null = null
  /** Tracé du sélecteur en cours (px canvas). `poly` = mode clics (persiste entre up/down). */
  private marqueePts: ScreenPt[] | null = null
  private marqueeKind: SelectMode = 'rect'
  private marqueeAdditive = false
  /** Alt/⌘ enfoncé pendant le marquee : seuls les objets non-formes sont pris en compte. */
  private marqueeMarkersOnly = false

  constructor(private readonly host: SelectHost) {}

  get ids(): string[] {
    return [...this.sel]
  }

  /** Ids des sélectionnables externes plats (markers + tracés) sélectionnés. */
  get markerIds(): (string | number)[] {
    return [...this.extSel]
  }

  /** Groupes (clusters) sélectionnés — pour les badges (rangée pliable) et l'application visuelle. */
  get groups(): { id: string; label: string; memberIds: (string | number)[]; counts?: Record<string, number> }[] {
    return [...this.groupSel].map(([id, g]) => ({ id, label: g.label, memberIds: [...g.memberIds], counts: g.counts }))
  }

  /** Set des markers effectifs (externes plats + membres des groupes) — base de `effectiveMarkerIds`/`appliedIds`. */
  private effectiveMarkerSet(): Set<string | number> {
    const out = new Set<string | number>(this.extSel)
    for (const g of this.groupSel.values()) for (const m of g.memberIds) out.add(m)
    return out
  }

  /**
   * Markers effectivement sélectionnés : les externes plats PLUS les membres des
   * groupes (clusters) — dédupliqués. C'est la sémantique publique
   * « sélectionner un cluster = sélectionner ses enfants ».
   */
  effectiveMarkerIds(): (string | number)[] {
    return [...this.effectiveMarkerSet()]
  }

  /** Ids diffusés aux providers pour l'application visuelle : membres effectifs + clés de groupe (pastilles). */
  appliedIds(): Set<string | number> {
    const out = this.effectiveMarkerSet()
    for (const key of this.groupSel.keys()) out.add(key)
    return out
  }

  has(id: string): boolean {
    return this.sel.has(id)
  }

  get size(): number {
    return this.sel.size
  }

  /**
   * Réécrit les TROIS populations sans notifier — unique endroit qui mute les
   * Sets/Map en bloc. Renvoie true si le contenu a changé ; chaque geste appelant
   * notifie alors UNE fois. `groups` par défaut = groupSel courant (un `write` de
   * formes/markers ne touche pas aux clusters, sauf passage explicite).
   */
  private write(
    shapeIds: readonly string[],
    markerIds: ReadonlyArray<string | number>,
    groups: ReadonlyMap<string, SelectableGroup> = this.groupSel,
  ): boolean {
    // `Set` et non `shapeIds.includes` : les deux listes grandissent ENSEMBLE (un
    // marquee sélectionne d'autant plus d'ids qu'il y a de formes), donc le `includes`
    // en boucle était le seul O(n·m) du chemin de sélection.
    const wanted = new Set(shapeIds)
    const shapes = new Set<string>()
    for (const d of this.host.list()) {
      if (wanted.has(d.id) && this.host.isSelectable(d)) shapes.add(d.id)
    }
    const markers = new Set(markerIds)
    // `groups === this.groupSel` (défaut) = les clusters ne bougent pas : on saute la
    // comparaison ET la réécriture des groupes (rien à copier, rien à comparer).
    const groupsUntouched = groups === this.groupSel
    const changed =
      !sameSet(shapes, this.sel) ||
      !sameSet(markers, this.extSel) ||
      (!groupsUntouched && !sameGroupMap(groups, this.groupSel))
    if (changed) {
      // Matérialiser AVANT de vider quand on réécrit les groupes : `groups` ne peut
      // pas être `this.groupSel` ici (groupsUntouched l'exclut), mais on fige l'entrée.
      const nextGroups = groupsUntouched ? null : [...groups]
      this.sel.clear()
      for (const id of shapes) this.sel.add(id)
      this.extSel.clear()
      for (const id of markers) this.extSel.add(id)
      if (nextGroups) {
        this.groupSel.clear()
        for (const [k, v] of nextGroups) this.groupSel.set(k, v)
      }
    }
    return changed
  }

  /** Remplace la sélection de formes (externes/groupes intacts — sert l'API publique `select`). */
  set(ids: readonly string[]): void {
    if (this.write(ids, [...this.extSel])) this.host.selectionChanged()
  }

  clear(): void {
    if (this.write([], [], new Map())) this.host.selectionChanged()
  }

  /**
   * Clic sur un sélectionnable externe (routé par le consumer du registre, ou par
   * le hit-test générique des tracés). Route vers la population idoine (groupe si
   * l'info porte un agrégat, sinon externe plat) et respecte la politique.
   */
  pickExternal(id: string | number, additive: boolean): void {
    const info = this.host.externalInfo?.(id) ?? null
    if (info && !kindAllowed(info.kind, this.host.selectionPolicy?.())) return
    if (info?.group) {
      const key = String(id)
      if (additive) {
        if (this.groupSel.has(key)) this.groupSel.delete(key)
        else this.groupSel.set(key, info.group)
        this.host.selectionChanged()
      } else if (this.write([], [], new Map([[key, info.group]]))) {
        this.host.selectionChanged()
      }
      return
    }
    if (additive) {
      if (this.extSel.has(id)) this.extSel.delete(id)
      else this.extSel.add(id)
      this.host.selectionChanged()
    } else if (this.write([], [id], new Map())) {
      this.host.selectionChanged()
    }
  }

  /** Désélectionne des sélectionnables externes plats (croix d'une ligne de badge). */
  deselectExternal(ids: ReadonlyArray<string | number>): void {
    let changed = false
    for (const id of ids) if (this.extSel.delete(id)) changed = true
    if (changed) this.host.selectionChanged()
  }

  /** Désélectionne un groupe entier (croix d'une rangée cluster). */
  deselectGroup(id: string | number): void {
    if (this.groupSel.delete(String(id))) this.host.selectionChanged()
  }

  /**
   * Retire UN membre d'un groupe (croix d'une ligne enfant de cluster) : le groupe
   * vidé de son dernier membre disparaît, sinon ses membres restants sont conservés.
   */
  deselectGroupMember(key: string | number, memberId: string | number): void {
    const k = String(key)
    const g = this.groupSel.get(k)
    if (!g) return
    const rest = g.memberIds.filter((m) => m !== memberId)
    if (rest.length === g.memberIds.length) return
    if (rest.length === 0) this.groupSel.delete(k)
    else this.groupSel.set(k, { ...g, memberIds: rest })
    this.host.selectionChanged()
  }

  /**
   * Réconcilie les groupes (clusters) sélectionnés avec le clustering COURANT — appelé
   * à chaque recompute (zoom). Un cluster live ayant EXACTEMENT les mêmes membres fait
   * survivre le groupe, re-clé sur son nouvel id d'agrégat pour que l'anneau se ré-attache
   * à la bonne pastille. Sinon (cluster splitté/fusionné → il n'existe plus tel quel) le
   * groupe se DISSOUT en sélection plate : ses membres restent sélectionnés (chacun garde
   * son anneau via `effectiveMarkerSet`) et sont listés à plat, la ligne cluster disparaît.
   */
  reconcileGroups(): void {
    if (this.groupSel.size === 0) return
    // Set des membres précalculé UNE fois par cluster courant (pas à chaque comparaison).
    const current: { key: string; group: SelectableGroup; members: Set<string | number> }[] = []
    for (const it of this.host.externalItems?.() ?? []) {
      if (it.kind !== 'cluster') continue
      const info = this.host.externalInfo?.(it.id)
      if (info?.group) current.push({ key: String(it.id), group: info.group, members: new Set(info.group.memberIds) })
    }
    let changed = false
    for (const [key, g] of [...this.groupSel]) {
      const wanted = new Set(g.memberIds)
      const match = current.find((c) => sameSet(c.members, wanted))
      if (match) {
        if (match.key !== key) {
          this.groupSel.delete(key)
          this.groupSel.set(match.key, match.group)
          changed = true
        }
      } else {
        this.groupSel.delete(key)
        for (const m of g.memberIds) this.extSel.add(m)
        changed = true
      }
    }
    if (changed) this.host.selectionChanged()
  }

  /**
   * Retire les sélectionnables externes disparus (données, filtre tags…). Un
   * GROUPE (cluster) survit tant qu'au moins un membre vit — jamais pruné sur
   * l'existence de sa pastille, qui est recalculée en continu.
   */
  pruneExternal(isAlive: (id: string | number) => boolean): void {
    let changed = false
    for (const id of [...this.extSel]) {
      if (!isAlive(id)) {
        this.extSel.delete(id)
        changed = true
      }
    }
    for (const [key, g] of [...this.groupSel]) {
      const alive = g.memberIds.filter(isAlive)
      if (alive.length === 0) {
        this.groupSel.delete(key)
        changed = true
      } else if (alive.length !== g.memberIds.length) {
        this.groupSel.set(key, { ...g, memberIds: alive })
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
    if (this.sel.size > 0 || this.extSel.size > 0 || this.groupSel.size > 0) {
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
    // Mode gomme : jamais de sélection/édition au clic sur une forme — chaque geste
    // démarre un marquee (le point sous le curseur est effacé via le marquee dégénéré,
    // ou par la gomme ponctuelle, l'autre mode). On tombe donc directement au marquee.
    if (!this.host.eraseActive?.()) {
      const hit = latLng ? this.host.hitTest(latLng) : null
      if (hit?.locked) {
        this.host.onLockedHit(hit)
        return true
      }
      if (hit && this.host.isSelectable(hit)) {
        this.pressed = { id: hit.id, additive: e.shiftKey, start: s, dragging: false }
        return true
      }
    }
    // Aucune forme touchée : essayer un objet drapé externe (tracé) sous le curseur.
    const extId = this.host.externalHitTest?.(s.x, s.y, this.host.interaction().shapeHitTolerancePx)
    if (extId !== null && extId !== undefined) {
      this.pressedExternal = { id: extId, additive: e.shiftKey, start: s, dragging: false }
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
    if (this.pressedExternal) {
      // Un tracé ne s'édite pas : au-delà du slop, on annule seulement le clic (pas de drag).
      if (
        !this.pressedExternal.dragging &&
        Math.hypot(s.x - this.pressedExternal.start.x, s.y - this.pressedExternal.start.y) >
          this.host.interaction().clickSlopPx
      ) {
        this.pressedExternal.dragging = true
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
          if (this.write([id], [], new Map())) this.host.selectionChanged()
        }
      }
      return true
    }
    if (this.pressedExternal) {
      const { id, additive, dragging } = this.pressedExternal
      this.pressedExternal = null
      if (!dragging) this.pickExternal(id, additive)
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
    // Gomme : le sélecteur n'établit rien, il efface. Le host collecte/supprime/émet
    // `onErase` ; la sélection reste vide (pas de contour ni de poignées résiduels).
    if (this.host.eraseActive?.()) {
      this.host.eraseMarquee?.(selector)
      this.host.selectionChanged()
      return
    }
    // Formes : sautées si Alt/⌘ (non-formes seulement). Alt filtre ce que le
    // sélecteur voit ; la sémantique remplace/ajoute reste portée par Maj seul.
    const hits: string[] = []
    if (!markersOnly) {
      for (const d of this.host.list()) {
        if (!this.host.isSelectable(d)) continue
        const contour = this.host.screenContour(d)
        if (contour && shapeTouchesSelector(contour.pts, contour.closed, selector)) hits.push(d.id)
      }
    }
    // Externes : un item géométrique (tracé) est « touché » comme une forme ; un item
    // point (marker, pastille de cluster) l'est s'il est DANS le sélecteur.
    const extHits: (string | number)[] = []
    for (const it of this.host.externalItems?.() ?? []) {
      const touched = it.geometry
        ? shapeTouchesSelector(it.geometry.pts, it.geometry.closed, selector)
        : pointInPolygon({ x: it.x, y: it.y }, selector)
      if (touched) extHits.push(it.id)
    }
    // Classer les externes : plats (markers/tracés) vs groupes (clusters).
    const extMarkers: (string | number)[] = []
    const extGroups = new Map<string, SelectableGroup>()
    for (const id of extHits) {
      const info = this.host.externalInfo?.(id) ?? null
      if (info?.group) extGroups.set(String(id), info.group)
      else extMarkers.push(id)
    }
    const nextShapes = this.marqueeAdditive ? [...this.sel, ...hits] : hits
    const nextMarkers = this.marqueeAdditive ? [...this.extSel, ...extMarkers] : extMarkers
    const nextGroups = this.marqueeAdditive ? new Map([...this.groupSel, ...extGroups]) : extGroups
    this.write(nextShapes, nextMarkers, nextGroups)
    // Notification unique : porte le changement de sélection ET l'effacement du tracé.
    this.host.selectionChanged()
  }
}

/** Égalité de deux maps de groupes : mêmes clés ET mêmes membres (ordre inclus). */
function sameGroupMap(a: ReadonlyMap<string, SelectableGroup>, b: ReadonlyMap<string, SelectableGroup>): boolean {
  if (a.size !== b.size) return false
  for (const [k, ga] of a) {
    const gb = b.get(k)
    if (!gb || ga.memberIds.length !== gb.memberIds.length) return false
    for (let i = 0; i < ga.memberIds.length; i++) if (ga.memberIds[i] !== gb.memberIds[i]) return false
  }
  return true
}

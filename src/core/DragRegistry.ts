/**
 * Charge utile d'un drag : `type` discriminant (routage/filtrage côté zones),
 * `id` stable de l'élément saisi, `data` opaque (le core ne la regarde jamais —
 * ex. le `MarkerData` complet pour la couche marker). Générique par construction :
 * markers, éléments de liste ou tout futur outil produisent le même contrat.
 */
export type DragPayload<T = unknown> = {
  type: string
  id: string | number
  data?: T
}

/**
 * Zone de dépôt enregistrée par un consommateur (via `useDropZone`). `accept`
 * filtre les charges recevables (absent = tout accepter) ; `onDrop` reçoit la
 * charge validée au relâchement. Le retour visuel de survol passe par `onChange`
 * + `overZone` (pas de callback dédié).
 */
export type DropZone = {
  accept?: (payload: DragPayload) => boolean
  onDrop: (payload: DragPayload) => void
}

/** État d'un drag en cours (source de vérité, lu par l'overlay et les zones). */
export type DragState = {
  payload: DragPayload
  /** Visuel accroché au curseur — `ReactNode` côté React, **opaque** au core. */
  ghost: unknown
  /**
   * Classe(s) CSS que le consommateur veut sur le ghost (échelle, style…) —
   * opaque au core, appliquée par `DragOverlay`. Évite que la couche générique
   * connaisse les classes internes d'un consommateur particulier.
   */
  ghostClassName?: string
  /** Position écran courante du pointeur (px client). */
  x: number
  y: number
  /** Id de la zone survolée **qui accepte** la charge, sinon `null`. */
  overZone: string | null
}

/** Diffusé à la fin d'un drag (dépôt validé, annulation, ou relâché dans le vide). */
export type DragEnd = {
  payload: DragPayload
  /** Zone où le dépôt a eu lieu (acceptée), ou `null` si relâché hors zone / annulé. */
  droppedZone: string | null
}

/**
 * Registre du drag-and-drop, partagé sur `MapEngine` (même motif que
 * `engine.selectables`/`engine.tags`) : source de vérité de l'état, registre des
 * zones de dépôt, et diffusion des changements. **Découplé du DOM** — les gestes
 * (long-press), le ghost et le hit-test vivent dans la couche React
 * (`useDraggable`, `useDropZone`, `DragOverlay`) qui pilote ce registre. Les
 * consommateurs ne se connaissent jamais entre eux.
 */
export class DragRegistry {
  private readonly zones = new Map<string, DropZone>()
  private state: DragState | null = null
  private readonly changeListeners = new Set<() => void>()
  private readonly endListeners = new Set<(end: DragEnd) => void>()

  /** Drag en cours, ou `null` au repos. */
  get active(): DragState | null {
    return this.state
  }

  /** Enregistre une zone de dépôt sous un id unique ; renvoie le désabonnement. */
  registerZone(id: string, zone: DropZone): () => void {
    this.zones.set(id, zone)
    return () => {
      if (this.zones.get(id) === zone) this.zones.delete(id)
    }
  }

  /** Changement d'état (début, mouvement, survol de zone, fin). */
  onChange(cb: () => void): () => void {
    this.changeListeners.add(cb)
    return () => this.changeListeners.delete(cb)
  }

  /** Fin d'un drag (dépôt, annulation) — porte la zone de dépôt éventuelle. */
  onEnd(cb: (end: DragEnd) => void): () => void {
    this.endListeners.add(cb)
    return () => this.endListeners.delete(cb)
  }

  /** Démarre un drag (appelé par `useDraggable` quand le long-press est atteint). */
  begin(payload: DragPayload, ghost: unknown, x: number, y: number, ghostClassName?: string): void {
    this.state = { payload, ghost, ghostClassName, x, y, overZone: null }
    this.emitChange()
  }

  /**
   * Met à jour la position du pointeur et la zone survolée (appelé par
   * `DragOverlay` à chaque `pointermove`). `zoneId` provient du hit-test DOM
   * (`elementFromPoint` → `data-m3d-drop`) ; il n'est retenu que s'il **accepte**
   * la charge. Le survol est diffusé via `onChange` (→ `isOver` des zones).
   */
  move(x: number, y: number, zoneId: string | null): void {
    const s = this.state
    if (!s) return
    s.x = x
    s.y = y
    s.overZone = zoneId !== null && this.accepts(zoneId, s.payload) ? zoneId : null
    this.emitChange()
  }

  /**
   * Termine le drag : dépose sur la zone survolée si une charge acceptée y est,
   * puis notifie `onEnd` (avec la zone de dépôt, ou `null`). Appelé au
   * `pointerup`.
   */
  end(): void {
    const s = this.state
    if (!s) return
    const droppedZone = s.overZone
    this.state = null
    if (droppedZone) this.zones.get(droppedZone)?.onDrop(s.payload)
    this.emitChange()
    this.emitEnd({ payload: s.payload, droppedZone })
  }

  /** Annule le drag sans dépôt (Échap, perte de focus) — `onEnd` reçoit `null`. */
  cancel(): void {
    const s = this.state
    if (!s) return
    this.state = null
    this.emitChange()
    this.emitEnd({ payload: s.payload, droppedZone: null })
  }

  private accepts(zoneId: string, payload: DragPayload): boolean {
    const z = this.zones.get(zoneId)
    if (!z) return false
    return z.accept ? z.accept(payload) : true
  }

  private emitChange(): void {
    for (const cb of this.changeListeners) cb()
  }

  private emitEnd(end: DragEnd): void {
    for (const cb of this.endListeners) cb(end)
  }
}

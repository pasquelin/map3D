import type { DataSource, Viewport } from './types'

export type ViewportControllerOptions = {
  /** Anti-rebond en millisecondes (operator utilise 500 ms). */
  debounce: number
  /**
   * Notifié d'un échec de `source.load` (jamais d'un abandon). Sans lui, un backend en panne
   * est indiscernable d'un viewport vide : le jeu courant reste affiché, en silence.
   */
  onError?: (error: unknown) => void
}


/**
 * Orchestre le chargement viewport-driven d'une `DataSource` : anti-rebond,
 * gate de zoom (`source.minZoom`), et annulation de la requête précédente quand
 * une nouvelle vue arrive. Reproduit le pattern `useMapDataLayers` d'operator,
 * mais découplé du transport (Apollo/REST/…).
 */
export class ViewportController<T> {
  private source: DataSource<T> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight: AbortController | null = null
  private lastViewport: Viewport | null = null
  private disposed = false
  /**
   * Le jeu vide a DÉJÀ été émis sous le seuil de zoom.
   *
   * Sans ce drapeau, chaque tick sous le seuil émettait un tableau vide NEUF : la couche
   * marker en tirait une identité neuve, tous ses mémos de visibilité tombaient, et les
   * trois registres (`selectables`, `markers`, `clusters`) étaient notifiés — `ChangeNotifier`
   * n'ayant aucune garde d'égalité, la surface de regroupement replanifiait un `rebuild()`
   * complet. Soit, à quelques milliers de markers dans les autres couches, une chaîne par
   * marker et un tri supercluster toutes les 500 ms de déplacement, pour zéro changement.
   */
  private emptied = false
  /** Le MÊME tableau vide à chaque émission — cf. `emptied`. */
  private readonly noData: T[] = []

  constructor(
    private readonly options: ViewportControllerOptions,
    private readonly onData: (data: T[]) => void,
    private readonly onLoadingChange?: (loading: boolean) => void,
  ) {}

  setSource(source: DataSource<T> | null): void {
    this.source = source
    this.emptied = false
    if (source && this.lastViewport) this.schedule(this.lastViewport)
    else this.cancel()
  }

  /** À appeler à chaque changement de vue (débouncé en interne). */
  push(viewport: Viewport): void {
    this.lastViewport = viewport
    if (!this.source) return
    this.schedule(viewport)
  }

  private schedule(viewport: Viewport): void {
    if (this.disposed) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.run(viewport), this.options.debounce)
  }

  private async run(viewport: Viewport): Promise<void> {
    const source = this.source
    if (!source || this.disposed) return
    if (source.minZoom !== undefined && viewport.zoom < source.minZoom) {
      // Abandonner ce qui est EN VOL : une requête partie au-dessus du seuil se résout
      // sinon après coup et repeuple la couche sous le seuil que ce gate existe pour
      // tenir — précisément les milliers de points qu'on refuse d'afficher là.
      if (this.inFlight) {
        this.inFlight.abort()
        this.inFlight = null
        this.onLoadingChange?.(false)
      }
      // Une seule émission par descente sous le seuil, sur un tableau CONSTANT.
      if (!this.emptied) {
        this.emptied = true
        this.onData(this.noData)
      }
      return
    }
    this.emptied = false
    this.inFlight?.abort()
    const controller = new AbortController()
    this.inFlight = controller
    this.onLoadingChange?.(true)
    try {
      const data = await source.load(viewport, controller.signal)
      if (!controller.signal.aborted && !this.disposed) this.onData(data)
    } catch (error) {
      // Abort ou erreur réseau : on laisse le jeu de données courant intact.
      if (!controller.signal.aborted && !this.disposed) this.options.onError?.(error)
    } finally {

      if (this.inFlight === controller) {
        this.inFlight = null
        this.onLoadingChange?.(false)
      }
    }
  }

  /**
   * Coupe le timer et la requête en vol.
   *
   * Retombe le drapeau de chargement : `run` ne le rend à `false` que dans son `finally`,
   * et pour la requête qui est ENCORE la courante — abandonnée d'ici, elle ne l'est plus,
   * si bien que le drapeau restait à `true` pour toujours. Un indicateur de chargement
   * branché dessus tournait alors indéfiniment sur une source retirée.
   */
  private cancel(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const had = this.inFlight !== null
    this.inFlight?.abort()
    this.inFlight = null
    this.emptied = false
    if (had) this.onLoadingChange?.(false)
  }

  dispose(): void {
    this.disposed = true
    this.cancel()
  }
}

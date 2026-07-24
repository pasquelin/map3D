import type { DataSource, Viewport } from './types'

export type ViewportControllerOptions = {
  /** Anti-rebond en millisecondes (operator utilise 500 ms). */
  debounce: number
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

  constructor(
    private readonly options: ViewportControllerOptions,
    private readonly onData: (data: T[]) => void,
    private readonly onLoadingChange?: (loading: boolean) => void,
  ) {}

  setSource(source: DataSource<T> | null): void {
    this.source = source
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
      this.onData([])
      return
    }
    this.inFlight?.abort()
    const controller = new AbortController()
    this.inFlight = controller
    this.onLoadingChange?.(true)
    try {
      const data = await source.load(viewport, controller.signal)
      if (!controller.signal.aborted && !this.disposed) this.onData(data)
    } catch {
      // Abort ou erreur réseau : on laisse le jeu de données courant intact.
    } finally {
      if (this.inFlight === controller) {
        this.inFlight = null
        this.onLoadingChange?.(false)
      }
    }
  }

  private cancel(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.inFlight?.abort()
    this.inFlight = null
  }

  dispose(): void {
    this.disposed = true
    this.cancel()
  }
}

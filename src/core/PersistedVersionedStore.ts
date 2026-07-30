import { writeStoredJSON } from './storage'

/**
 * Socle des registres portés par le moteur (`engine.plugins`, `engine.templates`) :
 * store **versionné** pour `useSyncExternalStore` + persistance localStorage **débouncée**
 * et auto-contenue. Le débounce existe parce que les mutations arrivent en rafale
 * (sliders du hub de plugins, renommage inline d'un template).
 *
 * Ce que le socle NE connaît PAS — la forme des données et ce qu'on en sérialise — est
 * délégué à `serialize()`, que la sous-classe implémente (partiel écart-aux-défauts pour
 * les plugins, sous-ensemble `origin:'local'` pour les templates). La sous-classe lit son
 * propre stockage initial dans son constructeur, après `super()`, via `this.storageKey`.
 */
export abstract class PersistedVersionedStore {
  private readonly listeners = new Set<() => void>()
  /** Snapshot pour `useSyncExternalStore` — incrémenté à chaque mutation notifiée. */
  version = 0
  private saveTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    /** `null` = pas de persistance. Lu par la sous-classe pour son chargement initial. */
    protected readonly storageKey: string | null,
    private readonly persistDebounceMs: number,
  ) {}

  /** Ce que la sous-classe écrit en localStorage (forme libre : record, tableau…). */
  protected abstract serialize(): unknown

  // Champ fléché LIÉ : `useSyncExternalStore` reçoit `store.on` détaché de son receveur
  // (sans `.call`) — une méthode de classe classique y perdrait son `this`.
  on = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Incrémente le snapshot et notifie les abonnés. */
  protected bump(): void {
    this.version++
    for (const cb of this.listeners) cb()
  }

  /** Programme une persistance débouncée (coalesce les rafales de mutations). */
  protected persistLater(): void {
    if (!this.storageKey) return
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined
      this.persistNow()
    }, this.persistDebounceMs)
  }

  private persistNow(): void {
    if (!this.storageKey) return
    writeStoredJSON(this.storageKey, this.serialize())
  }

  /** Flush la persistance en attente (démontage du moteur). */
  dispose(): void {
    if (this.saveTimer !== undefined) {
      clearTimeout(this.saveTimer)
      this.saveTimer = undefined
      this.persistNow()
    }
  }
}

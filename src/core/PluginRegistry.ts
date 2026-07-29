import { defaultConfig } from '../config/defaultConfig'
import { defaultsOf, filterKnown, partialOf, resolveConfig } from '../plugins/defaults'
import type { AnyPlugin } from '../plugins/types'
import { readStoredJSON, writeStoredJSON } from './storage'

export type PluginState = { enabled: boolean; config: Record<string, unknown> }

export type PluginEntry = {
  plugin: AnyPlugin
  enabled: boolean
  config: Record<string, unknown>
}

/**
 * Registre des plugins, porté par le moteur (`engine.plugins`), agnostique React.
 * Calqué sur `TagFilter` : store versionné pour `useSyncExternalStore`, persistance
 * localStorage auto-contenue mais DÉBOUNCÉE (les sliders du hub appellent `setConfig`
 * en rafale). Seul le PARTIEL (écart aux défauts) est persisté, pour survivre aux
 * évolutions de schéma ; une clé inconnue au chargement est ignorée (schéma = vérité).
 */
export class PluginRegistry {
  private readonly entries = new Map<string, PluginEntry>()
  private readonly stored: Record<string, PluginState>
  private readonly ticks = new Map<string, number>()
  private readonly listeners = new Set<() => void>()
  /** Snapshot pour `useSyncExternalStore`. */
  version = 0
  private saveTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly storageKey: string | null = defaultConfig.data.storageKeys.plugins,
    private readonly persistDebounceMs: number = defaultConfig.data.positionSaveDebounceMs,
  ) {
    const raw = this.storageKey ? (readStoredJSON(this.storageKey) as Record<string, PluginState> | null) : null
    this.stored = raw ?? {}
  }

  register(plugin: AnyPlugin, initial?: Partial<PluginState>): void {
    const id = plugin.meta.id
    const persisted = this.stored[id]
    const config = resolveConfig(plugin.config, initial?.config, persisted?.config)
    const enabled = persisted?.enabled ?? initial?.enabled ?? plugin.enabledByDefault ?? false
    this.entries.set(id, { plugin, enabled, config })
    this.emit()
  }

  unregister(id: string): void {
    if (this.entries.delete(id)) {
      this.ticks.delete(id)
      this.emit()
    }
  }

  list(): readonly PluginEntry[] {
    return [...this.entries.values()]
  }

  get(id: string): PluginEntry | undefined {
    return this.entries.get(id)
  }

  isEnabled(id: string): boolean {
    return this.entries.get(id)?.enabled ?? false
  }

  setEnabled(id: string, on: boolean): void {
    const e = this.entries.get(id)
    if (!e || e.enabled === on) return
    e.enabled = on
    this.persistLater()
    this.emit()
  }

  getConfig<C>(id: string): C {
    return (this.entries.get(id)?.config ?? {}) as C
  }

  setConfig(id: string, patch: Record<string, unknown>): void {
    const e = this.entries.get(id)
    if (!e) return
    e.config = { ...e.config, ...filterKnown(patch, e.plugin.config) }
    this.persistLater()
    this.emit()
  }

  resetConfig(id: string): void {
    const e = this.entries.get(id)
    if (!e) return
    e.config = defaultsOf(e.plugin.config)
    this.persistLater()
    this.emit()
  }

  /** Rafraîchissement manuel (`data.refresh === 'manual'`) : le `PluginHost` observe le tick. */
  requestRefresh(id: string): void {
    this.ticks.set(id, (this.ticks.get(id) ?? 0) + 1)
    this.emit()
  }

  refreshTick(id: string): number {
    return this.ticks.get(id) ?? 0
  }

  on(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Flush la persistance en attente (démontage du moteur). */
  dispose(): void {
    if (this.saveTimer !== undefined) {
      clearTimeout(this.saveTimer)
      this.saveTimer = undefined
      this.persistNow()
    }
  }

  private emit(): void {
    this.version++
    for (const cb of this.listeners) cb()
  }

  private persistLater(): void {
    if (!this.storageKey) return
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined
      this.persistNow()
    }, this.persistDebounceMs)
  }

  private persistNow(): void {
    if (!this.storageKey) return
    const out: Record<string, PluginState> = {}
    for (const [id, e] of this.entries) out[id] = { enabled: e.enabled, config: partialOf(e.config, e.plugin.config) }
    writeStoredJSON(this.storageKey, out)
  }
}

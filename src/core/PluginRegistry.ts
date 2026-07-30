import { defaultConfig } from '../config/defaultConfig'
import { defaultsOf, filterKnown, partialOf, resolveConfig } from '../plugins/defaults'
import type { AnyPlugin } from '../plugins/types'
import { PersistedVersionedStore } from './PersistedVersionedStore'
import { readStoredJSON } from './storage'

export type PluginState = { enabled: boolean; config: Record<string, unknown> }

export type PluginEntry = {
  plugin: AnyPlugin
  enabled: boolean
  config: Record<string, unknown>
}

/**
 * Registre des plugins, porté par le moteur (`engine.plugins`), agnostique React.
 * Store versionné + persistance débouncée hérités de `PersistedVersionedStore` (les
 * sliders du hub appellent `setConfig` en rafale). Seul le PARTIEL (écart aux défauts)
 * est persisté, pour survivre aux évolutions de schéma ; une clé inconnue au chargement
 * est ignorée (schéma = vérité).
 */
export class PluginRegistry extends PersistedVersionedStore {
  private readonly entries = new Map<string, PluginEntry>()
  private readonly stored: Record<string, PluginState>
  private readonly ticks = new Map<string, number>()

  constructor(
    storageKey: string | null = defaultConfig.data.storageKeys.plugins,
    persistDebounceMs: number = defaultConfig.data.positionSaveDebounceMs,
  ) {
    super(storageKey, persistDebounceMs)
    const raw = this.storageKey ? (readStoredJSON(this.storageKey) as Record<string, PluginState> | null) : null
    this.stored = raw ?? {}
  }

  register(plugin: AnyPlugin, initial?: Partial<PluginState>): void {
    const id = plugin.meta.id
    const persisted = this.stored[id]
    const config = resolveConfig(plugin.config, initial?.config, persisted?.config)
    const enabled = persisted?.enabled ?? initial?.enabled ?? plugin.enabledByDefault ?? false
    this.entries.set(id, { plugin, enabled, config })
    this.bump()
  }

  unregister(id: string): void {
    if (this.entries.delete(id)) {
      this.ticks.delete(id)
      this.bump()
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
    this.bump()
  }

  getConfig<C>(id: string): C {
    return (this.entries.get(id)?.config ?? {}) as C
  }

  setConfig(id: string, patch: Record<string, unknown>): void {
    const e = this.entries.get(id)
    if (!e) return
    e.config = { ...e.config, ...filterKnown(patch, e.plugin.config) }
    this.persistLater()
    this.bump()
  }

  resetConfig(id: string): void {
    const e = this.entries.get(id)
    if (!e) return
    e.config = defaultsOf(e.plugin.config)
    this.persistLater()
    this.bump()
  }

  /** Rafraîchissement manuel (`data.refresh === 'manual'`) : le `PluginHost` observe le tick. */
  requestRefresh(id: string): void {
    this.ticks.set(id, (this.ticks.get(id) ?? 0) + 1)
    this.bump()
  }

  refreshTick(id: string): number {
    return this.ticks.get(id) ?? 0
  }

  // Persiste le PARTIEL (écart aux défauts) : survit aux évolutions de schéma.
  protected serialize(): Record<string, PluginState> {
    const out: Record<string, PluginState> = {}
    for (const [id, e] of this.entries) out[id] = { enabled: e.enabled, config: partialOf(e.config, e.plugin.config) }
    return out
  }
}

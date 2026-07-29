import type { FetchPolicy } from '../config/types'
import type { AnyPlugin } from '../plugins/types'
import type { BuildingHit, MapEngine } from './MapEngine'
import type { PluginRegistry } from './PluginRegistry'

/** État porté par map3D pour UN plugin, sur le dernier bâtiment piqué. */
export type EnrichmentState = {
  loading: boolean
  /** Attributs résolus (null tant que loading/erreur). */
  data: Record<string, unknown> | null
  /** Provenance ; défaut `[plugin.meta.id]`. */
  tags: string[]
  error: Error | null
}

const EMPTY: EnrichmentState = { loading: false, data: null, tags: [], error: null }

/**
 * Orchestrateur d'enrichissement au pick. Agnostique React. Écoute `buildingclick` :
 * abort du pick précédent, appelle les `enrichBuilding` des plugins activés (la
 * plateforme fournit `signal` + `fetchPolicy`, le plugin fait le fetch), porte l'état
 * `{ loading, data, tags, error }` par plugin. Le clic reste instantané : cette classe
 * s'exécute APRÈS l'émission de `buildingclick`. Zéro travail à la frame (event-driven).
 * Les `tags` de provenance sont reportés à `engine.tags` (filtre « Couches »).
 */
export class PluginEnrichment {
  private readonly states = new Map<string, EnrichmentState>()
  private readonly listeners = new Set<() => void>()
  private ctrl: AbortController | null = null
  private readonly offClick: () => void
  private readonly offTags: () => void
  version = 0
  private readonly tagSource = 'm3d:plugin-enrichment'

  constructor(
    private readonly engine: MapEngine,
    private readonly plugins: PluginRegistry,
    private readonly policy: FetchPolicy,
  ) {
    this.offClick = engine.on('buildingclick', ({ hit }) => this.run(hit))
    // Re-render quand le filtre « Couches » change (une source masquée disparaît de merged()).
    this.offTags = engine.tags.onSelection(() => this.emit())
  }

  get(pluginId: string): EnrichmentState {
    return this.states.get(pluginId) ?? EMPTY
  }

  /** Merge des `data` (+ union des `tags`) des enrichisseurs actifs et non filtrés. */
  merged(): EnrichmentState {
    let loading = false
    let error: Error | null = null
    const data: Record<string, unknown> = {}
    const tags = new Set<string>()
    let has = false
    for (const [id, s] of this.states) {
      const entry = this.plugins.get(id)
      if (!entry?.enabled) continue
      if (this.engine.tags.isActive && !this.engine.tags.isVisible(s.tags)) continue
      if (s.loading) loading = true
      if (s.error) error = s.error
      for (const t of s.tags) tags.add(t)
      if (s.data) {
        Object.assign(data, s.data)
        has = true
      }
    }
    return { loading, data: has ? data : null, tags: [...tags], error }
  }

  on(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.offClick()
    this.offTags()
    this.ctrl?.abort()
  }

  private run(hit: BuildingHit): void {
    this.ctrl?.abort()
    const ctrl = new AbortController()
    this.ctrl = ctrl
    this.states.clear()
    const enrichers = this.plugins.list().filter((e) => e.enabled && e.plugin.enrichBuilding)
    for (const e of enrichers) {
      this.states.set(e.plugin.meta.id, { loading: true, data: null, tags: [e.plugin.meta.id], error: null })
    }
    this.reportTags()
    this.emit()

    for (const e of enrichers) {
      const id = e.plugin.meta.id
      const ctx = { engine: this.engine, config: e.config, signal: ctrl.signal, fetchPolicy: this.policy }
      Promise.resolve((e.plugin.enrichBuilding as NonNullable<AnyPlugin['enrichBuilding']>)(hit, ctx))
        .then((res) => {
          if (ctrl.signal.aborted) return
          this.states.set(id, { loading: false, data: res.attrs, tags: res.tags ?? [id], error: null })
          this.reportTags()
          this.emit()
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return
          this.states.set(id, {
            loading: false,
            data: null,
            tags: [id],
            error: err instanceof Error ? err : new Error(String(err)),
          })
          this.emit()
        })
    }
  }

  private reportTags(): void {
    const counts = new Map<string, number>()
    for (const s of this.states.values()) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    this.engine.tags.report(this.tagSource, counts)
  }

  private emit(): void {
    this.version++
    for (const cb of this.listeners) cb()
  }
}

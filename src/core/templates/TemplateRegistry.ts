import { defaultConfig } from '../../config/defaultConfig'
import type { GeoJSONFeatureCollection } from '../../layers/DrawLayer'
import { readStoredJSON, writeStoredJSON } from '../storage'
import type { ApplyMode, Template } from './types'

/**
 * Pont vers le dessin, posé par `<DrawLayer>` sur `engine.templates`. Découple le
 * gestionnaire du contexte React de dessin : le bouton peut ainsi vivre dans la barre
 * de contrôles (hors `<DrawLayer>`), comme « Couches » lit `engine.tags`. `null` tant
 * qu'aucune couche de dessin n'est montée (rien à sauvegarder).
 */
export type TemplateDrawPort = {
  toGeoJSON: () => GeoJSONFeatureCollection
  fromGeoJSON: (fc: GeoJSONFeatureCollection) => void
}

/**
 * Mutation programmatique : `silent` n'émet **aucun** event hôte (comme
 * `DrawLayer.MutateOptions`). Indispensable quand l'hôte réinjecte dans la carte ce
 * qu'il vient de recevoir de son backend — sans quoi l'écho relancerait sa mutation.
 */
export type TemplateMutateOptions = { silent?: boolean }

/**
 * Registre des templates, porté par le moteur (`engine.templates`), agnostique React.
 * Calqué sur `PluginRegistry` : store versionné pour `useSyncExternalStore`,
 * persistance localStorage DÉBOUNCÉE (renommage inline en rafale). Ne persiste que les
 * templates `origin:'local'` — ceux d'`origin:'api'` ont leur source de vérité côté
 * backend (le hook les réinjecte à chaque synchro).
 *
 * Le registre ne parle PAS au réseau : c'est le hook React qui pilote un éventuel
 * `TemplateProvider` et reflète son résultat ici (`setAll`/`save` en `origin:'api'`).
 * L'API prime donc naturellement : quand un provider est branché, sa liste écrase la
 * vue via `setAll`.
 */
export class TemplateRegistry {
  private entries = new Map<string, Template>()
  private readonly listeners = new Set<() => void>()
  /** Snapshot pour `useSyncExternalStore`. */
  version = 0
  private saveTimer: ReturnType<typeof setTimeout> | undefined

  /** Relais des events hôte, posés par le moteur (`engine.on('templatesave', …)`). */
  onSave?: (template: Template) => void
  onRemove?: (id: string) => void
  onApply?: (id: string, mode: ApplyMode) => void

  /** Pont vers le dessin (`toGeoJSON`/`fromGeoJSON`), posé par `<DrawLayer>`. */
  drawPort: TemplateDrawPort | null = null

  constructor(
    private readonly storageKey: string | null = defaultConfig.data.storageKeys.templates,
    private readonly persistDebounceMs: number = defaultConfig.data.positionSaveDebounceMs,
  ) {
    const raw = this.storageKey ? (readStoredJSON(this.storageKey) as Template[] | null) : null
    if (Array.isArray(raw)) for (const t of raw) if (t?.id) this.entries.set(t.id, { ...t, origin: 'local' })
  }

  list(): readonly Template[] {
    return [...this.entries.values()]
  }

  get(id: string): Template | undefined {
    return this.entries.get(id)
  }

  /** Ajoute ou remplace un template par identité. */
  save(template: Template, opts: TemplateMutateOptions = {}): void {
    this.entries.set(template.id, template)
    this.persistLater()
    this.bump()
    if (!opts.silent) this.onSave?.(template)
  }

  /** Renomme (les templates lecture seule ne sont pas concernés — l'appelant filtre). */
  rename(id: string, name: string, opts: TemplateMutateOptions = {}): void {
    const t = this.entries.get(id)
    if (!t || t.name === name) return
    // Renommer n'est pas une édition du contenu : on garde `updatedAt` tel quel (pas de bump).
    const next: Template = { ...t, name }
    this.entries.set(id, next)
    this.persistLater()
    this.bump()
    if (!opts.silent) this.onSave?.(next)
  }

  remove(id: string, opts: TemplateMutateOptions = {}): void {
    if (!this.entries.delete(id)) return
    this.persistLater()
    this.bump()
    if (!opts.silent) this.onRemove?.(id)
  }

  /**
   * Remplace TOUTE la collection (synchro provider ou import). Silencieux par défaut :
   * une synchro n'est pas une mutation utilisateur à réémettre vers l'hôte.
   */
  setAll(templates: readonly Template[], opts: TemplateMutateOptions = { silent: true }): void {
    this.entries = new Map(templates.map((t) => [t.id, t]))
    this.persistLater()
    this.bump()
    if (!opts.silent) for (const t of templates) this.onSave?.(t)
  }

  /** Relaie l'event `templateapply` (aucun état registre ne change — c'est le dessin). */
  notifyApply(id: string, mode: ApplyMode): void {
    this.onApply?.(id, mode)
  }

  // Champ fléché LIÉ : `useSyncExternalStore` reçoit `engine.templates.on` détaché de
  // son receveur — une méthode de classe classique y perdrait son `this`.
  on = (listener: () => void): (() => void) => {
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

  private bump(): void {
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
    // Seuls les templates locaux sont persistés : ceux de l'API font foi côté backend.
    const locals = [...this.entries.values()].filter((t) => t.origin === 'local')
    writeStoredJSON(this.storageKey, locals)
  }
}

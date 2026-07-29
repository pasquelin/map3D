import type { FolderApi, TabPageApi } from 'tweakpane'
import type { MapEngine, PluginField } from 'map3d'

/**
 * Onglet Plugins du dev panel : lit `engine.plugins`, un FolderApi par plugin (toggle +
 * un binding par champ de schéma, mappé comme la lib mappe la config). Bouton
 * « Réinitialiser » par plugin. Resync sur l'event 'plugins' (l'utilisateur peut toggler
 * depuis le hub in-map). Le champ `secret` → binding masqué, pas de copie presse-papier.
 */
export function buildPluginsTab(page: TabPageApi, engine: MapEngine): { sync: () => void } {
  const reg = engine.plugins
  const folders = new Map<string, FolderApi>()
  // Modèle plat par plugin : { enabled, ...config } lu/écrit via bindings.
  const models = new Map<string, Record<string, unknown>>()

  const rebuild = () => {
    for (const f of folders.values()) f.dispose()
    folders.clear()
    models.clear()
    for (const entry of reg.list()) {
      const id = entry.plugin.meta.id
      const folder = page.addFolder({ title: entry.plugin.meta.name, expanded: false })
      folders.set(id, folder)
      const model: Record<string, unknown> = { enabled: entry.enabled, ...entry.config }
      models.set(id, model)
      folder
        .addBinding(model, 'enabled', { label: 'Activé' })
        .on('change', (ev) => reg.setEnabled(id, Boolean(ev.value)))
      for (const field of entry.plugin.config ?? []) {
        folder
          .addBinding(model, field.key, paramsForField(field))
          .on('change', (ev) => reg.setConfig(id, { [field.key]: ev.value }))
      }
      folder.addButton({ title: 'Réinitialiser' }).on('click', () => reg.resetConfig(id))
    }
  }

  rebuild()

  const sync = () => {
    // Si la liste a changé (register/unregister), reconstruire ; sinon recopier les valeurs.
    if (folders.size !== reg.list().length) {
      rebuild()
      return
    }
    for (const entry of reg.list()) {
      const model = models.get(entry.plugin.meta.id)
      if (!model) {
        rebuild()
        return
      }
      model.enabled = entry.enabled
      for (const field of entry.plugin.config ?? []) model[field.key] = entry.config[field.key]
    }
    page.refresh()
  }

  return { sync }
}

function paramsForField(field: PluginField): Record<string, unknown> {
  const base: Record<string, unknown> = { label: field.label }
  if (field.type === 'number') {
    if (field.min !== undefined) base.min = field.min
    if (field.max !== undefined) base.max = field.max
    if (field.step !== undefined) base.step = field.step
  }
  if (field.type === 'select') base.options = { ...field.options }
  if (field.type === 'string' && field.secret) base.view = 'text' // pas de binding sensible exposé en clair
  return base
}

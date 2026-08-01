import type { FolderApi, TabPageApi } from 'tweakpane'
import type { MapEngine, PluginField } from '@pasquelin/map3d'

/**
 * Onglet Plugins du dev panel : lit `engine.plugins`, un FolderApi par plugin (toggle +
 * un binding par champ de schéma, mappé comme la lib mappe la config). Bouton
 * « Réinitialiser » par plugin. Resync sur l'event 'plugins' (l'utilisateur peut toggler
 * depuis le hub in-map). Le champ `secret` : jamais affiché en clair dans le dev panel —
 * il se règle via env (`VITE_*`) ou le hub in-map (input `type="password"`), pas ici.
 */
export function buildPluginsTab(page: TabPageApi, engine: MapEngine): { sync: () => void } {
  const reg = engine.plugins
  const folders = new Map<string, FolderApi>()
  // Modèle plat par plugin : { enabled, ...config } lu/écrit via bindings. Un champ
  // secret n'y a PAS de binding éditable sur sa vraie clé (cf. `isSecretField` plus bas) :
  // seule sa clé masquée (`MASK_SUFFIX`) est bindée, en lecture seule.
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
        if (isSecretField(field)) {
          // Binding en lecture seule sur un PROXY masqué, jamais sur la vraie valeur :
          // pas d'`onChange` qui écrirait le secret, pas de rendu en clair. Se règle
          // ailleurs (env / hub in-map) — le dev panel n'a besoin que de l'ÉTAT (renseigné
          // ou vide), jamais de la valeur.
          model[maskKeyOf(field)] = maskOf(entry.config[field.key])
          folder.addBinding(model, maskKeyOf(field), { label: field.label, readonly: true })
          continue
        }
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
      for (const field of entry.plugin.config ?? []) {
        // Un champ secret ne se resync que sur son proxy masqué — jamais sa vraie valeur.
        if (isSecretField(field)) model[maskKeyOf(field)] = maskOf(entry.config[field.key])
        else model[field.key] = entry.config[field.key]
      }
    }
    page.refresh()
  }

  return { sync }
}

/** Suffixe de la clé masquée d'un champ secret dans le modèle plat (jamais la vraie clé). */
const MASK_SUFFIX = '__mask'

function maskKeyOf(field: PluginField): string {
  return `${field.key}${MASK_SUFFIX}`
}

function isSecretField(field: PluginField): boolean {
  return field.type === 'string' && Boolean(field.secret)
}

/** Indicateur d'état, jamais la valeur : un secret renseigné ou vide, rien d'autre. */
function maskOf(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? '••••••' : '(vide)'
}

function paramsForField(field: PluginField): Record<string, unknown> {
  const base: Record<string, unknown> = { label: field.label }
  if (field.type === 'number') {
    if (field.min !== undefined) base.min = field.min
    if (field.max !== undefined) base.max = field.max
    if (field.step !== undefined) base.step = field.step
  }
  if (field.type === 'select') base.options = { ...field.options }
  return base
}

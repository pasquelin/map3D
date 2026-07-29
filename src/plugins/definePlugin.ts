import type { Plugin, PluginConfigOf, PluginField } from './types'

/** Infère `C` depuis `config`, pour que `ctx.config` soit typé sans annotation. */
export function definePlugin<const S extends readonly PluginField[]>(
  def: Plugin<PluginConfigOf<S>> & { config?: S },
): Plugin<PluginConfigOf<S>> {
  return def
}

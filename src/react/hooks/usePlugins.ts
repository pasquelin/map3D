import { useSyncExternalStore } from 'react'
import { useMapContext } from '../context'
import type { AnyPlugin, PluginField } from '../../plugins/types'

export type PluginView = {
  meta: AnyPlugin['meta']
  enabled: boolean
  config: Record<string, unknown>
  schema: readonly PluginField[]
  setEnabled: (on: boolean) => void
  setConfig: (patch: Record<string, unknown>) => void
  resetConfig: () => void
  /** Pour `data.refresh === 'manual'`. */
  refresh: () => void
}

/**
 * Vue réactive des plugins enregistrés. `useSyncExternalStore` sur `engine.plugins` :
 * pas de polling, re-render uniquement quand l'état plugins change.
 */
export function usePlugins(): { plugins: readonly PluginView[]; byId: (id: string) => PluginView | undefined } {
  const { engine } = useMapContext()
  const reg = engine.plugins
  useSyncExternalStore(reg.on, () => reg.version)
  const plugins = reg.list().map<PluginView>((e) => {
    const id = e.plugin.meta.id
    return {
      meta: e.plugin.meta,
      enabled: e.enabled,
      config: e.config,
      schema: e.plugin.config ?? [],
      setEnabled: (on) => reg.setEnabled(id, on),
      setConfig: (patch) => reg.setConfig(id, patch),
      resetConfig: () => reg.resetConfig(id),
      refresh: () => reg.requestRefresh(id),
    }
  })
  const byId = (id: string) => plugins.find((p) => p.meta.id === id)
  return { plugins, byId }
}

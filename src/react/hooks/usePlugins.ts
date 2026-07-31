import { useMemo, useSyncExternalStore } from 'react'
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
  const version = useSyncExternalStore(reg.on, () => reg.version)
  // Recomposé à la VERSION et non à chaque render : sans ce mémo, chaque rendu du
  // parent reconstruisait N vues et leurs quatre closures, alors que `useSyncExternalStore`
  // est justement là pour ne réagir qu'au store. `version` est la clé d'invalidation,
  // pas une valeur lue dans le corps — d'où le disable (même motif que `useTemplates`).
  return useMemo(() => {
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
    // Index plutôt qu'un `find` linéaire : `byId` est appelé par rangée de panneau.
    const index = new Map(plugins.map((p) => [p.meta.id, p]))
    return { plugins, byId: (id: string) => index.get(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg, version])
}

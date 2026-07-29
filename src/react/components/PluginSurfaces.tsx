import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useMapContext } from '../context'
import type { AnyPlugin } from '../../plugins/types'

/**
 * Monte les surfaces des plugins ACTIVÉS. Deux responsabilités :
 *  1. synchroniser la liste hôte `plugins` → `engine.plugins` (register/unregister par `meta.id`) ;
 *  2. rendre un `<PluginHost>` par plugin activé (voies A/C/setup — Tasks 7-8).
 * Un plugin désactivé n'a AUCUN hôte monté → coût nul.
 */
export function PluginSurfaces({ plugins }: { plugins?: readonly AnyPlugin[] }) {
  const { engine } = useMapContext()
  // Latest-ref : les définitions peuvent être recréées à chaque render côté hôte.
  const latest = useRef(plugins ?? [])
  latest.current = plugins ?? []

  useEffect(() => {
    const defs = latest.current
    const ids = new Set(defs.map((d) => d.meta.id))
    for (const d of defs) if (!engine.plugins.get(d.meta.id)) engine.plugins.register(d)
    for (const e of engine.plugins.list()) if (!ids.has(e.plugin.meta.id)) engine.plugins.unregister(e.plugin.meta.id)
  }, [engine, plugins])

  useSyncExternalStore(engine.plugins.on, () => engine.plugins.version)
  return (
    <>
      {engine.plugins
        .list()
        .filter((e) => e.enabled)
        .map((e) => (
          <PluginHost key={e.plugin.meta.id} id={e.plugin.meta.id} />
        ))}
    </>
  )
}

/** Coquille : rendra les voies A/C/setup en Tasks 7-8. */
function PluginHost({ id }: { id: string }) {
  void id
  return null
}

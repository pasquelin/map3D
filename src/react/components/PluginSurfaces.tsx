import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useMapContext } from '../context'
import { MarkerLayer } from './MarkerLayer'
import type { DataSource, MarkerData } from '../../data/types'
import type { AnyPlugin, PluginField } from '../../plugins/types'
import { defaultPluginFetchPolicy } from '../../plugins/fetchPolicy'

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

/** Une voie par plugin activé (A implémentée ici ; C/setup en Task 8). */
function PluginHost({ id }: { id: string }) {
  const { engine } = useMapContext()
  useSyncExternalStore(engine.plugins.on, () => engine.plugins.version)
  const entry = engine.plugins.get(id)
  if (!entry) return null
  const { plugin, config } = entry
  return <>{plugin.data && <PluginDataHost plugin={plugin} config={config} tick={engine.plugins.refreshTick(id)} />}</>
}

/** Signature des seuls champs `refetch: true` : ne relance `fetch` que sur eux (perf §9.5). */
function refetchSignature(config: Record<string, unknown>, schema: readonly PluginField[] | undefined): string {
  const parts: string[] = []
  for (const f of schema ?? []) if (f.refetch) parts.push(`${f.key}=${JSON.stringify(config[f.key])}`)
  return parts.join('&')
}

function PluginDataHost({
  plugin,
  config,
  tick,
}: {
  plugin: AnyPlugin
  config: Record<string, unknown>
  tick: number
}) {
  const { engine } = useMapContext()
  const dataDef = plugin.data
  const ml = plugin.markerLayer ?? {}

  // Config lue au moment du fetch (pas dans les deps du useMemo de la source) : les champs
  // cosmétiques ne recréent PAS la source, donc ne refetch pas — ils s'appliqueront au
  // prochain déplacement naturel. Seuls les champs `refetch` changent l'identité de la source.
  const cfgRef = useRef(config)
  cfgRef.current = config
  const refetchSig = refetchSignature(config, plugin.config)

  const policy = useMemo(
    () => ({ ...defaultPluginFetchPolicy, ...(dataDef?.fetchPolicy ?? {}) }),
    // dataDef stable tant que la définition ne change pas ; refetchSig ne concerne pas la policy
    [dataDef],
  )

  // Polling optionnel, pausé quand l'onglet est caché (perf §9.6).
  const [intervalTick, setIntervalTick] = useState(0)
  useEffect(() => {
    const r = dataDef?.refresh
    if (!r || typeof r !== 'object') return
    const timer = window.setInterval(() => {
      if (!document.hidden) setIntervalTick((t) => t + 1)
    }, r.intervalMs)
    return () => window.clearInterval(timer)
  }, [dataDef])

  // Nouvelle identité de source → useLiveData relance le fetch (abort de l'obsolète inclus).
  const source = useMemo<DataSource<MarkerData<unknown>>>(
    () => ({
      minZoom: dataDef?.minZoom,
      load: async (viewport, signal) => {
        if (!dataDef) return []
        const ctx = { engine, config: cfgRef.current, signal, fetchPolicy: policy, viewport }
        return dataDef.fetch(ctx as never)
      },
    }),
    // refetchSig / tick (manuel) / intervalTick recréent la source ; cfgRef évite les cosmétiques.
    [engine, dataDef, policy, refetchSig, tick, intervalTick],
  )

  // Callbacks mémoïsés : ne pas invalider les useMemo internes de MarkerLayer à chaque render (perf §9.10).
  const menu = useMemo(() => ml.menu, [ml])
  const tooltip = useMemo(() => ml.tooltip, [ml])
  const icon = useMemo(() => ml.icon, [ml])
  const typeLabel = useMemo(() => ml.typeLabel, [ml])

  return (
    <MarkerLayer<unknown>
      source={source}
      cluster={ml.cluster}
      icon={icon}
      tooltip={tooltip}
      menu={menu}
      typeLabel={typeLabel}
      size={ml.size}
    />
  )
}

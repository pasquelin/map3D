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

/** Une voie par plugin activé : A (`data`), C (`layer`) et cycle de vie (`setup`). */
function PluginHost({ id }: { id: string }) {
  const { engine } = useMapContext()
  useSyncExternalStore(engine.plugins.on, () => engine.plugins.version)
  const entry = engine.plugins.get(id)
  if (!entry) return null
  const { plugin, config } = entry
  return (
    <>
      {plugin.data && <PluginDataHost plugin={plugin} config={config} tick={engine.plugins.refreshTick(id)} />}
      {plugin.layer && <PluginLayerHost plugin={plugin} config={config} />}
      {plugin.setup && <PluginSetupHost plugin={plugin} config={config} />}
    </>
  )
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
    // refetchSig / tick (manuel) / intervalTick sont des casse-cache VOLONTAIRES : ils ne
    // sont lus par rien ci-dessus, mais recréer la source est le seul moyen de relancer le fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, dataDef, policy, refetchSig, tick, intervalTick],
  )

  // `plugin` est stable (identité portée par l'hôte) : sa déclaration l'est donc aussi,
  // pas besoin de useMemo dédié — étalée directement en props de <MarkerLayer>.
  return <MarkerLayer<unknown> source={source} {...(plugin.markerLayer ?? {})} />
}

/**
 * Voie C : contribue un `Layer` moteur brut. `Layer.setConfig` prend la config CARTE
 * (pas la config plugin), donc on recrée le layer à chaque changement de config plugin
 * (pas la garantie « jamais de remontage » de la voie markers — documenté).
 */
function PluginLayerHost({ plugin, config }: { plugin: AnyPlugin; config: Record<string, unknown> }) {
  const { engine } = useMapContext()
  const cfgSig = JSON.stringify(config)
  useEffect(() => {
    if (!plugin.layer) return
    const ctrl = new AbortController()
    const layer = plugin.layer({ engine, config, signal: ctrl.signal, fetchPolicy: defaultPluginFetchPolicy } as never)
    engine.addLayer(layer)
    return () => {
      ctrl.abort()
      engine.removeLayer(layer) // removeLayer appelle layer.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, plugin, cfgSig])
  return null
}

/** Cycle de vie global : setup une fois à l'activation, teardown à la désactivation. Config via ref. */
function PluginSetupHost({ plugin, config }: { plugin: AnyPlugin; config: Record<string, unknown> }) {
  const { engine } = useMapContext()
  const cfgRef = useRef(config)
  cfgRef.current = config
  useEffect(() => {
    if (!plugin.setup) return
    const ctrl = new AbortController()
    const teardown = plugin.setup({
      engine,
      config: cfgRef.current,
      signal: ctrl.signal,
      fetchPolicy: defaultPluginFetchPolicy,
    } as never)
    return () => {
      ctrl.abort()
      if (typeof teardown === 'function') teardown()
    }
  }, [engine, plugin])
  return null
}

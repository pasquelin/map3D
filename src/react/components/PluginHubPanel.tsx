import { useState } from 'react'
import { useLabels } from '../context'
import { usePlugins, type PluginView } from '../hooks/usePlugins'
import { formatLabel } from '../../labels/mergeLabels'
import { PluginConfigControls } from './PluginConfigControls'

/** Contenu du hub : liste des plugins + toggle + config dépliante auto-rendue. */
export function PluginHubPanel() {
  const labels = useLabels()
  const { plugins } = usePlugins()
  if (plugins.length === 0) return <div className="m3d-plugin-hub-empty">{labels.plugins.empty}</div>
  return (
    <div className="m3d-plugin-hub">
      <h2 className="m3d-plugin-hub-title">{labels.plugins.title}</h2>
      {plugins.map((p) => (
        <PluginRow key={p.meta.id} view={p} />
      ))}
    </div>
  )
}

function PluginRow({ view }: { view: PluginView }) {
  const labels = useLabels()
  const [open, setOpen] = useState(false)
  const hasConfig = view.schema.length > 0
  return (
    <div className="m3d-plugin-row">
      <div className="m3d-plugin-row-head">
        <button type="button" className="m3d-plugin-row-name" disabled={!hasConfig} onClick={() => setOpen((o) => !o)}>
          {view.meta.name}
        </button>
        <input
          type="checkbox"
          aria-label={formatLabel(labels.plugins.toggle, { name: view.meta.name })}
          checked={view.enabled}
          onChange={(e) => view.setEnabled(e.target.checked)}
        />
      </div>
      {open && hasConfig && (
        <div className="m3d-plugin-row-body">
          <PluginConfigControls schema={view.schema} config={view.config} onChange={view.setConfig} />
          <button type="button" className="m3d-plugin-reset" onClick={view.resetConfig}>
            {labels.plugins.reset}
          </button>
        </div>
      )}
    </div>
  )
}

import { mdiDeleteSweepOutline } from '@mdi/js'
import { useState } from 'react'
import { useLabels } from '../context'
import { usePlugins, type PluginView } from '../hooks/usePlugins'
import { formatLabel } from '../../labels/mergeLabels'
import { PluginConfigControls } from './PluginConfigControls'
import { UiIcon } from './UiIcon'

/**
 * Contenu du hub : liste des plugins + toggle + config dépliante auto-rendue.
 *
 * Mise en page partagée avec les réglages du catalogue (`.m3d-togglelist` : titre +
 * rangées « libellé / case à droite »), et même bouton de pied `.m3d-tagclear` —
 * ici « Tout désactiver » (pendant du « Tout retirer » du catalogue).
 */
export function PluginHubPanel() {
  const labels = useLabels()
  const { plugins } = usePlugins()
  if (plugins.length === 0) return <div className="m3d-togglelist-empty">{labels.plugins.empty}</div>
  const anyEnabled = plugins.some((p) => p.enabled)
  return (
    <div className="m3d-togglelist">
      <h2 className="m3d-togglelist-title">{labels.plugins.title}</h2>
      {plugins.map((p) => (
        <PluginRow key={p.meta.id} view={p} />
      ))}
      <button
        type="button"
        className="m3d-tagclear"
        disabled={!anyEnabled}
        onClick={() => plugins.forEach((p) => p.enabled && p.setEnabled(false))}
      >
        <UiIcon path={mdiDeleteSweepOutline} />
        {labels.plugins.clear}
      </button>
    </div>
  )
}

function PluginRow({ view }: { view: PluginView }) {
  const labels = useLabels()
  const [open, setOpen] = useState(false)
  const hasConfig = view.schema.length > 0
  return (
    <div className="m3d-plugin-row">
      <div className="m3d-togglerow">
        <button type="button" className="m3d-togglerow-name" disabled={!hasConfig} onClick={() => setOpen((o) => !o)}>
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

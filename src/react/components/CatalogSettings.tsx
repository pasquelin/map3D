import { mdiDeleteSweepOutline } from '@mdi/js'
import { useLabels } from '../context'
import { useCatalog, useCatalogSettings } from '../hooks/useCatalog'
import { UiIcon } from './UiIcon'

/**
 * Réglages du catalogue, dans le sous-panneau de l'engrenage.
 *
 * Rien de propre ici : mise en page partagée avec le hub des plugins — un titre
 * (`.m3d-togglelist-title`) puis des rangées « libellé à gauche / case à droite »
 * (`.m3d-togglerow` + `.m3d-togglerow-name`) ; « Tout retirer » garde le bouton de pied
 * `.m3d-tagclear`, comme « Réinitialiser cet outil » juste à côté. Les rangées sont des
 * `<label>` : cliquer le texte bascule sa case.
 *
 * L'état vient de `engine.catalogState`, partagé avec le panneau du catalogue : vider
 * la sélection d'ici vide la carte, sans que les deux surfaces aient à se connaître.
 */
export function CatalogSettingsPanel() {
  const labels = useLabels()
  const settings = useCatalogSettings()
  const catalog = useCatalog()

  return (
    <div className="m3d-togglelist">
      <h2 className="m3d-togglelist-title">{labels.catalog.settings.title}</h2>
      <label className="m3d-togglerow">
        <span className="m3d-togglerow-name">{labels.catalog.settings.persist}</span>
        <input type="checkbox" checked={settings.persist} onChange={(e) => settings.setPersist(e.target.checked)} />
      </label>
      <label className="m3d-togglerow">
        <span className="m3d-togglerow-name">{labels.catalog.settings.fitOnAdd}</span>
        <input type="checkbox" checked={settings.fitOnAdd} onChange={(e) => settings.setFitOnAdd(e.target.checked)} />
      </label>
      <button
        type="button"
        className="m3d-tagclear"
        disabled={catalog.selection.length === 0}
        onClick={() => catalog.clear()}
      >
        <UiIcon path={mdiDeleteSweepOutline} />
        {labels.catalog.settings.clear}
      </button>
    </div>
  )
}

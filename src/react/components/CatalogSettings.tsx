import { mdiDeleteSweepOutline } from '@mdi/js'
import { useLabels } from '../context'
import { useCatalog, useCatalogSettings } from '../hooks/useCatalog'
import { UiIcon } from './UiIcon'

/**
 * Réglages du catalogue, dans le sous-panneau de l'engrenage.
 *
 * Rien de propre ici : les deux interrupteurs reprennent la rangée à case du panneau
 * « Couches » (`.m3d-tagrow`), et « Tout retirer » son bouton de pied (`.m3d-tagclear`),
 * comme le fait déjà « Réinitialiser cet outil » juste à côté.
 *
 * L'état vient de `engine.catalogState`, partagé avec le panneau du catalogue : vider
 * la sélection d'ici vide la carte, sans que les deux surfaces aient à se connaître.
 */
export function CatalogSettingsPanel() {
  const labels = useLabels()
  const settings = useCatalogSettings()
  const catalog = useCatalog()

  return (
    <>
      <div className="m3d-taglist">
        <label className="m3d-tagrow">
          <input type="checkbox" checked={settings.persist} onChange={(e) => settings.setPersist(e.target.checked)} />
          <span className="m3d-taglabel">{labels.catalog.settings.persist}</span>
        </label>
        <label className="m3d-tagrow">
          <input type="checkbox" checked={settings.fitOnAdd} onChange={(e) => settings.setFitOnAdd(e.target.checked)} />
          <span className="m3d-taglabel">{labels.catalog.settings.fitOnAdd}</span>
        </label>
      </div>
      <button
        type="button"
        className="m3d-tagclear"
        disabled={catalog.selection.length === 0}
        onClick={() => catalog.clear()}
      >
        <UiIcon path={mdiDeleteSweepOutline} />
        {labels.catalog.settings.clear}
      </button>
    </>
  )
}

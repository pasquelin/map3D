import { mdiMagnifyExpand } from '@mdi/js'
import Icon from '@mdi/react'
import { useLabels } from '../context'
import { useLens } from '../hooks/useLens'
import { TIP_ID } from './Toolbar'
import { ICON_SIZE, useTip } from './tooltip'

/**
 * Bouton de l'outil loupe, à insérer dans `<Toolbar extraTools={<LensToolButton />}>`.
 * Item principal de la barre (même langage que les outils de dessin) ; pilote
 * `useLens()`. Nécessite un `<LensLayer>` au-dessus (fournit le contexte) et un
 * `<Toolbar>` (fournit le `<Tooltip>` partagé).
 */
export function LensToolButton() {
  const lens = useLens()
  const labels = useLabels()
  const tip = useTip(TIP_ID)
  return (
    <button
      {...tip(labels.lens.tool, lens.shortcut ?? undefined)}
      className={`m3d-btn${lens.active ? ' m3d-on' : ''}`}
      onClick={lens.toggle}
    >
      <Icon path={mdiMagnifyExpand} size={ICON_SIZE} />
    </button>
  )
}

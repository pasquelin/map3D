import { mdiMagnifyExpand } from '@mdi/js'
import { useLabels } from '../context'
import { useLens } from '../hooks/useLens'
import { TIP_ID } from './Toolbar'
import { ToolButton } from './ToolButton'
import { useTip } from './tooltip'

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
    <ToolButton
      icon={mdiMagnifyExpand}
      label={labels.lens.tool}
      tip={tip}
      shortcut={lens.shortcut ?? undefined}
      active={lens.active}
      onClick={lens.toggle}
    />
  )
}

import { mdiMagnifyExpand } from '@mdi/js'
import { useContext } from 'react'
import { LensContext, useLabels, useToolbar } from '../context'
import { ToolButton } from './ToolButton'
import { useTip } from './tooltip'

/**
 * Bouton de l'outil loupe — item principal de la barre, au même langage visuel que
 * les outils de dessin. Rendu par `<Toolbar>` elle-même : rien à câbler côté
 * application. Il ne s'affiche que si la loupe est montée (`toolbar.lens`, le défaut) ;
 * une carte sans loupe le fait disparaître au lieu de planter, comme la palette de
 * symboles quand l'outil est désactivé.
 *
 * Exporté pour un placement manuel (barre maison) ; il suppose alors un `<Toolbar>`
 * quelque part, qui fournit le `<Tooltip>` partagé.
 */
export function LensToolButton() {
  const lens = useContext(LensContext)
  const labels = useLabels()
  const tip = useTip(useToolbar().tipId)
  if (!lens) return null
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

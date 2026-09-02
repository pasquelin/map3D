import { mdiEraser } from '@mdi/js'
import type { ReactNode } from 'react'
import type { EraseMode } from '../../layers/DrawLayer'
import { useConfig, useLabels, useToolbar } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { ERASE_MODE_META } from './drawControls'
import { FlyoutToolButton } from './FlyoutToolButton'
import { useTip } from './tooltip'

/**
 * Bouton « Gomme » et son sous-menu (ponctuelle / sélection / tout effacer), ouvert au
 * SURVOL du côté opposé à la barre — même châssis que `SelectToolButton` (`FlyoutToolButton`).
 *
 * Le flyout ne choisit que POINT vs SÉLECTION : le sous-mode du marquee (rect/poly/lasso)
 * reste celui du sélecteur (`selectMode`), pas de 2ᵉ jeu de modes à tenir. La gomme ne
 * règle aucun style (comme `select`), donc rien à publier comme ancre.
 *
 * Se retire de la barre tant que rien n'est effaçable (`config.toolbar.autoHide.erase`) :
 * une gomme sans cible n'est pas un outil indisponible, c'est un outil sans emploi.
 */
export function EraseToolButton({
  position,
  modes,
  clearRow,
}: {
  position: 'left' | 'right'
  modes?: EraseMode[]
  /** Rangée « Tout effacer », résolue par la barre (section `clear` de `components`). */
  clearRow?: ReactNode
}) {
  const { tool, setTool, eraseMode, setEraseMode, shortcuts, canErase } = useDrawing()
  const labels = useLabels()
  const tip = useTip(useToolbar().tipId)
  // Hooks appelés INCONDITIONNELLEMENT, avant tout retour anticipé (même piège que
  // `ToolButton` et `Toolbar` avec `useConfig`) : la sortie « rien à effacer » est plus bas.
  const autoHide = useConfig().toolbar.autoHide.erase

  const active = tool === 'erase'
  const available = modes ? ERASE_MODE_META.filter((m) => modes.includes(m.mode)) : ERASE_MODE_META

  // Le composant reste MONTÉ et rend `null` : le relâchement de l'outil armé et le refus
  // de le rearmer au clavier vivent dans `<DrawLayer>`, sur la même source de vérité —
  // un bouton qui se démonte n'aurait pas pu tenir la seconde règle.
  if (autoHide && !canErase) return null

  return (
    <FlyoutToolButton
      position={position}
      icon={mdiEraser}
      label={labels.tools.erase}
      tip={tip}
      shortcut={shortcuts.erase}
      active={active}
      onClick={() => {
        // Mode courant hors liste (config restreinte) : bascule sur le 1er autorisé.
        if (!active && available.length > 0 && !available.some((m) => m.mode === eraseMode)) {
          setEraseMode(available[0]!.mode)
        }
        setTool(active ? null : 'erase')
      }}
      rows={available.map((m) => ({
        key: m.mode,
        icon: m.icon,
        label: labels.eraseModes[m.mode].label,
        description: labels.eraseModes[m.mode].description,
        shortcut: shortcuts[m.action],
        on: active && eraseMode === m.mode,
        onSelect: () => {
          setEraseMode(m.mode)
          setTool('erase')
        },
      }))}
      // En DERNIER, après les modes : c'est la seule rangée destructrice du menu, et
      // elle n'arme rien — un clic et tout est effacé.
      trailing={clearRow}
    />
  )
}

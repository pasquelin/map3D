import { mdiEraser } from '@mdi/js'
import { type ReactNode, useRef } from 'react'
import type { EraseMode } from '../../layers/DrawLayer'
import { useConfig, useLabels } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { ERASE_MODE_META } from './drawControls'
import { DropdownSurface } from './Dropdown'
import { useHoverFlyout, useToolbar } from './Toolbar'
import { ToolButton } from './ToolButton'
import { useTip } from './tooltip'
import { UiIcon } from './UiIcon'

/**
 * Bouton « Gomme » et son sous-menu (ponctuelle / sélection / tout effacer), ouvert au
 * SURVOL du côté opposé à la barre — même châssis que `SelectToolButton` (`useHoverFlyout`).
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
  const wrapRef = useRef<HTMLDivElement>(null)
  // Hooks appelés INCONDITIONNELLEMENT, avant tout retour anticipé (même piège que
  // `ToolButton` et `Toolbar` avec `useConfig`) : la sortie « rien à effacer » est plus bas.
  const autoHide = useConfig().toolbar.autoHide.erase

  const active = tool === 'erase'
  const available = modes ? ERASE_MODE_META.filter((m) => modes.includes(m.mode)) : ERASE_MODE_META
  // « Tout effacer » compte comme une rangée : sans elle dans le décompte, un seul mode
  // autorisé aurait fermé le sous-menu alors qu'il a bien deux lignes à montrer.
  const flyout = useHoverFlyout(available.length + (clearRow ? 1 : 0))

  // Le composant reste MONTÉ et rend `null` : le relâchement de l'outil armé et le refus
  // de le rearmer au clavier vivent dans `<DrawLayer>`, sur la même source de vérité —
  // un bouton qui se démonte n'aurait pas pu tenir la seconde règle.
  if (autoHide && !canErase) return null

  return (
    <div ref={wrapRef} {...flyout.wrapProps}>
      <ToolButton
        icon={mdiEraser}
        label={labels.tools.erase}
        // Infobulle seulement sans sous-menu (mêmes raisons que `SelectToolButton`) ; les
        // rangées portent la leur, avec leur raccourci.
        tip={flyout.hasFlyout ? undefined : tip}
        shortcut={shortcuts.erase}
        active={active}
        className={flyout.hasFlyout ? 'm3d-btn-flyout' : undefined}
        onClick={() => {
          // Mode courant hors liste (config restreinte) : bascule sur le 1er autorisé.
          if (!active && available.length > 0 && !available.some((m) => m.mode === eraseMode)) {
            setEraseMode(available[0]!.mode)
          }
          setTool(active ? null : 'erase')
        }}
      />
      {flyout.showing && (
        <DropdownSurface anchor={wrapRef.current} position={position} clampHeight={false} panelClassName="m3d-flyout">
          {available.map((m) => (
            <button
              key={m.mode}
              {...tip(labels.eraseModes[m.mode].description, shortcuts[m.action])}
              className={`m3d-flyout-item${active && eraseMode === m.mode ? ' m3d-on' : ''}`}
              onClick={() => {
                setEraseMode(m.mode)
                setTool('erase')
                flyout.close()
              }}
            >
              <UiIcon path={m.icon} />
              <span className="m3d-flyout-label">{labels.eraseModes[m.mode].label}</span>
            </button>
          ))}
          {/* En DERNIER, après les modes : c'est la seule rangée destructrice du menu, et
              elle n'arme rien — un clic et tout est effacé. Le survol qui sort referme le
              menu, aucun `close()` à poser. */}
          {clearRow}
        </DropdownSurface>
      )}
    </div>
  )
}

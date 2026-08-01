import { mdiEraser } from '@mdi/js'
import { useRef } from 'react'
import type { EraseMode } from '../../layers/DrawLayer'
import { useLabels } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { ERASE_MODE_META } from './drawControls'
import { DropdownSurface } from './Dropdown'
import { TIP_ID, useHoverFlyout } from './Toolbar'
import { ToolButton } from './ToolButton'
import { useTip } from './tooltip'
import { UiIcon } from './UiIcon'

/**
 * Bouton « Gomme » et son sous-menu (ponctuelle / sélection), ouvert au SURVOL du côté
 * opposé à la barre — même châssis que `SelectToolButton` (`useHoverFlyout`).
 *
 * Le flyout ne choisit que POINT vs SÉLECTION : le sous-mode du marquee (rect/poly/lasso)
 * reste celui du sélecteur (`selectMode`), pas de 2ᵉ jeu de modes à tenir. La gomme n'a
 * pas de panneau de style (comme `select`), donc rien à publier comme ancre.
 */
export function EraseToolButton({ position, modes }: { position: 'left' | 'right'; modes?: EraseMode[] }) {
  const { tool, setTool, eraseMode, setEraseMode, shortcuts } = useDrawing()
  const labels = useLabels()
  const tip = useTip(TIP_ID)
  const wrapRef = useRef<HTMLDivElement>(null)

  const active = tool === 'erase'
  const available = modes ? ERASE_MODE_META.filter((m) => modes.includes(m.mode)) : ERASE_MODE_META
  const flyout = useHoverFlyout(available.length)

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
        </DropdownSurface>
      )}
    </div>
  )
}

import { mdiRuler } from '@mdi/js'
import { useRef } from 'react'
import type { MeasureTool } from '../../layers/DrawLayer'
import { useLabels } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { MEASURE_TOOL_META } from './drawControls'
import { DropdownSurface } from './Dropdown'
import { useHoverFlyout, useToolbar } from './Toolbar'
import { ToolButton } from './ToolButton'
import { useTip } from './tooltip'
import { UiIcon } from './UiIcon'

/**
 * Bouton « Mesures » et son sous-menu, ouvert au SURVOL du côté opposé à la barre — même
 * châssis que `SelectToolButton` (`useHoverFlyout`).
 *
 * ⚠️ Avec une seule rangée disponible, le sous-menu ne s'ouvre PAS : le bouton agit
 * directement et retrouve son infobulle. C'est l'état courant — la grille de coordonnées y a
 * vécu un temps avant de rejoindre les contrôles de vue, où elle survit au repli de la barre.
 * Le châssis reste monté pour la rangée suivante, et parce qu'il publie l'ancre de l'outil
 * actif (cf. `publishActiveTool`).
 */
export function MeasureToolButton({ position, tools }: { position: 'left' | 'right'; tools?: MeasureTool[] }) {
  const { tool, setTool, shortcuts } = useDrawing()
  const labels = useLabels()
  const bar = useToolbar()
  const tip = useTip(bar.tipId)
  const wrapRef = useRef<HTMLDivElement>(null)

  const active = tool === 'measure'
  const available = tools ? MEASURE_TOOL_META.filter((m) => tools.includes(m.tool)) : MEASURE_TOOL_META
  // Châssis partagé avec le sélecteur : ouverture au survol, effacement devant un dropdown,
  // fermeture au repli de la barre.
  const flyout = useHoverFlyout(available.length)

  return (
    <div ref={wrapRef} {...flyout.wrapProps}>
      <ToolButton
        // Publie son bouton comme ancre de l'outil actif : `measure` a quitté la boucle
        // `tools.map`, qui s'en chargeait pour les boutons simples.
        ref={active ? bar.publishActiveTool : null}
        icon={mdiRuler}
        label={labels.tools.measure}
        // Infobulle SEULEMENT sans sous-menu. Quand le survol ouvre une surface, l'infobulle
        // venait se poser par-dessus celle qu'on est en train de lire ; les rangées portent
        // alors la leur, avec leur raccourci. (`ToolButton` garde son `aria-label` dans les
        // deux cas — un bouton sans infobulle n'est jamais un bouton sans nom accessible.)
        tip={flyout.hasFlyout ? undefined : tip}
        shortcut={shortcuts.measure}
        active={active}
        className={flyout.hasFlyout ? 'm3d-btn-flyout' : undefined}
        onClick={() => setTool(active ? null : 'measure')}
      />
      {flyout.showing && (
        <DropdownSurface anchor={wrapRef.current} position={position} clampHeight={false} panelClassName="m3d-flyout">
          {available.map((m) => (
            <button
              key={m.tool}
              {...tip(labels.measureTools[m.tool].description, shortcuts.measure)}
              className={`m3d-flyout-item${active ? ' m3d-on' : ''}`}
              onClick={() => {
                setTool(active ? null : 'measure')
                flyout.close()
              }}
            >
              <UiIcon path={m.icon} />
              <span className="m3d-flyout-label">{labels.measureTools[m.tool].label}</span>
            </button>
          ))}
        </DropdownSurface>
      )}
    </div>
  )
}

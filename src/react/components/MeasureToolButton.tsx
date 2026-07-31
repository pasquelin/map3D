import { mdiRuler } from '@mdi/js'
import { useRef, useState } from 'react'
import type { MeasureTool } from '../../layers/DrawLayer'
import { useConfig, useLabels } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { useGraticule } from '../hooks/useGraticule'
import { MEASURE_TOOL_META } from './drawControls'
import { DropdownSurface, useYieldsToDropdown } from './Dropdown'
import { TIP_ID, useToolbar } from './Toolbar'
import { ToolButton } from './ToolButton'
import { useTip } from './tooltip'
import { UiIcon } from './UiIcon'
import { useCloseWhenHidden } from './useDismiss'

/**
 * Bouton « Mesures » + sous-menu (mesurer, grille de coordonnées), ouvert au SURVOL du côté
 * opposé à la barre — même patron que `SelectToolButton`, dont il partage le châssis.
 *
 * Les deux rangées ne sont pas de même nature, exactement comme la ligne « bâtiment » du
 * sélecteur : `measure` est un outil de tracé, `graticule` un CALQUE. D'où la différence de
 * comportement au clic — allumer la grille ne relâche rien, alors qu'activer la règle quitte
 * l'outil courant.
 */
export function MeasureToolButton({ position, tools }: { position: 'left' | 'right'; tools?: MeasureTool[] }) {
  const { tool, setTool, shortcuts } = useDrawing()
  const graticule = useGraticule()
  const labels = useLabels()
  const graticuleKey = useConfig().interaction.shortcuts.draw.graticule
  const tip = useTip(TIP_ID)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  useCloseWhenHidden(useToolbar().retracted, setOpen)

  const active = tool === 'measure'
  const available = tools ? MEASURE_TOOL_META.filter((m) => tools.includes(m.tool)) : MEASURE_TOOL_META
  // Même règle que le sélecteur : une seule rangée disponible = pas de sous-menu, et le
  // survol ne doit pas venir poser une surface par-dessus un dropdown déjà ouvert.
  const dropdownOuvert = useYieldsToDropdown()
  const hasFlyout = available.length > 1 && !dropdownOuvert
  const shortcutOf = (t: MeasureTool) => (t === 'measure' ? shortcuts.measure : graticuleKey)
  const isOn = (t: MeasureTool) => (t === 'measure' ? active : graticule.visible)

  return (
    <div
      ref={wrapRef}
      className="m3d-selectwrap"
      onPointerEnter={hasFlyout ? () => setOpen(true) : undefined}
      onPointerLeave={hasFlyout ? () => setOpen(false) : undefined}
    >
      <ToolButton
        icon={mdiRuler}
        label={labels.tools.measure}
        tip={tip}
        shortcut={shortcuts.measure}
        // Allumé si l'UN des deux l'est : la barre doit dire qu'il se passe quelque chose
        // sous ce bouton, même quand c'est la grille et non la règle.
        active={active || graticule.visible}
        className={hasFlyout ? 'm3d-btn-flyout' : undefined}
        onClick={() => setTool(active ? null : 'measure')}
      />
      {open && hasFlyout && (
        <DropdownSurface anchor={wrapRef.current} position={position} clampHeight={false} panelClassName="m3d-flyout">
          {available.map((m) => (
            <button
              key={m.tool}
              {...tip(labels.measureTools[m.tool].description, shortcutOf(m.tool))}
              className={`m3d-flyout-item${isOn(m.tool) ? ' m3d-on' : ''}`}
              onClick={() => {
                // La grille est un CALQUE : l'allumer ne doit ni quitter l'outil de tracé ni
                // interrompre un tracé en cours. Seule la règle est un outil exclusif.
                if (m.tool === 'graticule') graticule.toggle()
                else setTool(active ? null : 'measure')
                setOpen(false)
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

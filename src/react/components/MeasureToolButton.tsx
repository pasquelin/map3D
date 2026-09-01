import { mdiRuler } from '@mdi/js'
import type { MeasureTool } from '../../layers/DrawLayer'
import { useLabels, useToolbar } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { MEASURE_TOOL_META } from './drawControls'
import { FlyoutToolButton } from './FlyoutToolButton'
import { useTip } from './tooltip'

/**
 * Bouton « Mesures » et son sous-menu, ouvert au SURVOL du côté opposé à la barre — même
 * châssis que `SelectToolButton` (`FlyoutToolButton`).
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

  const active = tool === 'measure'
  const available = tools ? MEASURE_TOOL_META.filter((m) => tools.includes(m.tool)) : MEASURE_TOOL_META
  const toggle = () => setTool(active ? null : 'measure')

  return (
    <FlyoutToolButton
      position={position}
      // Publie son bouton comme ancre de l'outil actif : `measure` a quitté la boucle
      // `tools.map`, qui s'en chargeait pour les boutons simples.
      buttonRef={active ? bar.publishActiveTool : null}
      icon={mdiRuler}
      label={labels.tools.measure}
      tip={tip}
      shortcut={shortcuts.measure}
      active={active}
      onClick={toggle}
      rows={available.map((m) => ({
        key: m.tool,
        icon: m.icon,
        label: labels.measureTools[m.tool].label,
        description: labels.measureTools[m.tool].description,
        shortcut: shortcuts.measure,
        on: active,
        onSelect: toggle,
      }))}
    />
  )
}

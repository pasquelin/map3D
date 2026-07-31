import { mdiRuler } from '@mdi/js'
import { useRef } from 'react'
import type { MeasureTool } from '../../layers/DrawLayer'
import { useConfig, useLabels } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { useGraticule } from '../hooks/useGraticule'
import { MEASURE_TOOL_META } from './drawControls'
import { DropdownSurface } from './Dropdown'
import { TIP_ID, useHoverFlyout, useToolbar } from './Toolbar'
import { ToolButton } from './ToolButton'
import { useTip } from './tooltip'
import { UiIcon } from './UiIcon'

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
  // Même table que le bouton des contrôles de vue : les deux affichent LA MÊME touche, et
  // c'est là que le dispatch clavier va la chercher.
  const graticuleKey = useConfig().interaction.shortcuts.controls.graticule
  const tip = useTip(TIP_ID)
  const wrapRef = useRef<HTMLDivElement>(null)
  const bar = useToolbar()

  const active = tool === 'measure'
  const available = tools ? MEASURE_TOOL_META.filter((m) => tools.includes(m.tool)) : MEASURE_TOOL_META
  // Châssis partagé avec le sélecteur : ouverture au survol, effacement devant un dropdown,
  // fermeture au repli de la barre.
  const flyout = useHoverFlyout(available.length)
  const shortcutOf = (t: MeasureTool) => (t === 'measure' ? shortcuts.measure : graticuleKey)
  const isOn = (t: MeasureTool) => (t === 'measure' ? active : graticule.visible)

  return (
    <div ref={wrapRef} {...flyout.wrapProps}>
      <ToolButton
        // Publie son bouton comme ancre de l'outil actif : c'est lui que le panneau de style
        // doit longer. Sans ça, `measure` ayant quitté la boucle `tools.map` qui s'en
        // chargeait, le panneau se recollait en haut de la barre.
        ref={active ? bar.publishActiveTool : null}
        icon={mdiRuler}
        label={labels.tools.measure}
        // PAS de `tip` : le survol de ce bouton ouvre déjà le sous-menu, et l'infobulle
        // venait se poser par-dessus la surface qu'on est en train de lire. Les rangées du
        // menu portent leur propre infobulle, avec leur raccourci — rien n'est perdu.
        // (`ToolButton` garde son `aria-label`, raccourci compris, même sans tooltip.)
        shortcut={shortcuts.measure}
        // Allumé si l'UN des deux l'est : la barre doit dire qu'il se passe quelque chose
        // sous ce bouton, même quand c'est la grille et non la règle.
        active={active || graticule.visible}
        className={flyout.hasFlyout ? 'm3d-btn-flyout' : undefined}
        onClick={() => setTool(active ? null : 'measure')}
      />
      {flyout.showing && (
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

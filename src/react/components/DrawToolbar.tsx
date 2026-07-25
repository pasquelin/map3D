import {
  mdiArrowTopRight,
  mdiCircleOutline,
  mdiEraser,
  mdiGesture,
  mdiHandBackRightOutline,
  mdiRuler,
  mdiTrashCanOutline,
  mdiUndo,
  mdiVectorLine,
  mdiVectorPolygon,
  mdiVectorRectangle,
} from '@mdi/js'
import Icon from '@mdi/react'
import { useEffect, useState } from 'react'
import { Tooltip } from 'react-tooltip'
import 'react-tooltip/dist/react-tooltip.css'
import { zoomForAltitude } from '../../core/MapEngine'
import type { DrawTool } from '../../layers/DrawLayer'
import { useMapContext } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { ICON_SIZE, tipProps } from './tooltip'

export type DrawToolbarProps = {
  position?: 'left' | 'right'
  /** Zoom minimal d'affichage — dessiner n'a de sens qu'en vue rapprochée ; en deçà la barre glisse hors écran. */
  minZoom?: number
  /** Outils affichés, dans l'ordre (défaut : tous). */
  tools?: DrawTool[]
}

const TIP_ID = 'm3d-draw-tip'

const TOOL_META: Record<DrawTool, { icon: string; label: string }> = {
  line: { icon: mdiVectorLine, label: 'Ligne' },
  polygon: { icon: mdiVectorPolygon, label: 'Polygone' },
  rect: { icon: mdiVectorRectangle, label: 'Rectangle' },
  circle: { icon: mdiCircleOutline, label: 'Cercle' },
  freehand: { icon: mdiGesture, label: 'Main levée' },
  arrow: { icon: mdiArrowTopRight, label: 'Flèche' },
  measure: { icon: mdiRuler, label: 'Mesurer' },
  erase: { icon: mdiEraser, label: 'Effacer' },
}

const DEFAULT_TOOLS: DrawTool[] = ['line', 'polygon', 'rect', 'circle', 'freehand', 'arrow', 'measure', 'erase']

/**
 * Barre d'outils de dessin (navigation, formes, gomme, annuler, tout effacer).
 * Nécessite un `<DrawLayer>` monté (elle pilote `useDrawing()`). Masquée sous
 * `minZoom` (glisse hors écran) : dessiner n'a de sens qu'en vue rapprochée.
 */
export function DrawToolbar({ position = 'left', minZoom = 11, tools = DEFAULT_TOOLS }: DrawToolbarProps) {
  const { tool, setTool, undo, clear } = useDrawing()
  const { engine } = useMapContext()
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    const below = (altitude: number) =>
      zoomForAltitude(Math.max(1, altitude - engine.terrainHeight)) < minZoom
    setHidden(below(engine.camera.getState().altitude))
    return engine.on('camera', (s) => setHidden(below(s.altitude)))
  }, [engine, minZoom])

  const tip = (label: string) => tipProps(TIP_ID, label)
  const toggle = (t: DrawTool) => setTool(tool === t ? null : t)

  return (
    <>
      <div className={`m3d-drawbar m3d-${position}${hidden ? ' m3d-hidden' : ''}`}>
        <button {...tip('Naviguer')} className={`m3d-btn${tool === null ? ' m3d-on' : ''}`} onClick={() => setTool(null)}>
          <Icon path={mdiHandBackRightOutline} size={ICON_SIZE} />
        </button>
        {tools.map((t) => (
          <button key={t} {...tip(TOOL_META[t].label)} className={`m3d-btn${tool === t ? ' m3d-on' : ''}`} onClick={() => toggle(t)}>
            <Icon path={TOOL_META[t].icon} size={ICON_SIZE} />
          </button>
        ))}
        <button {...tip('Annuler')} className="m3d-btn" onClick={undo}>
          <Icon path={mdiUndo} size={ICON_SIZE} />
        </button>
        <button {...tip('Tout effacer')} className="m3d-btn" onClick={clear}>
          <Icon path={mdiTrashCanOutline} size={ICON_SIZE} />
        </button>
      </div>
      <Tooltip id={TIP_ID} place={position === 'left' ? 'right' : 'left'} />
    </>
  )
}

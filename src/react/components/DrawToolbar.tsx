import {
  mdiCursorDefaultOutline,
  mdiHandBackRightOutline,
  mdiRedo,
  mdiTrashCanOutline,
  mdiUndo,
} from '@mdi/js'
import Icon from '@mdi/react'
import { type ReactNode, useEffect, useState } from 'react'
import { Tooltip } from 'react-tooltip'
import 'react-tooltip/dist/react-tooltip.css'
import { zoomForAltitude } from '../../core/MapEngine'
import type { DrawTool, SelectMode } from '../../layers/DrawLayer'
import { useLabels, useMapContext } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { SELECT_MODE_META, TOOL_ICONS } from './drawControls'
import { DrawSettingsButton } from './DrawSettingsPanel'
import { DrawStylePanel } from './DrawStylePanel'
import { modKey } from './shortcuts'
import { ICON_SIZE, useTip } from './tooltip'

/** Sections optionnelles de la barre : `false` pour masquer, ReactNode pour remplacer. */
export type DrawToolbarSection = 'navigate' | 'select' | 'stylePanel' | 'settings' | 'undo' | 'redo' | 'clear'

export type DrawToolbarProps = {
  position?: 'left' | 'right'
  /** Zoom minimal d'affichage — dessiner n'a de sens qu'en vue rapprochée ; en deçà la barre glisse hors écran. */
  minZoom?: number
  /** Outils affichés, dans l'ordre (`'select'` inclus — défaut : tous). */
  tools?: DrawTool[]
  /** Modes proposés par le flyout de sélection (défaut : les 3) ; un seul = pas de flyout. */
  selectModes?: SelectMode[]
  /** Masque (`false`) ou remplace (ReactNode) chaque section — défaut : tout affiché. */
  components?: Partial<Record<DrawToolbarSection, boolean | ReactNode>>
}

const TIP_ID = 'm3d-draw-tip'

const DEFAULT_TOOLS: DrawTool[] = [
  'select',
  'line',
  'polygon',
  'rect',
  'circle',
  'freehand',
  'arrow',
  'measure',
  'erase',
]

/**
 * Barre d'outils de dessin (navigation, formes, gomme, annuler, tout effacer).
 * Nécessite un `<DrawLayer>` monté (elle pilote `useDrawing()`). Masquée sous
 * `minZoom` (glisse hors écran) : dessiner n'a de sens qu'en vue rapprochée.
 */
export function DrawToolbar({
  position = 'left',
  minZoom = 11,
  tools = DEFAULT_TOOLS,
  selectModes,
  components = {},
}: DrawToolbarProps) {
  const { tool, setTool, undo, redo, canUndo, canRedo, clear, shortcuts } = useDrawing()
  const { engine } = useMapContext()
  const labels = useLabels()
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    const below = (altitude: number) =>
      zoomForAltitude(Math.max(1, altitude - engine.terrainHeight)) < minZoom
    setHidden(below(engine.camera.getState().altitude))
    return engine.on('camera', (s) => setHidden(below(s.altitude)))
  }, [engine, minZoom])

  const tip = useTip(TIP_ID)
  const toggle = (t: DrawTool) => setTool(tool === t ? null : t)
  const undoKey = `${modKey}Z`
  /** Section configurable : masquée (false), remplacée (ReactNode) ou par défaut. */
  const slot = (key: DrawToolbarSection, node: ReactNode): ReactNode => {
    const c = components[key]
    if (c === false) return null
    if (c !== undefined && c !== true) return c
    return node
  }

  return (
    <>
      <div className={`m3d-drawbar m3d-${position}${hidden ? ' m3d-hidden' : ''}`}>
        {slot(
          'navigate',
          <button {...tip(labels.toolbar.navigate, labels.keys.escape)} className={`m3d-btn${tool === null ? ' m3d-on' : ''} m3d-btn-move`} onClick={() => setTool(null)}>
            <Icon path={mdiHandBackRightOutline} size={ICON_SIZE} />
          </button>,
        )}
        {tools.map((t) =>
          t === 'select' ? (
            slot('select', <SelectToolButton key={t} position={position} modes={selectModes} />)
          ) : (
            <button key={t} {...tip(labels.tools[t], shortcuts[t])} className={`m3d-btn${tool === t ? ' m3d-on' : ''}`} onClick={() => toggle(t)}>
              <Icon path={TOOL_ICONS[t]} size={ICON_SIZE} />
            </button>
          ),
        )}
        {slot(
          'undo',
          <button {...tip(labels.toolbar.undo, undoKey)} className="m3d-btn" onClick={undo} disabled={!canUndo}>
            <Icon path={mdiUndo} size={ICON_SIZE} />
          </button>,
        )}
        {slot(
          'redo',
          <button {...tip(labels.toolbar.redo, `⇧${undoKey}`)} className="m3d-btn" onClick={redo} disabled={!canRedo}>
            <Icon path={mdiRedo} size={ICON_SIZE} />
          </button>,
        )}
        {slot('settings', <DrawSettingsButton position={position} tip={tip} />)}
        {slot(
          'clear',
          <button {...tip(labels.toolbar.clearAll)} className="m3d-btn m3d-btn-delete" onClick={clear}>
            <Icon path={mdiTrashCanOutline} size={ICON_SIZE} />
          </button>,
        )}
      </div>
      {!hidden && slot('stylePanel', <DrawStylePanel position={position} />)}
      <Tooltip id={TIP_ID} place={position === 'left' ? 'right' : 'left'} />
    </>
  )
}

/**
 * Bouton Sélectionner + flyout des modes (rectangle, polygone, lasso), ouvert au
 * SURVOL du côté opposé à la barre. Les sous-boutons affichent icône + libellé ;
 * le raccourci est dans leur tooltip (même convention que les autres boutons).
 */
function SelectToolButton({ position, modes }: { position: 'left' | 'right'; modes?: SelectMode[] }) {
  const { tool, setTool, selectMode, setSelectMode, shortcuts } = useDrawing()
  const labels = useLabels()
  const tip = useTip(TIP_ID)
  const [open, setOpen] = useState(false)

  const active = tool === 'select'
  const available = modes ? SELECT_MODE_META.filter((m) => modes.includes(m.mode)) : SELECT_MODE_META
  const hasFlyout = available.length > 1

  return (
    <div
      className="m3d-selectwrap"
      onPointerEnter={hasFlyout ? () => setOpen(true) : undefined}
      onPointerLeave={hasFlyout ? () => setOpen(false) : undefined}
    >
      <button
        aria-label={labels.tools.select}
        className={`m3d-btn${hasFlyout ? ' m3d-btn-flyout' : ''}${active ? ' m3d-on' : ''}`}
        onClick={() => {
          // Mode courant hors liste (config restreinte) : bascule sur le 1er autorisé.
          if (!active && available.length > 0 && !available.some((m) => m.mode === selectMode)) {
            setSelectMode(available[0]!.mode)
          }
          setTool(active ? null : 'select')
        }}
      >
        <Icon path={mdiCursorDefaultOutline} size={ICON_SIZE} />
      </button>
      {open && hasFlyout && (
        <div className={`m3d-panel m3d-flyout m3d-${position}`}>
          {available.map((m) => (
            <button
              key={m.mode}
              {...tip(labels.selectModes[m.mode].description, shortcuts[m.action])}
              className={`m3d-flyout-item${active && selectMode === m.mode ? ' m3d-on' : ''}`}
              onClick={() => {
                setSelectMode(m.mode)
                setTool('select')
                setOpen(false)
              }}
            >
              <Icon path={m.icon} size={0.7} />
              <span className="m3d-flyout-label">{labels.selectModes[m.mode].label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

import {
  mdiCompassOutline,
  mdiCursorMove,
  mdiEarth,
  mdiFullscreen,
  mdiMinus,
  mdiPlus,
  mdiRotateOrbit,
  mdiVideo2d,
  mdiVideo3d,
} from '@mdi/js'
import Icon from '@mdi/react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Tooltip } from 'react-tooltip'
import 'react-tooltip/dist/react-tooltip.css'
import { useMapContext } from '../context'
import { plainKey } from './shortcuts'
import { TagFilterControl } from './TagFilterControl'
import { ICON_SIZE, tipProps } from './tooltip'

export type MapControlAction =
  | 'north'
  | 'zoomIn'
  | 'zoomOut'
  | 'tilt'
  | 'topDown'
  | 'globe'
  | 'layers'
  | 'fullscreen'

/** Boutons individuels de la barre (grain fin de `MapControlsProps.buttons`). */
export type MapControlButton =
  | 'pan'
  | 'rotate'
  | 'compass'
  | 'zoomIn'
  | 'zoomOut'
  | 'tilt'
  | 'topDown'
  | 'globe'
  | 'layers'
  | 'fullscreen'

export type MapControlsProps = {
  position?: 'left' | 'right'
  /** Grain GROUPE : masquer (`false`) ou remplacer (ReactNode) un groupe entier de la barre. */
  components?: Partial<Record<'drag' | 'compass' | 'zoom' | 'view' | 'layers' | 'fullscreen', boolean | ReactNode>>
  /**
   * Grain BOUTON : `false` masque un bouton précis (ex. `{ rotate: false, zoomOut: false }`).
   * Un groupe dont tous les boutons sont masqués disparaît, et le raccourci
   * clavier d'un bouton masqué est désactivé avec lui.
   */
  buttons?: Partial<Record<MapControlButton, boolean>>
  /**
   * Raccourcis clavier par action — `false` pour en désactiver un, une autre
   * touche pour le remapper si elle est déjà prise ailleurs dans l'app. Lettres
   * SEULES (pas de ⌘/Ctrl : les navigateurs réservent ⌘T/⌘N/⌘W…), identiques
   * Mac/PC, affichées dans les tooltips. Défauts : voir `DEFAULT_SHORTCUTS`
   * (README « Raccourcis clavier ») — sans collision avec les outils de dessin.
   */
  shortcuts?: Partial<Record<MapControlAction, string | false>>
}

/** Pas d'inclinaison par clic (rad). */
const TILT_STEP = Math.PI * 0.11
const TIP_ID = 'm3d-tooltip'

const DEFAULT_SHORTCUTS: Record<MapControlAction, string | false> = {
  north: 'n',
  zoomIn: '+',
  zoomOut: '-',
  tilt: 'i',
  /** N (nord) fait déjà la vue du dessus — pas de 2e touche par défaut. */
  topDown: false,
  globe: 'g',
  layers: 't',
  fullscreen: 'f',
}

function isNode(v: boolean | ReactNode | undefined): v is ReactNode {
  return v !== undefined && typeof v !== 'boolean'
}

/** Contrôles de navigation : déplacement/rotation du drag, boussole, zoom, inclinaison / vue du dessus / retour au globe, couches (filtre par tag), plein écran. */
export function MapControls({ position = 'right', components = {}, buttons = {}, shortcuts }: MapControlsProps) {
  const { engine } = useMapContext()

  // Mode du drag gauche (déplacer / pivoter) — source de vérité côté moteur.
  const [dragMode, setDragModeState] = useState(engine.getDragMode())
  useEffect(() => engine.on('dragmode', setDragModeState), [engine])

  const zoomBy = useCallback(
    (factor: number) => {
      const s = engine.camera.getState()
      engine.camera.flyTo({ lat: s.lat, lng: s.lng, altitude: s.altitude * factor }, { duration: 0.4 })
    },
    [engine],
  )
  const topDown = useCallback(() => engine.flyToTopDown(), [engine])
  const tiltUp = useCallback(() => engine.tiltBy(TILT_STEP), [engine])
  const globe = useCallback(() => engine.flyToGlobe(), [engine])
  const toggleFs = useCallback(() => {
    const root = engine.renderer.domElement.parentElement
    if (!document.fullscreenElement) root?.requestFullscreen?.()
    else document.exitFullscreen?.()
  }, [engine])

  type Slot = keyof NonNullable<MapControlsProps['components']>
  /** Le groupe PAR DÉFAUT est-il rendu ? (ni masqué, ni remplacé par un nœud custom)
   *  — même vérité pour le rendu et l'activation des raccourcis : un slot customisé
   *  ne garde pas d'action clavier fantôme. */
  const defaultShown = (key: Slot) => !isNode(components[key]) && components[key] !== false
  /** Ce bouton précis est-il visible ? (grain fin `buttons`, dans un groupe rendu) */
  const btn = (b: MapControlButton) => buttons[b] !== false
  const keys = { ...DEFAULT_SHORTCUTS, ...shortcuts }
  const tip = (label: string, action?: MapControlAction) => tipProps(TIP_ID, label, action && keys[action])

  // Raccourcis : listener monté UNE fois (les props sont lues via ref au moment de
  // la frappe — un littéral `shortcuts={{...}}` inline ne recrée pas le listener).
  const stateRef = useRef({ keys, defaultShown, btn })
  stateRef.current = { keys, defaultShown, btn }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = plainKey(e)
      if (!k) return
      const { keys, defaultShown, btn } = stateRef.current
      // '=' accepté pour zoomIn '+' : même touche sans Maj sur la plupart des claviers.
      const is = (a: MapControlAction) => k === keys[a] || (keys[a] === '+' && k === '=')
      // Un raccourci n'est actif que si SON bouton est visible (groupe + grain fin).
      if ((defaultShown('compass') && btn('compass') && is('north')) || (defaultShown('view') && btn('topDown') && is('topDown'))) topDown()
      else if (defaultShown('zoom') && btn('zoomIn') && is('zoomIn')) zoomBy(0.5)
      else if (defaultShown('zoom') && btn('zoomOut') && is('zoomOut')) zoomBy(2)
      else if (defaultShown('view') && btn('tilt') && is('tilt')) tiltUp()
      else if (defaultShown('view') && btn('globe') && is('globe')) globe()
      else if (defaultShown('fullscreen') && btn('fullscreen') && is('fullscreen')) toggleFs()
      else return
      // Raccourci consommé : pas d'action par défaut du navigateur (ex. frappe
      // insérée si un champ vient de prendre le focus).
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [topDown, zoomBy, tiltUp, globe, toggleFs])

  return (
    <div className={`m3d-controls m3d-${position}`}>
      {isNode(components.drag)
        ? components.drag
        : defaultShown('drag') && (btn('pan') || btn('rotate')) && (
            <div className="m3d-controls-group">
              {btn('pan') && (
                <button
                  className={`m3d-btn${dragMode === 'pan' ? ' m3d-on' : ''}`}
                  {...tip('Déplacer la carte')}
                  onClick={() => engine.setDragMode('pan')}
                >
                  <Icon path={mdiCursorMove} size={ICON_SIZE} />
                </button>
              )}
              {btn('rotate') && (
                <button
                  className={`m3d-btn${dragMode === 'rotate' ? ' m3d-on' : ''}`}
                  {...tip('Pivoter la vue (MAJ)')}
                  onClick={() => engine.setDragMode('rotate')}
                >
                  <Icon path={mdiRotateOrbit} size={ICON_SIZE} />
                </button>
              )}
            </div>
          )}

      {isNode(components.compass)
        ? components.compass
        : defaultShown('compass') && btn('compass') && (
            <div className="m3d-controls-group">
              <button className="m3d-btn" {...tip('Nord / vue du dessus', 'north')} onClick={topDown}>
                <Icon path={mdiCompassOutline} size={ICON_SIZE} />
              </button>
            </div>
          )}

      {isNode(components.zoom)
        ? components.zoom
        : defaultShown('zoom') && (btn('zoomIn') || btn('zoomOut')) && (
            <div className="m3d-controls-group">
              {btn('zoomIn') && (
                <button className="m3d-btn" {...tip('Zoom avant', 'zoomIn')} onClick={() => zoomBy(0.5)}>
                  <Icon path={mdiPlus} size={ICON_SIZE} />
                </button>
              )}
              {btn('zoomOut') && (
                <button className="m3d-btn" {...tip('Zoom arrière', 'zoomOut')} onClick={() => zoomBy(2)}>
                  <Icon path={mdiMinus} size={ICON_SIZE} />
                </button>
              )}
            </div>
          )}

      {isNode(components.view)
        ? components.view
        : defaultShown('view') && (btn('tilt') || btn('topDown') || btn('globe')) && (
            <div className="m3d-controls-group">
              {btn('tilt') && (
                <button className="m3d-btn" {...tip('Incliner', 'tilt')} onClick={tiltUp}>
                  <Icon path={mdiVideo3d} size={ICON_SIZE} />
                </button>
              )}
              {btn('topDown') && (
                <button className="m3d-btn" {...tip('Vue du dessus', 'topDown')} onClick={topDown}>
                  <Icon path={mdiVideo2d} size={ICON_SIZE} />
                </button>
              )}
              {btn('globe') && (
                <button className="m3d-btn" {...tip('Retour au globe', 'globe')} onClick={globe}>
                  <Icon path={mdiEarth} size={ICON_SIZE} />
                </button>
              )}
            </div>
          )}

      {isNode(components.layers)
        ? components.layers
        : defaultShown('layers') && btn('layers') && (
            <TagFilterControl position={position} tipId={TIP_ID} shortcut={keys.layers} />
          )}

      {isNode(components.fullscreen)
        ? components.fullscreen
        : defaultShown('fullscreen') && btn('fullscreen') && (
            <div className="m3d-controls-group">
              <button className="m3d-btn" {...tip('Plein écran', 'fullscreen')} onClick={toggleFs}>
                <Icon path={mdiFullscreen} size={ICON_SIZE} />
              </button>
            </div>
          )}

      <Tooltip id={TIP_ID} place={position === 'right' ? 'left' : 'right'} />
    </div>
  )
}

import {
  mdiCompassOutline,
  mdiEarth,
  mdiFullscreen,
  mdiMinus,
  mdiPlus,
  mdiVideo2d,
  mdiVideo3d,
} from '@mdi/js'
import Icon from '@mdi/react'
import { type ReactNode, useCallback } from 'react'
import { Tooltip } from 'react-tooltip'
import 'react-tooltip/dist/react-tooltip.css'
import { useMapContext } from '../context'

export type MapControlsProps = {
  position?: 'left' | 'right'
  components?: Partial<Record<'compass' | 'zoom' | 'view' | 'fullscreen', boolean | ReactNode>>
}

/** Pas d'inclinaison par clic (rad). */
const TILT_STEP = Math.PI * 0.11
const ICON_SIZE = 0.8
const TIP_ID = 'm3d-tooltip'

function isNode(v: boolean | ReactNode | undefined): v is ReactNode {
  return v !== undefined && typeof v !== 'boolean'
}

/** Contrôles de navigation : boussole, zoom, inclinaison / vue du dessus / retour au globe, plein écran. */
export function MapControls({ position = 'right', components = {} }: MapControlsProps) {
  const { engine } = useMapContext()

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

  const show = (key: keyof NonNullable<MapControlsProps['components']>) => components[key] !== false
  const tip = (label: string) => ({ 'data-tooltip-id': TIP_ID, 'data-tooltip-content': label, 'aria-label': label })

  return (
    <div className={`m3d-controls m3d-${position}`}>
      {isNode(components.compass)
        ? components.compass
        : show('compass') && (
            <div className="m3d-controls-group">
              <button className="m3d-btn" {...tip('Nord / vue du dessus')} onClick={topDown}>
                <Icon path={mdiCompassOutline} size={ICON_SIZE} />
              </button>
            </div>
          )}

      {isNode(components.zoom)
        ? components.zoom
        : show('zoom') && (
            <div className="m3d-controls-group">
              <button className="m3d-btn" {...tip('Zoom avant')} onClick={() => zoomBy(0.5)}>
                <Icon path={mdiPlus} size={ICON_SIZE} />
              </button>
              <button className="m3d-btn" {...tip('Zoom arrière')} onClick={() => zoomBy(2)}>
                <Icon path={mdiMinus} size={ICON_SIZE} />
              </button>
            </div>
          )}

      {isNode(components.view)
        ? components.view
        : show('view') && (
            <div className="m3d-controls-group">
              <button className="m3d-btn" {...tip('Incliner')} onClick={tiltUp}>
                <Icon path={mdiVideo3d} size={ICON_SIZE} />
              </button>
              <button className="m3d-btn" {...tip('Vue du dessus')} onClick={topDown}>
                <Icon path={mdiVideo2d} size={ICON_SIZE} />
              </button>
              <button className="m3d-btn" {...tip('Retour au globe')} onClick={globe}>
                <Icon path={mdiEarth} size={ICON_SIZE} />
              </button>
            </div>
          )}

      {isNode(components.fullscreen)
        ? components.fullscreen
        : show('fullscreen') && (
            <div className="m3d-controls-group">
              <button className="m3d-btn" {...tip('Plein écran')} onClick={toggleFs}>
                <Icon path={mdiFullscreen} size={ICON_SIZE} />
              </button>
            </div>
          )}

      <Tooltip id={TIP_ID} place={position === 'right' ? 'left' : 'right'} />
    </div>
  )
}

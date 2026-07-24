import { type ReactNode, useCallback } from 'react'
import { useMapContext } from '../context'

export type MapControlsProps = {
  position?: 'left' | 'right'
  components?: Partial<Record<'zoom' | 'compass' | 'fullscreen', boolean | ReactNode>>
}

function isNode(v: boolean | ReactNode | undefined): v is ReactNode {
  return v !== undefined && typeof v !== 'boolean'
}

/** Contrôles de navigation (zoom via altitude, recentrage nord, plein écran). */
export function MapControls({ position = 'right', components = {} }: MapControlsProps) {
  const { engine } = useMapContext()

  const zoomBy = useCallback(
    (factor: number) => {
      const s = engine.camera.getState()
      engine.camera.flyTo({ lat: s.lat, lng: s.lng, altitude: s.altitude * factor }, { duration: 0.4 })
    },
    [engine],
  )
  const resetNorth = useCallback(() => {
    const s = engine.camera.getState()
    engine.camera.flyTo({ lat: s.lat, lng: s.lng, altitude: s.altitude }, { duration: 0.5 })
  }, [engine])
  const toggleFs = useCallback(() => {
    const root = engine.renderer.domElement.parentElement
    if (!document.fullscreenElement) root?.requestFullscreen?.()
    else document.exitFullscreen?.()
  }, [engine])

  const show = (key: keyof NonNullable<MapControlsProps['components']>) => components[key] !== false

  return (
    <div className={`m3d-controls m3d-${position}`}>
      {isNode(components.compass)
        ? components.compass
        : show('compass') && (
            <button className="m3d-btn" style={{ width: 44, height: 44, borderRadius: '50%' }} onClick={resetNorth} aria-label="Recentrer (nadir)" title="Recentrer (nadir)">
              <svg viewBox="0 0 40 40" width="30" height="30">
                <path d="M20 6 L25 21 L20 18 L15 21 Z" fill="#F0503A" />
                <path d="M20 34 L15 19 L20 22 L25 19 Z" fill="#98A2B3" />
              </svg>
            </button>
          )}

      {isNode(components.zoom)
        ? components.zoom
        : show('zoom') && (
            <div className="m3d-controls-group">
              <button className="m3d-btn" onClick={() => zoomBy(0.5)} aria-label="Zoom avant">
                <Icon d="M12 5v14M5 12h14" />
              </button>
              <button className="m3d-btn" onClick={() => zoomBy(2)} aria-label="Zoom arrière">
                <Icon d="M5 12h14" />
              </button>
            </div>
          )}

      {isNode(components.fullscreen)
        ? components.fullscreen
        : show('fullscreen') && (
            <div className="m3d-controls-group">
              <button className="m3d-btn" onClick={toggleFs} aria-label="Plein écran">
                <Icon d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </button>
            </div>
          )}
    </div>
  )
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

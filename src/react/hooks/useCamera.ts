import { useEffect, useState } from 'react'
import type { Camera, CameraState, FitBoundsOptions, FlyOptions } from '../../core/Camera'
import type { Bounds, LatLng } from '../../shared'
import { useMap, useTheme } from '../context'

export type UseCameraResult = {
  state: CameraState
  flyTo: Camera['flyTo']
  follow: (getPos: () => LatLng | null) => () => void
  /** Recentre/altitude immédiats (équivaut à un flyTo court). */
  moveTo: (dest: Partial<LatLng> & { altitude?: number }, opts?: FlyOptions) => void
  /** Cadre un ensemble géographique (marge en px, `duration: 0` = instantané). */
  fitBounds: (bounds: Bounds, opts?: FitBoundsOptions) => void
  /** Recentre instantanément, altitude inchangée. */
  setCenter: (p: LatLng) => void
  /** Recentre en douceur, altitude inchangée. */
  panTo: (p: LatLng, opts?: FlyOptions) => void
  /** Zoom façon carte 2D (échelle Google : 0 = monde, ~20 = rue). */
  setZoom: (zoom: number, opts?: { duration?: number }) => void
  getZoom: () => number
}

/** État caméra réactif + commandes (vol, suivi, cadrage, recentrage) sur le globe. */
export function useCamera(): UseCameraResult {
  const engine = useMap()
  const theme = useTheme()
  const [state, setState] = useState<CameraState>(() => engine.camera.getState())

  useEffect(() => engine.on('camera', (s) => setState({ ...s })), [engine])

  return {
    state,
    flyTo: (dest, opts) => engine.camera.flyTo(dest, opts),
    follow: (getPos) => engine.camera.follow(getPos),
    moveTo: (dest, opts) => engine.camera.flyTo(dest, { duration: theme.animations.moveTo, ...opts }),
    fitBounds: (bounds, opts) => engine.camera.fitBounds(bounds, opts),
    setCenter: (p) => engine.camera.setCenter(p),
    panTo: (p, opts) => engine.camera.panTo(p, opts),
    setZoom: (zoom, opts) => engine.camera.setZoom(zoom, opts),
    getZoom: () => engine.camera.getZoom(),
  }
}

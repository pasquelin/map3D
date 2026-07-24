import { useEffect, useState } from 'react'
import type { Camera, CameraState, FlyOptions } from '../../core/Camera'
import type { LatLng } from '../../shared'
import { useMap } from '../context'

export type UseCameraResult = {
  state: CameraState
  flyTo: Camera['flyTo']
  follow: (getPos: () => LatLng | null) => () => void
  /** Recentre/altitude immédiats (équivaut à un flyTo court). */
  moveTo: (dest: Partial<LatLng> & { altitude?: number }, opts?: FlyOptions) => void
}

/** État caméra réactif + commandes (flyTo, follow) sur le globe. */
export function useCamera(): UseCameraResult {
  const engine = useMap()
  const [state, setState] = useState<CameraState>(() => engine.camera.getState())

  useEffect(() => engine.on('camera', (s) => setState({ ...s })), [engine])

  return {
    state,
    flyTo: (dest, opts) => engine.camera.flyTo(dest, opts),
    follow: (getPos) => engine.camera.follow(getPos),
    moveTo: (dest, opts) => engine.camera.flyTo(dest, { duration: 0.4, ...opts }),
  }
}

import { useEffect, useRef } from 'react'
import type { CameraState } from '../../core/Camera'
import type { MapEvents } from '../../core/MapEngine'
import type { MapView } from '../../core/Layer'
import { useMap } from '../context'

export type MapEventHandlers = {
  onClick?: (e: MapEvents['click']) => void
  onCameraChange?: (state: CameraState) => void
  onViewportChange?: (view: MapView) => void
}

/** Abonnement déclaratif aux événements du moteur. */
export function useMapEvents(handlers: MapEventHandlers): void {
  const engine = useMap()
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const offs = [
      engine.on('click', (e) => ref.current.onClick?.(e)),
      engine.on('camera', (s) => ref.current.onCameraChange?.(s)),
      engine.on('viewport', (v) => ref.current.onViewportChange?.(v)),
    ]
    return () => offs.forEach((off) => off())
  }, [engine])
}

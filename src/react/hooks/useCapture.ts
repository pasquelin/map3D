import { useCallback, useContext } from 'react'
import type { CaptureOptions } from '../../core/capture'
import { CaptureContext, runCapture } from '../capture'
import { useMap } from '../context'

/**
 * Capture l'image de la carte depuis un composant sous `<Map>` : renvoie une fonction
 * `(opts?) => Promise<Blob>` qui injecte le rasteriseur d'overlay de la prop `capture` et
 * émet la trace `onCapture`. Le pendant impératif est `handle.capture()` ; le cœur,
 * `engine.capture()` (3D seule, sans injection).
 */
export function useCapture(): (opts?: CaptureOptions) => Promise<Blob> {
  const engine = useMap()
  const capture = useContext(CaptureContext)
  return useCallback((opts?: CaptureOptions) => runCapture(engine, capture, opts ?? {}), [engine, capture])
}

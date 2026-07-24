import { useEffect, useRef } from 'react'
import type { Viewport } from '../../data/types'
import { useMap } from '../context'

export type UseViewportOptions = { debounce?: number; minZoom?: number }

/**
 * S'abonne aux changements de vue (émis à l'inactivité, façon `idle`), avec
 * anti-rebond et gate de zoom optionnels. Reproduit le déclencheur de refetch
 * viewport-driven d'operator.
 */
export function useViewport(cb: (viewport: Viewport) => void, opts: UseViewportOptions = {}): void {
  const engine = useMap()
  const cbRef = useRef(cb)
  cbRef.current = cb
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = engine.on('viewport', (v) => {
      const { debounce, minZoom } = optsRef.current
      if (minZoom !== undefined && v.zoom < minZoom) return
      const fire = () => cbRef.current({ bounds: v.bounds, center: v.center, zoom: v.zoom })
      if (debounce && debounce > 0) {
        if (timer) clearTimeout(timer)
        timer = setTimeout(fire, debounce)
      } else {
        fire()
      }
    })
    return () => {
      off()
      if (timer) clearTimeout(timer)
    }
  }, [engine])
}

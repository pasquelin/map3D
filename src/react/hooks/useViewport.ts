import { useEffect, useRef } from 'react'
import type { Viewport } from '../../data/types'
import { useConfig, useMap } from '../context'

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
  // Contexte et non `engine.config` : cf. `useConfig`. Via une ref parce que le
  // handler survit à ses renders — il doit voir la cadence courante, pas celle
  // qu'il aurait capturée à son abonnement.
  const debounceRef = useRef(0)
  debounceRef.current = useConfig().data.viewportDebounceMs

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = engine.on('viewport', (v) => {
      const { minZoom } = optsRef.current
      // Sans option explicite, la cadence de la carte s'applique — comme dans
      // `useLiveData`. Les deux hooks écoutent le même événement ; l'un tirait à
      // chaque frame d'arrêt et l'autre toutes les 500 ms, sans raison exprimée.
      // `debounce: 0` reste un choix valide et désactive l'anti-rebond.
      const debounce = optsRef.current.debounce ?? debounceRef.current
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

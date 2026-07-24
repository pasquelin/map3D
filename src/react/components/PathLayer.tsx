import { useEffect, useRef } from 'react'
import { PathLayer as CorePathLayer, type PathData } from '../../layers/PathLayer'
import { useMapContext } from '../context'

export type PathLayerProps = {
  paths: PathData[]
  animateHead?: boolean
}

/** Tracés / parcours (ruban + casing, épaisseur en mètres, tête animée). */
export function PathLayer({ paths, animateHead = true }: PathLayerProps) {
  const { engine, theme } = useMapContext()
  const ref = useRef<CorePathLayer | null>(null)

  useEffect(() => {
    const layer = new CorePathLayer(
      engine.scene,
      engine.projection,
      {
        color: theme.colors.path.base,
        casingColor: theme.colors.path.casing,
        width: 6,
        casingWidth: 3,
        renderOrder: 1,
      },
      animateHead,
    )
    engine.addLayer(layer)
    ref.current = layer
    return () => {
      engine.removeLayer(layer)
      ref.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  useEffect(() => {
    ref.current?.setDefaults({ color: theme.colors.path.base, casingColor: theme.colors.path.casing })
  }, [theme])

  useEffect(() => {
    ref.current?.setPaths(paths)
  }, [paths])

  useEffect(() => {
    ref.current?.setAnimateHead(animateHead)
  }, [animateHead])

  return null
}

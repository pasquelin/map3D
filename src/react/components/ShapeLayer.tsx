import { useEffect, useRef } from 'react'
import { ShapeLayer as CoreShapeLayer, type ShapeData } from '../../layers/ShapeLayer'
import { useMapContext } from '../context'

export type ShapeLayerProps = {
  shapes: ShapeData[]
}

/** Zones/formes plaquées au sol (cercle-rayon, polygone, rectangle-bounds). */
export function ShapeLayer({ shapes }: ShapeLayerProps) {
  const { engine, theme } = useMapContext()
  const ref = useRef<CoreShapeLayer | null>(null)

  useEffect(() => {
    const layer = new CoreShapeLayer(engine.annotations, engine.projection, {
      color: theme.colors.zone.stroke,
      width: 6,
      fillOpacity: 0.22,
      renderOrder: 1,
    })
    engine.addLayer(layer)
    ref.current = layer
    return () => {
      engine.removeLayer(layer)
      ref.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  useEffect(() => {
    ref.current?.setDefaults({ color: theme.colors.zone.stroke })
  }, [theme])

  useEffect(() => {
    ref.current?.setShapes(shapes)
  }, [shapes])

  return null
}

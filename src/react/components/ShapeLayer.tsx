import { ShapeLayer as CoreShapeLayer, type ShapeData } from '../../layers/ShapeLayer'
import { useMapContext } from '../context'
import { useLayer, useLayerSync } from '../hooks/useLayer'

export type ShapeLayerProps = {
  shapes: ShapeData[]
}

/** Zones/formes plaquées au sol (cercle-rayon, polygone, rectangle-bounds). */
export function ShapeLayer({ shapes }: ShapeLayerProps) {
  const { engine, theme } = useMapContext()

  const ref = useLayer(
    () =>
      new CoreShapeLayer(engine.annotations, engine.projection, {
        color: theme.colors.zone.stroke,
        width: 6,
        fillOpacity: 0.22,
        renderOrder: 1,
      }),
  )

  useLayerSync(ref, theme, (layer, t) => layer.setDefaults({ color: t.colors.zone.stroke }))
  useLayerSync(ref, shapes, (layer, s) => layer.setShapes(s))

  return null
}

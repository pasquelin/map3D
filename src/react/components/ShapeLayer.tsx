import { useId, useMemo, useRef } from 'react'
import { boundsOfShape, ringOfShape, ShapeLayer as CoreShapeLayer, type ShapeData } from '../../layers/ShapeLayer'
import { createTitleCache } from '../../search/match'
import { SHAPE_GROUP } from '../../search/registry'
import { useLabels, useMapContext } from '../context'
import { useErasableProvider } from '../hooks/useErasableProvider'
import { useLayer, useLayerSync, useStatCounter } from '../hooks/useLayer'
import { useSearchProvider } from '../hooks/useSearchProvider'

export type ShapeLayerProps = {
  /** Zones à afficher (cercles, rectangles, polygones), drapées sur le relief. */
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

  useStatCounter(ref)
  useLayerSync(ref, theme, (layer, t) => layer.setDefaults({ color: t.colors.zone.stroke }))
  useLayerSync(ref, shapes, (layer, s) => layer.setShapes(s))

  const latest = useRef(shapes)
  latest.current = shapes
  // Titres normalisés mémoïsés PAR OBJET : un tick de données préserve la plupart des
  // références, donc ne renormalise que ce qui a réellement changé.
  const normalizedTitle = useMemo(() => createTitleCache<ShapeData>((s) => s.title), [])
  // Une forme nommée est cherchable, une forme anonyme est ignorée : « polygon-3 »
  // n'est pas un résultat. Compte mémoïsé sur la liste : c'est lui qui déclare la rubrique.
  const namedCount = useMemo(() => shapes.reduce((n, s) => (s.title ? n + 1 : n), 0), [shapes])
  const zoneColor = theme.colors.zone.stroke
  useSearchProvider<ShapeData>({
    group: SHAPE_GROUP,
    label: useLabels().search.groups.shape,
    color: zoneColor,
    source: useId(),
    items: () => latest.current,
    normalizedTitle: (s) => (s.title ? normalizedTitle(s) : null),
    boundsOf: boundsOfShape,
    entryOf: (shape) => ({ id: shape.id ?? shape.title!, title: shape.title!, color: shape.color ?? zoneColor }),
    count: namedCount,
  })

  // Expose les formes hôte `erasable` à la gomme — inscription, présence et notification
  // sont les mêmes que celles de `PathLayer`, elles vivent donc dans le hook partagé.
  useErasableProvider('shape', shapes, (s) => ({
    id: s.id!,
    ring: ringOfShape(s),
    closed: s.kind !== 'line' && s.kind !== 'arrow',
    kind: 'shape',
  }))

  return null
}

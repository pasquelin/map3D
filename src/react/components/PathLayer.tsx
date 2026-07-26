import { PathLayer as CorePathLayer, type PathData } from '../../layers/PathLayer'
import { useMapContext } from '../context'
import { useLayer, useLayerSync } from '../hooks/useLayer'

export type PathLayerProps = {
  paths: PathData[]
  animateHead?: boolean
}

/** Tracés / parcours (ruban + casing, épaisseur en mètres, tête animée). */
export function PathLayer({ paths, animateHead = true }: PathLayerProps) {
  const { engine, theme } = useMapContext()

  const ref = useLayer(
    () =>
      new CorePathLayer(
        engine.annotations,
        engine.projection,
        {
          color: theme.colors.path.base,
          casingColor: theme.colors.path.casing,
          width: 6,
          casingWidth: 3,
          renderOrder: 1,
        },
        animateHead,
      ),
  )

  useLayerSync(ref, theme, (layer, t) =>
    layer.setDefaults({ color: t.colors.path.base, casingColor: t.colors.path.casing }),
  )
  useLayerSync(ref, paths, (layer, p) => layer.setPaths(p))
  useLayerSync(ref, animateHead, (layer, v) => layer.setAnimateHead(v))

  return null
}

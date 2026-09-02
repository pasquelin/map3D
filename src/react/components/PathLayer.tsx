import { useEffect } from 'react'
import { PathLayer as CorePathLayer, type PathData } from '../../layers/PathLayer'
import { useConfig, useMapContext } from '../context'
import { useErasableProvider } from '../hooks/useErasableProvider'
import { useLayer, useLayerSync, useStatCounter } from '../hooks/useLayer'
import { renderOrderOf } from '../renderOrder'

export type PathLayerProps = {
  /** Tracés à afficher, drapés sur le relief. */
  paths: PathData[]
  /** Pulsation du point courant, en tête du tracé (défaut `true`). */
  animateHead?: boolean
}

/** Tracés / parcours (ruban + casing, épaisseur en mètres, tête animée). */
export function PathLayer({ paths, animateHead = true }: PathLayerProps) {
  const { engine, theme } = useMapContext()
  const config = useConfig()

  const ref = useLayer(
    () =>
      new CorePathLayer(
        engine.annotations,
        engine.projection,
        {
          color: theme.colors.path.base,
          casingColor: theme.colors.path.casing,
          width: theme.path.width,
          casingWidth: theme.path.casingWidth,
          renderOrder: renderOrderOf(config, 'paths', 1),
        },
        animateHead,
      ),
  )

  useStatCounter(ref)
  useLayerSync(ref, theme, (layer, t) =>
    layer.setDefaults({
      color: t.colors.path.base,
      casingColor: t.colors.path.casing,
    }),
  )
  useLayerSync(ref, paths, (layer, p) => layer.setPaths(p))
  useLayerSync(ref, animateHead, (layer, v) => layer.setAnimateHead(v))

  // Provider du registre de sélection : expose les tracés (contour écran) au marquee
  // et au clic. Même patron que le provider marker (`useMarkerRegistries`).
  useEffect(() => {
    return engine.selectables.register({
      screenItems: () => ref.current?.selectableItems(engine.threeCamera) ?? [],
      setSelected: (ids) => ref.current?.setSelected(ids),
      info: (id) =>
        ref.current?.hasSelectable(id) ? { kind: 'path', type: 'path', color: ref.current.colorOf(id) } : null,
      hitTest: (x, y, tol) => ref.current?.hitTest(x, y, tol) ?? null,
      boundsOf: (id) => ref.current?.boundsOfId(id) ?? null,
      // Contours des tracés sélectionnés → pointillé de l'overlay (langage de sélection commun).
      selectedContours: () => ref.current?.selectedContours() ?? [],
      hasSelectedContours: () => ref.current?.hasSelectedContours() ?? false,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  // Expose les tracés `erasable` à la gomme — même mécanique que `ShapeLayer`, d'où le
  // hook partagé (séparé de la sélection, qui a son propre registre).
  useErasableProvider('path', paths, (p: PathData) => ({ id: p.id!, ring: p.points, closed: false, kind: 'path' }))

  return null
}

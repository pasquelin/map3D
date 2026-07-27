import { useEffect, useRef, useState } from 'react'
import { MarkerLayer as CoreMarkerLayer } from '../../layers/MarkerLayer'
import { useMap } from '../context'

/**
 * Couche DOM de positionnement (pool de nœuds, tween, ancrage `CSS2DObject`) et la
 * table `id → élément` que React porte en état pour y monter ses portails.
 *
 * Mutualisé parce que DEUX surfaces le montent à l'identique : `<MarkerLayer>` pour
 * ses markers, `<ClusterSurface>` pour ses pastilles. Le montage/démontage d'une
 * couche du moteur et le va-et-vient `setState` des nœuds n'ont pas à diverger entre
 * elles — ce sont les seules choses qu'elles partagent, tout le reste (chrome, menu,
 * gestes) leur est propre.
 *
 * `setup` règle la couche à sa CRÉATION (tween, anneaux, tige, cull). Lu par ref :
 * une fonction redéfinie à chaque rendu ne remonte pas la couche, ce qui détruirait
 * tous les nœuds DOM et rejouerait leurs animations d'entrée.
 */
export function useOverlayLayer(setup?: (core: CoreMarkerLayer) => void): {
  /** La couche, ou `null` avant le premier montage et après le démontage. */
  layerRef: React.RefObject<CoreMarkerLayer | null>
  /** Nœuds DOM montés par la couche, par clé d'`OverlayItem`. */
  nodes: ReadonlyMap<string | number, HTMLDivElement>
} {
  const engine = useMap()
  const layerRef = useRef<CoreMarkerLayer | null>(null)
  const [nodes, setNodes] = useState<Map<string | number, HTMLDivElement>>(new Map())

  const setupRef = useRef(setup)
  setupRef.current = setup

  useEffect(() => {
    const core = new CoreMarkerLayer(
      engine.overlayAnchor,
      engine.tiles.ellipsoid,
      engine.projection,
      (id, el) => setNodes((prev) => new Map(prev).set(id, el)),
      (id) =>
        setNodes((prev) => {
          const next = new Map(prev)
          next.delete(id)
          return next
        }),
    )
    setupRef.current?.(core)
    engine.addLayer(core)
    layerRef.current = core
    return () => {
      engine.removeLayer(core)
      layerRef.current = null
    }
  }, [engine])

  return { layerRef, nodes }
}

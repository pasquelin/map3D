import { useEffect, useMemo, useReducer, useRef } from 'react'
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
  /** Table de vérité, mutée par la couche ; ce que React expose n'en est qu'un instantané. */
  const nodesRef = useRef(new Map<string | number, HTMLDivElement>())
  const [rev, bump] = useReducer((x: number) => x + 1, 0)

  const setupRef = useRef(setup)
  setupRef.current = setup

  useEffect(() => {
    const core = new CoreMarkerLayer(
      engine.overlayAnchor,
      engine.tiles.ellipsoid,
      engine.projection,
      (id, el) => {
        nodesRef.current.set(id, el)
        bump()
      },
      (id) => {
        nodesRef.current.delete(id)
        bump()
      },
    )
    setupRef.current?.(core)
    engine.addLayer(core)
    layerRef.current = core
    return () => {
      engine.removeLayer(core)
      layerRef.current = null
    }
  }, [engine])

  // Un instantané par LOT, pas par marker. `onMount`/`onUnmount` sont appelés depuis la
  // boucle de `setItems` : recopier la table à chaque appel coûtait O(n²) — 500 markers
  // éclatant d'un cluster allouaient 500 tables et ~125 000 réinsertions dans la même
  // passe, pendant un mouvement de caméra. Les N `bump` d'un lot ne produisent qu'un
  // rendu, donc qu'une copie. La copie reste nécessaire : `nodes` sert de dépendance aux
  // mémos des surfaces, une table mutée en place ne les réveillerait pas.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nodes = useMemo(() => new Map(nodesRef.current), [rev])

  return { layerRef, nodes }
}

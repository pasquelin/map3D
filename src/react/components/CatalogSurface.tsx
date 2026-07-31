import { useMemo } from 'react'
import { useCatalogHost } from '../hooks/useCatalog'
import { ShapeLayer } from './ShapeLayer'

/**
 * Les géométries venues du catalogue, posées sur la carte.
 *
 * Montée par `<Map>` en PERMANENCE, et non par le panneau : ce qu'on a affiché doit
 * rester visible quand on referme la liste — c'est tout l'intérêt du geste. C'est aussi
 * elle qui porte les effets à instance unique (restauration, purge), d'où
 * `useCatalogHost` plutôt que `useCatalog`.
 *
 * `<ShapeLayer>` fait le reste : drapage sur le relief, extrusion, thème, et
 * l'inscription à la recherche qui rend cherchable ce qui vient d'être affiché.
 */
export function CatalogSurface() {
  const shapes = useCatalogHost()
  // `ShapeLayer` attend un tableau mutable ; la copie est refaite seulement quand le
  // store a réellement changé de formes, pas à chaque render de la carte.
  const list = useMemo(() => [...shapes], [shapes])
  if (list.length === 0) return null
  return <ShapeLayer shapes={list} />
}

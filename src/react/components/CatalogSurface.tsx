import { memo, useCallback, useMemo } from 'react'
import type { CatalogToggleSource } from '../../catalog/types'
import { useMapContext } from '../context'
import { useCatalogHost, useEnabledToggleSources } from '../hooks/useCatalog'
import { MarkerLayer } from './MarkerLayer'
import { ShapeLayer } from './ShapeLayer'

/**
 * Ce que le catalogue pose sur la carte : les formes et les points des éléments cochés,
 * et une couche par jeu à bascule allumé.
 *
 * Montée par `<Map>` en PERMANENCE, et non par le panneau : ce qu'on a affiché doit
 * rester visible quand on referme la liste — c'est tout l'intérêt du geste. C'est aussi
 * elle qui porte les effets à instance unique (restauration, purge), d'où
 * `useCatalogHost` plutôt que `useCatalog`.
 *
 * `<ShapeLayer>` et `<MarkerLayer>` font le reste : drapage sur le relief, extrusion,
 * thème, regroupement, filtre « Couches » et inscription à la recherche.
 */
export function CatalogSurface() {
  const { shapes, markers } = useCatalogHost()
  const enabled = useEnabledToggleSources()

  // `ShapeLayer`/`MarkerLayer` attendent des tableaux mutables ; la copie est refaite
  // seulement quand le store a réellement changé, pas à chaque render de la carte.
  const shapeList = useMemo(() => [...shapes], [shapes])
  const markerList = useMemo(() => [...markers], [markers])

  return (
    <>
      {shapeList.length > 0 && <ShapeLayer shapes={shapeList} />}
      {markerList.length > 0 && <MarkerLayer points={markerList} />}
      {enabled.map((source) => (
        <ToggleLayer key={source.id} source={source} />
      ))}
    </>
  )
}

/**
 * Un jeu allumé — exactement la voie déclarative des plugins : la `DataSource` de l'hôte
 * est passée à `<MarkerLayer source>`, qui tient le `ViewportController` (anti-rebond,
 * gate `minZoom`, annulation, rejet des réponses hors-ordre).
 *
 * L'état de chargement remonte au store parce que la LIGNE qui l'affiche vit dans un autre
 * arbre (le panneau), et peut très bien être démontée pendant le vol. Le drapeau retombe
 * au démontage par le nettoyage d'effet de `<MarkerLayer onLoadingChange>` ; côté store,
 * `setSourceOn(false)`/`purge`/`clear` le purgent aussi, et `isSourceLoading` garde sur
 * `enabled` — trois ceintures pour un état qu'aucune surface ne peut rendre elle-même.
 *
 * `memo` sur une prop d'identité STABLE (l'objet source vient du registre) : sans lui, la
 * boucle se refermait sur elle-même — publier le chargement mute le store, ce qui re-rend
 * la surface, donc chaque couche et son millier de markers, pour une information que seule
 * une ligne de panneau consomme.
 */
const ToggleLayer = memo(function ToggleLayer({ source }: { source: CatalogToggleSource }) {
  const { engine } = useMapContext()
  const store = engine.catalogState
  const onLoadingChange = useCallback(
    (loading: boolean) => store.setSourceLoading(source.id, loading),
    [store, source.id],
  )

  return (
    <MarkerLayer<unknown> source={source.source} onLoadingChange={onLoadingChange} {...(source.markerLayer ?? {})} />
  )
})

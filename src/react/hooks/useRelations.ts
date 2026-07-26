import { useContext } from 'react'
import { RelationContext, type RelationApi, useLabels } from '../context'

/**
 * API du moteur de relations. Consommée par le menu marker (`menuFor`) et par la
 * barre d'état. Lève hors d'un `<RelationLayer>` — comme les autres hooks de la
 * lib, une API muette masquerait un oubli de montage.
 */
export function useRelations(): RelationApi {
  const labels = useLabels()
  const api = useContext(RelationContext)
  if (!api) throw new Error(labels.errors.outsideMap)
  return api
}

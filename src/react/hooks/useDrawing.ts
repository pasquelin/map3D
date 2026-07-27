import { useContext } from 'react'
import { DrawingContext, type DrawingApi, useLabels } from '../context'

/** Contrôle des outils de dessin. Nécessite la couche de dessin (retirée par `draw={false}`). */
export function useDrawing(): DrawingApi {
  const labels = useLabels()
  const ctx = useContext(DrawingContext)
  // Via `labels` comme `useRelations` — un message d'erreur affiché par l'hôte n'a
  // pas de raison d'être en français quand tout le reste de la lib est traduit.
  if (!ctx) throw new Error(labels.errors.drawingRequired)
  return ctx
}

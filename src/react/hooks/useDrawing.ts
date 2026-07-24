import { useContext } from 'react'
import { DrawingContext, type DrawingApi } from '../context'

/** Contrôle des outils de dessin. Nécessite un `<DrawLayer>` monté. */
export function useDrawing(): DrawingApi {
  const ctx = useContext(DrawingContext)
  if (!ctx) throw new Error('useDrawing nécessite un <DrawLayer> monté dans <Map>')
  return ctx
}

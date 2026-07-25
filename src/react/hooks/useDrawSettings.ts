import type { DrawSettings } from '../../layers/draw/DrawSettings'
import { useDrawing } from './useDrawing'

/**
 * Réglages par outil (persistés en localStorage). La réactivité vient du
 * provider : `<DrawLayer>` s'abonne au store et re-rend le contexte à chaque
 * `set`/`reset` — pas besoin d'un second abonnement par composant.
 */
export function useDrawSettings(): DrawSettings {
  return useDrawing().settings
}

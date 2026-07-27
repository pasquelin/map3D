import { useContext } from 'react'
import { LensContext, type LensApi, useLabels } from '../context'

/**
 * API de l'outil loupe — monté par `<Map>` en même temps que la barre d'outils.
 *
 * Retiré par `<Map toolbar={{ lens: false }}>`, ou par `toolbar={false}` qui emporte
 * la barre entière. Il n'existe PAS de prop `lens` à la racine : la loupe se règle là
 * où son bouton apparaît.
 */
export function useLens(): LensApi {
  const labels = useLabels()
  const ctx = useContext(LensContext)
  // Passe par `labels`, comme `useRelations` : ce message peut remonter jusqu'à un
  // écran d'erreur de l'application hôte, où le français en dur détonne.
  if (!ctx) throw new Error(labels.errors.lensRequired)
  return ctx
}

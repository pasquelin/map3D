import { useContext } from 'react'
import { LensContext, type LensApi } from '../context'

/** API de l'outil loupe — monté par `<Map>` (défaut ; `<Map lens={false}>` le retire). */
export function useLens(): LensApi {
  const ctx = useContext(LensContext)
  if (!ctx) throw new Error('useLens nécessite la loupe : elle est retirée par <Map lens={false}>')
  return ctx
}

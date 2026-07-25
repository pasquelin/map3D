import { useContext } from 'react'
import { LensContext, type LensApi } from '../context'

/** API de l'outil loupe — nécessite un `<LensLayer>` monté dans `<Map>`. */
export function useLens(): LensApi {
  const ctx = useContext(LensContext)
  if (!ctx) throw new Error('useLens nécessite un <LensLayer> monté dans <Map>')
  return ctx
}

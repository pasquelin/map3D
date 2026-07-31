import { useCallback, useEffect, useMemo, useState } from 'react'
import { zoomForAltitude } from '../../core/math'
import { useConfig, useMap } from '../context'

/**
 * Combien de seuils le zoom satisfait, hystérésis appliquée à celui qu'on quitte.
 * `band` vient de `performance.markerZoomBand` — voir ce champ pour le pourquoi.
 */
export const crossedCount = (zoom: number, sorted: readonly number[], previous: number, band: number): number => {
  let n = 0
  for (const t of sorted) {
    // Ouvrir demande de dépasser `t + band`, refermer de redescendre sous `t - band` :
    // entre les deux, le seuil garde l'état qu'il avait.
    const wasOpen = n < previous
    if (zoom >= (wasOpen ? t - band : t + band)) n++
    else break
  }
  return n
}

/**
 * Gate de zoom des markers `static` : renvoie un prédicat « ce seuil est-il
 * franchi ? », dont l'identité ne change qu'à un franchissement RÉEL.
 *
 * C'est toute la raison d'être du hook. Garder le zoom en état re-rendrait la couche
 * à chaque frame de molette, pour une réponse qui ne change qu'en traversant un
 * seuil. Ici l'état ne bouge que deux fois par traversée, quel que soit le nombre de
 * markers.
 *
 * `thresholds` porte les seuils présents dans les données — un seul dans le cas
 * courant (tout le décor suit la config), plusieurs dès qu'un marker impose le sien
 * (`static: { minZoom }`). Le hook les trie et les dédoublonne lui-même : il compte
 * les seuils franchis en s'arrêtant au premier qui ne l'est pas, et un appelant qui
 * fournirait `[16, 11]` obtiendrait sinon des réponses fausses en silence. Tableau
 * vide, le hook ne s'abonne à rien : une carte sans décor ne paie ni listener ni
 * rendu.
 *
 * Le zoom vient de l'altitude portée par l'événement `camera`, pas de
 * `engine.getView()` : celui-ci répond une VUE (bounds compris), là où le gate ne
 * veut qu'une échelle — et il n'est de toute façon pas rafraîchi par le seul fait
 * qu'on l'interroge.
 */
export function useZoomGate(thresholds: readonly number[]): (minZoom: number) => boolean {
  const engine = useMap()
  // Contexte et non `engine.config` : une charte remplacée à chaud doit rétrécir la
  // bande sans remonter la carte.
  const band = useConfig().performance.markerZoomBand
  // Clé de CONTENU : `thresholds` est reconstruit à chaque rendu de l'appelant alors
  // que sa valeur ne bouge presque jamais. Sans elle, l'effet se réabonnerait sans fin.
  const key = thresholds.join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sorted = useMemo(() => [...new Set(thresholds)].sort((a, b) => a - b), [key])
  const [zoom, setZoom] = useState(() => engine.camera.getZoom())

  useEffect(() => {
    if (sorted.length === 0) return
    // Réévalué à l'abonnement : les seuils viennent peut-être de changer, et personne
    // ne bougera forcément la caméra pour le faire savoir. Comptage SANS hystérésis
    // ici — il n'y a pas d'état précédent à conserver, seulement une position.
    const z0 = engine.camera.getZoom()
    let crossed = sorted.filter((t) => z0 >= t).length
    setZoom(z0)
    return engine.on('camera', (state) => {
      const z = zoomForAltitude(state.altitude)
      const next = crossedCount(z, sorted, crossed, band)
      if (next === crossed) return
      crossed = next
      // Le zoom N'EST publié qu'au franchissement : entre deux, le prédicat rendrait
      // la même réponse, et le re-render serait pur gaspillage.
      setZoom(z)
    })
  }, [engine, sorted, band])

  return useCallback((minZoom: number) => minZoom <= 0 || zoom >= minZoom, [zoom])
}

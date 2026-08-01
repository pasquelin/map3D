import { useEffect, useRef } from 'react'
import { inTextInput } from '../components/shortcuts'
import { usePedestrian } from './usePedestrian'

/**
 * Échap du mode piéton, monté INDÉPENDAMMENT du dessin.
 *
 * La sortie vivait dans `useDrawKeyboard`, donc absente sous `draw={false}` : on marchait
 * sans pouvoir remonter. Elle est ici, dans le HUD piéton toujours monté.
 *
 * Deux niveaux, comme le veut le Pointer Lock :
 * - **immersion totale** : Échap est le relâchement NATIF du verrou → retour en exploration
 *   par `pointerlockchange` (cf. `MapEngine.onPointerLockChange`). On ne quitte PAS le mode
 *   ici — un cran à la fois.
 * - **exploration / placement** : Échap quitte le mode piéton (rend la caméra à l'orbite).
 *
 * Latest-ref : le listener se pose une fois, mais lit toujours l'état courant — le rebinder
 * à chaque frame de marche (l'état réémet à chaque rotation) serait du gaspillage.
 */
export function usePedestrianKeys(): void {
  const { state, exit } = usePedestrian()
  const ref = useRef({ state, exit })
  ref.current = { state, exit }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || inTextInput(e)) return
      const { state, exit } = ref.current
      // En immersion totale, on laisse le navigateur relâcher le verrou (→ exploration) ;
      // hors piéton, rien à faire.
      if (state.mode !== 'pedestrian' || state.immersion === 'full') return
      exit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

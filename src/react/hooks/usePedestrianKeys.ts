import { useEffect, useRef } from 'react'
import { inTextInput, plainKey } from '../components/shortcuts'
import { useConfig } from '../context'
import { usePedestrian } from './usePedestrian'

/**
 * Clavier du mode piéton, monté INDÉPENDAMMENT du dessin (le mode ne dépend d'aucune barre).
 *
 * **Échap**, deux niveaux, comme le veut le Pointer Lock :
 * - immersion totale : Échap est le relâchement NATIF du verrou → retour en exploration par
 *   `pointerlockchange` (cf. `MapEngine.onPointerLockChange`). On ne quitte PAS le mode ici.
 * - exploration / placement : Échap quitte le mode piéton (rend la caméra à l'orbite).
 *
 * **Bascule d'immersion** (`interaction.shortcuts.pedestrian.immersion`, aucune touche par
 * défaut) : en marche active, alterne `explore` ↔ `full`. Le `keydown` est un geste
 * utilisateur, donc `requestPointerLock` (déclenché par `setImmersion('full')`) y est permis.
 *
 * Latest-ref : le listener se pose une fois mais lit toujours l'état courant — le rebinder à
 * chaque frame de marche (l'état réémet à chaque rotation) serait du gaspillage.
 */
export function usePedestrianKeys(): void {
  const { state, exit, setImmersion } = usePedestrian()
  const immersionKey = useConfig().interaction.shortcuts.pedestrian.immersion
  const ref = useRef({ state, exit, setImmersion, immersionKey })
  ref.current = { state, exit, setImmersion, immersionKey }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (inTextInput(e)) return
      const { state, exit, setImmersion, immersionKey } = ref.current
      if (state.mode !== 'pedestrian') return
      // Bascule d'immersion (si une touche est configurée), en marche active seulement.
      if (immersionKey !== false && state.phase === 'active' && plainKey(e) === immersionKey) {
        e.preventDefault()
        setImmersion(state.immersion === 'full' ? 'explore' : 'full')
        return
      }
      // Échap : en immersion totale, on laisse le navigateur relâcher le verrou (→ exploration)
      // ; sinon on quitte le mode.
      if (e.key === 'Escape' && state.immersion !== 'full') exit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

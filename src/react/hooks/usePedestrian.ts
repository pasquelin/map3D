import { useEffect, useState } from 'react'
import type { ImmersionLevel, PedestrianState } from '../../core/pedestrianState'
import type { LatLng } from '../../shared'
import { useMap } from '../context'

export type PedestrianApi = {
  /** État courant, réactif — l'objet est stable côté moteur (cf. `samePedestrianState`). */
  state: PedestrianState
  /** Arme le curseur cible : le clic suivant choisit le point d'entrée, s'il est posable. */
  enterPlacement: () => void
  /** Entre directement à un point. Rend `false` si le point n'est pas posable. */
  enter: (p: LatLng) => boolean
  exit: () => void
  setImmersion: (level: ImmersionLevel) => void
}

/**
 * Mode piéton / première personne : état réactif et commandes.
 *
 * L'état vient de l'ÉVÉNEMENT et non d'une lecture au rendu : la carte change d'elle-même
 * (Échap dans le canvas, bascule 2D qui referme le mode), et un consommateur qui ne suivrait
 * que ses propres appels afficherait un bouton actif sur un mode déjà quitté.
 */
export function usePedestrian(): PedestrianApi {
  const engine = useMap()
  const [state, setState] = useState<PedestrianState>(() => engine.getPedestrian())

  useEffect(() => engine.on('pedestrian', setState), [engine])

  return {
    state,
    enterPlacement: () => engine.enterPedestrianPlacement(),
    enter: (p) => engine.enterPedestrian(p),
    exit: () => engine.exitPedestrian(),
    setImmersion: (level) => engine.setPedestrianImmersion(level),
  }
}

import { useEffect, useMemo, useState } from 'react'
import {
  type CameraMode,
  isGroundedView,
  type ImmersionLevel,
  type PedestrianPhase,
  type PedestrianState,
} from '../../core/pedestrianState'
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

  // Les quatre commandes ne dépendent que du moteur : les recréer à chaque render
  // invaliderait tout `memo` en aval pour un simple changement de cap.
  return useMemo(
    () => ({
      state,
      enterPlacement: () => engine.enterPedestrianPlacement(),
      enter: (p: LatLng) => engine.enterPedestrian(p),
      exit: () => engine.exitPedestrian(),
      setImmersion: (level: ImmersionLevel) => engine.setPedestrianImmersion(level),
    }),
    [engine, state],
  )
}

/**
 * Caméra au ras du sol — le pendant React de ce que le moteur diffuse aux couches par
 * `setGrounded`.
 *
 * Ne rend QUE le booléen, là où `usePedestrian` rend l'état complet : celui-ci porte le cap
 * et le tangage, réémis dès qu'on tourne la tête (cf. `ANGLE_EPSILON`). Un consommateur
 * coûteux qui ne s'intéresse qu'au mode se re-rendrait alors à chaque rotation.
 */
export function useGroundedView(): boolean {
  const engine = useMap()
  const [grounded, setGrounded] = useState(() => isGroundedView(engine.getPedestrian()))
  useEffect(() => engine.on('pedestrian', (s) => setGrounded(isGroundedView(s))), [engine])
  return grounded
}

/** Sous-état « chrome » du mode piéton — cf. `usePedestrianChrome`. */
export type PedestrianChrome = {
  mode: CameraMode
  phase: PedestrianPhase
  immersion: ImmersionLevel
  exit: () => void
  setImmersion: (level: ImmersionLevel) => void
}

/**
 * Ce dont le HUD piéton (et son clavier) a besoin : `mode`/`phase`/`immersion` + les deux
 * commandes utiles. Ne RE-REND que si l'un des trois change.
 *
 * `usePedestrian` réémet à CHAQUE rotation (cap/tangage, cf. `ANGLE_EPSILON`) : un HUD qui
 * ne dépend pas du regard s'y re-rendrait à chaque `pointermove` en immersion. Même garde
 * d'égalité que `useGroundedView`, sur trois champs — l'objet d'état ne change d'identité
 * que sur un vrai changement de chrome, donc React court-circuite le rendu sinon.
 */
export function usePedestrianChrome(): PedestrianChrome {
  const engine = useMap()
  const [ui, setUi] = useState(() => {
    const s = engine.getPedestrian()
    return { mode: s.mode, phase: s.phase, immersion: s.immersion }
  })
  useEffect(
    () =>
      engine.on('pedestrian', (s) =>
        setUi((prev) =>
          prev.mode === s.mode && prev.phase === s.phase && prev.immersion === s.immersion
            ? prev
            : { mode: s.mode, phase: s.phase, immersion: s.immersion },
        ),
      ),
    [engine],
  )
  return useMemo(
    () => ({
      ...ui,
      exit: () => engine.exitPedestrian(),
      setImmersion: (level: ImmersionLevel) => engine.setPedestrianImmersion(level),
    }),
    [engine, ui],
  )
}

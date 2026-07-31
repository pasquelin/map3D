import { useCallback, useEffect, useState } from 'react'
import { useMapContext } from '../context'

export type GraticuleApi = {
  /** La grille est-elle affichée ? */
  visible: boolean
  setVisible: (on: boolean) => void
  toggle: () => void
}

/**
 * Bascule de la grille de coordonnées, lue AU MOTEUR — sa seule source de vérité.
 *
 * Trois commandes la pilotent : la rangée « Grille » du sous-menu « Mesures », le bouton des
 * contrôles de vue, et le raccourci clavier. Un état React local aurait divergé dès que l'une
 * d'elles agit — c'est le défaut que `useBuildingPick` corrige déjà pour l'outil « bâtiment ».
 */
export function useGraticule(): GraticuleApi {
  const { engine } = useMapContext()
  const [visible, setVisibleState] = useState(() => engine.getGraticuleVisible())
  useEffect(() => engine.on('graticule', setVisibleState), [engine])
  const setVisible = useCallback((on: boolean) => engine.setGraticuleVisible(on), [engine])
  // Lit l'état AU MOTEUR et non la valeur capturée : deux bascules dans la même frame
  // (raccourci + clic) partiraient sinon du même `visible` et s'annuleraient.
  const toggle = useCallback(() => engine.setGraticuleVisible(!engine.getGraticuleVisible()), [engine])
  return { visible, setVisible, toggle }
}

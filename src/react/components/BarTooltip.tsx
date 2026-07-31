import { createPortal } from 'react-dom'
import { Tooltip } from 'react-tooltip'
import { useMapContext } from '../context'

/**
 * L'infobulle partagée d'une barre, **portée à la racine de la carte**.
 *
 * Le portail n'est pas un détail : une barre est `position:absolute` AVEC un `z-index`,
 * donc une racine d'empilement. Une infobulle rendue dedans ne peut plus se comparer
 * qu'à ses frères de la barre — et se retrouve derrière les panneaux, qui sont portés à
 * la racine au même niveau mais plus loin dans le DOM. Aucun `z-index` posé sur
 * l'infobulle ne pouvait la sortir de là : c'était son PARENT qui la plafonnait.
 *
 * Sortie de la barre, elle redevient sœur des panneaux et son `z-index` compte à
 * nouveau — ce qui la remet au-dessus, là où on survole les contrôles à expliquer.
 */
export function BarTooltip({
  id,
  place,
  hidden,
}: {
  id: string
  place: 'left' | 'right'
  /**
   * Éteindre l'infobulle. La barre de DESSIN s'en sert quand une de ses surfaces est
   * ouverte : l'infobulle d'un bouton survolé venait se poser sur le panneau qu'on est
   * en train de lire. Les barres dont un panneau contient lui-même des contrôles à
   * expliquer ne doivent PAS l'utiliser — elles éteindraient leurs propres infobulles.
   */
  hidden?: boolean
}) {
  const { overlay } = useMapContext()
  const host = overlay.parentElement
  if (!host) return null
  return createPortal(
    <Tooltip
      id={id}
      place={place}
      className="m3d-tip"
      classNameArrow="m3d-tip-arrow"
      hidden={hidden}
      disableStyleInjection
    />,
    host,
  )
}

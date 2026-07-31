import { createPortal } from 'react-dom'
import { Tooltip } from 'react-tooltip'
import { useMapContext } from '../context'

/**
 * Une instance d'infobulle de la carte, **portée à la racine**. Point de montage UNIQUE
 * pour les trois qui coexistaient (contrôles, dessin, templates).
 *
 * Le portail n'est pas un détail : une barre est `position:absolute` AVEC un `z-index`,
 * donc une racine d'empilement, et un panneau porte un `backdrop-filter`, qui en est une
 * aussi. Une infobulle rendue dans l'une ou l'autre ne se compare qu'à ses frères de
 * cette boîte — aucun `z-index` ne l'en sort, c'est son PARENT qui la plafonne. C'est ce
 * qui avait conduit `TemplatesPanel` à monter sa PROPRE instance dans son panneau : la
 * seule façon, alors, de passer au-dessus de lui.
 *
 * Portée à la racine, elle devient sœur des barres ET des panneaux, donc son `z-index`
 * décide de nouveau — et une seule instance par barre suffit à tout couvrir.
 */
export function MapTooltip({
  id,
  place,
  hidden,
}: {
  id: string
  place: 'left' | 'right' | 'top' | 'bottom'
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

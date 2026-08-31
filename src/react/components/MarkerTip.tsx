import type { CSSProperties, ReactNode } from 'react'
import { useNudgeInside } from './panelFit'

export type MarkerTipContent = {
  title?: ReactNode
  content?: ReactNode
}

/** Y a-t-il de quoi afficher une infobulle ? (les deux champs sont optionnels) */
export const hasTipContent = (tip: MarkerTipContent | null | undefined): boolean =>
  tip != null && (tip.title != null || tip.content != null)

export type MarkerTipProps = MarkerTipContent & {
  /** Classes en plus de `m3d-markertip` (variante urgence, ancrage du dock…). */
  className?: string
  /** Position/décalage : `left`/`top` en px conteneur, ou `--m3d-tiplift` pour l'ancre. */
  style?: CSSProperties
}

/**
 * Infobulle d'un élément : titre optionnel + contenu optionnel. Partagée par le marker, la
 * pastille de regroupement et le dock d'épinglés — les trois répétaient le même couple de
 * `<div>`. L'ancrage et le portail restent à l'appelant ; le RABATTEMENT, non.
 *
 * Centrée sur son ancre par un `transform`, elle était coupée net près d'un bord — un titre
 * amputé de ses premiers caractères, sans moyen de le lire. Elle se rabat donc comme les
 * menus contextuels, ancrés au même overlay, en mesure `'visual'` : la boîte de layout
 * d'une surface que le `transform` PLACE n'est qu'un point sur l'ancre (cf. `NudgeMeasure`).
 */
export function MarkerTip({ title, content, className, style }: MarkerTipProps) {
  const [, setNudge] = useNudgeInside(false, 'visual')
  return (
    <div ref={setNudge} className={`m3d-markertip${className ? ` ${className}` : ''}`} style={style}>
      {title != null && <div className="m3d-markertip-title">{title}</div>}
      {content != null && <div className="m3d-markertip-content">{content}</div>}
    </div>
  )
}

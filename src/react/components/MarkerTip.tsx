import type { CSSProperties, ReactNode } from 'react'

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
 * Corps d'une infobulle d'élément : titre optionnel + contenu optionnel. Partagé par
 * l'infobulle de marker (survol sur la carte) et celle du dock d'épinglés — les deux
 * répétaient le même couple de `<div>` avec les mêmes classes.
 *
 * Ne porte NI positionnement NI portail : chaque appelant les gère (l'un est ancré
 * par le CSS2DRenderer, l'autre projeté dans `.m3d-root`). Seule la composition
 * interne est mutualisée, ce qui garantit qu'un changement de structure les suit
 * toutes les deux.
 */
export function MarkerTip({ title, content, className, style }: MarkerTipProps) {
  return (
    <div className={`m3d-markertip${className ? ` ${className}` : ''}`} style={style}>
      {title != null && <div className="m3d-markertip-title">{title}</div>}
      {content != null && <div className="m3d-markertip-content">{content}</div>}
    </div>
  )
}

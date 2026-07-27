import { mdiClose, mdiDrag, mdiMagnetOn } from '@mdi/js'
import { UiIcon } from './UiIcon'
import type { ReactNode } from 'react'
import type { DraggablePanel } from '../hooks/useDraggablePanel'

export type FloatingPanelProps = {
  /**
   * Mécanique de déplacement, fournie par l'APPELANT via `useDraggablePanel`.
   *
   * Volontairement pas appelée ici : un panneau monté conditionnellement (le HUD de
   * sélection disparaît quand la sélection se vide) perdrait sinon son état épinglé
   * à chaque démontage, et reviendrait à sa position par défaut au lieu de rester
   * là où l'utilisateur l'avait posé. Le hook doit vivre dans un composant stable.
   */
  panel: DraggablePanel
  title: ReactNode
  /** aria-label de la poignée de déplacement. */
  moveLabel: string
  /** Actions d'en-tête, à droite du titre (avant le rattachement et la fermeture). */
  actions?: ReactNode
  /**
   * Libellé du bouton de rattachement. Fourni = le bouton apparaît dès que le
   * panneau a été déplacé (il n'a de sens que pour un panneau ancré à un élément
   * mobile, comme la zone de la loupe).
   */
  snapBackLabel?: string
  onClose?: () => void
  closeLabel?: string
  /** Classe de la variante, sur le conteneur externe (position, débordement). */
  hudClassName?: string
  /** Classe de la variante, sur la carte (largeur via `--m3d-panel-w`). */
  panelClassName?: string
  children: ReactNode
}

/**
 * Panneau flottant déplaçable : conteneur HUD + carte thémée + en-tête (poignée,
 * titre, actions, rattachement, fermeture). Squelette **partagé** par le panneau de
 * sélection et celui de la loupe — les deux répétaient la même structure à trois
 * niveaux avec des classes distinctes dont le CSS était quasi identique.
 *
 * Ne porte AUCUNE règle de placement : le conteneur reçoit `panel.style`, calculé
 * par `useDraggablePanel` (position épinglée, ancre, clamp au conteneur).
 */
export function FloatingPanel({
  panel,
  title,
  moveLabel,
  actions,
  snapBackLabel,
  onClose,
  closeLabel,
  hudClassName,
  panelClassName,
  children,
}: FloatingPanelProps) {
  const { panelRef, style, gripProps, pinned, reset } = panel
  return (
    <div ref={panelRef} className={`m3d-floathud${hudClassName ? ` ${hudClassName}` : ''}`} style={style}>
      <div className={`m3d-panel m3d-floatpanel${panelClassName ? ` ${panelClassName}` : ''}`}>
        <div className="m3d-floathead">
          {/* Pas de tooltip sur la poignée : il resterait affiché pendant le drag. */}
          <button type="button" className="m3d-selgrip" {...gripProps} aria-label={moveLabel}>
            <UiIcon path={mdiDrag} />
          </button>
          <span className="m3d-floathead-title">{title}</span>
          {actions}
          {snapBackLabel && pinned && (
            <button
              type="button"
              className="m3d-selrow-x"
              onClick={reset}
              title={snapBackLabel}
              aria-label={snapBackLabel}
            >
              <UiIcon path={mdiMagnetOn} />
            </button>
          )}
          {onClose && (
            <button type="button" className="m3d-selrow-x" onClick={onClose} aria-label={closeLabel}>
              <UiIcon path={mdiClose} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

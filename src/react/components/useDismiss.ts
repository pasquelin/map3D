import { type RefObject, useEffect } from 'react'

export type DismissOptions = {
  /**
   * Fermer aussi à la molette. Pour une surface ancrée à un élément de la CARTE : la
   * carte défile sous elle, son ancrage devient faux — mieux vaut refermer.
   */
  wheel?: boolean
  /**
   * Capter Échap en phase de CAPTURE et arrêter sa propagation. Sans cela, la touche
   * poursuit sa route jusqu'aux raccourcis globaux (quitter l'outil, retirer la zone
   * de la loupe) alors que l'utilisateur ne visait qu'à refermer cette surface.
   */
  captureEscape?: boolean
}

/**
 * Ferme une surface ancrée au clic hors de `ref` ou à Échap — pattern partagé des
 * flyouts de barres (Couches, Réglages des outils) et des menus de ligne.
 *
 * Le test est un `contains` sur la cible : la surface n'a donc rien à faire de son
 * côté (aucun `stopPropagation` à semer sur ses gestionnaires), et un portail
 * fonctionne tant que le nœud passé en `ref` est bien celui rendu à distance.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  { wheel = false, captureEscape = false }: DismissOptions = {},
): void {
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (captureEscape) e.stopPropagation()
      onClose()
    }
    const onWheel = () => onClose()
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, captureEscape)
    if (wheel) window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, captureEscape)
      if (wheel) window.removeEventListener('wheel', onWheel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wheel, captureEscape])
}

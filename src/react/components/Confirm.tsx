import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useMapContext } from '../context'

export type ConfirmProps = {
  /** Message affiché (déjà formaté). */
  message: string
  /** Libellé du bouton de confirmation. */
  confirmLabel: string
  /** Libellé du bouton d'annulation. */
  cancelLabel: string
  /** Action destructive : le bouton de confirmation passe en rouge. */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Dialogue de confirmation, thémé comme le reste (`.m3d-panel`, vars `--m3d-*`).
 * Rendu par portail dans l'overlay de la carte : Échap / clic sur le fond annulent,
 * Entrée confirme. Le focus part sur le bouton de confirmation.
 */
export function Confirm({ message, confirmLabel, cancelLabel, danger, onConfirm, onCancel }: ConfirmProps) {
  const { overlay } = useMapContext()
  // Porté dans `.m3d-root` et non dans l'overlay : un modal doit couvrir TOUT (markers
  // CSS2D, poignées d'édition, panneaux). Rendu dans l'overlay, il retombait dans le
  // « plan carte » et passait sous la couche d'édition (`--m3d-z-edit-overlay`).
  const root = overlay.closest('.m3d-root') ?? overlay
  const okRef = useRef<HTMLButtonElement>(null)

  // Latest-ref : `onConfirm`/`onCancel` sont des flèches recréées à chaque render du
  // parent. Sans ça, l'effet se ré-exécuterait à chaque re-render (le panneau se re-rend
  // 1×/frame de tracé), rebranchant le listener ET revolant le focus vers « Confirmer ».
  const handlers = useRef({ onConfirm, onCancel })
  handlers.current = { onConfirm, onCancel }

  useEffect(() => {
    okRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handlers.current.onCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        handlers.current.onConfirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return createPortal(
    // `stopPropagation` du pointerdown : le dialogue est porté HORS du flyout qui l'a
    // ouvert, dont le `useDismiss` écoute `document`. Sans ça, cliquer « Confirmer »
    // refermerait le flyout, démontant ce dialogue AVANT que son `onClick` ne parte —
    // et l'action (mise à jour, suppression) ne s'exécuterait jamais.
    <div className="m3d-confirm-backdrop" onPointerDown={(e) => e.stopPropagation()} onClick={onCancel}>
      <div className="m3d-panel m3d-confirm" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="m3d-confirm-msg">{message}</div>
        <div className="m3d-confirm-actions">
          <button type="button" className="m3d-confirm-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={okRef}
            className={danger ? 'm3d-confirm-ok m3d-confirm-danger' : 'm3d-confirm-ok'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    root,
  )
}

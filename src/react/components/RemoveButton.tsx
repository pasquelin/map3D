import { REMOVE_CLASS, REMOVE_ICON_PATH, REMOVE_TEXT_CLASS } from '../../core/removeButton'

export type RemoveButtonProps = {
  /** Libellé : texte visible (si `withText`), infobulle et `aria-label`. */
  label: string
  /** Afficher le libellé à côté de l'icône. Sans lui, le bouton reste une icône seule. */
  withText?: boolean
  /** Classes supplémentaires, pour le positionnement propre à chaque hôte. */
  className?: string
  onRemove: () => void
}

/**
 * Bouton « supprimer » de la lib — icône, couleur et libellé identiques partout
 * (barre d'état d'une relation, pastilles du dock, indice de retrait au drag).
 *
 * Le tracé d'icône et les classes viennent de `core/removeButton`, où la feuille de
 * styles les retrouve aussi : ce sont les mêmes noms des deux côtés, ce qui empêche
 * l'apparence de diverger d'un usage à l'autre.
 */
export function RemoveButton({ label, withText, className, onRemove }: RemoveButtonProps) {
  return (
    <button
      type="button"
      className={className ? `${REMOVE_CLASS} ${className}` : REMOVE_CLASS}
      title={label}
      aria-label={label}
      // Stoppé en plus du clic : sans cela le geste démarre un drag (carte ou
      // pastille) avant que le clic n'aboutisse, et le bouton devient inutilisable.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onRemove()
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d={REMOVE_ICON_PATH} fill="currentColor" />
      </svg>
      <span className={REMOVE_TEXT_CLASS}>{withText ? label : ''}</span>
    </button>
  )
}

/** Conventions partagées des barres d'outils (MapControls, DrawToolbar). */

/** Taille des icônes @mdi/react des boutons de barre. */
export const ICON_SIZE = 0.8

/** Attributs tooltip + accessibilité d'un bouton de barre (cible un `<Tooltip id={id}>`). */
export const tipProps = (id: string, label: string) => ({
  'data-tooltip-id': id,
  'data-tooltip-content': label,
  'aria-label': label,
})

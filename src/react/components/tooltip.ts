/** Conventions partagées des barres d'outils (MapControls, DrawToolbar, TagFilterControl). */

/** Taille des icônes @mdi/react des boutons de barre. */
export const ICON_SIZE = 0.8

/** Suffixe d'affichage d'un raccourci : `Plein écran (F)`, `Annuler (⌘Z)`. */
export const withShortcut = (label: string, key?: string | false): string =>
  key ? `${label} (${key.length === 1 ? key.toUpperCase() : key})` : label

/**
 * Attributs tooltip + accessibilité d'un bouton de barre (cible un `<Tooltip id={id}>`).
 * `shortcut` (optionnel) est affiché à la suite du libellé — tooltip ET aria-label.
 */
export const tipProps = (id: string, label: string, shortcut?: string | false) => {
  const text = withShortcut(label, shortcut)
  return {
    'data-tooltip-id': id,
    'data-tooltip-content': text,
    'aria-label': text,
  }
}

/** Conventions partagées des barres d'outils (MapControls, DrawToolbar, TagFilterControl). */

import { formatLabel } from '../../labels/mergeLabels'
import { useLabels } from '../context'


/** Affichage d'une touche : lettre seule en capitale, combo tel quel. */
export const formatKey = (key: string): string => (key.length === 1 ? key.toUpperCase() : key)

/**
 * Suffixe d'affichage d'un raccourci : `Plein écran (F)`, `Annuler (⌘Z)`.
 * `template` = gabarit `labels.format.shortcut` (variables `{label}` et `{key}`) —
 * obligatoire : un oubli ignorerait silencieusement la traduction de l'hôte.
 */
export const withShortcut = (label: string, key: string | false | undefined, template: string): string =>
  key ? formatLabel(template, { label, key: formatKey(key) }) : label

/**
 * Attributs tooltip + accessibilité d'un bouton de barre (cible un `<Tooltip id={id}>`).
 * `shortcut` (optionnel) est affiché à la suite du libellé — tooltip ET aria-label.
 */
export const tipProps = (id: string, label: string, shortcut: string | false | undefined, template: string) => {
  const text = withShortcut(label, shortcut, template)
  return {
    'data-tooltip-id': id,
    'data-tooltip-content': text,
    'aria-label': text,
  }
}

/**
 * Fabrique `tip(label, shortcut?)` d'une barre : câblée sur le gabarit des labels
 * du provider — les composants n'ont aucun template à threader (impossible à oublier).
 */
export function useTip(id: string): (label: string, shortcut?: string | false) => Record<string, string> {
  const labels = useLabels()
  return (label, shortcut) => tipProps(id, label, shortcut, labels.format.shortcut)
}
